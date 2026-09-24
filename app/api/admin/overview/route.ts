import { seoulToday } from "@/lib/dates";
import { guardAdmin, handleError, ok } from "@/lib/http";
import { getLastTeamReport } from "@/lib/reports";
import { adminView, getSettings } from "@/lib/settings";
import { getSheetStatus } from "@/lib/sheets";
import { listTasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const denied = await guardAdmin();
    if (denied) return denied;
    const [settings, tasks, sheetStatus, lastReport] = await Promise.all([
      getSettings(),
      listTasks(),
      getSheetStatus(),
      getLastTeamReport(),
    ]);
    return ok({ today: seoulToday(), settings: adminView(settings), tasks, sheetStatus, lastReport });
  } catch (e) {
    return handleError(e);
  }
}
