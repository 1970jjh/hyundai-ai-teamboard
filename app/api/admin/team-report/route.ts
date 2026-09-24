import { seoulToday } from "@/lib/dates";
import { writeTeamReport } from "@/lib/gemini";
import { fail, guardAdmin, handleError, ok } from "@/lib/http";
import { saveTeamReport } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { listTasks } from "@/lib/tasks";

export const maxDuration = 60;

export async function POST() {
  try {
    const denied = await guardAdmin();
    if (denied) return denied;
    const s = await getSettings();
    const tasks = await listTasks();
    if (!tasks.length) return fail("아직 등록된 업무 카드가 없습니다.");
    const report = await writeTeamReport({ apiKey: s.geminiKey, model: s.model }, s.teamName, s.members, tasks, seoulToday());
    return ok(await saveTeamReport(report));
  } catch (e) {
    return handleError(e);
  }
}
