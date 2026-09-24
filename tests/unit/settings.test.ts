import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// 저장소를 임시 폴더로 + 배포자가 정한 초기 비밀번호 — 모듈을 불러오기 전에 설정
const dir = mkdtempSync(path.join(tmpdir(), "tb-settings-"));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = "deployer-pass-1";
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_STORE_ID;
const { getSettings, updateSettings, adminView } = await import("@/lib/settings");
const { hashPassword, verifyPassword, DEFAULT_PASSWORD } = await import("@/lib/auth");
afterAll(() => {
  delete process.env.ADMIN_PASSWORD;
  rmSync(dir, { recursive: true, force: true });
});

describe("설정 — 초기 비밀번호·비밀값·동시 수정", () => {
  it("ADMIN_PASSWORD 가 있으면 그것이 초기 비밀번호, 기본 비밀번호 경고는 없음", async () => {
    const s = await getSettings();
    expect(verifyPassword("deployer-pass-1", s.passwordHash)).toBe(true);
    expect(verifyPassword(DEFAULT_PASSWORD, s.passwordHash)).toBe(false);
    expect(adminView(s).defaultPassword).toBe(false);
  });
  it("공개 기본 비밀번호(20261105)를 쓰는 중이면 경고 플래그", async () => {
    await updateSettings({ passwordHash: hashPassword(DEFAULT_PASSWORD) });
    expect(adminView(await getSettings()).defaultPassword).toBe(true);
    await updateSettings({ passwordHash: hashPassword("changed-pass") });
    expect(adminView(await getSettings()).defaultPassword).toBe(false);
  });
  it("시트 비밀값은 첫 실행에 한 번 만들어지고 바뀌지 않는다", async () => {
    const a = (await getSettings()).sheetSecret;
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect((await getSettings()).sheetSecret).toBe(a);
    expect(adminView(await getSettings()).sheetSecret).toBe(a);
  });
  it("동시 설정 변경(키 저장 + 팀원 추가 + 비밀번호 변경)이 서로를 지우지 않는다", async () => {
    const newHash = hashPassword("after-race");
    await Promise.all([
      updateSettings({ geminiKey: "k-not-real-1234" }),
      updateSettings({ members: ["김지현"] }),
      updateSettings({ passwordHash: newHash }),
      updateSettings({ teamName: "인재육성팀" }),
    ]);
    const s = await getSettings();
    expect(s).toMatchObject({ geminiKey: "k-not-real-1234", members: ["김지현"], passwordHash: newHash, teamName: "인재육성팀" });
  });
});
