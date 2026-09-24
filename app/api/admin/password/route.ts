import { hashPassword } from "@/lib/auth";
import { guardAdmin, handleError, ok, readBody, setSessionCookie } from "@/lib/http";
import { passwordChangeSchema } from "@/lib/schemas";
import { updateSettings } from "@/lib/settings";

/** 비밀번호 변경 → 다른 기기의 세션은 무효, 지금 브라우저는 새 세션으로 유지 */
export async function POST(req: Request) {
  try {
    const denied = await guardAdmin();
    if (denied) return denied;
    const body = await readBody(req, passwordChangeSchema);
    if ("error" in body) return body.error;
    await setSessionCookie(await updateSettings({ passwordHash: hashPassword(body.data.password) }));
    return ok({ changed: true });
  } catch (e) {
    return handleError(e);
  }
}
