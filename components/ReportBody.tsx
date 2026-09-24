import type { ReportSection } from "@/lib/reportText";

/** 시안의 report-copy 블록 — 섹션 제목은 러스트 굵게, 항목은 목록 */
export function ReportBody({ id, sections, empty }: { id: string; sections: ReportSection[] | null; empty: string }) {
  if (!sections) {
    return (
      <div className="report-copy empty" id={id}>
        {empty}
      </div>
    );
  }
  return (
    <div className="report-copy" id={id} data-testid={id}>
      {sections.map((s) => (
        <div key={s.label}>
          <b>{s.label}</b>
          <ul>
            {s.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
