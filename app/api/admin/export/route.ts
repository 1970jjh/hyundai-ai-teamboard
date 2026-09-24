import { toCsv } from "@/lib/csv";
import { seoulToday } from "@/lib/dates";
import { guardAdmin, handleError } from "@/lib/http";
import { listTasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const denied = await guardAdmin();
    if (denied) return denied;
    return new Response(toCsv(await listTasks()), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="teamboard-${seoulToday()}.csv"`,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
