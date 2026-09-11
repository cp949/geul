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
import { expect, type Locator, type Page } from "@playwright/test";

export const SHOWCASE_BASE_URL = "http://127.0.0.1:5174";

/**
 * showcase의 `path`를 연다. 초기 문서가 비어 있는 예제(Kitchen sink 등)는
 * 열자마자 코드 블록이 없으므로, 아래 `openShowcaseExample`의 "첫 코드
 * 블록이 보일 때까지 기다린다" 단계 없이 이 함수만 쓴다.
 */
export const openShowcasePage = async (page: Page, path: string) => {
  await page.goto(`${SHOWCASE_BASE_URL}${path}`);
};

/**
 * showcase의 `path`(예: `/examples/syntax-highlighting-lowlight`)를 열고
 * 코드 블록이 렌더될 때까지 기다린 뒤 그 첫 번째 `<code>` locator를
 * 돌려준다. 구문 강조 예제 spec들의 공통 첫 줄이다.
 *
 * `.first()`로 좁힌다 — 대부분의 예제는 코드 블록 1개뿐이라 영향이
 * 없지만, lowlight 예제(javascript·python·css 3개 블록)처럼 여러 개인
 * 페이지에서도 strict mode violation 없이 대표 블록(javascript, 여러
 * 라이브러리가 공유하는 비교 기준)을 가리키게 한다. 나머지 블록은
 * 필요한 spec이 `page.locator(...).nth(n)`으로 직접 찾는다.
 */
export const openShowcaseExample = async (page: Page, path: string) => {
  await openShowcasePage(page, path);
  const code = page.locator("pre[data-geul-code-block] code").first();
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

/**
 * `/image` 슬래시 명령 → Upload 탭 → 파일 선택까지 진행하고 업로드가
 * 끝날 때까지 기다린 뒤 결과 `<img>` locator를 돌려준다. 00-composite와
 * 07-media 두 예제의 mock uploadFile이 동일 패턴을 복제하고(소스 패널
 * 자기완결성, 스펙 §5) 각 example.tsx 안에서 실제로 data url을
 * 렌더하는지 확인하는 spec 2개(G-TST-002 — 두 번째 파일부터 공용화)가
 * 공유한다.
 */
export const uploadImageViaFilePanel = async (
  page: Page,
  editable: Locator,
  fixturePath = "e2e/fixtures/resize-photo.png",
): Promise<Locator> => {
  await editable.click();
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).click();

  await page.getByRole("tab", { name: "Upload" }).click();
  await page.getByLabel("Image file").setInputFiles(fixturePath);

  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByRole("status")).not.toBeVisible();

  return editable.locator("img");
};
