import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** 실제 Gemini 호출 — .env.test.local 의 GEMINI_API_KEY_FOR_TESTS 사용 (npm run test:live) */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { include: ["tests/live/**/*.test.ts"], environment: "node", testTimeout: 120_000, reporters: ["verbose"] },
});
