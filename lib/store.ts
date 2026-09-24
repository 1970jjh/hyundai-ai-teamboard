import { promises as fs } from "node:fs";
import path from "node:path";
import { put, get, list, del, BlobPreconditionFailedError } from "@vercel/blob";

/**
 * 저장소: 레코드 1건 = JSON 파일 1개.
 * BLOB_READ_WRITE_TOKEN 이 있으면 Vercel Blob(private), 없으면 로컬 파일(.data/).
 */
export interface Store {
  /** createOnly=true 이면 이미 있을 때 false 를 돌려주고 덮어쓰지 않는다. */
  putJson(key: string, value: unknown, opts?: { createOnly?: boolean }): Promise<boolean>;
  getJson<T>(key: string): Promise<T | null>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

function assertKey(key: string): void {
  if (!/^[a-z0-9-]+(\/[a-zA-Z0-9-]+)*\.json$/.test(key) && !/^[a-z0-9-]+\/$/.test(key)) {
    throw new Error(`잘못된 저장 경로: ${key}`);
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
      await fs.mkdir(path.dirname(target), { recursive: true });
      const body = JSON.stringify(value);
      if (opts?.createOnly) {
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
    },
    async getJson<T>(key: string) {
      try {
        return JSON.parse(await fs.readFile(file(key), "utf8")) as T;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
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
      await fs.rm(file(key), { force: true });
    },
  };
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
      await new Promise((r) => setTimeout(r, 20 * (i + 1)));
    }
  }
}

export function createBlobStore(token: string): Store {
  return {
    async putJson(key, value, opts) {
      assertKey(key);
      try {
        await put(key, JSON.stringify(value), {
          access: "private",
          token,
          addRandomSuffix: false,
          allowOverwrite: !opts?.createOnly,
          contentType: "application/json",
          cacheControlMaxAge: 60,
        });
        return true;
      } catch (e) {
        if (opts?.createOnly && (e instanceof BlobPreconditionFailedError || /already exists/i.test(String(e)))) {
          return false;
        }
        throw e;
      }
    },
    async getJson<T>(key: string) {
      assertKey(key);
      // useCache:false → 방금 쓴 내용을 바로 읽는다(CDN 캐시 우회).
      const res = await get(key, { access: "private", token, useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return JSON.parse(await new Response(res.stream).text()) as T;
    },
    async list(prefix) {
      assertKey(prefix);
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, cursor, token, limit: 1000 });
        keys.push(...page.blobs.map((b) => b.pathname));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return keys;
    },
    async delete(key) {
      assertKey(key);
      await del(key, { token });
    },
  };
}

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    cached = createBlobStore(token);
  } else if (process.env.VERCEL) {
    throw new Error("Vercel Blob 저장소가 연결되지 않았습니다. Vercel 프로젝트 › Storage 에서 Blob 을 연결해 주세요.");
  } else {
    cached = createLocalStore(process.env.DATA_DIR || path.join(process.cwd(), ".data"));
  }
  return cached;
}
