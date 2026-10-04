/**
 * 접힌 toggle e2e가 공용으로 쓰는 헬퍼. 샘플 문서(`샘플 불러오기`)의 block-10은
 * 자식 block-11을 가진 토글이고 block-12는 그 뒤 제목이다.
 * `showcase-static-toolbar-collapsed-toggle-enter.spec.ts`(Issue #252)가 처음 썼고
 * `...-backspace.spec.ts`(Issue #253)가 같은 헬퍼를 필요로 해 여기로 승격했다
 * (G-TST-002).
 */
import { expect, type Locator, type Page } from "@playwright/test";

import { openShowcasePage } from "./showcase.js";
import { blockId, placeCaretIn } from "./static-toolbar-sample.js";

/** 샘플을 불러와 block-10을 접고 라벨을 클릭해 캐럿을 둔다. */
export const openCollapsedSample = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editable = page.getByRole("textbox", { name: "Editor" });
  const block = blockId(editable, 10);
  await block.locator("[data-geul-toggle-marker]").click();
  await expect(blockId(editable, 11)).toBeHidden();
  await placeCaretIn(page, block);
  return { editable, block };
};

/** toggle 라벨 줄(블록 컨테이너의 첫 자식)의 텍스트. 자식 블록 텍스트는 뺀다. */
export const labelText = (block: Locator) =>
  block.evaluate((element) => element.firstElementChild?.textContent ?? "");

/** block의 바로 뒤 형제 블록 컨테이너. */
export const nextSibling = (block: Locator) =>
  block.locator("xpath=following-sibling::*[1]");

/** block 안 숨은 그룹의 직속 자식 컨테이너. */
export const groupChildren = (block: Locator) =>
  block.locator(":scope > [data-geul-block-group] > *");
