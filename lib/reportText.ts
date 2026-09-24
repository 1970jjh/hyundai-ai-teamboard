import type { TeamReport, WeeklyReport } from "./schemas";

export interface ReportSection {
  label: string;
  items: string[];
}

export const weeklySections = (r: WeeklyReport): ReportSection[] => [
  { label: "실적", items: r.achievements },
  { label: "계획", items: r.plans },
  { label: "이슈", items: r.issues.length ? r.issues : ["특이사항 없음"] },
];

export const teamSections = (r: TeamReport): ReportSection[] => [
  { label: "성과", items: r.achievements },
  { label: "병목", items: r.bottlenecks.length ? r.bottlenecks : ["특이사항 없음"] },
  { label: "재분배 제안", items: r.redistribution.length ? r.redistribution : ["현재 재분배 필요 없음"] },
];

/** 복사용 평문 — 메일·메신저에 그대로 붙여넣기 좋게 */
export function sectionsToText(title: string, sections: ReportSection[]): string {
  return [title, ...sections.map((s) => `■ ${s.label}\n${s.items.map((i) => `- ${i}`).join("\n")}`)].join("\n\n");
}
