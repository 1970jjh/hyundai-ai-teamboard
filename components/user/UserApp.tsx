"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "@/lib/client";
import type { Status, Task } from "@/lib/schemas";
import { Footer, Masthead, useToast } from "../ui";
import { Board } from "./Board";
import { QuickAdd, draftFromTask, type Draft } from "./QuickAdd";
import { WeeklyReport } from "./WeeklyReport";

interface Team {
  teamName: string;
  members: string[];
  aiReady: boolean;
  today: string;
}
const ME_KEY = "teamboard-me";

function readMe(): string {
  try {
    return localStorage.getItem(ME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function UserApp() {
  const [team, setTeam] = useState<Team | null>(null);
  const [loadError, setLoadError] = useState("");
  const [me, setMeState] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toastNode, toast] = useToast();

  const loadTasks = useCallback(
    async (owner: string) => {
      try {
        setTasks(await api<Task[]>(`/api/tasks?owner=${encodeURIComponent(owner)}`));
      } catch (e) {
        toast(errorText(e));
      }
    },
    [toast],
  );

  useEffect(() => {
    api<Team>("/api/team")
      .then((t) => {
        setTeam(t);
        const saved = readMe();
        if (t.members.includes(saved)) {
          setMeState(saved);
          loadTasks(saved);
        }
      })
      .catch((e) => setLoadError(errorText(e)));
  }, [loadTasks]);

  const setMe = (name: string) => {
    setMeState(name);
    setDraft(null);
    setTasks([]);
    loadTasks(name);
    try {
      if (name) localStorage.setItem(ME_KEY, name);
      else localStorage.removeItem(ME_KEY);
    } catch {
      /* 저장 못 해도 이번 세션은 동작 */
    }
  };

  const replace = (task: Task) => setTasks((list) => list.map((t) => (t.id === task.id ? task : t)));

  async function patch(task: Task, body: Partial<Task>, message: string) {
    replace({ ...task, ...body });
    try {
      replace(await api<Task>(`/api/tasks/${task.id}`, { method: "PATCH", body }));
      if (message) toast(message);
    } catch (e) {
      toast(errorText(e));
      loadTasks(me);
    }
  }

  async function remove(task: Task) {
    if (!window.confirm(`«${task.title}» 카드를 삭제할까요?`)) return;
    setTasks((list) => list.filter((t) => t.id !== task.id));
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      toast("카드를 삭제했습니다");
    } catch (e) {
      toast(errorText(e));
      loadTasks(me);
    }
  }

  const today = team?.today ?? "";
  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="page">
      <Masthead active="user" teamName={team?.teamName ?? ""} today={today} />
      <section className="hero">
        <div>
          <div className="kicker">PERSONAL WORK JOURNAL / 01</div>
          <h1>
            이번 주의 일을
            <br />
            차분하게 정리합니다.
          </h1>
          <p>할 일을 남기고, 진행을 옮기고, 한 주의 기록을 보고서로 마무리하세요.</p>
        </div>
        {team && me && (
          <div className="hero-side">
            <strong>{me}의 업무</strong>
            <span>
              카드 {tasks.length}개 · 완료 {done}개
            </span>
            <br />
            <select aria-label="이름 선택" value={me} onChange={(e) => setMe(e.target.value)}>
              {team.members.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
        )}
      </section>

      {loadError && <Notice title="불러오지 못했습니다" text={loadError} />}
      {team && team.members.length === 0 && (
        <Notice title="아직 팀원 명단이 없습니다" text="관리자가 «관리자 대시보드 › 설정»에서 팀원 이름을 먼저 등록하면, 여기서 내 이름을 골라 시작할 수 있습니다.">
          <Link className="button" href="/admin">
            관리자 설정으로 가기 →
          </Link>
        </Notice>
      )}
      {team && team.members.length > 0 && !me && (
        <Notice title="내 이름을 선택하세요" text="이 브라우저에 기억해 두었다가 다음에는 바로 열어 드립니다.">
          <div className="name-grid">
            {team.members.map((m) => (
              <button key={m} onClick={() => setMe(m)}>
                {m}
              </button>
            ))}
          </div>
        </Notice>
      )}

      {team && me && (
        <>
          <div className="user-layout">
            <div>
              <div className="section-heading">
                <h2>
                  <span className="section-no">01.</span> AI 빠른 등록
                </h2>
                <small>말하듯 적으면 카드가 됩니다</small>
              </div>
              <QuickAdd
                owner={me}
                aiReady={team.aiReady}
                draft={draft}
                setDraft={setDraft}
                toast={toast}
                onSaved={(task, isNew) => {
                  setTasks((list) => (isNew ? [task, ...list] : list.map((t) => (t.id === task.id ? task : t))));
                  toast(isNew ? "카드를 «할 일»에 저장했습니다" : "카드를 수정했습니다");
                }}
              />
            </div>
            <WeeklyReport key={me} owner={me} aiReady={team.aiReady} today={today} toast={toast} />
          </div>
          <section className="board-section">
            <div className="section-heading">
              <h2>
                <span className="section-no">03.</span> 내 업무 보드
              </h2>
              <small>끌어다 놓거나 상태 버튼으로 업무를 이동합니다</small>
            </div>
            <Board
              tasks={tasks}
              today={today}
              onMove={(task, status: Status) => patch(task, { status }, "업무 상태를 변경했습니다")}
              onToggleItem={(task, i) =>
                patch(task, { checklist: task.checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c)) }, "")
              }
              onEdit={(task) => {
                setDraft(draftFromTask(task));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onDelete={remove}
            />
          </section>
        </>
      )}
      <Footer />
      {toastNode}
    </div>
  );
}

function Notice({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <section className="notice">
      <div className="kicker">START HERE</div>
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </section>
  );
}
