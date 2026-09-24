"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "@/lib/client";
import type { SavedTeamReport } from "@/lib/reports";
import type { Task } from "@/lib/schemas";
import type { AdminSettingsView } from "@/lib/settings";
import type { SheetStatus } from "@/lib/sheets";
import { deadlineAlerts, memberLoads, teamStats } from "@/lib/stats";
import { Footer, Masthead, useToast } from "../ui";
import { Deadlines, LoadChart, Metrics } from "./Charts";
import { Settings } from "./Settings";
import { TeamReport } from "./TeamReport";
import { TeamTable } from "./TeamTable";

export interface Overview {
  today: string;
  settings: AdminSettingsView;
  tasks: Task[];
  sheetStatus: SheetStatus;
  lastReport: SavedTeamReport | null;
}

export function AdminApp() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [toastNode, toast] = useToast();

  const reload = useCallback(async () => {
    try {
      setData(await api<Overview>("/api/admin/overview"));
    } catch (e) {
      if (/로그인/.test(errorText(e))) setAdmin(false);
      else toast(errorText(e));
    }
  }, [toast]);

  useEffect(() => {
    api<{ admin: boolean }>("/api/admin/session")
      .then((r) => {
        setAdmin(r.admin);
        if (r.admin) reload();
      })
      .catch(() => setAdmin(false));
  }, [reload]);

  return (
    <div className="page">
      <Masthead active="admin" teamName={data?.settings.teamName ?? ""} today={data?.today ?? ""} />
      <section className="hero">
        <div>
          <div className="kicker">TEAM OPERATIONS REVIEW / 02</div>
          <h1>
            팀의 한 주를
            <br />
            읽는 자리.
          </h1>
          <p>분산된 업무를 한 페이지에 모아 지연과 업무 집중을 확인합니다.</p>
        </div>
        {data && (
          <div className="hero-side">
            <strong>{data.settings.teamName} 현황</strong>
            <span>주간 운영 리포트 · 팀원 {data.settings.members.length}명</span>
          </div>
        )}
      </section>
      {admin === false && <Login onDone={() => { setAdmin(true); reload(); }} />}
      {admin && data && <Dashboard data={data} reload={reload} setData={setData} toast={toast} onLogout={() => { setAdmin(false); setData(null); }} />}
      <Footer />
      {toastNode}
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="login notice">
      <div className="kicker">ADMIN ONLY</div>
      <h2>관리자 비밀번호</h2>
      <p>처음 비밀번호는 교육 안내문에 적힌 번호입니다. 들어간 뒤 설정에서 꼭 바꿔 주세요.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/api/admin/session", { body: { password } });
            onDone();
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input type="password" aria-label="관리자 비밀번호" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="button" disabled={busy || !password}>
          들어가기
        </button>
      </form>
      {error && <div className="error-text" role="alert">{error}</div>}
    </section>
  );
}

interface DashboardProps {
  data: Overview;
  reload: () => Promise<void>;
  setData: (d: Overview) => void;
  toast: (t: string) => void;
  onLogout: () => void;
}

function Dashboard({ data, reload, setData, toast, onLogout }: DashboardProps) {
  const { tasks, today, settings } = data;
  const stats = teamStats(tasks, today);
  const loads = memberLoads(tasks, settings.members, today);
  const alerts = deadlineAlerts(tasks, today);
  return (
    <>
      <div className="admin-lede">
        <Metrics stats={stats} />
        <Callout data={data} overdue={stats.overdue} soon={stats.soon} />
      </div>
      <div className="admin-columns">
        <div>
          <div className="section-heading">
            <h2>
              <span className="section-no">01.</span> 팀 전체 보드
            </h2>
            <small>담당자 · 상태 · 마감 필터</small>
          </div>
          <TeamTable tasks={tasks} today={today} people={loads.map((l) => l.name)} onRefresh={reload} />
          <TeamReport
            initial={data.lastReport}
            hasTasks={tasks.length > 0}
            aiReady={settings.hasKey}
            teamName={settings.teamName}
            today={today}
            toast={toast}
            onSaved={(r) => setData({ ...data, lastReport: r })}
          />
        </div>
        <div>
          <div className="section-heading">
            <h2>
              <span className="section-no">02.</span> 사람과 일정
            </h2>
          </div>
          <LoadChart loads={loads} />
          <Deadlines alerts={alerts} />
          <Settings data={data} setData={setData} reload={reload} toast={toast} onLogout={onLogout} />
        </div>
      </div>
    </>
  );
}

function Callout({ data, overdue, soon }: { data: Overview; overdue: number; soon: number }) {
  const headline = data.lastReport?.headline;
  const fallback = !data.tasks.length
    ? "아직 등록된 업무가 없습니다."
    : overdue
      ? `지연 ${overdue}건을 먼저 확인하세요.`
      : soon
        ? `3일 안에 마감되는 업무가 ${soon}건 있습니다.`
        : "지연 없이 순조롭게 진행 중입니다.";
  return (
    <div className="callout">
      <div className="kicker">THIS WEEK&apos;S NOTE</div>
      <strong>{headline ?? fallback}</strong>
      <p>
        {!isSetUp(data)
          ? "관리자 설정에서 팀원 명단과 Gemini API 키를 먼저 등록하세요."
          : headline
            ? "최근 AI 팀 리포트의 한 줄 요약입니다. 아래에서 새로 생성할 수 있습니다."
            : "AI 팀 리포트를 생성하면 이 자리에 한 줄 요약이 표시됩니다."}
      </p>
    </div>
  );
}

const isSetUp = (d: Overview) => d.settings.members.length > 0 && d.settings.hasKey;
