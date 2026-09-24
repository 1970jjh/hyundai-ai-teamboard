/**
 * IP 당 요청 수 제한(고정 창 안의 슬라이딩 목록).
 * ponytail: 인스턴스 메모리 기준 — 서버리스 인스턴스마다 따로 세고 재시작하면 초기화된다.
 * 여러 인스턴스를 합산해 막아야 하면 Upstash/KV 같은 공유 카운터로 바꿀 것.
 * 교육장처럼 여러 명이 같은 공인 IP 를 쓰는 경우를 고려해 한도를 넉넉히 잡았다.
 */
export const LIMITS = {
  /** 공개 AI 호출(빠른 등록·주간보고) */
  ai: { max: 120, windowMs: 10 * 60 * 1000 },
  /** 공개 쓰기(카드 생성·수정·삭제) */
  write: { max: 600, windowMs: 10 * 60 * 1000 },
} as const;

const hits = new Map<string, number[]>();
const MAX_KEYS = 10_000;

/** 허용이면 true(그리고 1회 기록), 한도 초과면 false */
export function allow(bucket: string, ip: string, max: number, windowMs: number, now = Date.now()): boolean {
  if (hits.size > MAX_KEYS) hits.clear(); // 메모리 보호
  const key = `${bucket}:${ip}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  hits.set(key, [...recent, now]);
  return true;
}
