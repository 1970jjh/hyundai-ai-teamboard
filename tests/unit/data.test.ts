import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { TaskInput } from "@/lib/schemas";
import { makeTask } from "./fixtures";

// 저장소를 임시 폴더로 — 모듈을 불러오기 전에 설정
const dir = mkdtempSync(path.join(tmpdir(), "tb-data-"));
process.env.DATA_DIR = dir;
delete process.env.BLOB_READ_WRITE_TOKEN;
const { getSettings, updateSettings, applyPatch, maskKey, adminView } = await import("@/lib/settings");
const { createTask, updateTask, listTasks, deleteTask, deleteAllTasks, mergeTask, getTask } = await import("@/lib/tasks");
const { verifyPassword, DEFAULT_PASSWORD } = await import("@/lib/auth");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const input = (title: string, owner = "김지현"): TaskInput => ({
  owner,
  title,
  due: "",
  priority: "medium",
  category: "",
  checklist: [],
  status: "todo",
});

describe("설정", () => {
  it("첫 실행: 기본 비밀번호·서명 비밀값 자동 생성, 동시 요청에도 하나만 저장", async () => {
    const all = await Promise.all(Array.from({ length: 8 }, () => getSettings()));
    const stored = await getSettings();
    expect(all.map((s) => s.sessionSecret)).toContain(stored.sessionSecret);
    expect(stored.sessionSecret).toHaveLength(64);
    expect(verifyPassword(DEFAULT_PASSWORD, stored.passwordHash)).toBe(true);
    expect(stored.members).toEqual([]);
    expect(stored.model).toBe("gemini-3.7-flash");
    expect((await getSettings()).sessionSecret).toBe(stored.sessionSecret);
  });
  it("수정은 합쳐서 저장, 명단 중복 제거", async () => {
    await updateSettings(applyPatch({ members: ["김지현", "박서연", "김지현"], teamName: "인재육성팀" }));
    const s = await getSettings();
    expect(s.members).toEqual(["김지현", "박서연"]);
    expect(s.teamName).toBe("인재육성팀");
    expect(s.model).toBe("gemini-3.7-flash");
  });
  it("키는 가려서만 보여 준다", async () => {
    await updateSettings({ geminiKey: "AIza.fake.TESTKEY.not.real.ab12" });
    const view = adminView(await getSettings());
    expect(view.keyMasked).toBe("AIza…ab12");
    expect(JSON.stringify(view)).not.toContain("TESTKEY");
    expect(JSON.stringify(view)).not.toMatch(/passwordHash|sessionSecret/);
    expect(maskKey("")).toBe("");
  });
});

describe("업무 카드", () => {
  it("생성·수정·삭제", async () => {
    const t = await createTask({ ...input("교육장 섭외"), due: "2026-09-30", priority: "high" });
    expect((await getTask(t.id))?.title).toBe("교육장 섭외");
    const done = await updateTask(t.id, { status: "done" }, "2026-09-25T00:00:00.000Z");
    expect(done).toMatchObject({ status: "done", completedAt: "2026-09-25T00:00:00.000Z", due: "2026-09-30", title: "교육장 섭외" });
    expect(await deleteTask(t.id)).toBe(true);
    expect(await getTask(t.id)).toBeNull();
    expect(await deleteTask(t.id)).toBe(false);
    expect(await updateTask(t.id, { status: "doing" })).toBeNull();
  });
  it("완료 해제하면 완료일도 지운다", () => {
    const t = makeTask({ status: "done", completedAt: "2026-09-20T00:00:00.000Z" });
    expect(mergeTask(t, { status: "doing" }, "2026-09-25T00:00:00.000Z").completedAt).toBe("");
    expect(mergeTask(t, { title: "x" }, "2026-09-25T00:00:00.000Z").completedAt).toBe("2026-09-20T00:00:00.000Z");
  });
  it("잘못된 id 로는 파일에 접근하지 않는다", async () => {
    expect(await getTask("../settings")).toBeNull();
  });
  it("동시성: 20건 동시 저장 → 20건 모두 조회, 유실 없음", async () => {
    await deleteAllTasks();
    const created = await Promise.all(Array.from({ length: 20 }, (_, i) => createTask(input(`동시 카드 ${i}`, `팀원${i % 5}`))));
    const listed = await listTasks();
    expect(listed).toHaveLength(20);
    expect(new Set(listed.map((t) => t.id))).toEqual(new Set(created.map((t) => t.id)));
    await Promise.all(created.map((t) => updateTask(t.id, { status: "doing" })));
    expect((await listTasks()).every((t) => t.status === "doing")).toBe(true);
    expect(await deleteAllTasks()).toBe(20);
    expect(await listTasks()).toEqual([]);
  });
});
