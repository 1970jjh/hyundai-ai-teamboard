import { getStore } from "./store";
import { PRIORITY_LABEL, STATUS_LABEL, type Settings, type Task } from "./schemas";

export const SHEET_TYPE = "tasks";
/** «버전» = 원본 수정 시각(ISO). Apps Script 가 늦게 도착한 옛 수정을 무시하는 데 쓴다. */
export const SHEET_HEADERS = ["ID", "담당자", "제목", "상태", "우선순위", "마감일", "체크리스트", "생성일", "수정일", "버전"] as const;
const STATUS_KEY = "sheet-status.json";

export type SheetRow = Record<(typeof SHEET_HEADERS)[number], string>;

export type SheetPayload =
  | { type: string; action: "upsert"; id: string; updatedAt: string; headers: readonly string[]; row: SheetRow }
  | { type: string; action: "delete"; id: string; updatedAt: string }
  | { type: string; action: "replace_all"; headers: readonly string[]; rows: SheetRow[] }
  | { type: string; action: "ping" };

const seoulTime = (iso: string) =>
  iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16) : "";

export function taskToRow(t: Task): SheetRow {
  return {
    ID: t.id,
    담당자: t.owner,
    제목: t.title,
    상태: STATUS_LABEL[t.status],
    우선순위: PRIORITY_LABEL[t.priority],
    마감일: t.due,
    체크리스트: t.checklist.map((c) => `${c.done ? "☑" : "☐"} ${c.text}`).join("\n"),
    생성일: seoulTime(t.createdAt),
    수정일: seoulTime(t.updatedAt),
    버전: t.updatedAt,
  };
}

export const upsertPayload = (t: Task): SheetPayload => ({
  type: SHEET_TYPE,
  action: "upsert",
  id: t.id,
  updatedAt: t.updatedAt,
  headers: SHEET_HEADERS,
  row: taskToRow(t),
});
export const deletePayload = (id: string, updatedAt = new Date().toISOString()): SheetPayload => ({
  type: SHEET_TYPE,
  action: "delete",
  id,
  updatedAt,
});
export const replaceAllPayload = (tasks: Task[]): SheetPayload => ({
  type: SHEET_TYPE,
  action: "replace_all",
  headers: SHEET_HEADERS,
  rows: tasks.map(taskToRow),
});

/* ---------- 전송 ---------- */

export interface SheetTarget {
  url: string;
  secret: string;
}
export interface SendOptions {
  timeoutMs?: number;
  /** 첫 시도 뒤 재시도 사이 대기(ms). 길이 = 재시도 횟수 */
  backoffMs?: number[];
  /** 재시도 포함 전체 시간 한도 */
  budgetMs?: number;
}
type Result = { ok: boolean; error?: string; retry?: boolean };

const DEFAULTS: Required<SendOptions> = { timeoutMs: 5000, backoffMs: [300, 1000], budgetMs: 20_000 };

/** Apps Script 는 POST 결과를 script.googleusercontent.com 으로 302 한다 — 그곳만 따라간다. */
function isAllowedRedirect(location: string): boolean {
  if (!URL.canParse(location)) return false;
  const u = new URL(location);
  const testPrefix = process.env.SHEET_URL_PREFIX_FOR_TESTS;
  if (testPrefix && location.startsWith(testPrefix)) return true;
  return u.protocol === "https:" && u.hostname === "script.googleusercontent.com";
}

async function sendOnce(target: SheetTarget, payload: SheetPayload, timeoutMs: number): Promise<Result> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    let res = await fetch(target.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, secret: target.secret }),
      redirect: "manual",
      signal,
    });
    if (res.status >= 300 && res.status < 400) {
      const location = new URL(res.headers.get("location") ?? "", target.url).toString();
      if (!isAllowedRedirect(location)) return { ok: false, error: "시트 주소가 허용되지 않은 곳으로 이동했습니다" };
      res = await fetch(location, { method: "GET", redirect: "manual", signal });
    }
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `시트 응답 오류 (HTTP ${res.status})`, retry: res.status >= 500 || res.status === 429 };
    const body = safeJson(text);
    if (!body || body.ok !== true) {
      return {
        ok: false,
        error: body?.error
          ? `시트 스크립트 오류: ${body.error}`
          : "시트 스크립트 응답이 올바르지 않습니다. 웹 앱 배포(액세스: 모든 사용자)를 확인하세요.",
      };
    }
    return { ok: true };
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, error: timeout ? `시트 응답 시간 초과(${timeoutMs / 1000}초)` : "시트 주소에 연결하지 못했습니다", retry: true };
  }
}

/** 시트로 전송(네트워크·5xx 오류는 짧게 재시도). 실패해도 throw 하지 않고 결과만 돌려준다(원본은 Blob). */
export async function postToSheet(target: SheetTarget, payload: SheetPayload, opts: SendOptions = {}): Promise<{ ok: boolean; error?: string }> {
  const { timeoutMs, backoffMs, budgetMs } = { ...DEFAULTS, ...opts };
  const deadline = Date.now() + budgetMs;
  let result = await sendOnce(target, payload, timeoutMs);
  for (const wait of backoffMs) {
    if (result.ok || !result.retry || Date.now() + wait + timeoutMs > deadline) break;
    await new Promise((r) => setTimeout(r, wait));
    result = await sendOnce(target, payload, timeoutMs);
  }
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

function safeJson(text: string): { ok?: boolean; error?: string } | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ---------- 상태 기록 ---------- */

export interface SheetStatus {
  lastOkAt: string;
  lastError: string;
  lastErrorAt: string;
}
const EMPTY_STATUS: SheetStatus = { lastOkAt: "", lastError: "", lastErrorAt: "" };

export async function getSheetStatus(): Promise<SheetStatus> {
  return (await getStore().getJson<SheetStatus>(STATUS_KEY)) ?? EMPTY_STATUS;
}

/** 성공하면 마지막 오류를 지운다. */
export async function recordSheetResult(result: { ok: boolean; error?: string }, now = new Date().toISOString()) {
  await getStore().updateJson<SheetStatus>(STATUS_KEY, (prev) =>
    result.ok
      ? { lastOkAt: now, lastError: "", lastErrorAt: "" }
      : { ...(prev ?? EMPTY_STATUS), lastError: result.error ?? "알 수 없는 오류", lastErrorAt: now },
  );
}

/** 설정된 시트가 있으면 보내고 결과를 기록한다(연결 안 됐으면 아무것도 안 함). */
export async function syncToSheet(s: Pick<Settings, "sheetUrl" | "sheetSecret">, payload: SheetPayload): Promise<void> {
  if (!s.sheetUrl) return;
  await recordSheetResult(await postToSheet({ url: s.sheetUrl, secret: s.sheetSecret }, payload));
}
