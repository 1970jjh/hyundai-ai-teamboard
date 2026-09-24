"use client";

import { useState } from "react";
import { api, errorText } from "@/lib/client";
import { PRIORITIES, PRIORITY_LABEL, type AiTask, type Priority, type Task } from "@/lib/schemas";
import { Sparkle } from "../ui";

export interface Draft {
  id?: string;
  title: string;
  due: string;
  priority: Priority;
  category: string;
  checklist: { text: string; done: boolean }[];
}

const emptyDraft = (title: string): Draft => ({ title, due: "", priority: "medium", category: "", checklist: [] });
export const draftFromTask = (t: Task): Draft => ({
  id: t.id,
  title: t.title,
  due: t.due,
  priority: t.priority,
  category: t.category,
  checklist: t.checklist,
});

interface Props {
  owner: string;
  aiReady: boolean;
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
  onSaved: (task: Task, isNew: boolean) => void;
  toast: (t: string) => void;
}

export function QuickAdd({ owner, aiReady, draft, setDraft, onSaved, toast }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "ai" | "save">("");
  const [error, setError] = useState("");

  async function runAi() {
    if (!aiReady) return setError("AI 기능을 쓰려면 관리자에게 Gemini API 키 등록을 요청하세요. «직접 등록»은 지금도 됩니다.");
    if (text.trim().length < 2) return setError("업무 내용을 한 줄로 적어 주세요");
    setBusy("ai");
    setError("");
    try {
      const ai = await api<AiTask>("/api/ai/task", { body: { text } });
      setDraft({ ...ai, checklist: ai.checklist.map((c) => ({ text: c, done: false })) });
      toast("AI가 카드 초안을 만들었습니다 · 저장 전에 고칠 수 있어요");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!draft) return;
    const body = { ...draft, checklist: draft.checklist.filter((c) => c.text.trim()), owner };
    setBusy("save");
    setError("");
    try {
      const task = draft.id
        ? await api<Task>(`/api/tasks/${draft.id}`, { method: "PATCH", body: { ...body, id: undefined } })
        : await api<Task>("/api/tasks", { body: { ...body, status: "todo" } });
      onSaved(task, !draft.id);
      setDraft(null);
      if (!draft.id) setText("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="ai-letter">
      <div className="kicker">GEMINI ASSISTED</div>
      <h3>떠오른 업무를 그대로 적어주세요.</h3>
      <p>Gemini가 제목, 마감일, 우선순위와 작은 실행 목록으로 정리합니다.</p>
      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          runAi();
        }}
      >
        <input
          aria-label="업무 내용"
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          placeholder="예) 다음주 수요일까지 신입 온보딩 교육장 섭외하고 강사 확정"
        />
        <button className="button light" type="button" onClick={() => setDraft(emptyDraft(text.trim().slice(0, 80)))}>
          직접 등록
        </button>
        <button className="button" type="submit" disabled={busy !== ""}>
          <Sparkle /> {busy === "ai" ? "정리하는 중…" : "AI로 정리"}
        </button>
      </form>
      {!aiReady && <div className="hint">AI 키가 아직 등록되지 않았습니다 · 관리자에게 요청하세요. 직접 등록은 가능합니다.</div>}
      {error && <div className="hint warn" role="alert">{error}</div>}
      {draft && <DraftEditor draft={draft} setDraft={setDraft} onSave={save} saving={busy === "save"} />}
    </div>
  );
}

function DraftEditor({ draft, setDraft, onSave, saving }: { draft: Draft; setDraft: (d: Draft | null) => void; onSave: () => void; saving: boolean }) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setItem = (i: number, text: string) =>
    set({ checklist: draft.checklist.map((c, j) => (j === i ? { ...c, text } : c)) });
  return (
    <form
      className="preview"
      aria-label={draft.id ? "카드 수정" : "새 카드 검토"}
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="kicker">{draft.id ? "카드 수정" : "저장 전 검토 · 자유롭게 고치세요"}</div>
      <div className="preview-grid">
        <div>
          <label htmlFor="d-title">제목</label>
          <input id="d-title" className="title-input" value={draft.title} maxLength={80} required onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div>
          <label htmlFor="d-due">마감일</label>
          <input id="d-due" type="date" value={draft.due} onChange={(e) => set({ due: e.target.value })} />
        </div>
        <div>
          <label htmlFor="d-priority">우선순위</label>
          <select id="d-priority" value={draft.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="d-category">분류</label>
          <input id="d-category" value={draft.category} maxLength={20} placeholder="교육 운영" onChange={(e) => set({ category: e.target.value })} />
        </div>
      </div>
      <div className="checklist-edit">
        <span className="field-label">체크리스트</span>
        {draft.checklist.map((c, i) => (
          <div key={i}>
            <input aria-label={`체크리스트 ${i + 1}`} value={c.text} maxLength={100} onChange={(e) => setItem(i, e.target.value)} />
            <button type="button" className="icon-btn" aria-label={`체크리스트 ${i + 1} 삭제`} onClick={() => set({ checklist: draft.checklist.filter((_, j) => j !== i) })}>
              ×
            </button>
          </div>
        ))}
        {draft.checklist.length < 15 && (
          <div>
            <button type="button" className="link-btn" onClick={() => set({ checklist: [...draft.checklist, { text: "", done: false }] })}>
              ＋ 항목 추가
            </button>
          </div>
        )}
      </div>
      <div className="preview-actions">
        <button type="button" className="button small light" onClick={() => setDraft(null)}>
          취소
        </button>
        <button type="submit" className="button small" disabled={saving || !draft.title.trim()}>
          {saving ? "저장하는 중…" : draft.id ? "수정 저장" : "카드 저장 →"}
        </button>
      </div>
    </form>
  );
}
