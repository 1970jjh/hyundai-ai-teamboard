/** 날짜는 모두 Asia/Seoul 기준 'YYYY-MM-DD' 문자열로 다룬다. */
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function seoulToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

function toUtc(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(ymd: string, days: number): string {
  const d = toUtc(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function weekdayOf(ymd: string): string {
  return WEEKDAYS[toUtc(ymd).getUTCDay()];
}

/** 월요일 시작 주의 [월, 일]. */
export function weekRange(ymd: string): [string, string] {
  const dow = toUtc(ymd).getUTCDay();
  const monday = addDays(ymd, dow === 0 ? -6 : 1 - dow);
  return [monday, addDays(monday, 6)];
}

/** "9월 30일" */
export function formatKoreanDate(ymd: string): string {
  if (!ymd) return "";
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}월 ${d}일`;
}

/** "2026. 09. 24" */
export function formatEdition(ymd: string): string {
  return ymd.replaceAll("-", ". ");
}

/** AI 가 "다음주 수요일" 같은 표현을 정확히 계산하도록 넣어 주는 달력 문맥. */
export function calendarContext(today: string): string {
  const [monday] = weekRange(today);
  const line = (start: string) =>
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return `${weekdayOf(d)} ${d}`;
    }).join(", ");
  return [
    `오늘: ${today} (${weekdayOf(today)}요일, Asia/Seoul)`,
    `이번 주(월~일): ${line(monday)}`,
    `다음 주(월~일): ${line(addDays(monday, 7))}`,
    `다다음 주(월~일): ${line(addDays(monday, 14))}`,
    `"다음주 X요일"은 다음 주 목록의 해당 요일, "이번 주 X요일"은 이번 주 목록의 해당 요일이다.`,
  ].join("\n");
}
