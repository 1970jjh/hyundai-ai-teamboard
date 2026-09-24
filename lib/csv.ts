import { SHEET_HEADERS, taskToRow } from "./sheets";
import type { Task } from "./schemas";

/** 엑셀·시트가 수식으로 읽지 않도록 = + - @ 탭 CR 로 시작하면 앞에 ' 를 붙인다(Apps Script 와 같은 규칙). */
export const neutralize = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const quote = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
const cell = (v: string) => quote(neutralize(v));

/** 엑셀에서 한글이 깨지지 않도록 BOM 을 붙인다. 열은 구글시트와 같다. */
export function toCsv(tasks: Task[]): string {
  const rows = tasks.map((t) => {
    const row = taskToRow(t);
    return SHEET_HEADERS.map((h) => cell(row[h])).join(",");
  });
  return `﻿${[SHEET_HEADERS.join(","), ...rows].join("\r\n")}\r\n`;
}
