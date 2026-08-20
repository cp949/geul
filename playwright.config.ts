import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    // retain-on-failure는 통과할 테스트의 trace까지 전부 기록한 뒤 버린다 —
    // 전량 통과하는 정상 실행에서 산출물이 0인 작업에 e2e 예산의 41%가
    // 들어갔다(chromium 83개: 45.1s -> 26.3s, Issue #74). CI는 retries가
    // 2라 실패 trace가 그대로 남고, 로컬은 실패한 spec만
    // `--trace=on`으로 다시 돌리면 더 완전한 trace를 얻는다.
    trace: "on-first-retry",
  },
  projects: [
    // 회귀 게이트 3종. 성능 기준선 spec은 게이트가 아니므로 아래 perf
    // 프로젝트가 단독으로 가져간다(testIgnore).
    {
      name: "chromium",
      testIgnore: /table-performance\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // R1 완료 조건(AC-05): 슬라이스 1~11 핵심 시나리오를 3-엔진에서
      // 검증한다. 70개 전체가 아니라 @core 태그가 붙은 부분집합만 돈다 —
      // 전체 회귀는 chromium 프로젝트가 계속 담당한다.
      name: "firefox",
      grep: /@core/,
      testIgnore: /table-performance\.spec\.ts$/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      grep: /@core/,
      testIgnore: /table-performance\.spec\.ts$/,
      use: { ...devices["Desktop Safari"] },
    },
    {
      // 성능 기준선 기록 전용(`pnpm test:e2e:perf`). 게이트가 아니다 —
      // table-performance.spec.ts는 표가 만들어졌는지만 단언하고 수치는
      // docs/product/performance-baseline.md에 사람이 옮겨 적는다.
      //
      // 게이트에서 떼어내는 이유는 두 가지다. (1) 단일 테스트가 38.6초로
      // 나머지 116개 최대값(5.2초)의 7배라 임계경로를 혼자 만든다.
      // (2) 회귀 스위트와 같이 돌면 6워커 경합 속에서 performance.now()
      // 표본을 뜨게 돼 그 수치로는 20% 회귀 판정을 세울 수 없다.
      // workers: 1로 격리해 표본을 경합에서 떼어낸다(Issue #74).
      name: "perf",
      testMatch: /table-performance\.spec\.ts$/,
      workers: 1,
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
