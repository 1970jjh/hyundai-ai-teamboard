import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { adminLogin, lane } from "./helpers";

if (existsSync(".env.test.local")) process.loadEnvFile(".env.test.local");
const KEY = process.env.GEMINI_API_KEY_FOR_TESTS ?? "";

test.describe.configure({ mode: "serial" });
test.skip(!KEY, "GEMINI_API_KEY_FOR_TESTS 없음 — 라이브 AI E2E 건너뜀");

test("관리자 키 입력 → 연결 테스트 성공 (화면엔 끝 4자리만)", async ({ page }) => {
  await adminLogin(page);
  const details = page.locator("details.settings");
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
  await page.getByLabel("Gemini API 키 · 서버에만 저장").fill(KEY);
  await page.getByRole("button", { name: "키 저장" }).click();
  await expect(page.locator(".toast")).toContainText("API 키를 저장했습니다");
  const placeholder = await page.getByLabel("Gemini API 키 · 서버에만 저장").getAttribute("placeholder");
  expect(placeholder).toContain(`${KEY.slice(0, 4)}…${KEY.slice(-4)}`);
  expect(await page.content()).not.toContain(KEY);

  const aiBlock = page.locator(".settings-block", { hasText: "AI (Gemini)" });
  await aiBlock.getByRole("button", { name: "연결 테스트" }).click();
  await expect(aiBlock.locator(".status-line.good")).toContainText("연결 성공", { timeout: 60_000 });
});

test("사용자: AI 빠른 등록 → 초안 편집 → 저장, AI 주간보고 생성", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "김지현" }).click();
  await page.getByLabel("업무 내용").fill("다음주 수요일까지 신입 온보딩 교육장 섭외하고 강사 확정");
  await page.getByRole("button", { name: "AI로 정리" }).click();
  await expect(page.getByLabel("제목")).not.toHaveValue("", { timeout: 60_000 });
  await expect(page.getByLabel("마감일")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByLabel("체크리스트 1", { exact: true })).toBeVisible();
  const title = `${await page.getByLabel("제목").inputValue()} ✎`;
  await page.getByLabel("제목").fill(title);
  await page.getByRole("button", { name: "카드 저장 →" }).click();
  await expect(lane(page, "todo")).toContainText(title);
  await lane(page, "todo").getByTestId("task-card").filter({ hasText: title }).getByRole("button", { name: "진행 시작 →" }).click();
  await expect(lane(page, "doing")).toContainText(title);

  await page.getByRole("button", { name: "AI 주간보고 생성" }).click();
  const report = page.getByTestId("my-report");
  await expect(report).toContainText("실적", { timeout: 60_000 });
  await expect(report).toContainText("계획");
  await expect(report).toContainText("이슈");
});

test("관리자: AI 팀 주간 리포트 생성 → 한 줄 요약 반영", async ({ page }) => {
  await adminLogin(page);
  await page.getByRole("button", { name: "AI 리포트 생성" }).click();
  const report = page.getByTestId("team-report");
  await expect(report).toContainText("성과", { timeout: 60_000 });
  await expect(report).toContainText("병목");
  await expect(report).toContainText("재분배 제안");
  await page.reload();
  await expect(page.getByTestId("team-report")).toContainText("성과");
  await expect(page.locator(".callout")).toContainText("최근 AI 팀 리포트");
});
