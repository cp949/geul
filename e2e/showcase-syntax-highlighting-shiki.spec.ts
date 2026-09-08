/**
 * RD-003-DELTA-02(BLK-017, Issue #162) — `apps/showcase`의 shiki 구문
 * 강조 예제를 검증한다. `SyntaxHighlighter`의 `Promise` 반환 분기를 실제
 * 라이브러리(shiki 문법 엔진 WASM 초기화)로 처음 실증하는 spec이다
 * (DELTA-01의 lowlight는 동기 반환만 썼다). 페이지 이동은
 * `e2e/support/showcase.ts`의 `openShowcaseExample`을 쓴다(G-TST-002).
 */
import { expect, test } from "@playwright/test";

import {
  openShowcaseExample,
  SYNTAX_HIGHLIGHTING_SAMPLE_SOURCE as SAMPLE_SOURCE,
} from "./support/showcase.js";

test("shiki 예제는 코드 블록에 토큰별 class를 렌더하고 source 텍스트를 바꾸지 않는다", async ({
  page,
}) => {
  const code = await openShowcaseExample(
    page,
    "/examples/syntax-highlighting-shiki",
  );

  // spec §4 — 강조는 텍스트를 바꾸지 않는다. 줄바꿈 렌더 차이를 피하려고
  // 공백을 정규화해 비교한다(ProseMirror가 텍스트 자체를 바꾸지 않는다는
  // 사실은 RD-001 core 회귀가 이미 고정 — 여기서는 showcase 배선이 그
  // 보증을 실제로 쓰는지만 본다).
  const renderedText = (await code.textContent()) ?? "";
  expect(renderedText.replace(/\s+/g, " ").trim()).toBe(
    SAMPLE_SOURCE.replace(/\s+/g, " ").trim(),
  );

  // shiki 어댑터가 만드는 결정적 class 접두사(`shiki-tok-`)를 가진 span이
  // 하나 이상 있어야 한다 — 문법 엔진 WASM 초기화(비동기)를 기다린 뒤
  // `syntaxHighlighter`가 실제로 연결됐다는 증거다.
  const highlightedSpans = code.locator('span[class*="shiki-tok-"]');
  await expect(highlightedSpans.first()).toBeVisible();
  expect(await highlightedSpans.count()).toBeGreaterThan(0);

  // 알려진 keyword 토큰("function")의 computed color가 github-light
  // 테마의 실제 keyword 색상과 일치하는지 구체적으로 확인한다 — class
  // 존재만으로는 어댑터가 엉뚱한 토큰에 우연히 class를 붙인 false
  // positive를 배제하지 못하고, 테마 스타일시트 계산(getTheme().settings)이
  // 실제로 어댑터의 class 계산과 같은 값에 수렴하는지도 이 assertion으로만
  // 검증된다.
  const functionKeyword = code.getByText("function", { exact: true });
  await expect(functionKeyword).toHaveCSS("color", "rgb(215, 58, 73)");
});
