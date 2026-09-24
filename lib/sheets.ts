import { getStore } from "./store";
import { PRIORITY_LABEL, STATUS_LABEL, type Task } from "./schemas";

export const SHEET_TYPE = "tasks";
export const SHEET_HEADERS = ["ID", "담당자", "제목", "상태", "우선순위", "마감일", "체크리스트", "생성일", "수정일"] as const;
const STATUS_KEY = "sheet-status.json";
const TIMEOUT_MS = 5000;

export type SheetRow = Record<(typeof SHEET_HEADERS)[number], string>;

export type SheetPayload =
  | { type: string; action: "upsert"; id: string; headers: readonly string[]; row: SheetRow }
  | { type: string; action: "delete"; id: string }
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
  };
}

export const upsertPayload = (t: Task): SheetPayload => ({
  type: SHEET_TYPE,
  action: "upsert",
  id: t.id,
  headers: SHEET_HEADERS,
  row: taskToRow(t),
});
export const deletePayload = (id: string): SheetPayload => ({ type: SHEET_TYPE, action: "delete", id });
export const replaceAllPayload = (tasks: Task[]): SheetPayload => ({
  type: SHEET_TYPE,
  action: "replace_all",
  headers: SHEET_HEADERS,
  rows: tasks.map(taskToRow),
});

/** 시트로 전송. 실패해도 throw 하지 않고 결과만 돌려준다(원본은 Blob). */
export async function postToSheet(url: string, payload: SheetPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `시트 응답 오류 (HTTP ${res.status})` };
    const body = safeJson(text);
    if (!body || body.ok !== true) {
      return { ok: false, error: body?.error ? `시트 스크립트 오류: ${body.error}` : "시트 스크립트 응답이 올바르지 않습니다. 웹 앱 배포(액세스: 모든 사용자)를 확인하세요." };
    }
    return { ok: true };
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, error: timeout ? "시트 응답 시간 초과(5초)" : "시트 주소에 연결하지 못했습니다" };
  }
}

function safeJson(text: string): { ok?: boolean; error?: string } | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export interface SheetStatus {
  lastOkAt: string;
  lastError: string;
  lastErrorAt: string;
}

export async function getSheetStatus(): Promise<SheetStatus> {
  return (await getStore().getJson<SheetStatus>(STATUS_KEY)) ?? { lastOkAt: "", lastError: "", lastErrorAt: "" };
}

export async function recordSheetResult(result: { ok: boolean; error?: string }, now = new Date().toISOString()) {
  const prev = await getSheetStatus();
  const next = result.ok
    ? { ...prev, lastOkAt: now }
    : { ...prev, lastError: result.error ?? "알 수 없는 오류", lastErrorAt: now };
  await getStore().putJson(STATUS_KEY, next);
}

/** 설정된 시트가 있으면 보내고 결과를 기록한다(연결 안 됐으면 아무것도 안 함). */
export async function syncToSheet(url: string, payload: SheetPayload): Promise<void> {
  if (!url) return;
  await recordSheetResult(await postToSheet(url, payload));
}
