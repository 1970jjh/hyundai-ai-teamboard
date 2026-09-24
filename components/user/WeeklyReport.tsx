"use client";

import { useState } from "react";
import { api, copyText, errorText } from "@/lib/client";
import { weekRange } from "@/lib/dates";
import { sectionsToText, weeklySections, type ReportSection } from "@/lib/reportText";
import type { WeeklyReport as Report } from "@/lib/schemas";
import { ReportBody } from "../ReportBody";
import { Sparkle } from "../ui";

export function WeeklyReport({ owner, aiReady, today, toast }: { owner: string; aiReady: boolean; today: string; toast: (t: string) => void }) {
  const [sections, setSections] = useState<ReportSection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mon, sun] = weekRange(today);
  const title = `[주간 업무보고] ${owner} (${mon.slice(5).replace("-", "/")} ~ ${sun.slice(5).replace("-", "/")})`;

  async function generate() {
    if (!aiReady) return setError("AI 기능을 쓰려면 관리자에게 Gemini API 키 등록을 요청하세요.");
    setBusy(true);
    setError("");
    try {
      setSections(weeklySections(await api<Report>("/api/ai/weekly", { body: { owner } })));
      toast("주간보고 초안을 작성했습니다");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!sections) return toast("먼저 AI 주간보고를 생성하세요");
    toast((await copyText(sectionsToText(title, sections))) ? "복사했습니다" : "브라우저 복사를 사용할 수 없습니다");
  }

  return (
    <aside className="report">
      <div className="section-no">02. WEEKLY REPORT</div>
      <h3>
        한 주의 기록이
        <br />
        보고가 됩니다.
      </h3>
      <p>완료한 일과 남은 일을 읽고 실적 / 계획 / 이슈 초안을 작성합니다.</p>
      <ReportBody id="my-report" sections={sections} empty="버튼을 누르면 이번 주 카드로 실적 · 계획 · 이슈 초안을 씁니다." />
      {error && <div className="hint warn" role="alert">{error}</div>}
      <div className="report-actions">
        <button className="button" onClick={generate} disabled={busy}>
          <Sparkle /> {busy ? "작성하는 중…" : "AI 주간보고 생성"}
        </button>
        <button className="button light" onClick={copy}>
          복사
        </button>
      </div>
    </aside>
  );
}
