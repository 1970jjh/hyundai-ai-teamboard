"use client";

import { useState } from "react";
import { STATUSES, STATUS_LABEL, PRIORITY_LABEL, type Task } from "@/lib/schemas";
import { checklistProgress, dueState } from "@/lib/stats";

type DueFilter = "all" | "urgent" | "overdue";

interface Props {
  tasks: Task[];
  today: string;
  people: string[];
  onRefresh: () => void;
}

const shortDate = (ymd: string) => (ymd ? `${Number(ymd.slice(5, 7))}.${Number(ymd.slice(8, 10))}` : "—");

export function TeamTable({ tasks, today, people, onRefresh }: Props) {
  const [person, setPerson] = useState("all");
  const [status, setStatus] = useState("all");
  const [due, setDue] = useState<DueFilter>("all");

  const rows = tasks.filter((t) => {
    const state = dueState(t, today);
    return (
      (person === "all" || t.owner === person) &&
      (status === "all" || t.status === status) &&
      (due === "all" || (due === "overdue" ? state === "overdue" : state === "overdue" || state === "soon"))
    );
  });

  return (
    <>
      <div className="filters">
        <select aria-label="담당자 필터" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="all">전체 담당자</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select aria-label="상태 필터" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">전체 상태</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select aria-label="마감 필터" value={due} onChange={(e) => setDue(e.target.value as DueFilter)}>
          <option value="all">모든 마감</option>
          <option value="urgent">임박·지연</option>
          <option value="overdue">지연만</option>
        </select>
        <button className="button small light" onClick={onRefresh}>
          새로고침
        </button>
      </div>
      <div className="table-wrap">
        <table className="work-table">
          <thead>
            <tr>
              <th>업무</th>
              <th>담당</th>
              <th>상태</th>
              <th>마감</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={4}>{tasks.length ? "조건에 맞는 업무가 없습니다." : "팀원이 카드를 등록하면 여기에 모두 모입니다."}</td>
              </tr>
            )}
            {rows.map((t) => {
              const state = dueState(t, today);
              return (
                <tr key={t.id} data-testid="team-row">
                  <td>
                    {t.title}
                    <small>
                      {PRIORITY_LABEL[t.priority]}
                      {t.category ? ` · ${t.category}` : ""}
                      {t.checklist.length ? ` · 체크 ${checklistProgress(t)}` : ""}
                    </small>
                  </td>
                  <td>{t.owner}</td>
                  <td>{STATUS_LABEL[t.status]}</td>
                  <td className={state === "overdue" ? "overdue" : ""}>
                    {shortDate(t.due)}
                    {state === "overdue" ? " 지연" : state === "soon" ? " 임박" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
