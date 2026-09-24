import type { Task } from "@/lib/schemas";

export const TODAY = "2026-09-24";

export const makeTask = (p: Partial<Task> = {}): Task => ({
  id: crypto.randomUUID(),
  owner: "김지현",
  title: "업무",
  due: "",
  priority: "medium",
  category: "",
  checklist: [],
  status: "todo",
  createdAt: "2026-09-24T01:00:00.000Z",
  updatedAt: "2026-09-24T01:00:00.000Z",
  completedAt: "",
  ...p,
});
