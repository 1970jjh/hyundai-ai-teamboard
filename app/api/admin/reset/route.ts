import { after } from "next/server";
import { z } from "zod";
import { guardAdmin, handleError, ok, readBody } from "@/lib/http";
import { deleteTeamReport } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { replaceAllPayload, syncToSheet } from "@/lib/sheets";
import { deleteAllTasks } from "@/lib/tasks";

const confirmSchema = z.object({ confirm: z.literal("초기화", { message: "확인 문구로 «초기화»를 입력하세요" }) });

/** 업무 카드·리포트를 모두 지운다(팀 이름·명단·키·비밀번호 설정은 유지) */
export async function POST(req: Request) {
  try {
    const denied = await guardAdmin();
    if (denied) return denied;
    const body = await readBody(req, confirmSchema);
    if ("error" in body) return body.error;
    const deleted = await deleteAllTasks();
    await deleteTeamReport();
    const settings = await getSettings();
    after(() => syncToSheet(settings, replaceAllPayload([])));
    return ok({ deleted });
  } catch (e) {
    return handleError(e);
  }
}
