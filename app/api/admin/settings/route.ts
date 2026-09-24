import { guardAdmin, handleError, ok, readBody } from "@/lib/http";
import { settingsPatchSchema } from "@/lib/schemas";
import { adminView, applyPatch, updateSettings } from "@/lib/settings";

export async function PUT(req: Request) {
  try {
    const denied = await guardAdmin();
    if (denied) return denied;
    const body = await readBody(req, settingsPatchSchema);
    if ("error" in body) return body.error;
    return ok(adminView(await updateSettings(applyPatch(body.data))));
  } catch (e) {
    return handleError(e);
  }
}
