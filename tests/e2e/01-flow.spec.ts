import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { adminLogin, createTaskApi, lane, PASSWORD, seoulDate, SHEET_URL, sheetReceived } from "./helpers";

test.describe.configure({ mode: "serial" });

test("첫 실행: 팀원 명단이 없으면 관리자 설정 안내", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "아직 팀원 명단이 없습니다" })).toBeVisible();
  await page.getByRole("link", { name: "관리자 설정으로 가기 →" }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("관리자: 로그인 → 팀 이름·팀원 명단 등록", async ({ page, request }) => {
  expect((await request.get("/api/admin/overview")).status()).toBe(401);
  await page.goto("/admin");
  await page.getByLabel("관리자 비밀번호").fill("wrong-pass");
  await page.getByRole("button", { name: "들어가기" }).click();
  await expect(page.locator(".login [role=alert]")).toContainText("비밀번호가 올바르지 않습니다");

  await adminLogin(page);
  await expect(page.locator("details.settings")).toHaveAttribute("open", "");
  await page.getByLabel("팀 이름").fill("인재육성팀");
  await page.locator(".settings-block").first().getByRole("button", { name: "저장" }).click();
  await expect(page.locator(".toast")).toContainText("팀 이름을 저장했습니다");

  for (const name of ["김지현", "박서연", "이민재"]) {
    await page.getByLabel("추가할 팀원 이름").fill(name);
    await page.getByRole("button", { name: "팀원 추가" }).click();
    await expect(page.getByTestId("member-chips")).toContainText(name);
  }
  await page.getByLabel("모델").selectOption("gemini-3.8-flash");
  await expect(page.locator(".toast")).toContainText("모델을 바꿨습니다");
  await page.getByLabel("모델").selectOption("gemini-3.7-flash");

  await page.getByLabel("웹 앱 주소").fill("https://evil.example.com/x");
  await page.locator(".settings-block", { hasText: "구글시트" }).getByRole("button", { name: "저장" }).click();
  await expect(page.locator(".toast")).toContainText("script.google.com");

  await page.reload();
  await expect(page.getByTestId("member-chips")).toContainText("이민재");
  await expect(page.locator(".edition")).toContainText("인재육성팀");
});

test("사용자: 이름 선택 → 직접 등록(저장 전 편집) → 새로고침해도 유지", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "김지현" }).click();
  await expect(page.getByText("김지현의 업무")).toBeVisible();

  // 키가 없으면 AI 는 안내만, 직접 등록은 된다
  await page.getByLabel("업무 내용").fill("신입 온보딩 교육장 섭외");
  await page.getByRole("button", { name: "AI로 정리" }).click();
  await expect(page.locator(".ai-letter [role=alert]")).toContainText("관리자에게 Gemini API 키 등록을 요청");

  await page.getByRole("button", { name: "직접 등록" }).click();
  await expect(page.getByLabel("제목")).toHaveValue("신입 온보딩 교육장 섭외");
  await page.getByLabel("제목").fill("신입 온보딩 교육장 및 강사 확정");
  await page.getByLabel("마감일").fill(seoulDate(6));
  await page.getByLabel("우선순위").selectOption("high");
  await page.getByLabel("분류").fill("교육 운영");
  await page.getByRole("button", { name: "＋ 항목 추가" }).click();
  await page.getByLabel("체크리스트 1", { exact: true }).fill("교육장 후보 3곳 비교");
  await page.getByRole("button", { name: "＋ 항목 추가" }).click();
  await page.getByLabel("체크리스트 2", { exact: true }).fill("강사 일정 확인");
  await page.getByRole("button", { name: "카드 저장 →" }).click();

  const card = lane(page, "todo").getByTestId("task-card").filter({ hasText: "신입 온보딩 교육장 및 강사 확정" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("우선순위 높음");
  await expect(card).toContainText("교육 운영");
  await expect(card).toContainText("체크리스트 0/2");

  await page.reload();
  await expect(page.getByText("김지현의 업무")).toBeVisible();
  await expect(lane(page, "todo")).toContainText("신입 온보딩 교육장 및 강사 확정");
});

