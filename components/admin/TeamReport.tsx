"use client";

import { useState } from "react";
import { api, copyText, errorText } from "@/lib/client";
import { formatKoreanDate } from "@/lib/dates";
import type { SavedTeamReport } from "@/lib/reports";
import { sectionsToText, teamSections } from "@/lib/reportText";
import { ReportBody } from "../ReportBody";
import { Sparkle } from "../ui";

interface Props {
  initial: SavedTeamReport | null;
  hasTasks: boolean;
  aiReady: boolean;
  teamName: string;
  today: string;
  toast: (t: string) => void;
  onSaved: (r: SavedTeamReport) => void;
}

export function TeamReport({ initial, hasTasks, aiReady, teamName, today, toast, onSaved }: Props) {
  const [report, setReport] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sections = report ? teamSections(report) : null;
  const title = `[${teamName} 주간 운영 리포트] ${formatKoreanDate(today)}`;

  async function generate() {
    if (!aiReady) return setError("먼저 아래 관리자 설정에서 Gemini API 키를 저장하세요.");
    if (!hasTasks) return setError("아직 등록된 업무 카드가 없습니다.");
    setBusy(true);
    setError("");
    try {
      const r = await api<SavedTeamReport>("/api/admin/team-report", { method: "POST", body: {} });
      setReport(r);
      onSaved(r);
      toast("AI 팀 리포트를 생성했습니다");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!report || !sections) return toast("먼저 AI 리포트를 생성하세요");
    const text = sectionsToText(`${title}\n${report.headline}`, sections);
    toast((await copyText(text)) ? "복사했습니다" : "브라우저 복사를 사용할 수 없습니다");
  }

  return (
    <section className="ai-report print-area" aria-label="AI 팀 주간 리포트">
      <div className="kicker">GEMINI / TEAM ANALYSIS</div>
      <h3>AI 팀 주간 리포트</h3>
      <p>
        {report
          ? `${report.headline} · ${new Date(report.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} 생성`
          : "성과 요약, 병목, 업무 재배분 제안을 한 번에 정리합니다."}
      </p>
      <ReportBody id="team-report" sections={sections} empty="버튼을 누르면 팀 전체 카드를 읽고 성과 · 병목 · 재분배 제안을 작성합니다." />
      {error && <div className="error-text" role="alert">{error}</div>}
      <div className="report-actions">
        <button className="button" onClick={generate} disabled={busy}>
          <Sparkle /> {busy ? "분석하는 중…" : "AI 리포트 생성"}
        </button>
        <button className="button light" onClick={copy}>
          복사
        </button>
        <button className="button light" onClick={() => (report ? window.print() : toast("먼저 AI 리포트를 생성하세요"))}>
          인쇄 / PDF
        </button>
      </div>
    </section>
  );
}
