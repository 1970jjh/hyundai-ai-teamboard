import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/http";
import { allow, LIMITS } from "@/lib/rateLimit";

describe("IP 당 요청 제한", () => {
  it("한도까지는 허용, 넘으면 거부, 창이 지나면 다시 허용", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(allow("t", "9.9.9.9", 3, 60_000, t0 + i)).toBe(true);
    expect(allow("t", "9.9.9.9", 3, 60_000, t0 + 10)).toBe(false);
    expect(allow("t", "8.8.8.8", 3, 60_000, t0 + 10)).toBe(true); // 다른 IP 는 따로
    expect(allow("other", "9.9.9.9", 3, 60_000, t0 + 10)).toBe(true); // 다른 종류도 따로
    expect(allow("t", "9.9.9.9", 3, 60_000, t0 + 60_001)).toBe(true);
  });
  it("공개 AI 한도는 쓰기 한도보다 좁다", () => {
    expect(LIMITS.ai.max).toBeLessThan(LIMITS.write.max);
  });
  it("IP 는 Vercel 의 x-real-ip 우선(x-forwarded-for 위조 무시)", () => {
    const req = (h: Record<string, string>) => new Request("http://x/", { headers: h });
    expect(clientIp(req({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "6.6.6.6, 1.1.1.1" }))).toBe("1.1.1.1");
    expect(clientIp(req({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(req({}))).toBe("local");
  });
});
