import { seoulToday } from "@/lib/dates";
import { handleError, ok } from "@/lib/http";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** 사용자 화면용 공개 정보(비밀값 없음) */
export async function GET() {
  try {
    const s = await getSettings();
    return ok({ teamName: s.teamName, members: s.members, aiReady: Boolean(s.geminiKey), today: seoulToday() });
  } catch (e) {
    return handleError(e);
  }
}
