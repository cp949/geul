import { defineConfig, devices } from "@playwright/test";

// chrome83 project 전용 build+preview 서버(D7). Playwright는 --project
// 필터와 무관하게 webServer 배열 전체를 항상 띄운다(실측 확인) — 포트만
// 다르다고 격리되지 않는다. 이 엔트리를 무조건 배열에 두면 `pnpm
// test:e2e`(chromium 게이트)/`pnpm test:e2e:full`(3-엔진)/`pnpm
// test:e2e:perf`(성능 측정) — 모두 chrome83과 무관 — 도 매번 demo 프로덕션
// 빌드 + `vite preview` 기동을 떠안는다(트랙-6 발견 F1).
// `GEUL_CHROME83_WEBSERVER` 환경변수가 설정된 실행에서만 배열에
// 포함해 실제로 격리한다 — `test:e2e:chrome83`의 `docker run -e
// GEUL_CHROME83_WEBSERVER=1`이 그 실행에서만 이 값을 켠다.
const chrome83WebServer = process.env.GEUL_CHROME83_WEBSERVER
  ? [
      {
        command:
          "pnpm --filter @cp949/geul-react build && pnpm --filter @cp949/geul-demo build && pnpm --filter @cp949/geul-demo exec vite preview --port 4174 --host 127.0.0.1 --strictPort",
        url: "http://127.0.0.1:4174",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
    ]
  : [];

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
      // @core 자격 기준은 엔진 간 구현 차이다(ADR 0007:
      // docs/adr/0007-own-behavior-at-the-lowest-proving-layer.md).
      // 태그 붙은 부분집합만 3-엔진에서 돌고, 전체 회귀는 chromium이 담당한다.
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
    {
      // Chrome83(Debian snapshot 고정 바이너리, docker/chrome83) 실검증
      // 전용. 공식 browser floor는 Chrome75(ADR-0008)지만 Playwright
      // 1.62.1이 무조건 호출하는 CDP Browser.setDownloadBehavior가
      // Chrome82부터 존재해 83을 실제 검증 가능한 최소로 쓴다(01-계획.md
      // D10·D11). `@core` 시나리오 3개(링크 툴바, 블록 분리, 표 행 추가)만
      // 선택하고, dev 서버가 아니라 build+preview 산출물을 서빙한다(D7) —
      // vite dev는 build.target을 적용하지 않아 downlevel 결과가 반영되지
      // 않는다. `pnpm test:e2e:chrome83`(docker/chrome83 컨테이너 안에서만
      // 실행)로만 돈다 — `pnpm test:e2e`/`pnpm verify`에는 포함하지 않는다.
      // testMatch는 파일명 단위라 파일 하나에 `@core` 테스트가 2개 이상이면
      // 의도치 않은 테스트까지 함께 편입된다 — 그래서 표 행 추가
      // 시나리오는 `table-keyboard-navigation.spec.ts`(Shift+Tab 포커스
      // 트랩 테스트 전용)에 합치지 않고 별도 파일로 뗐다(Issue #124).
      name: "chrome83",
      testMatch:
        /(link-toolbar|block-handle|table-keyboard-row-insert)\.spec\.ts$/,
      grep: /@core/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4174",
        launchOptions: {
          executablePath: "/usr/bin/chromium",
          args: ["--no-sandbox"],
        },
      },
    },
  ],
  webServer: [
    {
      // dist/styles.css가 src/*.tsx의 클래스 문자열에서 생성되므로, 단독
      // test:e2e가 스테일 CSS로 돌지 않도록 react 패키지를 먼저 빌드한다
      // (reuseExistingServer로 서버를 재사용하는 경우는 제외).
      command:
        "pnpm --filter @cp949/geul-react build && pnpm --filter @cp949/geul-demo dev --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    ...chrome83WebServer,
  ],
});
