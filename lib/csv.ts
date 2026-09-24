import { SHEET_HEADERS, taskToRow } from "./sheets";
import type { Task } from "./schemas";

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

/** 엑셀에서 한글이 깨지지 않도록 BOM 을 붙인다. 열은 구글시트와 같다. */
export function toCsv(tasks: Task[]): string {
  const rows = tasks.map((t) => {
    const row = taskToRow(t);
    return SHEET_HEADERS.map((h) => cell(row[h])).join(",");
  });
  return `﻿${[SHEET_HEADERS.join(","), ...rows].join("\r\n")}\r\n`;
}
