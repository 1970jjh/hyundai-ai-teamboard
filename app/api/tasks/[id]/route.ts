import { after } from "next/server";
import { fail, handleError, ok, readBody } from "@/lib/http";
import { taskPatchSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";
import { deletePayload, syncToSheet, upsertPayload } from "@/lib/sheets";
import { deleteTask, updateTask } from "@/lib/tasks";

export async function PATCH(req: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = await readBody(req, taskPatchSchema);
    if ("error" in body) return body.error;
    const settings = await getSettings();
    if (body.data.owner && !settings.members.includes(body.data.owner)) return fail("팀원 명단에 없는 이름입니다");
    const task = await updateTask(id, body.data);
    if (!task) return fail("업무 카드를 찾을 수 없습니다", 404);
    after(() => syncToSheet(settings.sheetUrl, upsertPayload(task)));
    return ok(task);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  try {
    const { id } = await ctx.params;
    if (!(await deleteTask(id))) return fail("업무 카드를 찾을 수 없습니다", 404);
    const settings = await getSettings();
    after(() => syncToSheet(settings.sheetUrl, deletePayload(id)));
    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
