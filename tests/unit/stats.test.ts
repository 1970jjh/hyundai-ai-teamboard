import { describe, expect, it } from "vitest";
import { checklistProgress, deadlineAlerts, dueState, memberLoads, teamStats } from "@/lib/stats";
import { makeTask, TODAY } from "./fixtures";

const tasks = [
  makeTask({ owner: "김지현", status: "doing", due: "2026-09-22" }), // 지연
  makeTask({ owner: "김지현", status: "todo", due: "2026-09-27" }), // 임박(3일)
  makeTask({ owner: "박서연", status: "doing", due: "2026-09-28" }), // 4일 뒤 → 여유
  makeTask({ owner: "박서연", status: "done", due: "2026-09-20" }), // 완료는 지연 아님
  makeTask({ owner: "퇴사자", status: "todo" }),
];

describe("집계", () => {
  it("마감 상태", () => {
    expect(tasks.map((t) => dueState(t, TODAY))).toEqual(["overdue", "soon", "later", "closed", "none"]);
    expect(dueState(makeTask({ due: TODAY }), TODAY)).toBe("soon");
  });
  it("현황 카드 수치", () => {
    expect(teamStats(tasks, TODAY)).toEqual({ total: 5, todo: 2, doing: 2, done: 1, completionRate: 20, overdue: 1, soon: 1 });
    expect(teamStats([], TODAY).completionRate).toBe(0);
  });
  it("인원별 부하 — 명단 순서 + 명단 밖 담당자", () => {
    const loads = memberLoads(tasks, ["박서연", "김지현", "이민재"], TODAY);
    expect(loads.map((l) => l.name)).toEqual(["박서연", "김지현", "이민재", "퇴사자"]);
    expect(loads[1]).toEqual({ name: "김지현", todo: 1, doing: 1, done: 0, overdue: 1 });
    expect(loads[2]).toEqual({ name: "이민재", todo: 0, doing: 0, done: 0, overdue: 0 });
  });
  it("지연 먼저, 그다음 임박", () => {
    expect(deadlineAlerts(tasks, TODAY).map((t) => t.state)).toEqual(["overdue", "soon"]);
  });
  it("체크리스트 진행률", () => {
    const t = makeTask({ checklist: [{ text: "a", done: true }, { text: "b", done: false }] });
    expect(checklistProgress(t)).toBe("1/2");
    expect(checklistProgress(makeTask())).toBe("");
  });
});
