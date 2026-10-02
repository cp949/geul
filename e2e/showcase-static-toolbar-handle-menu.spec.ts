/**
 * showcase static-toolbar 예제에서 블록 핸들 메뉴(BlockSideMenu)의 닫힘과
 * 초점을 실제 Chromium에서 확인한다(Issue #233, RD-002 DELTA-01).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - 툴바 버튼의 mousedown은 preventDefault라 클릭 대상이 초점을 받지 않는다.
 *   메뉴 항목에 초점이 남은 채 언마운트되면 브라우저가 초점을 BODY로
 *   떨어뜨린다. jsdom은 이 초점 낙하를 재현하지 않는다.
 * - 핸들 Enter는 keydown 뒤 네이티브 click으로 이어진다. 이 순서와 초점
 *   이동은 실제 키 입력으로만 확인된다.
 * 단위 규칙(reason별 초점, 삭제 시 닫힘)은 block-side-menu.test.tsx가 소유한다.
 *
 * G-TST-001: 바깥 클릭·Escape로 닫는 UI는 `--workers` 병렬로도 반복한다.
 * `fullyParallel: false`라 `--fully-parallel`을 함께 준다.
 */
import { expect, test, type Page } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";
import { yieldFrame } from "./support/yield-frame.js";

/**
 * 예제를 열고 3번째 블록을 hover해 핸들을 띄운다.
 * 핸들 거터는 hover 중인 블록에만 뜨므로 메뉴를 열기 전에 hover가 필요하다.
 */
const openWithHandle = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const block = editable.locator('[data-geul-block-id$="block-3"]');
  await block.click();
  await page.keyboard.press("End");
  // ProseMirror는 클릭한 selection을 selectionchange 뒤 비동기로 반영한다.
  await yieldFrame(page);
  await block.hover();
  const handle = page.getByRole("button", {
    name: "Drag to reorder, click for options",
  });
  await expect(handle).toBeVisible();
  return {
    handle,
    menu: page.getByRole("menu", { name: "Block menu" }),
    editorInput: editable.locator('[contenteditable="true"]'),
    boldButton: page
      .getByRole("toolbar", { name: "Toolbar" })
      .getByRole("button", { name: "Bold", exact: true }),
  };
};

test("핸들 메뉴 항목에 초점이 있을 때 툴바 Bold를 누르면 메뉴가 닫히고 초점이 편집기에 남는다", async ({
  page,
}) => {
  const { handle, menu, editorInput, boldButton } = await openWithHandle(page);

  await handle.click();
  await expect(menu).toBeVisible();
  // 마우스 클릭으로 연 메뉴는 항목에 초점이 없다. 키보드로 항목에 초점을 둔
  // 상태를 직접 만든다.
  await menu.getByRole("menuitem", { name: "Heading 1" }).focus();
  await expect(menu.getByRole("menuitem", { name: "Heading 1" })).toBeFocused();

  await boldButton.click();

  await expect(menu).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .not.toBe("BODY");
  await expect(editorInput).toBeFocused();
});

test("핸들에서 Enter로 연 메뉴는 첫 항목에 초점을 두고 Escape는 편집기로 초점을 돌린다", async ({
  page,
}) => {
  const { handle, menu, editorInput } = await openWithHandle(page);

  await handle.focus();
  await page.keyboard.press("Enter");

  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem").first()).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(menu).toHaveCount(0);
  await expect(editorInput).toBeFocused();
});

test("마우스로 연 핸들 메뉴는 초점이 편집기에 있어도 Escape로 닫히고 초점이 편집기에 남는다", async ({
  page,
}) => {
  // ProseMirror는 편집기 안의 Escape를 preventDefault한다. 마우스로 연 메뉴는
  // 초점이 편집기에 남으므로 이 Escape가 module까지 닿아야 닫힌다.
  const { handle, menu, editorInput } = await openWithHandle(page);

  await handle.click();
  await expect(menu).toBeVisible();
  await expect(editorInput).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(menu).toHaveCount(0);
  await expect(editorInput).toBeFocused();
});
