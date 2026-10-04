/**
 * showcase `/examples/static-toolbar`의 샘플 문서를 쓰는 e2e 공용 헬퍼.
 * `showcase-static-toolbar-block-type-blockers.spec.ts`(Issue #245)가 처음
 * 썼고 `showcase-static-toolbar-collapsed-toggle-caret.spec.ts`(Issue #246)가
 * 같은 두 헬퍼를 두 번째로 필요로 해 여기로 승격했다(G-TST-002).
 */
import { expect, type Locator, type Page } from "@playwright/test";

import { yieldFrame } from "./yield-frame.js";

/** 샘플 문서의 `number`번째 블록 컨테이너. */
export const blockId = (editable: Locator, number: number) =>
  editable.locator(`[data-geul-block-id$="sample-block-${number}"]`);

/** 블록의 텍스트 줄을 클릭해 캐럿을 두고 툴바 상태가 따라올 때까지 기다린다. */
export const placeCaretIn = async (page: Page, target: Locator) => {
  await target.click();
  await yieldFrame(page);
  await expect(
    page.getByRole("button", { name: "Block type" }),
  ).toHaveAttribute("aria-disabled", "false");
};
