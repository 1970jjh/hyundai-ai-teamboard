import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = "20261105";
export const SHEET_URL = "http://127.0.0.1:3199/exec";

export function seoulDate(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function adminLogin(page: Page, password = PASSWORD) {
  await page.goto("/admin");
  await page.getByLabel("관리자 비밀번호").fill(password);
  await page.getByRole("button", { name: "들어가기" }).click();
  await expect(page.getByTestId("metrics")).toBeVisible();
}

export async function createTaskApi(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post("/api/tasks", { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: string; title: string };
}

export async function sheetReceived(request: APIRequestContext): Promise<Array<Record<string, unknown>>> {
  return (await request.get("http://127.0.0.1:3199/received")).json();
}

export const lane = (page: Page, status: "todo" | "doing" | "done") => page.locator(`[data-lane="${status}"]`);

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