test("사용자: 버튼·드래그로 상태 이동, 체크리스트·수정·삭제", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "김지현" }).click();
  const title = "신입 온보딩 교육장 및 강사 확정";
  const card = (status: "todo" | "doing" | "done") => lane(page, status).getByTestId("task-card").filter({ hasText: title });

  await card("todo").getByRole("button", { name: "진행 시작 →" }).click();
  await expect(card("doing")).toBeVisible();
  await expect(lane(page, "doing").locator(".count")).toHaveText("01");

  await card("doing").dragTo(lane(page, "done"));
  await expect(card("done")).toBeVisible();
  await expect(card("done")).toContainText("완료됨");
  await page.reload();
  await expect(card("done")).toBeVisible();

  await card("done").getByRole("button", { name: "← 다시 진행" }).click();
  await expect(card("doing")).toBeVisible();

  await card("doing").getByText("체크리스트 0/2").click();
  await card("doing").getByLabel("교육장 후보 3곳 비교").check();
  await expect(card("doing")).toContainText("체크리스트 1/2");
  await page.reload();
  await expect(card("doing")).toContainText("체크리스트 1/2");

  await card("doing").getByRole("button", { name: "수정" }).click();
  await page.getByLabel("제목").fill(`${title} (수정)`);
  await page.getByRole("button", { name: "수정 저장" }).click();
  await expect(lane(page, "doing")).toContainText(`${title} (수정)`);

  // 삭제용 카드
  await page.getByLabel("업무 내용").fill("지울 카드");
  await page.getByRole("button", { name: "직접 등록" }).click();
  await page.getByRole("button", { name: "카드 저장 →" }).click();
  const temp = lane(page, "todo").getByTestId("task-card").filter({ hasText: "지울 카드" });
  await expect(temp).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await temp.getByRole("button", { name: "삭제" }).click();
  await expect(temp).toHaveCount(0);
  await page.reload();
  await expect(lane(page, "todo")).not.toContainText("지울 카드");
});

test("관리자: 현황·필터·부하 막대·지연 목록·CSV", async ({ page, request }) => {
  await createTaskApi(request, { owner: "박서연", title: "채용면접관 교육 콘텐츠 검수", due: seoulDate(-2), status: "doing", priority: "high" });
  await createTaskApi(request, { owner: "이민재", title: "신입 입문교육 만족도 결과 취합", due: seoulDate(1), status: "doing" });
  await createTaskApi(request, { owner: "이민재", title: "핵심인재 과정 수료자 명단 확정", status: "done" });

  await adminLogin(page);
  const metrics = page.getByTestId("metrics");
  await expect(metrics).toContainText("전체 업무04");
  await expect(metrics).toContainText("진행 중03");
  await expect(metrics).toContainText("완료율25%");
  await expect(metrics).toContainText("지연 업무01");
  await expect(page.locator(".callout")).toContainText("지연 1건을 먼저 확인하세요");

  await expect(page.getByTestId("team-row")).toHaveCount(4);
  await page.getByLabel("담당자 필터").selectOption("이민재");
  await expect(page.getByTestId("team-row")).toHaveCount(2);
  await page.getByLabel("담당자 필터").selectOption("all");
  await page.getByLabel("마감 필터").selectOption("overdue");
  await expect(page.getByTestId("team-row")).toHaveCount(1);
  await expect(page.getByTestId("team-row")).toContainText("채용면접관 교육 콘텐츠 검수");
  await page.getByLabel("마감 필터").selectOption("all");
  await page.getByLabel("상태 필터").selectOption("done");
  await expect(page.getByTestId("team-row")).toHaveCount(1);

  const chart = page.getByRole("img", { name: "인원별 업무 부하 막대 그래프" });
  await expect(chart).toContainText("박서연");
  await expect(chart).toContainText("1건 · 지연 1");

  const alerts = page.getByTestId("deadline-alert");
  await expect(alerts.first()).toContainText("채용면접관 교육 콘텐츠 검수");
  await expect(alerts.first()).toContainText("마감 지남");
  await expect(page.locator(".alert", { hasText: "신입 입문교육 만족도" })).toContainText("마감 임박");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "CSV 내보내기" }).click()]);
  const csv = readFileSync(await download.path(), "utf8");
  expect(csv.startsWith("﻿ID,담당자,제목,상태,우선순위,마감일,체크리스트,생성일,수정일")).toBe(true);
  expect(csv).toContain("채용면접관 교육 콘텐츠 검수");
  expect(csv.trim().split("\r\n")).toHaveLength(5);

  // AI 리포트는 키가 없으면 안내
  await page.getByRole("button", { name: "AI 리포트 생성" }).click();
  await expect(page.locator(".ai-report [role=alert]")).toContainText("Gemini API 키");
});

