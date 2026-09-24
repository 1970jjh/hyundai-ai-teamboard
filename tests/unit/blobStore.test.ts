import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * @vercel/blob 을 메모리 가짜로 바꿔 ETag 조건부 쓰기·재시도·자격증명 판정을 검사한다.
 * 가짜는 실제 SDK 처럼 ifMatch 불일치/없는 blob → BlobPreconditionFailedError, allowOverwrite:false 인데 있으면 오류.
 */
const blobs = new Map<string, { body: string; etag: number }>();
let etagSeq = 0;
const puts: Array<{ key: string; ifMatch?: string; allowOverwrite?: boolean }> = [];
/** 읽기 직후 다른 요청이 끼어드는 상황을 흉내 낸다 */
let interleave: (() => void) | null = null;

vi.mock("@vercel/blob", async () => {
  const actual = await vi.importActual<typeof import("@vercel/blob")>("@vercel/blob");
  return {
    BlobPreconditionFailedError: actual.BlobPreconditionFailedError,
    BlobNotFoundError: actual.BlobNotFoundError,
    get: async (key: string) => {
      const b = blobs.get(key);
      const hook = interleave;
      interleave = null;
      hook?.();
      if (!b) return null;
      return { statusCode: 200, stream: new Response(b.body).body, blob: { etag: String(b.etag) } };
    },
    put: async (key: string, body: string, opts: { ifMatch?: string; allowOverwrite?: boolean }) => {
      puts.push({ key, ifMatch: opts.ifMatch, allowOverwrite: opts.allowOverwrite });
      const cur = blobs.get(key);
      if (opts.ifMatch !== undefined && (!cur || String(cur.etag) !== opts.ifMatch)) throw new actual.BlobPreconditionFailedError();
      if (!opts.allowOverwrite && opts.ifMatch === undefined && cur) throw new actual.BlobError("This blob already exists");
      blobs.set(key, { body, etag: ++etagSeq });
      return {};
    },
    del: async (key: string) => void blobs.delete(key),
    list: async () => ({ blobs: [...blobs.keys()].map((pathname) => ({ pathname })), hasMore: false }),
  };
});

const { createBlobStore, hasBlobCredentials, BLOB_MISSING_MESSAGE, StoreConflictError } = await import("@/lib/store");

beforeEach(() => {
  blobs.clear();
  puts.length = 0;
  interleave = null;
});

describe("Blob 저장소 — ETag 조건부 쓰기", () => {
  it("읽은 뒤 다른 요청이 먼저 쓰면 재시도해서 두 변경을 모두 살린다", async () => {
    const store = createBlobStore();
    await store.putJson("settings.json", { members: ["a"], key: "" });
    interleave = () => blobs.set("settings.json", { body: JSON.stringify({ members: ["a"], key: "K" }), etag: ++etagSeq });
    const next = await store.updateJson<{ members: string[]; key: string }>("settings.json", (cur) => ({ ...cur!, members: [...cur!.members, "b"] }));
    expect(next).toEqual({ members: ["a", "b"], key: "K" });
    expect(await store.getJson("settings.json")).toEqual({ members: ["a", "b"], key: "K" });
    expect(puts.filter((p) => p.ifMatch)).toHaveLength(2); // 첫 시도 충돌 → 재시도
  });
  it("수정 도중 삭제되면 되살리지 않는다", async () => {
    const store = createBlobStore();
    await store.putJson("tasks/t1.json", { v: 1 });
    interleave = () => blobs.delete("tasks/t1.json");
    expect(await store.updateJson<{ v: number }>("tasks/t1.json", (cur) => (cur ? { v: cur.v + 1 } : null))).toBeNull();
    expect(blobs.has("tasks/t1.json")).toBe(false);
  });
  it("첫 실행 생성은 원자적(이미 있으면 덮어쓰지 않고 그 값을 쓴다)", async () => {
    const store = createBlobStore();
    interleave = () => blobs.set("settings.json", { body: JSON.stringify({ secret: "winner" }), etag: ++etagSeq });
    const got = await store.updateJson<{ secret: string }>("settings.json", (cur) => cur ?? { secret: "mine" });
    expect(got).toEqual({ secret: "winner" });
    expect(await store.putJson("settings.json", { secret: "x" }, { createOnly: true })).toBe(false);
  });
  it("5번 모두 충돌하면 한국어 409 오류", async () => {
    const store = createBlobStore();
    await store.putJson("settings.json", { n: 0 });
    const bump = () => blobs.set("settings.json", { body: '{"n":0}', etag: ++etagSeq });
    let tries = 0;
    await expect(
      store.updateJson("settings.json", (cur) => {
        tries++;
        bump(); // 매번 쓰기 직전에 다른 요청이 이긴다
        return cur;
      }),
    ).rejects.toBeInstanceOf(StoreConflictError);
    expect(tries).toBe(5);
  });
});

describe("저장소 선택", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  it("BLOB_READ_WRITE_TOKEN 또는 BLOB_STORE_ID(OIDC) 둘 다 Blob 모드", () => {
    expect(hasBlobCredentials({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" })).toBe(true);
    expect(hasBlobCredentials({ BLOB_STORE_ID: "store_abc", VERCEL_OIDC_TOKEN: "t" })).toBe(true);
    expect(hasBlobCredentials({})).toBe(false);
  });
  it("Vercel 인데 Blob 자격증명이 없으면 로컬 파일로 가지 않고 명확한 오류", async () => {
    vi.resetModules();
    process.env = { ...saved, VERCEL: "1", BLOB_READ_WRITE_TOKEN: "", BLOB_STORE_ID: "" };
    const fresh = await import("@/lib/store");
    expect(() => fresh.getStore()).toThrow(BLOB_MISSING_MESSAGE);
    expect(BLOB_MISSING_MESSAGE).toMatch(/README.*3단계/);
  });
  it("Vercel + BLOB_STORE_ID 만 있어도(OIDC) 저장소가 만들어진다", async () => {
    vi.resetModules();
    process.env = { ...saved, VERCEL: "1", BLOB_READ_WRITE_TOKEN: "", BLOB_STORE_ID: "store_abc" };
    const fresh = await import("@/lib/store");
    expect(() => fresh.getStore()).not.toThrow();
  });
});
