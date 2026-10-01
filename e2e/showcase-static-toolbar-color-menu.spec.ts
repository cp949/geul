/**
 * StaticToolbar의 글자색·배경색 트리거와 menu를 실제 브라우저에서
 * 확인한다(Issue #224, spec §5, G-UI-001).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - 네이티브 입력의 기본 동작. Enter·Space가 포커스된 스와치의 click이
 *   되는지, Tab이 포커스를 어디로 옮기는지, 확정 뒤 포커스가 실제로
 *   편집기로 돌아오는지가 대상이다. jsdom은 키 입력을 요소에 라우팅하지
 *   않고 탭 순서도 계산하지 못한다.
 * - 색이 실제로 입혀졌는지는 블록 DOM의 `span` 스타일로 판정한다. DOM
 *   selection으로는 판정하지 않는다.
 * 트리거 속성, 열림 포커스, 이동이 색상 명령을 부르지 않는 계약은 단위
 * 테스트(static-toolbar-color-menu.test.tsx)가 소유한다.
 *
 * `@core`는 키보드로 연 메뉴의 이동과 Enter 확정 한 건에만 붙인다. 포커스
 * 이동과 기본 click 변환은 엔진 간 구현 차이가 있을 수 있다. 나머지는
 * Chromium 전용이다.
 */
import { expect, test, type Page } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";
import {
  editorSelectionText,
  placeCaretAtEnd,
  selectRange,
} from "./support/static-toolbar-selection.js";
import { yieldFrame } from "./support/yield-frame.js";

/** 3번 문단의 초기 텍스트. */
const BLOCK_TEXT = "문단 3. 아래로 스크롤해도 위 툴바는 그대로 보인다.";
/** `selectRange`가 잡는 3번 문단 앞 3글자. */
const RANGE_TEXT = BLOCK_TEXT.slice(0, 3);
/** 글자색 팔레트의 둘째 색(red, `#D93025`)이 계산된 값. */
const SECOND_TEXT_COLOR = "rgb(217, 48, 37)";
/** 배경색 팔레트의 첫째 색(gray, `#F1F3F4`)이 계산된 값. */
const FIRST_BACKGROUND_COLOR = "rgb(241, 243, 244)";

/** 예제를 열고 3번 문단, 툴바, 색상 트리거와 메뉴 locator를 돌려준다. */
const openExample = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const toolbar = page.getByRole("toolbar", { name: "Toolbar" });
  await expect(toolbar).toBeVisible();
  return {
    page,
    toolbar,
    editorInput: editable.locator('[contenteditable="true"]'),
    block: editable.locator('[data-geul-block-id$="block-3"]'),
    textTrigger: toolbar.getByRole("button", {
      name: "Text color",
      exact: true,
    }),
    backgroundTrigger: toolbar.getByRole("button", {
      name: "Background color",
      exact: true,
    }),
    textMenu: page.getByRole("menu", { name: "Text color", exact: true }),
    backgroundMenu: page.getByRole("menu", {
      name: "Background color",
      exact: true,
    }),
  };
};

