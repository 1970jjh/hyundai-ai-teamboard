"use client";

import { useState } from "react";
import { APPS_SCRIPT_CODE } from "@/lib/appsScriptCode";
import { api, copyText, errorText } from "@/lib/client";
import type { SettingsPatch } from "@/lib/schemas";
import type { Overview } from "./AdminApp";

interface Props {
  data: Overview;
  save: (patch: SettingsPatch, message: string) => Promise<boolean>;
  reload: () => Promise<void>;
  toast: (t: string) => void;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 구글시트 실시간 쌓기(선택) — Apps Script 웹 앱 주소만 있으면 된다 */
export function SheetSettings({ data, save, reload, toast }: Props) {
  const [url, setUrl] = useState(data.settings.sheetUrl);
  const [busy, setBusy] = useState("");
  const { lastError, lastErrorAt, lastOkAt } = data.sheetStatus;
  const errorIsLatest = lastErrorAt && (!lastOkAt || lastErrorAt > lastOkAt);

  const run = async (action: "test" | "resend") => {
    setBusy(action);
    try {
      await api("/api/admin/sheet", { body: { action } });
      toast(action === "test" ? "시트 연결 성공" : "지금까지의 카드를 시트로 모두 보냈습니다");
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy("");
      reload();
    }
  };

  return (
    <div className="settings-block">
      <h4>구글시트 실시간 쌓기 (선택)</h4>
      <ol className="steps">
        <li>구글 드라이브에서 새 구글시트를 만듭니다.</li>
        <li>시트 메뉴 «확장 프로그램 › Apps Script»를 열고, 아래 코드를 통째로 붙여넣은 뒤 저장합니다.</li>
        <li>«배포 › 새 배포 › 유형: 웹 앱», 실행: 나 / 액세스: «모든 사용자»로 배포하고 권한을 허용합니다.</li>
        <li>나온 웹 앱 주소(…/exec)를 아래 칸에 붙여넣고 저장 → «연결 테스트».</li>
      </ol>
      <label htmlFor="s-code">Apps Script 코드</label>
      <textarea id="s-code" readOnly value={APPS_SCRIPT_CODE} onFocus={(e) => e.currentTarget.select()} />
      <div className="settings-actions">
        <button className="button small light" onClick={async () => toast((await copyText(APPS_SCRIPT_CODE)) ? "코드를 복사했습니다" : "코드 칸을 눌러 직접 복사하세요")}>
          코드 복사
        </button>
      </div>
      <label htmlFor="s-sheet" style={{ marginTop: 12 }}>
        웹 앱 주소
      </label>
      <div className="inline-form">
        <input id="s-sheet" value={url} placeholder="https://script.google.com/macros/s/…/exec" onChange={(e) => setUrl(e.target.value)} />
        <button className="button small" onClick={() => save({ sheetUrl: url.trim() }, url.trim() ? "시트 주소를 저장했습니다" : "시트 연결을 껐습니다")}>
          저장
        </button>
      </div>
      <div className="settings-actions">
        <button className="button small light" disabled={!data.settings.sheetUrl || busy !== ""} onClick={() => run("test")}>
          {busy === "test" ? "확인 중…" : "연결 테스트"}
        </button>
        <button className="button small light" disabled={!data.settings.sheetUrl || busy !== ""} onClick={() => run("resend")}>
          {busy === "resend" ? "보내는 중…" : "지금까지 데이터 전부 보내기"}
        </button>
      </div>
      {!data.settings.sheetUrl && <div className="status-line">꺼져 있음 · 주소를 저장하면 카드가 생기거나 바뀔 때마다 시트에 한 줄씩 쌓입니다.</div>}
      {data.settings.sheetUrl && errorIsLatest && (
        <div className="status-line bad" role="status">
          마지막 오류 ({when(lastErrorAt)}): {lastError} · 앱 저장은 정상입니다.
        </div>
      )}
      {data.settings.sheetUrl && !errorIsLatest && lastOkAt && <div className="status-line good">마지막 전송 성공 · {when(lastOkAt)}</div>}
    </div>
  );
}
