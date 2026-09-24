"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { formatEdition } from "@/lib/dates";

export function Masthead({ active, teamName, today }: { active: "user" | "admin"; teamName: string; today: string }) {
  return (
    <header className="masthead">
      <div className="mast-left">
        <span className="specimen">AI TEAMBOARD</span>
        <Link href="/" className="wordmark">
          팀보드
        </Link>
      </div>
      <div className="mast-right">
        <span className="edition">
          {teamName}
          {today ? ` · ${formatEdition(today)}` : ""}
        </span>
        <nav className="switch" aria-label="화면 전환">
          <Link href="/" className={active === "user" ? "active" : ""} aria-current={active === "user" ? "page" : undefined}>
            사용자 화면
          </Link>
          <Link href="/admin" className={active === "admin" ? "active" : ""} aria-current={active === "admin" ? "page" : undefined}>
            관리자 대시보드
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  );
}

export function Footer() {
  return <footer className="footer">JJ Creative 교육연구소 · 2026 현대그룹 인재육성실무협의회 · Powered by Gemini</footer>;
}

/** 화면 하단 알림 한 줄 */
export function useToast(): [React.ReactNode, (text: string) => void] {
  const [text, setText] = useState("");
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((t: string) => {
    setText(t);
    setShown(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(false), 2600);
  }, []);
  const node = (
    <div className={`toast${shown ? " show" : ""}`} role="status" aria-live="polite">
      {text}
    </div>
  );
  return [node, show];
}
