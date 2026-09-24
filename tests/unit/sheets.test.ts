import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APPS_SCRIPT_CODE } from "@/lib/appsScriptCode";
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

describe("시트 페이로드", () => {
  it("한글 헤더 순서 고정", () => {
    expect(SHEET_HEADERS).toEqual(["ID", "담당자", "제목", "상태", "우선순위", "마감일", "체크리스트", "생성일", "수정일"]);
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
    });
  });
  it("upsert / delete / replace_all 모양", () => {
    expect(upsertPayload(task)).toMatchObject({ type: "tasks", action: "upsert", id: task.id, headers: SHEET_HEADERS });
    expect(deletePayload("x")).toEqual({ type: "tasks", action: "delete", id: "x" });
    expect(replaceAllPayload([task])).toMatchObject({ type: "tasks", action: "replace_all", rows: [taskToRow(task)] });
  });
  it("앱에 보이는 Apps Script 코드 = apps-script/Code.gs", () => {
    expect(APPS_SCRIPT_CODE).toBe(readFileSync("apps-script/Code.gs", "utf8"));
  });
  it("CSV — BOM, 헤더, 따옴표 이스케이프", () => {
    const csv = toCsv([task]);
    expect(csv.startsWith("﻿ID,담당자,제목")).toBe(true);
    expect(csv).toContain('"교육장 섭외, ""대관"" 확정"');
  });
});

describe("가짜 수신 서버로 전송 검증", () => {
  let server: Server;
  let base = "";
  const received: unknown[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.url === "/redirect") {
          // Apps Script 처럼 302 로 결과 주소를 돌려준다
          received.push(JSON.parse(body));
          res.writeHead(302, { Location: "/result" }).end();
        } else if (req.url === "/result") res.end(JSON.stringify({ ok: true }));
        else if (req.url === "/ok") {
          received.push(JSON.parse(body));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
        } else if (req.url === "/script-error") res.end(JSON.stringify({ ok: false, error: "boom" }));
        else if (req.url === "/html") res.end("<html>login</html>");
        else if (req.url === "/slow") setTimeout(() => res.end("{}"), 6000);
        else res.writeHead(500).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  it("정상 전송 — 페이로드가 그대로 도착", async () => {
    expect(await postToSheet(`${base}/ok`, upsertPayload(task))).toEqual({ ok: true });
    expect(received.at(-1)).toEqual(JSON.parse(JSON.stringify(upsertPayload(task))));
  });
  it("Apps Script 식 302 리다이렉트도 성공", async () => {
    expect(await postToSheet(`${base}/redirect`, deletePayload("abc"))).toEqual({ ok: true });
    expect(received.at(-1)).toEqual({ type: "tasks", action: "delete", id: "abc" });
  });
  it("실패는 throw 없이 한국어 오류", async () => {
    expect((await postToSheet(`${base}/script-error`, deletePayload("a"))).error).toMatch(/boom/);
    expect((await postToSheet(`${base}/html`, deletePayload("a"))).error).toMatch(/모든 사용자/);
    expect((await postToSheet(`${base}/500`, deletePayload("a"))).error).toMatch(/HTTP 500/);
    expect((await postToSheet("http://127.0.0.1:1/x", deletePayload("a"))).error).toMatch(/연결하지 못했/);
  });
  it("5초 타임아웃", async () => {
    expect((await postToSheet(`${base}/slow`, deletePayload("a"))).error).toMatch(/시간 초과/);
  }, 10_000);
});
