"use client";

import { useState } from "react";
import { api, errorText } from "@/lib/client";
import { MODELS, MODEL_LABEL, type SettingsPatch } from "@/lib/schemas";
import type { AdminSettingsView } from "@/lib/settings";
import type { Overview } from "./AdminApp";
import { SheetSettings } from "./SheetSettings";

interface Props {
  data: Overview;
  setData: (d: Overview) => void;
  reload: () => Promise<void>;
  toast: (t: string) => void;
  onLogout: () => void;
}

export function Settings({ data, setData, reload, toast, onLogout }: Props) {
  const s = data.settings;
  // 처음 한 번만 판단 — 저장 도중 패널이 접히지 않도록
  const [openAtStart] = useState(!s.members.length || !s.hasKey);
  const save = async (patch: SettingsPatch, message: string): Promise<boolean> => {
    try {
      const view = await api<AdminSettingsView>("/api/admin/settings", { method: "PUT", body: patch });
      setData({ ...data, settings: view });
      toast(message);
      return true;
    } catch (e) {
      toast(errorText(e));
      return false;
    }
  };

  return (
    <details className="settings" open={openAtStart}>
      <summary>관리자 설정 ＋</summary>
      <TeamBlock s={s} save={save} />
      <AiBlock s={s} save={save} toast={toast} />
      <SheetSettings data={data} save={save} reload={reload} toast={toast} />
      <SecurityBlock toast={toast} />
      <DataBlock toast={toast} reload={reload} onLogout={onLogout} />
    </details>
  );
}

type Save = (patch: SettingsPatch, message: string) => Promise<boolean>;

function TeamBlock({ s, save }: { s: AdminSettingsView; save: Save }) {
  const [teamName, setTeamName] = useState(s.teamName);
  const [name, setName] = useState("");
  const add = async () => {
    const n = name.trim();
    if (!n || s.members.includes(n)) return;
    if (await save({ members: [...s.members, n] }, `${n} 님을 명단에 추가했습니다`)) setName("");
  };
  return (
    <div className="settings-block">
      <h4>팀</h4>
      <label htmlFor="s-team">팀 이름</label>
      <div className="inline-form">
        <input id="s-team" value={teamName} maxLength={30} onChange={(e) => setTeamName(e.target.value)} />
        <button className="button small" onClick={() => save({ teamName }, "팀 이름을 저장했습니다")} disabled={!teamName.trim()}>
          저장
        </button>
      </div>
      <label style={{ marginTop: 12 }}>팀원 명단 ({s.members.length}명)</label>
      <div className="chips" data-testid="member-chips">
        {s.members.length === 0 && <span className="muted-text">아직 없습니다 · 이름을 추가하세요</span>}
        {s.members.map((m) => (
          <span className="chip" key={m}>
            {m}
            <button
              aria-label={`${m} 삭제`}
              onClick={() =>
                window.confirm(`${m} 님을 명단에서 뺄까요? (등록한 카드는 남습니다)`) &&
                save({ members: s.members.filter((x) => x !== m) }, `${m} 님을 명단에서 뺐습니다`)
              }
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input aria-label="추가할 팀원 이름" placeholder="이름" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        <button className="button small light" disabled={!name.trim()}>
          팀원 추가
        </button>
      </form>
    </div>
  );
}

function AiBlock({ s, save, toast }: { s: AdminSettingsView; save: Save; toast: (t: string) => void }) {
  const [key, setKey] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const r = await api<{ model: string; ms: number }>("/api/admin/ai-test", { method: "POST", body: {} });
      setResult({ ok: true, text: `연결 성공 · ${r.model} · ${(r.ms / 1000).toFixed(1)}초` });
    } catch (e) {
      setResult({ ok: false, text: errorText(e) });
    } finally {
      setTesting(false);
    }
  };
  return (
    <div className="settings-block">
      <h4>AI (Gemini)</h4>
      <div className="settings-fields">
        <div>
          <label htmlFor="s-key">Gemini API 키 · 서버에만 저장</label>
          <input
            id="s-key"
            type="password"
            autoComplete="off"
            value={key}
            placeholder={s.hasKey ? `${s.keyMasked} (저장됨)` : "AIza로 시작하는 키"}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="s-model">모델</label>
          <select id="s-model" value={s.model} onChange={(e) => save({ model: e.target.value as SettingsPatch["model"] }, "모델을 바꿨습니다")}>
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {MODEL_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="settings-actions">
        <button
          className="button small"
          disabled={key.trim().length < 20}
          onClick={async () => {
            if (await save({ geminiKey: key.trim() }, "API 키를 저장했습니다 · 연결 테스트를 눌러 확인하세요")) setKey("");
          }}
        >
          키 저장
        </button>
        <button className="button small light" onClick={test} disabled={testing || !s.hasKey}>
          {testing ? "확인 중…" : "연결 테스트"}
        </button>
        <a className="button small light" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" onClick={() => toast("새 탭에서 키 발급 페이지를 엽니다")}>
          키 발급 받기 ↗
        </a>
      </div>
      {result && <div className={`status-line ${result.ok ? "good" : "bad"}`} role="status">{result.text}</div>}
    </div>
  );
}

function SecurityBlock({ toast }: { toast: (t: string) => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const change = async () => {
    if (pw !== pw2) return toast("두 비밀번호가 다릅니다");
    try {
      await api("/api/admin/password", { body: { password: pw } });
      setPw("");
      setPw2("");
      toast("비밀번호를 바꿨습니다 · 다른 기기는 다시 로그인해야 합니다");
    } catch (e) {
      toast(errorText(e));
    }
  };
  return (
    <div className="settings-block">
      <h4>관리자 비밀번호 변경</h4>
      <div className="settings-fields">
        <div>
          <label htmlFor="s-pw">새 비밀번호 (6자 이상)</label>
          <input id="s-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div>
          <label htmlFor="s-pw2">한 번 더</label>
          <input id="s-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
      </div>
      <div className="settings-actions">
        <button className="button small" disabled={pw.length < 6} onClick={change}>
          비밀번호 변경
        </button>
      </div>
    </div>
  );
}

function DataBlock({ toast, reload, onLogout }: { toast: (t: string) => void; reload: () => Promise<void>; onLogout: () => void }) {
  const reset = async () => {
    const confirm = window.prompt("업무 카드와 AI 리포트를 모두 지웁니다(설정은 유지). 계속하려면 «초기화»를 입력하세요.");
    if (confirm === null) return;
    try {
      const r = await api<{ deleted: number }>("/api/admin/reset", { body: { confirm } });
      toast(`카드 ${r.deleted}건을 지웠습니다`);
      await reload();
    } catch (e) {
      toast(errorText(e));
    }
  };
  const logout = async () => {
    await api("/api/admin/session", { method: "DELETE" }).catch(() => null);
    onLogout();
  };
  return (
    <div className="settings-block">
      <h4>데이터</h4>
      <div className="settings-actions">
        <a className="button small light" href="/api/admin/export" download>
          CSV 내보내기
        </a>
        <button className="button small danger" onClick={reset}>
          전체 초기화
        </button>
        <button className="button small light" onClick={logout}>
          로그아웃
        </button>
      </div>
    </div>
  );
}
