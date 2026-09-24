import { promises as fs } from "node:fs";
import path from "node:path";
import { put, get, list, del, BlobNotFoundError, BlobPreconditionFailedError } from "@vercel/blob";

/**
 * 저장소: 레코드 1건 = JSON 파일 1개.
 * Blob 자격증명(BLOB_READ_WRITE_TOKEN 또는 BLOB_STORE_ID+OIDC)이 있으면 Vercel Blob(private), 없으면 로컬 파일(.data/).
 */
export interface Store {
  /** createOnly=true 이면 이미 있을 때 false 를 돌려주고 덮어쓰지 않는다. */
  putJson(key: string, value: unknown, opts?: { createOnly?: boolean }): Promise<boolean>;
  getJson<T>(key: string): Promise<T | null>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
  /**
   * 읽고-고치고-쓰기를 원자적으로. fn 이 null 을 돌려주면 쓰지 않고 null.
   * (현재 값이 없을 때 fn 이 null 을 돌려주면 → 지워진 레코드를 되살리지 않는다.)
   */
  updateJson<T>(key: string, fn: (current: T | null) => T | null): Promise<T | null>;
}

export class StoreConflictError extends Error {
  readonly status = 409;
  constructor() {
    super("다른 요청과 동시에 저장되어 반영하지 못했습니다. 잠시 뒤 다시 시도하세요.");
  }
}

export const BLOB_MISSING_MESSAGE =
  "Vercel Blob 저장소가 연결되지 않았습니다 — README «설치» 3단계처럼 Vercel 프로젝트 › Storage 에서 Blob 을 연결한 뒤 다시 배포해 주세요.";

const MAX_TRIES = 5;

function assertKey(key: string): void {
  if (!/^[a-z0-9-]+(\/[a-zA-Z0-9-]+)*\.json$/.test(key) && !/^[a-z0-9-]+\/$/.test(key)) {
    throw new Error(`잘못된 저장 경로: ${key}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- 로컬 파일 ---------- */

// ponytail: 프로세스 안 뮤텍스(로컬 개발·테스트는 한 프로세스). 여러 프로세스가 같은 폴더를 쓰면 파일 잠금이 필요.
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const run = (locks.get(id) ?? Promise.resolve()).then(fn, fn);
  const tail = run.catch(() => undefined);
  locks.set(id, tail);
  try {
    return await run;
  } finally {
    if (locks.get(id) === tail) locks.delete(id);
  }
}

async function readFileJson<T>(target: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(target, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function writeFileJson(target: string, value: unknown, createOnly?: boolean): Promise<boolean> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const body = JSON.stringify(value);
  if (createOnly) {
    try {
      await fs.writeFile(target, body, { flag: "wx" });
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw e;
    }
  }
  // 임시 파일에 쓰고 rename → 읽는 쪽이 반쯤 쓰인 파일을 보지 않는다.
  const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, body);
  await renameWithRetry(tmp, target);
  return true;
}

/** Windows 는 다른 프로세스가 파일을 읽는 중이면 rename 이 EPERM 으로 잠깐 실패한다. */
async function renameWithRetry(from: string, to: string, tries = 5): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (i >= tries || (code !== "EPERM" && code !== "EBUSY")) throw e;
      await sleep(20 * (i + 1));
    }
  }
}

export function createLocalStore(dir: string): Store {
  const file = (key: string) => {
    assertKey(key);
    return path.join(dir, ...key.split("/"));
  };
  return {
    async putJson(key, value, opts) {
      const target = file(key);
      return withLock(target, () => writeFileJson(target, value, opts?.createOnly));
    },
    async getJson<T>(key: string) {
      return readFileJson<T>(file(key));
    },
    async list(prefix) {
      assertKey(prefix);
      const folder = path.join(dir, ...prefix.split("/").filter(Boolean));
      try {
        const names = await fs.readdir(folder);
        return names.filter((n) => n.endsWith(".json")).map((n) => `${prefix}${n}`);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw e;
      }
    },
    async delete(key) {
      const target = file(key);
      await withLock(target, () => fs.rm(target, { force: true }));
    },
    async updateJson<T>(key: string, fn: (current: T | null) => T | null) {
      const target = file(key);
      return withLock(target, async () => {
        const next = fn(await readFileJson<T>(target));
        if (next !== null) await writeFileJson(target, next);
        return next;
      });
    },
  };
}

/* ---------- Vercel Blob ---------- */

const isConflict = (e: unknown) =>
  e instanceof BlobPreconditionFailedError || e instanceof BlobNotFoundError || /already exists/i.test(String(e));

/** 자격증명은 SDK 가 고른다(BLOB_READ_WRITE_TOKEN 또는 VERCEL_OIDC_TOKEN + BLOB_STORE_ID). */
export function createBlobStore(): Store {
  const readVersioned = async <T>(key: string): Promise<{ value: T; etag: string } | null> => {
    // useCache:false → 방금 쓴 내용을 바로 읽는다(CDN 캐시 우회).
    const res = await get(key, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) return null;
    return { value: JSON.parse(await new Response(res.stream).text()) as T, etag: res.blob.etag };
  };
  const write = (key: string, value: unknown, opts: { createOnly?: boolean; ifMatch?: string }) =>
    put(key, JSON.stringify(value), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: !opts.createOnly,
      ifMatch: opts.ifMatch,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
  return {
    async putJson(key, value, opts) {
      assertKey(key);
      try {
        await write(key, value, { createOnly: opts?.createOnly });
        return true;
      } catch (e) {
        if (opts?.createOnly && isConflict(e)) return false;
        throw e;
      }
    },
    async getJson<T>(key: string) {
      assertKey(key);
      return (await readVersioned<T>(key))?.value ?? null;
    },
    async list(prefix) {
      assertKey(prefix);
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, cursor, limit: 1000 });
        keys.push(...page.blobs.map((b) => b.pathname));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return keys;
    },
    async delete(key) {
      assertKey(key);
      await del(key);
    },
    async updateJson<T>(key: string, fn: (current: T | null) => T | null) {
      assertKey(key);
      for (let i = 0; i < MAX_TRIES; i++) {
        const cur = await readVersioned<T>(key);
        const next = fn(cur?.value ?? null);
        if (next === null) return null;
        try {
          // 있으면 ETag 가 같을 때만, 없으면 새로 만들 때만 쓴다.
          await write(key, next, cur ? { ifMatch: cur.etag } : { createOnly: true });
          return next;
        } catch (e) {
          if (!isConflict(e)) throw e;
          await sleep(50 + Math.random() * 100 * (i + 1));
        }
      }
      throw new StoreConflictError();
    },
  };
}

export const hasBlobCredentials = (env: Record<string, string | undefined> = process.env) =>
  Boolean(env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID);

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  if (hasBlobCredentials()) {
    cached = createBlobStore();
  } else if (process.env.VERCEL) {
    // Vercel 에서 로컬 파일로 가면 데이터가 사라진다 → 명확히 실패시킨다.
    throw new Error(BLOB_MISSING_MESSAGE);
  } else {
    cached = createLocalStore(process.env.DATA_DIR || path.join(process.cwd(), ".data"));
  }
  return cached;
}
