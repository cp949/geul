/**
 * RD-003-DELTA-03(BLK-017, Issue #162) — `apps/showcase`의 refractor(Prism)
 * 구문 강조 예제를 검증한다. 페이지 이동은 `e2e/support/showcase.ts`의
 * `openShowcaseExample`을 쓴다(G-TST-002, DELTA-02가 이미 공용화).
 */
import { expect, test } from "@playwright/test";

import {
  openShowcaseExample,
  SYNTAX_HIGHLIGHTING_SAMPLE_SOURCE as SAMPLE_SOURCE,
} from "./support/showcase.js";

test("refractor 예제는 코드 블록에 토큰별 class를 렌더하고 source 텍스트를 바꾸지 않는다", async ({
  page,
}) => {
  const code = await openShowcaseExample(
    page,
    "/examples/syntax-highlighting-refractor",
  );

  // spec §4 — 강조는 텍스트를 바꾸지 않는다. 줄바꿈 렌더 차이를 피하려고
  // 공백을 정규화해 비교한다(ProseMirror가 텍스트 자체를 바꾸지 않는다는
  // 사실은 RD-001 core 회귀가 이미 고정 — 여기서는 showcase 배선이 그
  // 보증을 실제로 쓰는지만 본다).
  const renderedText = (await code.textContent()) ?? "";
  expect(renderedText.replace(/\s+/g, " ").trim()).toBe(
    SAMPLE_SOURCE.replace(/\s+/g, " ").trim(),
  );

  // refractor(Prism) 어댑터가 만드는 표준 class(`token`)를 가진 span이
  // 하나 이상 있어야 한다 — `syntaxHighlighter`가 실제로 연결됐다는 증거다.
  const highlightedSpans = code.locator("span.token");
  await expect(highlightedSpans.first()).toBeVisible();
  expect(await highlightedSpans.count()).toBeGreaterThan(0);

  // 알려진 keyword 토큰("function")의 computed color가 Prism 기본 테마
  // (prism.css)의 실제 keyword 색상과 일치하는지 구체적으로 확인한다 —
  // class 존재만으로는 어댑터가 엉뚱한 토큰에 우연히 class를 붙인 false
  // positive를 배제하지 못한다.
  const functionKeyword = code.getByText("function", { exact: true });
  await expect(functionKeyword).toHaveCSS("color", "rgb(0, 119, 170)");
});
