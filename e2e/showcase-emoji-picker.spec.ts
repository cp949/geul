/**
 * showcase의 Emoji picker 예제(08-emoji-picker)를 검증한다. 루트 `e2e/`에는
 * emoji-picker 스펙이 없었다(demo 앱은 EmojiPicker를 마운트하지 않는다,
 * `apps/demo/src/app.tsx`는 SlashMenu만 얹는다) — showcase-mention.spec.ts와
 * 같은 "popup 1개당 파일 1개" 관례로 신규 파일을 추가한다(Issue #211
 * 01-계획.md "## 결정").
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  lastKeydownPrevented,
  recordKeydownPrevented,
} from "./support/keydown-prevented.js";
import { openShowcasePage } from "./support/showcase.js";
import { yieldFrame } from "./support/yield-frame.js";

/**
 * `openMentionExample`(`showcase-mention.spec.ts`)과 동일 이유로 분리 —
 * 접근성 이름으로 잡은 `Editor` textbox는 wrapper고 실제 contenteditable은
 * 그 안의 `[contenteditable="true"]`다.
 */
const openEmojiPickerExample = async (page: Page) => {
  await openShowcasePage(page, "/examples/emoji-picker");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  const menu = page.getByRole("listbox", { name: "Emoji picker" });
  return { editable, menu };
};

// Issue #211: 후보 0건 상태에서 Enter를 누르면 EmojiPicker의 keydown
// 핸들러가 event.preventDefault()를 호출하지 않아 ProseMirror 기본
// Enter(블록 분할)로 폴스루했다. 팝업은 열린 채 유지되고 블록은 분할되지
// 않아야 한다.
test("후보가 없을 때 Enter를 눌러도 블록이 분할되지 않는다 (Issue #211)", async ({
  page,
}) => {
  const { editable, menu } = await openEmojiPickerExample(page);

  await editable.click();
  await page.keyboard.type(":zzzznomatch");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option")).toHaveCount(0);

  await page.keyboard.press("Enter");

  await expect(menu).toBeVisible();
  await expect(editable.locator("p")).toHaveCount(1);
  await expect(editable.locator("p")).toHaveText(":zzzznomatch");
});

/** 강조된(`aria-selected="true"`) 옵션의 label을 읽는다. */
const highlightedLabel = (menu: Locator) =>
  menu
    .locator('[role="option"][aria-selected="true"]')
    .getAttribute("aria-label");

// Issue #227: Alt+ArrowDown은 브라우저·OS 단축키 조합이다. 열린 메뉴는
// preventDefault로 삼키거나 하이라이트를 옮기지 않는다.
test("수식 키 + 방향키는 하이라이트를 옮기지 않고 기본 동작을 막지 않는다 (Issue #227)", async ({
  page,
}) => {
  const { editable, menu } = await openEmojiPickerExample(page);

  await editable.click();
  await yieldFrame(page);
  await page.keyboard.type(":");
  await expect(menu).toBeVisible();
  // 수식 키 없는 ArrowDown으로 강조를 첫 줄 밖으로 옮겨 기준값을 만든다.
  await page.keyboard.press("ArrowDown");
  const before = await highlightedLabel(menu);
  expect(before).not.toBeNull();
  const firstLabel = await menu
    .getByRole("option")
    .first()
    .getAttribute("aria-label");
  expect(before).not.toBe(firstLabel);
  await recordKeydownPrevented(page);

  await page.keyboard.press("Alt+ArrowDown");

  expect(await lastKeydownPrevented(page)).toEqual({
    key: "ArrowDown",
    prevented: false,
  });
  expect(await highlightedLabel(menu)).toBe(before);
  await expect(menu).toBeVisible();
});
