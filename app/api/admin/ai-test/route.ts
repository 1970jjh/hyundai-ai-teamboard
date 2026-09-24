import { testConnection } from "@/lib/gemini";
import { guardAdmin, handleError, ok } from "@/lib/http";
import { getSettings } from "@/lib/settings";

export const maxDuration = 60;

export async function POST() {
  try {
    const denied = await guardAdmin();
    if (denied) return denied;
    const s = await getSettings();
    const started = Date.now();
    await testConnection({ apiKey: s.geminiKey, model: s.model });
    return ok({ model: s.model, ms: Date.now() - started });
  } catch (e) {
    return handleError(e);
  }
}
