/**
 * `playwright.config.ts`의 `webServer` 배열이 chrome83 전용 build+preview
 * 서버(포트 4174)를 `GEUL_CHROME83_WEBSERVER` 환경변수가 설정된 실행에서만
 * 포함하는지 검증한다(Issue #120 트랙-6 발견 F1).
 *
 * Playwright는 `--project` 필터와 무관하게 `webServer` 배열 전체를 항상
 * 띄운다 — 환경변수 게이트 없이 두 엔트리를 그대로 두면 `pnpm
 * test:e2e`/`pnpm test:e2e:perf`(3-엔진 회귀 게이트·성능 측정, 둘 다 chrome83과
 * 무관)도 매번 demo 프로덕션 빌드 + `vite preview` 기동을 떠안는다 —
 * 설정 파일 주석이 약속한 "포트로 격리된다"가 실제로는 지켜지지 않는다.
 *
 * 매 테스트가 `vi.resetModules()`로 모듈 캐시를 비우는 이유: 같은 경로를
 * 그대로 재-import하면 캐시가 재사용돼 앞선 테스트의 `process.env` 스냅샷이
 * 그대로 남는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEY = "GEUL_CHROME83_WEBSERVER";

let originalEnvValue: string | undefined;

beforeEach(() => {
  originalEnvValue = process.env[ENV_KEY];
});

afterEach(() => {
  if (originalEnvValue === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = originalEnvValue;
  }
});

const importPlaywrightConfig = async () => {
  vi.resetModules();
  const module = await import("../playwright.config.ts");
  return module.default as { webServer: Array<{ url: string }> };
};

describe("playwright.config.ts의 webServer 배열", () => {
  it(`${ENV_KEY}가 없으면 기존 dev 서버 엔트리 하나만 포함한다`, async () => {
    delete process.env[ENV_KEY];

    const config = await importPlaywrightConfig();

    expect(config.webServer).toHaveLength(1);
    expect(config.webServer[0]?.url).toBe("http://127.0.0.1:5173");
  });

  it(`${ENV_KEY}=1이면 chrome83 build+preview 서버까지 두 엔트리를 포함한다`, async () => {
    process.env[ENV_KEY] = "1";

    const config = await importPlaywrightConfig();

    expect(config.webServer).toHaveLength(2);
    expect(config.webServer[0]?.url).toBe("http://127.0.0.1:5173");
    expect(config.webServer[1]?.url).toBe("http://127.0.0.1:4174");
  });
});
