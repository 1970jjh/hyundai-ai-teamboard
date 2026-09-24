import { seoulToday } from "@/lib/dates";
import { parseTask } from "@/lib/gemini";
import { handleError, limitByIp, ok, readBody } from "@/lib/http";
import { quickTextSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";

export const maxDuration = 60;

/** 한 줄 → 카드 초안(저장하지 않음, 사용자가 검토 후 저장) */
export async function POST(req: Request) {
  try {
    const limited = limitByIp(req, "ai");
    if (limited) return limited;
    const body = await readBody(req, quickTextSchema);
    if ("error" in body) return body.error;
    const s = await getSettings();
    const today = seoulToday();
    const draft = await parseTask({ apiKey: s.geminiKey, model: s.model }, body.data.text, today);
    return ok(draft);
  } catch (e) {
    return handleError(e);
  }
}
