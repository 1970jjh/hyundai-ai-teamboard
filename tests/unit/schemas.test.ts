import { describe, expect, it } from "vitest";
import { aiTaskSchema, settingsPatchSchema, taskInputSchema, taskPatchSchema, weeklyReportSchema } from "@/lib/schemas";

describe("카드 입력 검증", () => {
  it("선택 항목은 기본값으로 채운다", () => {
    const t = taskInputSchema.parse({ owner: " 김지현 ", title: " 교육장 섭외 " });
    expect(t).toMatchObject({ owner: "김지현", title: "교육장 섭외", due: "", priority: "medium", status: "todo", checklist: [] });
  });
  it("수정(patch)은 보낸 항목만 — 기본값으로 덮어쓰지 않는다", () => {
    expect(taskPatchSchema.parse({ status: "done" })).toEqual({ status: "done" });
  });
  it("잘못된 값은 거부", () => {
    expect(taskInputSchema.safeParse({ owner: "a", title: "" }).success).toBe(false);
    expect(taskInputSchema.safeParse({ owner: "a", title: "x", due: "9월 30일" }).success).toBe(false);
    expect(taskInputSchema.safeParse({ owner: "a", title: "x", status: "waiting" }).success).toBe(false);
    expect(taskInputSchema.safeParse({ owner: "a", title: "x".repeat(81) }).success).toBe(false);
    expect(taskInputSchema.safeParse({ owner: "a".repeat(21), title: "x" }).success).toBe(false);
    expect(
      taskInputSchema.safeParse({ owner: "a", title: "x", checklist: Array(16).fill({ text: "a", done: false }) }).success,
    ).toBe(false);
  });
});

describe("설정 검증", () => {
  it("시트 주소는 Apps Script 주소만(빈 값은 끄기)", () => {
    expect(settingsPatchSchema.safeParse({ sheetUrl: "" }).success).toBe(true);
    const ok = (u: string) => settingsPatchSchema.safeParse({ sheetUrl: u }).success;
    expect(ok("https://script.google.com/macros/s/AKfycbx3Q_abc-DEF1234567890/exec")).toBe(true);
    expect(ok("https://evil.example.com/x")).toBe(false);
    // script.google.com 이어도 웹 앱 exec 형식이 아니면 거부
    expect(ok("https://script.google.com/macros/s/AKfycbx3Q_abc-DEF1234567890/dev")).toBe(false);
    expect(ok("https://script.google.com/home")).toBe(false);
    expect(ok("https://script.google.com.evil.com/macros/s/AKfycbx3Q_abc-DEF1234567890/exec")).toBe(false);
    expect(ok("https://script.google.com/macros/s/AKfycbx3Q_abc-DEF1234567890/exec?x=1")).toBe(false);
    expect(settingsPatchSchema.safeParse({ sheetUrl: "http://127.0.0.1/x" }).success).toBe(false);
  });
  it("모델은 정해진 3가지만", () => {
    expect(settingsPatchSchema.safeParse({ model: "gemini-3.8-flash" }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ model: "gpt-9" }).success).toBe(false);
  });
});

describe("AI 응답 검증", () => {
  it("빠른 등록 응답", () => {
    const good = { title: "a", due: "2026-09-30", priority: "high", category: "교육", checklist: ["x"] };
    expect(aiTaskSchema.safeParse(good).success).toBe(true);
    expect(aiTaskSchema.safeParse({ ...good, due: "next wed" }).success).toBe(false);
    expect(aiTaskSchema.safeParse({ ...good, due: "" }).success).toBe(true);
  });
  it("주간보고 응답", () => {
    expect(weeklyReportSchema.safeParse({ achievements: ["a"], plans: [], issues: [] }).success).toBe(true);
    expect(weeklyReportSchema.safeParse({ achievements: "a" }).success).toBe(false);
  });
});
