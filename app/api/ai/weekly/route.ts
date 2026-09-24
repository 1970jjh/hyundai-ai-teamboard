import { seoulToday } from "@/lib/dates";
import { writeWeeklyReport } from "@/lib/gemini";
import { fail, handleError, ok, readBody } from "@/lib/http";
import { ownerSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";
import { listTasks } from "@/lib/tasks";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await readBody(req, ownerSchema);
    if ("error" in body) return body.error;
    const s = await getSettings();
    const tasks = (await listTasks()).filter((t) => t.owner === body.data.owner);
    if (!tasks.length) return fail("등록된 업무 카드가 없습니다. 카드를 먼저 등록해 주세요.");
    const report = await writeWeeklyReport({ apiKey: s.geminiKey, model: s.model }, body.data.owner, tasks, seoulToday());
    return ok(report);
  } catch (e) {
    return handleError(e);
  }
}
