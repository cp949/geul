/**
 * 여러 블록 선택이 접힌 toggle을 걸칠 때 숨은 자손이 블록 타입 변환과 mark
 * 버튼 판정에 들어가지 않는지 실제 브라우저에서 확인한다(Issue #264).
 * 숨은 자손이 끼면 화면에 없는 블록까지 heading으로 바뀌고, 숨은 codeBlock
 * 하나 때문에 mark 버튼이 꺼지거나 사라진다.
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - `Shift+클릭`이 접힌 toggle을 사이에 둔 실제 다중 블록 selection을
 *   만드는지는 jsdom이 볼 수 없다. jsdom은 클릭으로 selection을 확장하지 않는다.
 * - StaticToolbar·FormattingToolbar가 한 selection에서 같은 판정을 쓰는지는
 *   두 툴바를 함께 띄운 실제 예제에서만 보인다.
 * 수집·판정 규칙의 세부 계약은 단위 테스트
 * (collapsed-toggle-multi-block-selection.test.ts)가 소유한다.
 *
 * 샘플 문서(`샘플 불러오기`)를 쓴다. block-9는 체크 항목, block-10은 자식
 * block-11을 가진 토글, block-12는 그 뒤 제목("코드")이다.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";
import { openCollapsedSample } from "./support/static-toolbar-collapsed-toggle.js";
import { editorSelectionText } from "./support/static-toolbar-selection.js";
import { blockId, placeCaretIn } from "./support/static-toolbar-sample.js";
import { yieldFrame } from "./support/yield-frame.js";

const BLOCK_9_TEXT = "체크된 항목";
const BLOCK_12_TEXT = "코드";

/**
 * 샘플을 불러와 block-11을 툴바 Code 버튼으로 codeBlock으로 바꾼다. 그 뒤
 * block-10을 접고 block-11이 숨을 때까지 기다린다. 숨은 블록은 클릭할 수
 * 없어 접기 전에 바꾼다.
 */
const openSampleWithHiddenCode = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editable = page.getByRole("textbox", { name: "Editor" });
  await placeCaretIn(page, blockId(editable, 11));
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(
    blockId(editable, 11).locator("pre[data-geul-code-block]"),
  ).toBeVisible();
  await blockId(editable, 10).locator("[data-geul-toggle-marker]").click();
  await expect(blockId(editable, 11)).toBeHidden();
  return { editable };
};

/**
 * block-9 텍스트 시작부터 block-12 텍스트 끝까지 선택한다. block-9 클릭 뒤
 * Home, block-12 Shift+클릭 뒤 Shift+End로 넓힌다. DOM selection이 두 블록
 * 텍스트를 모두 담을 때까지 다시 시도한다. 클릭 직후 키가 이전 selection에
 * 적용되는 경합을 피한다(G-EDT-002).
 */
const selectBlock9To12 = async (page: Page, editable: Locator) => {
  await expect(async () => {
    await placeCaretIn(page, blockId(editable, 9));
    await page.keyboard.press("Home");
    await yieldFrame(page);
    await blockId(editable, 12).click({ modifiers: ["Shift"] });
    await yieldFrame(page);
    await page.keyboard.press("Shift+End");
    await yieldFrame(page);
    const text = (await editorSelectionText(editable)) ?? "";
    expect(text.startsWith(BLOCK_9_TEXT)).toBe(true);
    expect(text.endsWith(BLOCK_12_TEXT)).toBe(true);
  }).toPass();
};

/** StaticToolbar(이름 "Toolbar") 안 Bold 버튼. */
const staticBold = (page: Page) =>
  page
    .getByRole("toolbar", { name: "Toolbar" })
    .getByRole("button", { name: "Bold", exact: true });

/** FormattingToolbar(이름 "Formatting") 안 Bold 버튼. */
const floatingBold = (page: Page) =>
  page
    .getByRole("toolbar", { name: "Formatting" })
    .getByRole("button", { name: "Bold", exact: true });

test("접힌 toggle을 걸친 선택을 Heading 1로 바꾸면 보이는 블록만 바뀌고 숨은 자식은 문단으로 남는다", async ({
  page,
}) => {
  const { editable } = await openCollapsedSample(page);
  await selectBlock9To12(page, editable);

  await page.getByRole("button", { name: "Block type" }).click();
  await page
    .getByRole("listbox")
    .getByRole("option", { name: "Heading 1" })
    .click();
  await yieldFrame(page);

  for (const number of [9, 10, 12]) {
    await expect(
      blockId(editable, number).locator(":scope > h1"),
      `block-${number}`,
    ).toHaveCount(1);
  }
  // 접힌 toggle이 heading이 되면 자식이 드러난다. 자식은 문단 그대로다.
  const child = blockId(editable, 11);
  await expect(child).toBeVisible();
  await expect(child.locator(":scope > p")).toHaveCount(1);
  await expect(child.locator("h1")).toHaveCount(0);
});

test("숨은 codeBlock을 걸친 선택에서 두 툴바 Bold가 활성이고 누르면 보이는 텍스트가 bold가 되며 눌림 상태가 따라간다", async ({
  page,
}) => {
  const { editable } = await openSampleWithHiddenCode(page);
  await selectBlock9To12(page, editable);

  await expect(staticBold(page)).toHaveAttribute("aria-disabled", "false");
  await expect(floatingBold(page)).toBeVisible();

  await staticBold(page).click();
  await yieldFrame(page);

  await expect(blockId(editable, 9).locator("strong")).toHaveText(BLOCK_9_TEXT);
  await expect(blockId(editable, 12).locator("strong")).toHaveText(
    BLOCK_12_TEXT,
  );
  // 접힌 toggle 라벨도 보이는 텍스트라 bold다.
  await expect(
    blockId(editable, 10).locator(":scope > :first-child strong"),
  ).toHaveCount(1);
  // 두 툴바의 눌림 상태가 명령 결과와 같다. 다시 누르면 bold가 풀린다.
  await expect(staticBold(page)).toHaveAttribute("aria-pressed", "true");
  await expect(floatingBold(page)).toHaveAttribute("aria-pressed", "true");
  await staticBold(page).click();
  await yieldFrame(page);
  await expect(blockId(editable, 9).locator("strong")).toHaveCount(0);
  await expect(blockId(editable, 12).locator("strong")).toHaveCount(0);
  await expect(staticBold(page)).toHaveAttribute("aria-pressed", "false");
  await expect(floatingBold(page)).toHaveAttribute("aria-pressed", "false");
});

test("숨은 codeBlock을 걸친 선택에서 Control+b가 보이는 텍스트에 bold를 적용한다", async ({
  page,
}) => {
  const { editable } = await openSampleWithHiddenCode(page);
  await selectBlock9To12(page, editable);

  await page.keyboard.press("Control+b");
  await yieldFrame(page);

  await expect(blockId(editable, 9).locator("strong")).toHaveText(BLOCK_9_TEXT);
  await expect(blockId(editable, 12).locator("strong")).toHaveText(
    BLOCK_12_TEXT,
  );
  await expect(
    blockId(editable, 10).locator(":scope > :first-child strong"),
  ).toHaveCount(1);
});
