import { after } from "next/server";
import { fail, handleError, limitByIp, ok, readBody } from "@/lib/http";
import { taskInputSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";
import { syncToSheet, upsertPayload } from "@/lib/sheets";
import { createTask, listTasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const owner = new URL(req.url).searchParams.get("owner") ?? "";
    if (!owner || owner.length > 20) return fail("이름을 선택하세요");
    return ok((await listTasks()).filter((t) => t.owner === owner));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const limited = limitByIp(req, "write");
    if (limited) return limited;
    const body = await readBody(req, taskInputSchema);
    if ("error" in body) return body.error;
    const settings = await getSettings();
    if (!settings.members.includes(body.data.owner)) return fail("팀원 명단에 없는 이름입니다");
    const task = await createTask(body.data);
    after(() => syncToSheet(settings, upsertPayload(task)));
    return ok(task, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
