import { describe, expect, it } from "vitest";
import { generateJson, NO_KEY_MESSAGE, taskPrompt, teamPrompt, weeklyPrompt } from "@/lib/gemini";
import { aiTaskSchema } from "@/lib/schemas";
import { makeTask, TODAY } from "./fixtures";

describe("Gemini 호출 준비(네트워크 없음)", () => {
  it("키가 없으면 친절한 안내", async () => {
    await expect(generateJson({ apiKey: "", model: "gemini-3.7-flash" }, "x", aiTaskSchema)).rejects.toThrow(NO_KEY_MESSAGE);
  });
  it("빠른 등록 프롬프트에 서울 기준 오늘·다음주 달력", () => {
    const p = taskPrompt("다음주 수요일까지 교육장 섭외", TODAY);
    expect(p).toContain("오늘: 2026-09-24 (목요일");
    expect(p).toContain("수 2026-09-30");
    expect(p).toContain("다음주 수요일까지 교육장 섭외");
  });
  it("주간보고·팀 리포트 프롬프트에 카드 내용이 들어간다", () => {
    const tasks = [
      makeTask({ title: "명단 확정", status: "done", completedAt: "2026-09-24T02:00:00.000Z" }),
      makeTask({ owner: "박서연", title: "콘텐츠 검수", due: "2026-09-22" }),
    ];
    expect(weeklyPrompt("김지현", tasks.slice(0, 1), TODAY)).toMatch(/\[완료\] 명단 확정.*완료일 2026-09-24/);
    const team = teamPrompt("인재육성팀", ["김지현", "박서연"], tasks, TODAY);
    expect(team).toContain("지연 1");
    expect(team).toContain("[박서연]");
    expect(team).toContain("- 박서연: 할 일 1, 진행 중 0, 완료 0, 지연 1");
  });
});
