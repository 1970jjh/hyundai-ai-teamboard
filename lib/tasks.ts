import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import type { Task, TaskInput, TaskPatch } from "./schemas";

const PREFIX = "tasks/";
const keyOf = (id: string) => `${PREFIX}${id}.json`;
const ID_RE = /^[a-f0-9-]{36}$/;

export function isTaskId(id: string): boolean {
  return ID_RE.test(id);
}

// ponytail: 목록 = list + 파일별 get(병렬). 팀 규모(수백 건)면 충분, 수천 건이면 인덱스 파일로.
export async function listTasks(): Promise<Task[]> {
  const store = getStore();
  const keys = await store.list(PREFIX);
  const tasks = await Promise.all(keys.map((k) => store.getJson<Task>(k)));
  return tasks
    .filter((t): t is Task => t !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTask(id: string): Promise<Task | null> {
  return isTaskId(id) ? getStore().getJson<Task>(keyOf(id)) : null;
}

export async function createTask(input: TaskInput, now = new Date().toISOString()): Promise<Task> {
  const task: Task = {
    ...input,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    completedAt: input.status === "done" ? now : "",
  };
  await getStore().putJson(keyOf(task.id), task);
  return task;
}

export function mergeTask(task: Task, patch: TaskPatch, now: string): Task {
  const next: Task = { ...task, ...patch, updatedAt: now };
  if (patch.status && patch.status !== task.status) {
    return { ...next, completedAt: patch.status === "done" ? now : "" };
  }
  return next;
}

export async function updateTask(id: string, patch: TaskPatch, now = new Date().toISOString()): Promise<Task | null> {
  const task = await getTask(id);
  if (!task) return null;
  const next = mergeTask(task, patch, now);
  await getStore().putJson(keyOf(id), next);
  return next;
}

export async function deleteTask(id: string): Promise<boolean> {
  const task = await getTask(id);
  if (!task) return false;
  await getStore().delete(keyOf(id));
  return true;
}

export async function deleteAllTasks(): Promise<number> {
  const store = getStore();
  const keys = await store.list(PREFIX);
  await Promise.all(keys.map((k) => store.delete(k)));
  return keys.length;
}