test("구글시트: 연결 테스트 → 새 카드가 10초 안에 한 줄로 도착 → 전부 보내기", async ({ page, request }) => {
  await adminLogin(page);
  await page.getByLabel("웹 앱 주소").fill(SHEET_URL);
  await page.locator(".settings-block", { hasText: "구글시트" }).getByRole("button", { name: "저장" }).click();
  await expect(page.locator(".toast")).toContainText("시트 주소를 저장했습니다");
  await page.getByRole("button", { name: "연결 테스트" }).last().click();
  await expect(page.locator(".toast")).toContainText("시트 연결 성공");
  await expect(page.locator(".status-line.good")).toContainText("마지막 전송 성공");

  const started = Date.now();
  const task = await createTaskApi(request, { owner: "김지현", title: "시트로 가는 카드", due: seoulDate(3) });
  await expect
    .poll(async () => (await sheetReceived(request)).find((p) => p.action === "upsert" && p.id === task.id), { timeout: 10_000 })
    .toBeTruthy();
  const upsert = (await sheetReceived(request)).find((p) => p.action === "upsert" && p.id === task.id)!;
  expect(Number(upsert.at) - started).toBeLessThan(10_000);
  expect(upsert.type).toBe("tasks");
  // 시트 비밀값: 관리자 화면의 복사용 Apps Script 코드에 들어간 값과 같은 값이 함께 온다
  expect(upsert.secret).toMatch(/^[a-f0-9]{64}$/);
  await expect(page.locator("#s-code")).toHaveValue(new RegExp(`var SECRET = '${upsert.secret}';`));
  expect(upsert.updatedAt).toBeTruthy();
  expect(upsert.row).toMatchObject({ ID: task.id, 담당자: "김지현", 제목: "시트로 가는 카드", 상태: "할 일", 우선순위: "보통", 마감일: seoulDate(3) });

  const upd = await request.patch(`/api/tasks/${task.id}`, { data: { status: "doing" } });
  expect(upd.ok()).toBeTruthy();
  await expect
    .poll(async () => (await sheetReceived(request)).some((p) => p.id === task.id && (p.row as { 상태?: string })?.상태 === "진행 중"))
    .toBe(true);
  expect((await request.delete(`/api/tasks/${task.id}`)).ok()).toBeTruthy();
  await expect.poll(async () => (await sheetReceived(request)).some((p) => p.action === "delete" && p.id === task.id)).toBe(true);

  await page.getByRole("button", { name: "지금까지 데이터 전부 보내기" }).click();
  await expect(page.locator(".toast")).toContainText("시트로 모두 보냈습니다");
  const all = (await sheetReceived(request)).filter((p) => p.action === "replace_all").at(-1)!;
  expect((all.rows as unknown[]).length).toBe(4);
  expect(all.headers).toEqual(["ID", "담당자", "제목", "상태", "우선순위", "마감일", "체크리스트", "생성일", "수정일", "버전"]);

  // 자동 전송 오류는 설정을 다시 펼칠 때 새로 읽어 보여 준다
  await page.getByLabel("웹 앱 주소").fill("http://127.0.0.1:3199/fail");
  await page.locator(".settings-block", { hasText: "구글시트" }).getByRole("button", { name: "저장" }).click();
  await expect(page.locator(".toast")).toContainText("시트 주소를 저장했습니다");
  await createTaskApi(request, { owner: "김지현", title: "실패할 전송" });
  const summary = page.locator("details.settings > summary");
  await expect(async () => {
    await summary.click();
    await summary.click();
    await expect(page.locator(".status-line.bad")).toContainText("시트가 거부함", { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await page.getByLabel("웹 앱 주소").fill(SHEET_URL);
  await page.locator(".settings-block", { hasText: "구글시트" }).getByRole("button", { name: "저장" }).click();
  await expect(page.locator(".toast")).toContainText("시트 주소를 저장했습니다");
});

test("동시성: 5명이 동시에 등록해도 유실 없음", async ({ page, request }) => {
  const owners = ["김지현", "박서연", "이민재", "김지현", "박서연"];
  await Promise.all(owners.map((owner, i) => createTaskApi(request, { owner, title: `동시 등록 ${i}` })));
  await adminLogin(page);
  await expect(page.getByTestId("team-row").filter({ hasText: "동시 등록" })).toHaveCount(5);
});

test("입력 검증: 명단에 없는 이름·잘못된 값은 거부", async ({ request }) => {
  expect((await request.post("/api/tasks", { data: { owner: "외부인", title: "x" } })).status()).toBe(400);
  expect((await request.post("/api/tasks", { data: { owner: "김지현", title: "" } })).status()).toBe(400);
  expect((await request.post("/api/tasks", { data: "not json", headers: { "Content-Type": "application/json" } })).status()).toBe(400);
  expect((await request.patch("/api/tasks/not-a-real-id", { data: { status: "done" } })).status()).toBe(404);
  expect((await request.post("/api/admin/reset", { data: { confirm: "초기화" } })).status()).toBe(401);
});

test("비밀번호 변경 → 옛 비밀번호 거부 → 새 비밀번호로 로그인 → 원복", async ({ page }) => {
  await adminLogin(page);
  // 공개된 기본 비밀번호로 로그인 중 → 경고 배너 + 변경 바로가기(강제는 아님)
  const warning = page.getByTestId("default-password-warning");
  await expect(warning).toContainText("기본 비밀번호");
  await warning.getByRole("button", { name: "지금 비밀번호 바꾸기" }).click();
  await expect(page.getByLabel("새 비밀번호 (6자 이상)")).toBeFocused();
  await page.getByLabel("새 비밀번호 (6자 이상)").fill("newpass123");
  await page.getByLabel("한 번 더").fill("newpass123");
  await page.getByRole("button", { name: "비밀번호 변경" }).click();
  await expect(page.locator(".toast")).toContainText("비밀번호를 바꿨습니다");
  await expect(warning).toHaveCount(0);
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByLabel("관리자 비밀번호")).toBeVisible();

  await page.getByLabel("관리자 비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "들어가기" }).click();
  await expect(page.locator(".login [role=alert]")).toContainText("비밀번호가 올바르지 않습니다");

  await adminLogin(page, "newpass123");
  await page.getByLabel("새 비밀번호 (6자 이상)").fill(PASSWORD);
  await page.getByLabel("한 번 더").fill(PASSWORD);
  await page.getByRole("button", { name: "비밀번호 변경" }).click();
  await expect(page.locator(".toast")).toContainText("비밀번호를 바꿨습니다");
});

test("전체 초기화: 확인 문구를 넣어야 카드가 모두 지워지고 설정은 유지", async ({ page }) => {
  await adminLogin(page);
  page.once("dialog", (d) => d.accept("아니오"));
  await page.getByRole("button", { name: "전체 초기화" }).click();
  await expect(page.locator(".toast")).toContainText("«초기화»를 입력하세요");

  page.once("dialog", (d) => d.accept("초기화"));
  await page.getByRole("button", { name: "전체 초기화" }).click();
  await expect(page.locator(".toast")).toContainText("건을 지웠습니다");
  await expect(page.getByTestId("metrics")).toContainText("전체 업무00");
  await expect(page.getByTestId("member-chips")).toContainText("김지현");
});
