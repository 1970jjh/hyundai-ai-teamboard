import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { APPS_SCRIPT_CODE, appsScriptCodeFor } from "@/lib/appsScriptCode";
import { toCsv } from "@/lib/csv";
import { deletePayload, postToSheet, replaceAllPayload, SHEET_HEADERS, taskToRow, upsertPayload } from "@/lib/sheets";
import { makeTask } from "./fixtures";

const task = makeTask({
  title: '교육장 섭외, "대관" 확정',
  priority: "high",
  status: "doing",
  due: "2026-09-30",
  checklist: [
    { text: "후보 비교", done: true },
    { text: "강사 확정", done: false },
  ],
});
const SECRET = "a".repeat(64);

describe("시트 페이로드", () => {
  it("한글 헤더 순서 고정(마지막은 순서 판정용 버전)", () => {
    expect(SHEET_HEADERS).toEqual(["ID", "담당자", "제목", "상태", "우선순위", "마감일", "체크리스트", "생성일", "수정일", "버전"]);
  });
  it("카드 → 한 줄", () => {
    expect(taskToRow(task)).toEqual({
      ID: task.id,
      담당자: "김지현",
      제목: task.title,
      상태: "진행 중",
      우선순위: "높음",
      마감일: "2026-09-30",
      체크리스트: "☑ 후보 비교\n☐ 강사 확정",
      생성일: "2026-09-24 10:00",
      수정일: "2026-09-24 10:00",
      버전: task.updatedAt,
    });
  });
  it("upsert / delete / replace_all 모양 — updatedAt 포함", () => {
    expect(upsertPayload(task)).toMatchObject({ type: "tasks", action: "upsert", id: task.id, updatedAt: task.updatedAt, headers: SHEET_HEADERS });
    expect(deletePayload("x", "2026-09-25T00:00:00.000Z")).toEqual({ type: "tasks", action: "delete", id: "x", updatedAt: "2026-09-25T00:00:00.000Z" });
    expect(replaceAllPayload([task])).toMatchObject({ type: "tasks", action: "replace_all", rows: [taskToRow(task)] });
  });
  it("앱에 보이는 Apps Script 코드 = apps-script/Code.gs, 비밀값이 한 곳에 들어간다", () => {
    expect(APPS_SCRIPT_CODE).toBe(readFileSync("apps-script/Code.gs", "utf8"));
    const code = appsScriptCodeFor(SECRET);
    expect(code).toContain(`var SECRET = '${SECRET}';`);
    expect(code).not.toContain("__SHEET_SECRET__");
  });
  it("CSV — BOM, 헤더, 따옴표 이스케이프", () => {
    const csv = toCsv([task]);
    expect(csv.startsWith("﻿ID,담당자,제목")).toBe(true);
    expect(csv).toContain('"교육장 섭외, ""대관"" 확정"');
  });
  it("CSV — 수식 주입 방어(= + - @ 탭 으로 시작하면 ' 를 붙인다)", () => {
    for (const title of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1"]) {
      const line = toCsv([makeTask({ title })]).split("\r\n")[1];
      expect(line).toMatch(/,"?'[=+\-@\t]/);
    }
    expect(toCsv([makeTask({ title: "평범한 제목" })])).toContain(",평범한 제목,");
  });
});

describe("가짜 수신 서버로 전송 검증", () => {
  let server: Server;
  let base = "";
  const received: Array<Record<string, unknown>> = [];
  const calls: Record<string, number> = {};
  const fast = { timeoutMs: 1000, backoffMs: [10, 10], budgetMs: 5000 };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const url = req.url ?? "";
        calls[url] = (calls[url] ?? 0) + 1;
        if (url === "/redirect") {
          // Apps Script 처럼 302 로 결과 주소를 돌려준다
          received.push(JSON.parse(body));
          res.writeHead(302, { Location: "/result" }).end();
        } else if (url === "/result") res.end(JSON.stringify({ ok: true }));
        else if (url === "/evil-redirect") res.writeHead(302, { Location: "https://example.com/steal" }).end();
        else if (url === "/ok") {
          received.push(JSON.parse(body));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
        } else if (url === "/flaky") {
          if (calls[url] < 3) res.writeHead(503).end();
          else res.end(JSON.stringify({ ok: true }));
        } else if (url === "/script-error") res.end(JSON.stringify({ ok: false, error: "boom" }));
        else if (url === "/html") res.end("<html>login</html>");
        else if (url === "/slow") setTimeout(() => res.end("{}"), 3000);
        else res.writeHead(500).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.SHEET_URL_PREFIX_FOR_TESTS = `${base}/`;
  });
  afterAll(() => {
    delete process.env.SHEET_URL_PREFIX_FOR_TESTS;
    server.closeAllConnections();
    server.close();
  });
  beforeEach(() => {
    for (const k of Object.keys(calls)) delete calls[k];
  });
  const to = (p: string) => ({ url: `${base}${p}`, secret: SECRET });

  it("정상 전송 — 페이로드 + 시트 비밀값이 도착", async () => {
    expect(await postToSheet(to("/ok"), upsertPayload(task), fast)).toEqual({ ok: true });
    expect(received.at(-1)).toEqual({ ...JSON.parse(JSON.stringify(upsertPayload(task))), secret: SECRET });
  });
  it("Apps Script 식 302 리다이렉트는 따라간다", async () => {
    expect(await postToSheet(to("/redirect"), deletePayload("abc", "t"), fast)).toEqual({ ok: true });
    expect(received.at(-1)).toMatchObject({ type: "tasks", action: "delete", id: "abc", secret: SECRET });
  });
  it("허용되지 않은 곳으로의 리다이렉트는 따라가지 않는다", async () => {
    const r = await postToSheet(to("/evil-redirect"), deletePayload("a"), fast);
    expect(r.error).toMatch(/허용되지 않은/);
    expect(calls["/evil-redirect"]).toBe(1);
  });
  it("일시 오류(5xx)는 짧게 재시도해 성공", async () => {
    expect(await postToSheet(to("/flaky"), deletePayload("a"), fast)).toEqual({ ok: true });
    expect(calls["/flaky"]).toBe(3);
  });
  it("스크립트가 거부한 요청은 재시도하지 않는다", async () => {
    expect((await postToSheet(to("/script-error"), deletePayload("a"), fast)).error).toMatch(/boom/);
    expect(calls["/script-error"]).toBe(1);
  });
  it("실패는 throw 없이 한국어 오류", async () => {
    expect((await postToSheet(to("/html"), deletePayload("a"), fast)).error).toMatch(/모든 사용자/);
    expect((await postToSheet(to("/500"), deletePayload("a"), fast)).error).toMatch(/HTTP 500/);
    expect(calls["/500"]).toBe(3);
    expect((await postToSheet({ url: "http://127.0.0.1:1/x", secret: SECRET }, deletePayload("a"), fast)).error).toMatch(/연결하지 못했/);
  });
  it("타임아웃 + 전체 시간 한도 안에서만 재시도", async () => {
    const started = Date.now();
    const r = await postToSheet(to("/slow"), deletePayload("a"), { timeoutMs: 300, backoffMs: [10, 10], budgetMs: 700 });
    expect(r.error).toMatch(/시간 초과/);
    expect(calls["/slow"]).toBe(2); // 세 번째는 한도(700ms)를 넘기므로 시도하지 않는다
    expect(Date.now() - started).toBeLessThan(1500);
  });
});
