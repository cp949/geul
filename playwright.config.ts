import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // dist/styles.css가 src/*.tsx의 클래스 문자열에서 생성되므로, 단독
    // test:e2e가 스테일 CSS로 돌지 않도록 react 패키지를 먼저 빌드한다
    // (reuseExistingServer로 서버를 재사용하는 경우는 제외).
    command:
      "pnpm --filter @cp949/geul-react build && pnpm --filter @cp949/geul-demo dev --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
