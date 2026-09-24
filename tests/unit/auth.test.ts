import { describe, expect, it } from "vitest";
import {
  clearFailures, hashPassword, isRateLimited, newSecret, recordFailure,
  SESSION_TTL_SECONDS, signSession, verifyPassword, verifySession,
} from "@/lib/auth";

describe("비밀번호 해시", () => {
  it("맞는 비밀번호만 통과", () => {
    const h = hashPassword("20261105");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("20261105", h)).toBe(true);
    expect(verifyPassword("20261106", h)).toBe(false);
  });
  it("같은 비밀번호도 매번 다른 해시(솔트)", () => {
    expect(hashPassword("x")).not.toBe(hashPassword("x"));
  });
  it("형식이 깨진 해시는 거부", () => {
    expect(verifyPassword("a", "plain")).toBe(false);
  });
});

describe("세션 쿠키 서명", () => {
  const secret = newSecret();
  const hash = hashPassword("20261105");

  it("서명한 토큰은 통과", () => {
    expect(verifySession(signSession(secret, hash), secret, hash)).toBe(true);
  });
  it("위조·변조·빈 토큰은 거부", () => {
    const token = signSession(secret, hash);
    const [payload] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ exp: Date.now() + 1e10 })).toString("base64url");
    expect(verifySession(`${forged}.${token.split(".")[1]}`, secret, hash)).toBe(false);
    expect(verifySession(`${payload}.xxx`, secret, hash)).toBe(false);
    expect(verifySession(undefined, secret, hash)).toBe(false);
    expect(verifySession("garbage", secret, hash)).toBe(false);
  });
  it("다른 비밀값으로는 통과 못 함", () => {
    expect(verifySession(signSession(secret, hash), newSecret(), hash)).toBe(false);
  });
  it("비밀번호를 바꾸면 기존 세션 무효", () => {
    expect(verifySession(signSession(secret, hash), secret, hashPassword("newpass1"))).toBe(false);
  });
  it("만료되면 거부", () => {
    const t0 = Date.now();
    const token = signSession(secret, hash, t0);
    expect(verifySession(token, secret, hash, t0 + SESSION_TTL_SECONDS * 1000 - 1)).toBe(true);
    expect(verifySession(token, secret, hash, t0 + SESSION_TTL_SECONDS * 1000 + 1)).toBe(false);
  });
});

describe("로그인 속도 제한", () => {
  it("5번 실패하면 막고, 5분 뒤 풀린다", () => {
    const ip = "1.2.3.4";
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(ip, t0)).toBe(false);
      recordFailure(ip, t0);
    }
    expect(isRateLimited(ip, t0 + 1000)).toBe(true);
    expect(isRateLimited(ip, t0 + 5 * 60 * 1000 + 1)).toBe(false);
  });
  it("성공하면 기록을 지운다", () => {
    const ip = "5.6.7.8";
    for (let i = 0; i < 5; i++) recordFailure(ip);
    clearFailures(ip);
    expect(isRateLimited(ip)).toBe(false);
  });
});
