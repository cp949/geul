/**
 * Kitchen sink(00-composite)의 미리보기 결과 패널을 검증한다(2026-09-11,
 * 사용자 요청 — 미리보기 코드블록도 라이브 에디터처럼 syntax highlight를
 * 적용). exportHtml()은 예제가 이미 라이브 에디터에 배선한
 * compositeSyntaxHighlighter(lowlight)를 그대로 재사용한다(새 하이라이터
 * 로딩 없음) — 이 spec은 그 재사용이 실제로 미리보기 DOM에 반영되는지만
 * 본다. 문서 편집(SlashMenu `/code` + 타이핑)은 vitest+jsdom에서
 * 신뢰할 만하게 재현할 방법이 이 저장소에 없어(ProseMirror 타이핑) e2e로
 * 확인한다 — e2e/code-block.spec.ts의 `insertCodeBlock` 패턴을 그대로
 * 따른다.
 */
import { expect, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

test("미리보기 탭의 코드 블록이 라이브 에디터와 동일하게 syntax highlight된다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");

  const editable = page.getByRole("textbox", { name: "Editor" });
  await editable.click();
  await page.keyboard.type("/code");
  await page.getByRole("option", { name: /Code/ }).click();

  // 언어를 지정하지 않으면 compositeSyntaxHighlighter가 빈 토큰을
  // 돌려줘 강조가 안 붙는다(e2e/code-block.spec.ts의 `openLanguagePopover`
  // + "js" + Enter 패턴을 그대로 따른다).
  await page.getByRole("button", { name: "Code language" }).click();
  const languageSearch = page.getByRole("combobox", {
    name: "Search for a language",
  });
  await languageSearch.fill("js");
  await languageSearch.press("Enter");

  await page.keyboard.type('const a = "hello";');

  const liveCode = editable.locator("pre[data-geul-code-block] code");
  await expect(liveCode).toBeVisible();

  // 실시간 갱신(그릴링 결정) — 탭을 누르지 않아도 기본 활성 탭인
  // 미리보기가 방금 만든 코드 블록을 이미 반영한다.
  const previewCode = page.locator(
    '[aria-label="미리보기"] pre[data-geul-block-id] code',
  );
  await expect(previewCode).toBeVisible();
  expect((await previewCode.textContent())?.trim()).toBe('const a = "hello";');

  const highlightedSpans = previewCode.locator('span[class*="hljs-"]');
  await expect(highlightedSpans.first()).toBeVisible();
  await expect(previewCode.locator("span.hljs-keyword").first()).toHaveText(
    "const",
  );
});
