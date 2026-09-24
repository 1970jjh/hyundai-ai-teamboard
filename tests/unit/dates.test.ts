import { describe, expect, it } from "vitest";
import { addDays, calendarContext, daysBetween, formatKoreanDate, seoulDayOf, seoulToday, weekRange, weekdayOf } from "@/lib/dates";

describe("날짜(Asia/Seoul)", () => {
  it("UTC 자정 전이라도 서울이 다음 날이면 다음 날", () => {
    expect(seoulToday(new Date("2026-09-24T15:30:00Z"))).toBe("2026-09-25");
    expect(seoulToday(new Date("2026-09-24T14:59:00Z"))).toBe("2026-09-24");
  });
  it("완료 시각(UTC) → 서울 날짜: 한국 9/25 00:30 완료는 9/25", () => {
    expect(seoulDayOf("2026-09-24T15:30:00.000Z")).toBe("2026-09-25");
    expect(formatKoreanDate(seoulDayOf("2026-09-24T15:30:00.000Z"))).toBe("9월 25일");
  });
  it("더하기·차이·요일", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-09-24", "2026-09-30")).toBe(6);
    expect(weekdayOf("2026-09-24")).toBe("목");
    expect(weekdayOf("2026-11-05")).toBe("목");
  });
  it("주는 월요일 시작", () => {
    expect(weekRange("2026-09-24")).toEqual(["2026-09-21", "2026-09-27"]);
    expect(weekRange("2026-09-27")).toEqual(["2026-09-21", "2026-09-27"]); // 일요일
    expect(weekRange("2026-09-28")).toEqual(["2026-09-28", "2026-10-04"]);
  });
  it("AI 달력 문맥에 다음주 수요일이 정확히 들어간다", () => {
    const ctx = calendarContext("2026-09-24");
    expect(ctx).toContain("오늘: 2026-09-24 (목요일");
    expect(ctx).toMatch(/다음 주\(월~일\):.*수 2026-09-30/);
    expect(ctx).toMatch(/이번 주\(월~일\):.*금 2026-09-25/);
  });
  it("표시 형식", () => {
    expect(formatKoreanDate("2026-09-30")).toBe("9월 30일");
    expect(formatKoreanDate("")).toBe("");
  });
});
