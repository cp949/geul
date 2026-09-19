/**
 * showcase의 Emoji picker 예제(08-emoji-picker)를 검증한다. 루트 `e2e/`에는
 * emoji-picker 스펙이 없었다(demo 앱은 EmojiPicker를 마운트하지 않는다,
 * `apps/demo/src/app.tsx`는 SlashMenu만 얹는다) — showcase-mention.spec.ts와
 * 같은 "popup 1개당 파일 1개" 관례로 신규 파일을 추가한다(Issue #211
 * 01-계획.md "## 결정").
 */
import { expect, type Page, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

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
