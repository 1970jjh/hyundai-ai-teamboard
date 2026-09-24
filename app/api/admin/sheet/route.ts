import { z } from "zod";
import { fail, guardAdmin, handleError, ok, readBody } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { postToSheet, recordSheetResult, replaceAllPayload, SHEET_TYPE, type SheetPayload } from "@/lib/sheets";
import { listTasks } from "@/lib/tasks";

export const maxDuration = 30;

const actionSchema = z.object({ action: z.enum(["test", "resend"]) });

/** 연결 테스트(ping) / 지금까지 데이터 전부 보내기(replace_all) */
export async function POST(req: Request) {
  try {
    const denied = await guardAdmin();
    if (denied) return denied;
    const body = await readBody(req, actionSchema);
    if ("error" in body) return body.error;
    const { sheetUrl } = await getSettings();
    if (!sheetUrl) return fail("먼저 웹 앱 주소를 저장하세요");
    const payload: SheetPayload =
      body.data.action === "test" ? { type: SHEET_TYPE, action: "ping" } : replaceAllPayload(await listTasks());
    const result = await postToSheet(sheetUrl, payload);
    await recordSheetResult(result);
    return result.ok ? ok({ action: body.data.action }) : fail(result.error ?? "시트 전송 실패", 502);
  } catch (e) {
    return handleError(e);
  }
}
