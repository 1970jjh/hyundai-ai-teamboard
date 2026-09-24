import { cookies } from "next/headers";
import type { z } from "zod";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./auth";
import { AiError } from "./gemini";
import { firstIssue, type Settings } from "./schemas";
import { allow, LIMITS } from "./rateLimit";
import { getSettings } from "./settings";
import { BLOB_MISSING_MESSAGE, StoreConflictError } from "./store";

export const ok = <T>(data: T, init?: ResponseInit) => Response.json({ success: true, data }, init);
export const fail = (error: string, status = 400) => Response.json({ success: false, error }, { status });

const MAX_BODY = 64 * 1024;

/** JSON 본문을 읽어 zod 로 검증. 실패하면 Response 를 돌려준다. */
export async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<{ data: T } | { error: Response }> {
  const text = await req.text();
  if (text.length > MAX_BODY) return { error: fail("요청이 너무 큽니다", 413) };
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { error: fail("잘못된 요청 형식입니다") };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? { data: parsed.data } : { error: fail(firstIssue(parsed.error)) };
}

export async function isAdmin(): Promise<boolean> {
  const s = await getSettings();
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value, s.sessionSecret, s.passwordHash);
}

export async function setSessionCookie(s: Pick<Settings, "sessionSecret" | "passwordHash">): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, signSession(s.sessionSecret, s.passwordHash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** 관리자 API 공통 가드 — 통과하면 null */
export async function guardAdmin(): Promise<Response | null> {
  return (await isAdmin()) ? null : fail("관리자 로그인이 필요합니다", 401);
}

/** Vercel 이 넣는 x-real-ip 우선(클라이언트가 위조할 수 없음), 없으면 x-forwarded-for 첫 값 */
export function clientIp(req: Request): string {
  return req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

/** IP 당 요청 제한 — 넘으면 429 응답, 통과하면 null */
export function limitByIp(req: Request, kind: keyof typeof LIMITS): Response | null {
  const { max, windowMs } = LIMITS[kind];
  return allow(kind, clientIp(req), max, windowMs) ? null : fail("요청이 너무 많습니다. 몇 분 뒤 다시 시도하세요.", 429);
}

/** 라우트 핸들러의 예기치 못한 오류를 한국어 응답으로 */
export function handleError(e: unknown): Response {
  if (e instanceof AiError || e instanceof StoreConflictError) return fail(e.message, e.status);
  console.error(e);
  return fail(e instanceof Error && e.message === BLOB_MISSING_MESSAGE ? e.message : "서버 오류가 발생했습니다", 500);
}
