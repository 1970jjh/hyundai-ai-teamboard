import { expect, test } from "@playwright/test";
import { adminLogin, createTaskApi, lane, noHorizontalScroll } from "./helpers";

test("휴대폰(390px): 사용자 화면 — 가로 스크롤 없이 등록·이동", async ({ page, request }) => {
  await createTaskApi(request, { owner: "박서연", title: "모바일에서 보는 카드", due: "2026-12-01" });
  await page.goto("/");
  await page.getByRole("button", { name: "박서연" }).click();
  await expect(page.getByText("박서연의 업무")).toBeVisible();
  await noHorizontalScroll(page);

  // 칸반이 세로로 쌓인다
  const todo = await lane(page, "todo").boundingBox();
  const doing = await lane(page, "doing").boundingBox();
  expect(doing!.y).toBeGreaterThan(todo!.y);
  expect(todo!.width).toBeGreaterThan(300);

  await page.getByLabel("업무 내용").fill("모바일 직접 등록");
  await page.getByRole("button", { name: "직접 등록" }).click();
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: "카드 저장 →" }).click();
  const card = lane(page, "todo").getByTestId("task-card").filter({ hasText: "모바일 직접 등록" });
  await card.getByRole("button", { name: "진행 시작 →" }).click();
  await expect(lane(page, "doing")).toContainText("모바일 직접 등록");
  await noHorizontalScroll(page);
});

test("휴대폰(390px): 관리자 대시보드 — 가로 스크롤 없음", async ({ page }) => {
  await adminLogin(page);
  await expect(page.getByRole("img", { name: "인원별 업무 부하 막대 그래프" })).toBeVisible();
  await noHorizontalScroll(page);
  const metrics = await page.getByTestId("metrics").boundingBox();
  expect(metrics!.width).toBeLessThanOrEqual(390);
});
