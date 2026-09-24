import { cookies } from "next/headers";
import { clearFailures, isRateLimited, recordFailure, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { clientIp, fail, handleError, isAdmin, ok, readBody, setSessionCookie } from "@/lib/http";
import { loginSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ admin: await isAdmin() });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (isRateLimited(ip)) return fail("로그인 시도가 너무 많습니다. 5분 뒤 다시 시도하세요.", 429);
    const body = await readBody(req, loginSchema);
    if ("error" in body) return body.error;
    const s = await getSettings();
    if (!verifyPassword(body.data.password, s.passwordHash)) {
      recordFailure(ip);
      return fail("비밀번호가 올바르지 않습니다", 401);
    }
    clearFailures(ip);
    await setSessionCookie(s);
    return ok({ admin: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return ok({ admin: false });
}
