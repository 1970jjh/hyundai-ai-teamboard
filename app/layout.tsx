import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 팀보드",
  description: "말하듯 적으면 AI가 업무 카드로 정리하고, 팀장은 팀 전체 진행·부하·지연을 한 화면에서 보는 초경량 팀 업무 보드",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f5f0e6" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- 루트 레이아웃이라 모든 페이지에 적용된다 */}
        <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
