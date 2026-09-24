import { defineConfig, devices } from "@playwright/test";

export const PORT = 3100;
export const SHEET_PORT = 3199;

/**
 * E2E — 로컬 저장 모드(.e2e-data/)로 빌드한 앱을 띄워 핵심 흐름을 검사한다.
 * 시트 연동은 tests/e2e/fake-sheet.ts 의 가짜 수신 서버로 받는다.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/fake-sheet.ts",
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: "ko-KR", timezoneId: "Asia/Seoul", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }, testMatch: /mobile/, dependencies: ["desktop"] },
  ],
  webServer: {
    command: `node -e "require('fs').rmSync('.e2e-data',{recursive:true,force:true})" && npm run build && npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/team`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      DATA_DIR: ".e2e-data",
      SHEET_URL_PREFIX_FOR_TESTS: `http://127.0.0.1:${SHEET_PORT}/`,
      BLOB_READ_WRITE_TOKEN: "",
    },
  },
});
