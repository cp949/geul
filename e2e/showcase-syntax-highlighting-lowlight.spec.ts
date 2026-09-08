/**
 * RD-003-DELTA-01(BLK-017, Issue #162) — `apps/showcase`의 lowlight(+
 * highlight.js) 구문 강조 예제를 검증한다. 이 저장소 최초의 example별
 * 전용 Playwright spec이다 — 기존 `e2e/*.spec.ts`는 전부 `apps/demo`의
 * composite("Kitchen sink") 페이지 하나만 열어 왔다(`e2e/support/demo.ts`의
 * `openDemo`, `page.goto("/")` 고정). `apps/showcase`는 실제 URL
 * 라우팅(react-router `BrowserRouter`)이라 example별로 직접
 * `page.goto()`할 수 있다.
 *
 * 페이지 이동 helper를 이 파일에 인라인한다 — `G-TST-002`의 적용 조건(두
 * 번째 테스트 파일이 같은 helper를 씀)이 아직 성립하지 않는다(이 파일이
 * 최초의 example별 spec). 두 번째 example spec(RD-003 DELTA-02)이 생기면
 * 공용화 여부를 그때 판단한다.
 */
import { expect, test } from "@playwright/test";

// `playwright.config.ts`의 `use.baseURL`은 apps/demo(5173) 고정이다.
// showcase는 별도 포트(5174, apps/showcase/vite.config.ts)라 전체 URL을
// 그대로 쓴다.
const SHOWCASE_BASE_URL = "http://127.0.0.1:5174";

const SAMPLE_SOURCE = `function greet(name) {
  // Says hello
  const greeting = \`Hello, \${name}!\`;
  return greeting.toUpperCase();
}

console.log(greet("Geul"));`;

test("lowlight 예제는 코드 블록에 highlight.js token class를 렌더하고 source 텍스트를 바꾸지 않는다", async ({
  page,
}) => {
  await page.goto(`${SHOWCASE_BASE_URL}/examples/syntax-highlighting-lowlight`);

  const code = page.locator("pre[data-geul-code-block] code");
  await expect(code).toBeVisible();

  // spec §4 — 강조는 텍스트를 바꾸지 않는다. 줄바꿈 렌더 차이를 피하려고
  // 공백을 정규화해 비교한다(ProseMirror가 텍스트 자체를 바꾸지 않는다는
  // 사실은 RD-001 core 회귀가 이미 고정 — 여기서는 showcase 배선이 그
  // 보증을 실제로 쓰는지만 본다).
  const renderedText = (await code.textContent()) ?? "";
  expect(renderedText.replace(/\s+/g, " ").trim()).toBe(
    SAMPLE_SOURCE.replace(/\s+/g, " ").trim(),
  );

  // highlight.js가 만드는 token class 접두사(`hljs-`)를 가진 span이
  // 하나 이상 있어야 한다 — `syntaxHighlighter`가 실제로 연결됐다는
  // 증거다.
  const highlightedSpans = code.locator('span[class*="hljs-"]');
  await expect(highlightedSpans.first()).toBeVisible();
  expect(await highlightedSpans.count()).toBeGreaterThan(0);

  // 알려진 keyword 하나("function")가 keyword class를 갖는지 구체적으로
  // 확인한다 — class 존재만으로는 엉뚱한 토큰에 우연히 걸리는 false
  // positive를 배제하지 못한다.
  await expect(code.locator("span.hljs-keyword").first()).toHaveText(
    "function",
  );
});
