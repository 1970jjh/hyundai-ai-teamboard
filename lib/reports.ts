import { getStore } from "./store";
import type { TeamReport } from "./schemas";

const KEY = "reports/team-latest.json";

export type SavedTeamReport = TeamReport & { createdAt: string };

export const getLastTeamReport = () => getStore().getJson<SavedTeamReport>(KEY);

export async function saveTeamReport(report: TeamReport): Promise<SavedTeamReport> {
  const saved = { ...report, createdAt: new Date().toISOString() };
  await getStore().putJson(KEY, saved);
  return saved;
}

export const deleteTeamReport = () => getStore().delete(KEY);
