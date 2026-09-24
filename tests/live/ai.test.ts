import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { parseTask, testConnection, writeTeamReport, writeWeeklyReport } from "@/lib/gemini";
import { MODELS, type Model, type Task } from "@/lib/schemas";

if (existsSync(".env.test.local")) process.loadEnvFile(".env.test.local");
const apiKey = process.env.GEMINI_API_KEY_FOR_TESTS ?? "";
const TODAY = "2026-09-24"; // 목요일 → 다음주 수요일 = 2026-09-30

const task = (p: Partial<Task>): Task => ({
  id: crypto.randomUUID(), owner: "김지현", title: "업무", due: "", priority: "medium", category: "교육 운영",
  checklist: [], status: "todo", createdAt: `${TODAY}T01:00:00.000Z`, updatedAt: `${TODAY}T01:00:00.000Z`, completedAt: "", ...p,
});
const TASKS: Task[] = [
  task({ title: "리더십 교육 대상자 명단 확정", status: "done", completedAt: `${TODAY}T02:00:00.000Z`, due: "2026-09-23" }),
  task({ title: "하반기 리더십 진단 운영안 작성", status: "doing", due: "2026-09-26", priority: "high",
    checklist: [{ text: "진단 일정 협의", done: true }, { text: "참여 대상 확정", done: false }] }),
  task({ title: "4분기 교육 수요조사 문항 검토", due: "2026-10-02" }),
  task({ owner: "박서연", title: "채용면접관 교육 콘텐츠 검수", status: "doing", due: "2026-09-22", priority: "high" }),
  task({ owner: "박서연", title: "신입 입문교육 만족도 결과 취합", status: "doing", due: addDays(TODAY, 1) }),
  task({ owner: "이민재", title: "핵심인재 과정 수료자 명단 확정", status: "done", completedAt: `${TODAY}T03:00:00.000Z` }),
];

const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const t = Date.now();
  const out = await fn();
  process.stdout.write(`  ⏱ ${label}: ${Date.now() - t}ms\n`);
  return out;
};

describe.skipIf(!apiKey)("라이브 Gemini (gemini-3.7-flash)", () => {
  const c = { apiKey, model: "gemini-3.7-flash" as Model };
  beforeAll(() => expect(apiKey.length).toBeGreaterThan(10));

  it("연결 테스트", async () => {
    await timed("연결 테스트", () => testConnection(c));
  });

  it("AI 빠른 등록 — '다음주 수요일'을 정확한 날짜로", async () => {
    const out = await timed("빠른 등록", () =>
      parseTask(c, "다음주 수요일까지 신입 온보딩 교육장 섭외하고 강사 확정", TODAY));
    expect(out.due).toBe("2026-09-30");
    expect(out.title.length).toBeGreaterThan(3);
    expect(out.checklist.length).toBeGreaterThanOrEqual(2);
    process.stdout.write(`  → ${JSON.stringify(out)}\n`);
  });

  it("AI 빠른 등록 — 내일/이번 주 금요일", async () => {
    const a = await timed("빠른 등록(내일)", () => parseTask(c, "내일까지 교육 만족도 설문 결과 정리", TODAY));
    expect(a.due).toBe("2026-09-25");
    const b = await timed("빠른 등록(이번 주 금요일)", () => parseTask(c, "이번 주 금요일 오전까지 강사료 품의 올리기", TODAY));
    expect(b.due).toBe("2026-09-25");
  });

  it("내 주간보고 초안", async () => {
    const mine = TASKS.filter((t) => t.owner === "김지현");
    const out = await timed("주간보고", () => writeWeeklyReport(c, "김지현", mine, TODAY));
    expect(out.achievements.length).toBeGreaterThan(0);
    expect(out.plans.length).toBeGreaterThan(0);
    process.stdout.write(`  → ${JSON.stringify(out)}\n`);
  });

  it("AI 팀 주간 리포트", async () => {
    const out = await timed("팀 리포트", () =>
      writeTeamReport(c, "인재육성팀", ["김지현", "박서연", "이민재"], TASKS, TODAY));
    expect(out.headline.length).toBeGreaterThan(0);
    expect(out.bottlenecks.length).toBeGreaterThan(0);
    process.stdout.write(`  → ${JSON.stringify(out)}\n`);
  });

  it.each(MODELS.filter((m) => m !== "gemini-3.7-flash"))("선택 모델 %s 도 JSON 응답", async (model) => {
    const out = await timed(`빠른 등록(${model})`, () =>
      parseTask({ apiKey, model }, "다음주 수요일까지 신입 온보딩 교육장 섭외하고 강사 확정", TODAY));
    expect(out.due).toBe("2026-09-30");
  });

  it("틀린 키는 친절한 한국어 오류", async () => {
    await expect(testConnection({ apiKey: "AIzaInvalidKeyForTest000000000000000", model: c.model })).rejects.toThrow(/키가 올바르지/);
  });
});
