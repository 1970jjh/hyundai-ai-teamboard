import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalStore, type Store } from "@/lib/store";

let dir: string;
let store: Store;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tb-store-"));
  store = createLocalStore(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("로컬 저장소", () => {
  it("쓰고 읽고 목록·삭제한다", async () => {
    await store.putJson("tasks/aaa.json", { a: 1 });
    await store.putJson("tasks/bbb.json", { b: 2 });
    expect(await store.getJson("tasks/aaa.json")).toEqual({ a: 1 });
    expect((await store.list("tasks/")).sort()).toEqual(["tasks/aaa.json", "tasks/bbb.json"]);
    await store.delete("tasks/aaa.json");
    expect(await store.getJson("tasks/aaa.json")).toBeNull();
    expect(await store.list("tasks/")).toEqual(["tasks/bbb.json"]);
  });

  it("없는 파일·폴더는 null·빈 목록", async () => {
    expect(await store.getJson("settings.json")).toBeNull();
    expect(await store.list("tasks/")).toEqual([]);
    await expect(store.delete("tasks/none.json")).resolves.toBeUndefined();
  });

  it("덮어쓰기 하면 최신 값이 바로 보인다", async () => {
    await store.putJson("settings.json", { v: 1 });
    await store.putJson("settings.json", { v: 2 });
    expect(await store.getJson("settings.json")).toEqual({ v: 2 });
  });

  it("createOnly 는 이미 있으면 덮어쓰지 않는다", async () => {
    expect(await store.putJson("settings.json", { v: 1 }, { createOnly: true })).toBe(true);
    expect(await store.putJson("settings.json", { v: 2 }, { createOnly: true })).toBe(false);
    expect(await store.getJson("settings.json")).toEqual({ v: 1 });
  });

  it("경로 조작(../)을 막는다", async () => {
    await expect(store.putJson("../evil.json", {})).rejects.toThrow(/잘못된 저장 경로/);
    await expect(store.getJson("tasks/../../x.json")).rejects.toThrow(/잘못된 저장 경로/);
  });

  it("동시성: 20건 동시 저장 → 20건 모두 조회", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `id-${i}`);
    await Promise.all(ids.map((id) => store.putJson(`tasks/${id}.json`, { id })));
    const keys = await store.list("tasks/");
    expect(keys).toHaveLength(20);
    const values = await Promise.all(keys.map((k) => store.getJson<{ id: string }>(k)));
    expect(values.map((v) => v?.id).sort()).toEqual([...ids].sort());
  });
});

describe("로컬 저장소 — 조건부 쓰기(updateJson)", () => {
  it("동시에 20번 고쳐도 하나도 잃지 않는다", async () => {
    await store.putJson("settings.json", { n: 0, tags: [] as number[] });
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.updateJson<{ n: number; tags: number[] }>("settings.json", (cur) => ({ n: cur!.n + 1, tags: [...cur!.tags, i] })),
      ),
    );
    const v = await store.getJson<{ n: number; tags: number[] }>("settings.json");
    expect(v?.n).toBe(20);
    expect(v?.tags).toHaveLength(20);
  });
  it("없는(지워진) 레코드는 fn 이 null 을 주면 되살리지 않는다", async () => {
    expect(await store.updateJson("tasks/gone.json", (cur) => (cur ? cur : null))).toBeNull();
    expect(await store.getJson("tasks/gone.json")).toBeNull();
  });
  it("삭제와 수정이 겹쳐도 삭제가 이기면 수정이 되살리지 않는다", async () => {
    await store.putJson("tasks/x.json", { v: 1 });
    await Promise.all([
      store.delete("tasks/x.json"),
      store.updateJson<{ v: number }>("tasks/x.json", (cur) => (cur ? { v: cur.v + 1 } : null)),
    ]);
    expect(await store.getJson("tasks/x.json")).toBeNull();
  });
});
