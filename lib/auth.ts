import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const DEFAULT_PASSWORD = "20261105";
/** 첫 실행 비밀번호 — ADMIN_PASSWORD 환경변수가 있으면 그것, 없으면 공개된 기본값 */
export const initialPassword = () => process.env.ADMIN_PASSWORD?.trim() || DEFAULT_PASSWORD;
/** README 에 공개된 기본 비밀번호를 아직 쓰는 중인가 */
export const isDefaultPassword = (passwordHash: string) => verifyPassword(DEFAULT_PASSWORD, passwordHash);
export const SESSION_COOKIE = "tb_admin";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

export function newSecret(): string {
  return randomBytes(32).toString("hex");
}

/** 서명 키에 비밀번호 해시를 섞는다 → 비밀번호를 바꾸면 기존 세션이 모두 무효. */
function mac(payload: string, secret: string, passwordHash: string): string {
  return createHmac("sha256", `${secret}:${passwordHash}`).update(payload).digest("base64url");
}

export function signSession(secret: string, passwordHash: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_TTL_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${mac(payload, secret, passwordHash)}`;
}

export function verifySession(token: string | undefined, secret: string, passwordHash: string, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = Buffer.from(mac(payload, secret, passwordHash));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp: number };
    return typeof exp === "number" && exp > now;
  } catch {
    return false;
  }
}

/* ---------- 로그인 속도 제한 ---------- */
// ponytail: 인스턴스 메모리 기준(서버리스 인스턴스마다 따로 셈). 공격이 문제면 Blob/KV 카운터로.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILS = 5;
const fails = new Map<string, number[]>();

export function isRateLimited(ip: string, now = Date.now()): boolean {
  const recent = (fails.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  fails.set(ip, recent);
  return recent.length >= MAX_FAILS;
}

export function recordFailure(ip: string, now = Date.now()): void {
  fails.set(ip, [...(fails.get(ip) ?? []), now]);
}

export function clearFailures(ip: string): void {
  fails.delete(ip);
}
