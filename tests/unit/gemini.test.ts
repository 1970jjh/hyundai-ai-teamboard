import { afterEach, describe, expect, it, vi } from "vitest";
import { AiError, generateJson, NO_KEY_MESSAGE, taskPrompt, teamPrompt, weeklyPrompt } from "@/lib/gemini";
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
    // 서울 자정 직후 완료 → 서울 날짜로
    const late = makeTask({ title: "심야 완료", status: "done", completedAt: "2026-09-24T15:30:00.000Z" });
    expect(weeklyPrompt("김지현", [late], TODAY)).toContain("완료일 2026-09-25");
    const team = teamPrompt("인재육성팀", ["김지현", "박서연"], tasks, TODAY);
    expect(team).toContain("지연 1");
    expect(team).toContain("[박서연]");
    expect(team).toContain("- 박서연: 할 일 1, 진행 중 0, 완료 0, 지연 1");
  });
});

describe("AI 시간 예산(가짜 fetch)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const config = { apiKey: "test-key-not-real", model: "gemini-3.7-flash" as const };

  /** 응답하지 않다가 취소 신호가 오면 실패하는 fetch */
  const hangingFetch = vi.fn(
    (_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")))),
  );

  it("남은 시간이 부족하면 호출하지 않고 친절한 시간 초과 오류", async () => {
    vi.stubGlobal("fetch", hangingFetch);
    await expect(generateJson(config, "x", aiTaskSchema, Date.now() + 1000)).rejects.toThrow(/너무 오래/);
    expect(hangingFetch).not.toHaveBeenCalled();
  });

  it("예산을 다 쓰면 중단하고 재시도하지 않는다(504)", async () => {
    hangingFetch.mockClear();
    vi.stubGlobal("fetch", hangingFetch);
    const started = Date.now();
    const err = await generateJson(config, "x", aiTaskSchema, Date.now() + 8_500).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.status).toBe(504);
    expect(err.message).toMatch(/너무 오래/);
    expect(hangingFetch).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(9_500);
  }, 15_000);

  it("첫 시도가 서버 오류로 늦게 실패하면 남은 시간이 부족해 재시도하지 않는다", async () => {
    const failingFetch = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 1_000));
      return new Response(JSON.stringify({ error: { code: 500, message: "internal", status: "INTERNAL" } }), { status: 500 });
    });
    vi.stubGlobal("fetch", failingFetch);
    await expect(generateJson(config, "x", aiTaskSchema, Date.now() + 8_500)).rejects.toThrow(/AI 응답/);
    expect(failingFetch).toHaveBeenCalledTimes(1);
  }, 15_000);
});
