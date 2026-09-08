/**
 * `apps/showcase`(react-router `BrowserRouter`, 5174) example별 e2e spec이
 * 공유하는 페이지 이동 절차(RD-003-DELTA-02, Issue #162). DELTA-01의
 * `showcase-syntax-highlighting-lowlight.spec.ts`가 인라인으로 갖고 있던
 * 로직을 두 번째 example spec(shiki) 추가 시점에 여기로 모았다
 * (`G-TST-002` — 두 번째 파일부터 공용화).
 *
 * `apps/demo`의 `e2e/support/demo.ts`(`openDemo`)와 역할이 같지만 대상 앱과
 * base URL이 달라 별도 파일로 둔다 — `playwright.config.ts`의
 * `use.baseURL`은 apps/demo(5173) 고정이라 showcase(5174)는 전체 URL을
 * 직접 써야 한다.
 */
import { expect, type Page } from "@playwright/test";

const SHOWCASE_BASE_URL = "http://127.0.0.1:5174";

/**
 * showcase의 `path`(예: `/examples/syntax-highlighting-lowlight`)를 열고
 * 코드 블록이 렌더될 때까지 기다린 뒤 그 `<code>` locator를 돌려준다.
 * 구문 강조 예제 spec들의 공통 첫 줄이다.
 */
export const openShowcaseExample = async (page: Page, path: string) => {
  await page.goto(`${SHOWCASE_BASE_URL}${path}`);
  const code = page.locator("pre[data-geul-code-block] code");
  await expect(code).toBeVisible();
  return code;
};

/**
 * 구문 강조 예제(lowlight·shiki·...)가 공통으로 쓰는 대표 JS 샘플. 여러
 * 라이브러리를 나란히 비교할 수 있도록 예제마다 같은 코드를 강조한다 —
 * 이 값 자체가 라이브러리 간 비교 기준이라(`pnpm scan:test-helpers`가
 * 두 spec의 동일 이름·동일 값을 실제로 감지) 한 곳에 둔다. 각
 * `example.tsx`(product 소스, 복사해 쓰는 예제라 자기완결적이어야 함 —
 * DELTA-01 "결정")는 별도로 리터럴을 유지한다 — 이 상수는 e2e만 쓴다.
 */
export const SYNTAX_HIGHLIGHTING_SAMPLE_SOURCE = `function greet(name) {
  // Says hello
  const greeting = \`Hello, \${name}!\`;
  return greeting.toUpperCase();
}

console.log(greet("Geul"));`;
