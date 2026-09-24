"use client";

import { useState } from "react";
import { formatKoreanDate } from "@/lib/dates";
import { PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Status, type Task } from "@/lib/schemas";
import { checklistProgress, dueState } from "@/lib/stats";

interface Props {
  tasks: Task[];
  today: string;
  onMove: (task: Task, status: Status) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleItem: (task: Task, index: number) => void;
}

const NEXT: Record<Status, { to: Status; label: string } | null> = {
  todo: { to: "doing", label: "진행 시작 →" },
  doing: { to: "done", label: "완료 처리 →" },
  done: null,
};
const PREV: Record<Status, { to: Status; label: string } | null> = {
  todo: null,
  doing: { to: "todo", label: "← 할 일로" },
  done: { to: "doing", label: "← 다시 진행" },
};

export function Board(props: Props) {
  const [over, setOver] = useState<Status | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  function drop(status: Status) {
    const task = props.tasks.find((t) => t.id === dragId);
    setOver(null);
    setDragId(null);
    if (task && task.status !== status) props.onMove(task, status);
  }

  return (
    <div className="board">
      {STATUSES.map((status) => {
        const lane = props.tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            className={`column${over === status ? " drag-over" : ""}`}
            data-lane={status}
            aria-label={`${STATUS_LABEL[status]} 칸`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver((o) => (o === status ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              drop(status);
            }}
          >
            <div className="col-top">
              {STATUS_LABEL[status]} <span className="count">{String(lane.length).padStart(2, "0")}</span>
            </div>
            {lane.length === 0 && <div className="col-empty">{status === "done" ? "완료한 카드가 여기에 쌓입니다" : "카드를 끌어다 놓을 수 있어요"}</div>}
            {lane.map((t) => (
              <TaskCard key={t.id} task={t} {...props} dragging={dragId === t.id} onDragStart={() => setDragId(t.id)} onDragEnd={() => setDragId(null)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  today,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onEdit,
  onDelete,
  onToggleItem,
}: Omit<Props, "tasks"> & { task: Task; dragging: boolean; onDragStart: () => void; onDragEnd: () => void }) {
  const state = dueState(task, today);
  const next = NEXT[task.status];
  const prev = PREV[task.status];
  const progress = checklistProgress(task);
  const dueText =
    task.status === "done"
      ? `${formatKoreanDate((task.completedAt || task.updatedAt).slice(0, 10))} 완료`
      : task.due
        ? `${formatKoreanDate(task.due)} 마감${state === "overdue" ? " · 지남" : state === "soon" ? " · 임박" : ""}`
        : "마감 없음";
  return (
    <article
      className={`task${dragging ? " dragging" : ""}`}
      draggable
      data-testid="task-card"
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="task-line">
        <span>{task.status === "done" ? "완료됨" : task.priority === "high" ? "우선순위 높음" : PRIORITY_LABEL[task.priority]}</span>
        <span>{task.category}</span>
      </div>
      <h3>{task.title}</h3>
      {task.checklist.length > 0 && (
        <details>
          <summary>체크리스트 {progress}</summary>
          {task.checklist.map((c, i) => (
            <label key={i} className={c.done ? "checked" : ""}>
              <input type="checkbox" checked={c.done} onChange={() => onToggleItem(task, i)} />
              {c.text}
            </label>
          ))}
        </details>
      )}
      <div className="task-foot">
        <span className={state === "overdue" ? "overdue" : ""}>{dueText}</span>
        <span className="task-actions">
          {prev && (
            <button className="link-btn muted" onClick={() => onMove(task, prev.to)}>
              {prev.label}
            </button>
          )}
          {next ? <button onClick={() => onMove(task, next.to)}>{next.label}</button> : <span>✓</span>}
        </span>
      </div>
      <div className="task-foot">
        <span className="task-actions">
          <button className="link-btn muted" onClick={() => onEdit(task)}>
            수정
          </button>
          <button className="link-btn muted" onClick={() => onDelete(task)}>
            삭제
          </button>
        </span>
      </div>
    </article>
  );
}
