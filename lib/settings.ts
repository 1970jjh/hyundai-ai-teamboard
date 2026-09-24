import { getStore } from "./store";
import { DEFAULT_PASSWORD, hashPassword, newSecret } from "./auth";
import { settingsSchema, type Settings, type SettingsPatch } from "./schemas";

const KEY = "settings.json";

const BASE = {
  teamName: "우리 팀",
  members: [] as string[],
  geminiKey: "",
  model: "gemini-3.7-flash" as const,
  sheetUrl: "",
};

function defaults(): Settings {
  return {
    ...BASE,
    passwordHash: hashPassword(DEFAULT_PASSWORD),
    sessionSecret: newSecret(),
  };
}

/** 첫 실행이면 기본 설정(서명 비밀값 포함)을 만든다. 동시에 여러 요청이 와도 하나만 저장된다. */
export async function getSettings(): Promise<Settings> {
  const store = getStore();
  const found = await store.getJson<Settings>(KEY);
  if (found) return settingsSchema.parse({ ...BASE, ...found });
  const fresh = defaults();
  const created = await store.putJson(KEY, fresh, { createOnly: true });
  if (created) return fresh;
  const winner = await store.getJson<Settings>(KEY);
  if (!winner) throw new Error("설정을 불러오지 못했습니다");
  return winner;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await getStore().putJson(KEY, next);
  return next;
}

export function applyPatch(patch: SettingsPatch): Partial<Settings> {
  const members = patch.members ? [...new Set(patch.members.map((m) => m.trim()))] : undefined;
  return Object.fromEntries(
    Object.entries({ ...patch, members }).filter(([, v]) => v !== undefined),
  ) as Partial<Settings>;
}

export function maskKey(key: string): string {
  if (!key) return "";
  return key.length <= 8 ? "••••" : `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** 관리자 화면용 — 비밀값은 빼고 키는 가린다 */
export function adminView(s: Settings) {
  return {
    teamName: s.teamName,
    members: s.members,
    model: s.model,
    sheetUrl: s.sheetUrl,
    hasKey: Boolean(s.geminiKey),
    keyMasked: maskKey(s.geminiKey),
  };
}
export type AdminSettingsView = ReturnType<typeof adminView>;