test("색상 트리거는 aria-haspopup menu를 가지고 클릭으로 열고 닫으면 aria-expanded가 따라간다", async ({
  page,
}) => {
  const { block, textTrigger, backgroundTrigger, textMenu, backgroundMenu } =
    await openExample(page);
  await placeCaretAtEnd(page, block, BLOCK_TEXT);

  for (const [trigger, menu] of [
    [textTrigger, textMenu],
    [backgroundTrigger, backgroundMenu],
  ] as const) {
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await trigger.click();
    await expect(menu).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
});

test("Enter로 연 메뉴는 첫 스와치가 포커스를 받고 마우스로 연 메뉴는 편집기 포커스를 유지한다", async ({
  page,
}) => {
  const { block, editorInput, textTrigger, textMenu } = await openExample(page);
  await placeCaretAtEnd(page, block, BLOCK_TEXT);

  await textTrigger.click();
  await expect(textMenu).toBeVisible();
  await expect(editorInput).toBeFocused();
  await textTrigger.click();
  await expect(textMenu).toHaveCount(0);

  await textTrigger.focus();
  await page.keyboard.press("Enter");

  await expect(textMenu.getByRole("menuitem").first()).toBeFocused();
});

test("키보드로 연 글자색 메뉴에서 ArrowDown·End·Home은 이동만 하고 색을 입히지 않는다", async ({
  page,
}) => {
  const { block, editorInput, textTrigger, textMenu } = await openExample(page);
  await selectRange(page, block, editorInput, RANGE_TEXT);
  const items = textMenu.getByRole("menuitem");
  await textTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(items.first()).toBeFocused();
  await expect(items).toHaveCount(9);

  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();

  await expect(textMenu).toBeVisible();
  await expect(block.locator("span[style]")).toHaveCount(0);
});

test("범위 선택 뒤 Enter로 연 글자색 메뉴에서 ArrowRight와 Enter가 그 색을 입히고 편집기가 포커스를 받는다 @core", async ({
  page,
}) => {
  const { block, editorInput, textTrigger, textMenu } = await openExample(page);
  await selectRange(page, block, editorInput, RANGE_TEXT);
  const items = textMenu.getByRole("menuitem");
  await textTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(items.first()).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");

  const colored = block.locator("span[style]");
  await expect(colored).toHaveText(RANGE_TEXT);
  await expect(colored).toHaveCSS("color", SECOND_TEXT_COLOR);
  await expect(textMenu).toHaveCount(0);
  await expect(editorInput).toBeFocused();
});

test("배경색 메뉴에서 Space가 색을 입히고 색 없음 스와치의 Enter가 색을 해제한다", async ({
  page,
}) => {
  const { block, editorInput, backgroundTrigger, backgroundMenu } =
    await openExample(page);
  await selectRange(page, block, editorInput, RANGE_TEXT);
  const items = backgroundMenu.getByRole("menuitem");
  await backgroundTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(items.first()).toBeFocused();

  await page.keyboard.press("Space");

  const colored = block.locator("span[style]");
  await expect(colored).toHaveText(RANGE_TEXT);
  await expect(colored).toHaveCSS("background-color", FIRST_BACKGROUND_COLOR);
  await expect(backgroundMenu).toHaveCount(0);
  await expect(editorInput).toBeFocused();
  // 적용 뒤에도 선택 범위가 유지돼 같은 범위에 이어서 적용·해제할 수 있다.
  await expect.poll(() => editorSelectionText(editorInput)).toBe(RANGE_TEXT);

  await backgroundTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(block.locator("span[style]")).toHaveCount(0);
  await expect(backgroundMenu).toHaveCount(0);
  await expect(block).toHaveText(BLOCK_TEXT);
});

test("트리거에서 Enter를 길게 눌러도 반복이 첫 스와치를 확정하거나 선택 범위를 줄바꿈으로 바꾸지 않는다", async ({
  page,
}) => {
  const { block, editorInput, textTrigger, textMenu } = await openExample(page);
  await selectRange(page, block, editorInput, RANGE_TEXT);
  const items = textMenu.getByRole("menuitem");
  await textTrigger.focus();

  await page.keyboard.down("Enter");
  await expect(items.first()).toBeFocused();
  // 같은 키를 떼지 않고 다시 누르면 `repeat`이 true인 keydown이 간다.
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.down("Enter");
    await yieldFrame(page);
  }
  await page.keyboard.up("Enter");

  await expect(textMenu).toBeVisible();
  await expect(items.first()).toBeFocused();
  await expect(block).toHaveText(BLOCK_TEXT);
  await expect(block.locator("span[style]")).toHaveCount(0);
});

test("키보드로 연 메뉴에서 Tab은 메뉴를 닫고 그 트리거로 돌아가며 이어 Tab은 툴바 밖으로 간다", async ({
  page,
}) => {
  const { block, toolbar, textTrigger, textMenu } = await openExample(page);
  await placeCaretAtEnd(page, block, BLOCK_TEXT);
  await textTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(textMenu.getByRole("menuitem").first()).toBeFocused();

  await page.keyboard.press("Tab");

  await expect(textMenu).toHaveCount(0);
  await expect(textTrigger).toBeFocused();
  // 포커스가 간 컨트롤이 roving Tab 정지점이 된 뒤에 다음 Tab을 보낸다.
  await expect(textTrigger).toHaveAttribute("tabindex", "0");

  await page.keyboard.press("Tab");

  await expect(toolbar.locator(":focus")).toHaveCount(0);
  await expect(textMenu).toHaveCount(0);
});

test("Escape는 메뉴를 닫고 포커스를 편집기로 돌려준다", async ({ page }) => {
  const { block, editorInput, textTrigger, textMenu } = await openExample(page);
  await placeCaretAtEnd(page, block, BLOCK_TEXT);
  await textTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(textMenu.getByRole("menuitem").first()).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(textMenu).toHaveCount(0);
  await expect(editorInput).toBeFocused();
});

test("키보드로 연 글자색 메뉴가 열린 채 배경색 트리거를 마우스로 누르면 메뉴가 바뀌고 포커스가 편집기로 간다", async ({
  page,
}) => {
  const { block, editorInput, textTrigger, backgroundTrigger, backgroundMenu } =
    await openExample(page);
  await placeCaretAtEnd(page, block, BLOCK_TEXT);
  await textTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("menu", { name: "Text color", exact: true })
      .getByRole("menuitem")
      .first(),
  ).toBeFocused();

  await backgroundTrigger.click();

  await expect(backgroundMenu).toBeVisible();
  await expect(editorInput).toBeFocused();
});

test("키보드로 연 글자색 메뉴가 열린 채 Bold를 마우스로 누르면 메뉴가 닫히고 포커스가 편집기에 남는다", async ({
  page,
}) => {
  const { toolbar, block, editorInput, textTrigger, textMenu } =
    await openExample(page);
  await placeCaretAtEnd(page, block, BLOCK_TEXT);
  await textTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(textMenu.getByRole("menuitem").first()).toBeFocused();

  await toolbar.getByRole("button", { name: "Bold", exact: true }).click();

  await expect(textMenu).toHaveCount(0);
  await expect(editorInput).toBeFocused();
});
