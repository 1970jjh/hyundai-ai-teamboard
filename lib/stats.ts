import { addDays } from "./dates";
import type { Task } from "./schemas";

export const SOON_DAYS = 3;

export type DueState = "overdue" | "soon" | "later" | "none" | "closed";

export function dueState(task: Pick<Task, "due" | "status">, today: string): DueState {
  if (task.status === "done") return "closed";
  if (!task.due) return "none";
  if (task.due < today) return "overdue";
  if (task.due <= addDays(today, SOON_DAYS)) return "soon";
  return "later";
}

export interface TeamStats {
  total: number;
  todo: number;
  doing: number;
  done: number;
  completionRate: number;
  overdue: number;
  soon: number;
}

export function teamStats(tasks: Task[], today: string): TeamStats {
  const count = (fn: (t: Task) => boolean) => tasks.filter(fn).length;
  const done = count((t) => t.status === "done");
  return {
    total: tasks.length,
    todo: count((t) => t.status === "todo"),
    doing: count((t) => t.status === "doing"),
    done,
    completionRate: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    overdue: count((t) => dueState(t, today) === "overdue"),
    soon: count((t) => dueState(t, today) === "soon"),
  };
}

export interface MemberLoad {
  name: string;
  todo: number;
  doing: number;
  done: number;
  overdue: number;
}

/** 명단 순서대로, 명단에 없는 담당자(삭제된 팀원)의 카드도 뒤에 붙인다. */
export function memberLoads(tasks: Task[], members: string[], today: string): MemberLoad[] {
  const names = [...new Set([...members, ...tasks.map((t) => t.owner)])];
  return names.map((name) => {
    const mine = tasks.filter((t) => t.owner === name);
    const count = (fn: (t: Task) => boolean) => mine.filter(fn).length;
    return {
      name,
      todo: count((t) => t.status === "todo"),
      doing: count((t) => t.status === "doing"),
      done: count((t) => t.status === "done"),
      overdue: count((t) => dueState(t, today) === "overdue"),
    };
  });
}

/** 지연(오래된 순) → 임박(가까운 순) */
export function deadlineAlerts(tasks: Task[], today: string): Array<Task & { state: "overdue" | "soon" }> {
  return tasks
    .map((t) => ({ ...t, state: dueState(t, today) }))
    .filter((t): t is Task & { state: "overdue" | "soon" } => t.state === "overdue" || t.state === "soon")
    .sort((a, b) => (a.state === b.state ? a.due.localeCompare(b.due) : a.state === "overdue" ? -1 : 1));
}

export function checklistProgress(task: Pick<Task, "checklist">): string {
  if (!task.checklist.length) return "";
  return `${task.checklist.filter((c) => c.done).length}/${task.checklist.length}`;
}
