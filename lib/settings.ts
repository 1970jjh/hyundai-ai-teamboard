import { getStore } from "./store";
import { hashPassword, initialPassword, isDefaultPassword, newSecret } from "./auth";
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
    passwordHash: hashPassword(initialPassword()),
    sessionSecret: newSecret(),
    sheetSecret: newSecret(),
  };
}

/** 저장본에 빠진 항목을 채운다(비밀값은 없을 때만 새로 만든다). */
const complete = (found: Partial<Settings> | null): Settings =>
  found ? settingsSchema.parse({ ...BASE, ...found, sheetSecret: found.sheetSecret || newSecret() }) : defaults();

/**
 * 첫 실행이면 기본 설정(서명 비밀값 포함)을 원자적으로 만든다 — 동시에 여러 요청이 와도 하나만 저장되고,
 * 모두 저장된 그 값을 쓴다. 예전 설정에 시트 비밀값이 없으면 한 번 채워 넣는다.
 */
export async function getSettings(): Promise<Settings> {
  const found = await getStore().getJson<Partial<Settings>>(KEY);
  if (found?.sheetSecret) return complete(found);
  const saved = await getStore().updateJson<Partial<Settings>>(KEY, (cur) => (cur?.sheetSecret ? cur : complete(cur)));
  return complete(saved);
}

/** 조건부 쓰기 — 동시에 온 다른 설정 변경을 덮어쓰지 않는다. */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const saved = await getStore().updateJson<Partial<Settings>>(KEY, (cur) => ({ ...complete(cur), ...patch }));
  return complete(saved);
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

/** 관리자 화면용 — 세션 비밀값·비밀번호 해시는 빼고 키는 가린다(시트 비밀값은 Apps Script 코드에 넣어야 해서 포함) */
export function adminView(s: Settings) {
  return {
    teamName: s.teamName,
    members: s.members,
    model: s.model,
    sheetUrl: s.sheetUrl,
    sheetSecret: s.sheetSecret,
    hasKey: Boolean(s.geminiKey),
    keyMasked: maskKey(s.geminiKey),
    defaultPassword: isDefaultPassword(s.passwordHash),
  };
}
export type AdminSettingsView = ReturnType<typeof adminView>;
