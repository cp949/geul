/**
 * 툴바 컨트롤에 포커스가 있을 때 undo·redo해도 포커스가 `BODY`로 유실되지
 * 않는지 실제 Chromium에서 확인한다(Issue #221, G-EDT-004, G-TST-001).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - 에디터가 포커스를 갖지 않으면 ProseMirror가 history가 복원한 selection을
 *   DOM에 반영하지 않는다. 그 뒤 문서 DOM이 바뀌면 DOM selection이 접힌다.
 * - 툴바가 닫히거나 버튼이 교체되는 시점(`selectionchange`, `keyup`)과
 *   Chromium이 편집 영역 안 selection 변경 때 포커스를 옮기는 동작은 jsdom이
 *   재현하지 못한다.
 * - 재동기화 조건·포커스 복구 조건·정리는 단위 테스트
 *   (history-focus-sync-extension.test.ts)가 소유한다.
 *
 * 단언 계약:
 * - 범위 selection을 복원하는 history(서식 적용, 링크 되살리기)는 텍스트
 *   선택 기반 툴바를 연 채 버튼 포커스를 유지한다.
 * - selection이 caret이나 `TextSelection`으로 복원돼 툴바가 정당하게 닫히면
 *   포커스는 에디터로 간다. 에디터 포커스에서 undo·redo한 결과와 같다.
 * - `NodeSelection`·`CellSelection`을 복원하는 history와 BlockSelection·
 *   StaticToolbar는 이미 버튼 포커스를 유지한다. 회귀를 막는다.
 * - 어느 경우든 최종 `document.activeElement`가 `BODY`가 아니다.
 *
 * 툴바 닫힘은 `role="toolbar"` 컨테이너 부재로 단언한다. Chromium 전용이다.
 * 다른 엔진은 이 증상을 검증하지 않아 `@core`를 붙이지 않는다.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { domBlockIds } from "./support/block-order.js";
import {
  blockSelectionToolbar,
  moveSelectionDownButton,
} from "./support/block-selection-toolbar.js";
import { insertFilledImage, insertTable, openDemo } from "./support/demo.js";
import { openShowcasePage } from "./support/showcase.js";
import { dragSelectCells } from "./support/table-selection.js";

/** 이 파일이 보내는 undo·redo 키 조합. */
type HistoryKey = "Control+z" | "Control+Shift+z" | "Control+y";

/**
 * history는 `newGroupDelay`(500ms) 안의 인접 입력을 한 이벤트로 합친다.
 * 직전 조작과 입력을 다른 history 이벤트로 가르려고 이만큼 기다린다.
 */
const HISTORY_GROUP_DELAY_MS = 600;

/**
 * 두 프레임과 짧은 타이머를 양보한다. 툴바 unmount는 `selectionchange`
 * (dispatch 뒤 6–8ms)나 `keyup`에서 일어난다. 이 대기 없이 포커스를 읽으면
 * unmount 전 값을 읽어 유실을 놓친다.
 */
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(resolve, 50)),
        ),
      ),
  );

/** 현재 포커스가 `BODY`(또는 없음)가 아님을 단언한다. */
const expectFocusNotLost = async (page: Page) => {
  const active = await page.evaluate(
    () => document.activeElement?.tagName ?? null,
  );
  expect(active).not.toBeNull();
  expect(active).not.toBe("BODY");
};

/**
 * undo·redo 키를 누르고 이벤트 순서가 끝날 때까지 기다린 뒤 포커스가
 * 유실되지 않았음을 단언한다.
 */
const pressHistory = async (page: Page, key: HistoryKey) => {
  await page.keyboard.press(key);
  await settle(page);
  await expectFocusNotLost(page);
};

/** 컨트롤에 포커스를 두고 실제로 받았는지 확인한다. */
const focusControl = async (control: Locator) => {
  await control.focus();
  await expect(control).toBeFocused();
};

const formattingToolbar = (page: Page) =>
  page.getByRole("toolbar", { name: "Formatting" });
const linkToolbar = (page: Page) => page.getByRole("toolbar", { name: "Link" });
const tableToolbar = (page: Page) =>
  page.getByRole("toolbar", { name: "Table selection" });
const mediaToolbar = (page: Page) =>
  page.getByRole("toolbar", { name: "Media toolbar" });

test("Formatting: 서식 적용의 undo·redo가 Bold 포커스와 툴바를 유지한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello World");
  await page.keyboard.press("Shift+Home");
  const bold = page.getByRole("button", { name: "Bold" });
  await expect(bold).toBeVisible();
  await bold.click();
  await expect(editable.locator("strong")).toHaveCount(1);
  await focusControl(bold);

  // undo(Control+z) → redo(Control+Shift+z) → undo → redo(Control+y)
  const steps: readonly [HistoryKey, number][] = [
    ["Control+z", 0],
    ["Control+Shift+z", 1],
    ["Control+z", 0],
    ["Control+y", 1],
  ];
  for (const [key, strongCount] of steps) {
    await pressHistory(page, key);

    await expect(editable.locator("strong")).toHaveCount(strongCount);
    await expect(formattingToolbar(page)).toBeVisible();
    await expect(bold).toBeFocused();
  }
});

test("Formatting: undo 뒤 에디터 밖을 클릭하면 에디터가 포커스를 되가져오지 않는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello World");
  await page.keyboard.press("Shift+Home");
  const bold = page.getByRole("button", { name: "Bold" });
  await bold.click();
  await expect(editable.locator("strong")).toHaveCount(1);
  await focusControl(bold);
  await pressHistory(page, "Control+z");
  await expect(bold).toBeFocused();

  // 비포커스 영역 클릭은 포커스를 BODY로 옮기고 툴바를 닫는다. undo 없이
  // 같은 클릭을 한 결과와 같아야 한다(G-UI-001).
  await page.mouse.click(5, 5);
  await settle(page);

  await expect(formattingToolbar(page)).toHaveCount(0);
  await expect(editable).not.toBeFocused();
});

test("Formatting: 입력의 redo는 caret을 복원해 툴바가 닫히고 에디터가 포커스를 받는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const paragraph = editable.locator("p").first();
  await editable.click();
  await page.keyboard.type("Hello");
  await page.waitForTimeout(HISTORY_GROUP_DELAY_MS);
  await page.keyboard.type("ABC");
  await expect(paragraph).toHaveText("HelloABC");
  await page.keyboard.press("Control+z");
  await expect(paragraph).toHaveText("Hello");
  // undo 뒤 selection이 접히면 툴바가 사라지므로, undo를 에디터 포커스에서
  // 먼저 하고 그 뒤에 범위를 만든다.
  await page.keyboard.press("Shift+Home");
  const bold = page.getByRole("button", { name: "Bold" });
  await expect(bold).toBeVisible();
  await focusControl(bold);

  await pressHistory(page, "Control+Shift+z");

  await expect(paragraph).toHaveText("HelloABC");
  await expect(formattingToolbar(page)).toHaveCount(0);
  await expect(editable).toBeFocused();
});

test("Link: 링크를 되살리는 redo가 Bold 포커스와 툴바를 유지한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Shift+Home");
  await page.getByRole("button", { name: "Add link" }).click();
  await page
    .getByRole("textbox", { name: "Link URL" })
    .pressSequentially("https://example.com");
  await page.getByRole("button", { name: "Save link" }).click();
  await expect(editable.locator("a")).toHaveCount(1);
  // 링크가 있는 텍스트를 다시 범위로 선택해 Edit link가 있는 툴바를 연다.
  await editable.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
  const editLink = page.getByRole("button", { name: "Edit link" });
  await expect(editLink).toBeVisible();
  await focusControl(editLink);

  // 링크를 지우는 undo는 caret이 아니라 범위를 복원한다. 포커스된 Edit link가
  // Add link로 교체돼 unmount되므로 에디터가 포커스를 받는다.
  await pressHistory(page, "Control+z");

  await expect(editable.locator("a")).toHaveCount(0);
  await expect(formattingToolbar(page)).toBeVisible();
  await expect(linkToolbar(page)).toBeVisible();
  await expect(editable).toBeFocused();

  const bold = page.getByRole("button", { name: "Bold" });
  await focusControl(bold);

  await pressHistory(page, "Control+Shift+z");

  await expect(editable.locator("a")).toHaveCount(1);
  await expect(formattingToolbar(page)).toBeVisible();
  await expect(bold).toBeFocused();
});

/** 슬래시 메뉴로 표를 만들고 셀 조회 함수를 준다. */
const openDemoWithTable = async (page: Page) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  /** 행·열 좌표로 실제 표 셀을 조회한다. */
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);
  return { editable, cell };
};

test("Table: 셀 서식(배경색)의 undo·redo가 Cell formatting 포커스와 툴바를 유지한다", async ({
  page,
}) => {
  const { cell } = await openDemoWithTable(page);
  await cell(0, 0).click();
  await dragSelectCells(page, cell(0, 0), cell(0, 1));
  const format = page.getByRole("button", { name: "Cell formatting" });
  await format.click();
  await page.getByRole("menuitem", { name: "Background color Yellow" }).click();
  await expect(cell(0, 0)).toHaveCSS("background-color", "rgb(254, 247, 224)");
  await focusControl(format);

  await pressHistory(page, "Control+z");

  await expect(cell(0, 0)).not.toHaveCSS(
    "background-color",
    "rgb(254, 247, 224)",
  );
  await expect(tableToolbar(page)).toBeVisible();
  await expect(format).toBeFocused();

  await pressHistory(page, "Control+Shift+z");

  await expect(cell(0, 0)).toHaveCSS("background-color", "rgb(254, 247, 224)");
  await expect(tableToolbar(page)).toBeVisible();
  await expect(format).toBeFocused();
});

test("Table: 셀 입력의 undo는 caret을 복원해 툴바가 닫히고 에디터가 포커스를 받는다", async ({
  page,
}) => {
  const { editable, cell } = await openDemoWithTable(page);
  // 표 삽입과 입력을 다른 history 이벤트로 가른다.
  await page.waitForTimeout(HISTORY_GROUP_DELAY_MS);
  await cell(0, 0).click();
  await page.keyboard.type("x");
  await expect(cell(0, 0)).toHaveText("x");
  await page.waitForTimeout(HISTORY_GROUP_DELAY_MS);
  await dragSelectCells(page, cell(0, 0), cell(0, 1));
  const format = page.getByRole("button", { name: "Cell formatting" });
  await expect(format).toBeVisible();
  await focusControl(format);

  await pressHistory(page, "Control+z");

  await expect(cell(0, 0)).toHaveText("");
  await expect(tableToolbar(page)).toHaveCount(0);
  await expect(editable).toBeFocused();
});

/**
 * 표를 만들고 (0,0)–(1,1)을 병합한 뒤 툴바에 `Split cell`이 뜬 상태로 둔다.
 * 병합 뒤 selection은 `TextSelection`이다.
 */
const openMergedTable = async (page: Page) => {
  const { editable, cell } = await openDemoWithTable(page);
  await cell(0, 0).click();
  await dragSelectCells(page, cell(0, 0), cell(1, 1));
  await page.getByRole("button", { name: "Merge cells" }).click();
  await expect(cell(0, 0)).toHaveAttribute("colspan", "2");
  const split = page.getByRole("button", { name: "Split cell" });
  await expect(split).toBeVisible();
  return { editable, cell, split };
};

test("Table: 병합의 undo는 Split cell이 Merge cells로 바뀌어도 에디터가 포커스를 받는다", async ({
  page,
}) => {
  const { editable, cell, split } = await openMergedTable(page);
  await focusControl(split);

  await pressHistory(page, "Control+z");

  await expect(cell(0, 0)).not.toHaveAttribute("colspan", "2");
  await expect(tableToolbar(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Merge cells" })).toBeVisible();
  await expect(editable).toBeFocused();
});

test("Table: 병합의 undo에서 키를 누른 채 두면 Split cell이 포커스를 유지하고 keyup 뒤 에디터가 받는다", async ({
  page,
}) => {
  const { editable, cell, split } = await openMergedTable(page);
  await focusControl(split);

  await page.keyboard.down("Control");
  await page.keyboard.down("z");
  await settle(page);
  // keyup 전에는 포커스된 버튼이 아직 unmount되지 않았다.
  await expect(cell(0, 0)).not.toHaveAttribute("colspan", "2");
  await expect(split).toBeFocused();
  await page.keyboard.up("z");
  await page.keyboard.up("Control");
  await settle(page);

  await expectFocusNotLost(page);
  await expect(tableToolbar(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Merge cells" })).toBeVisible();
  await expect(editable).toBeFocused();
});

test("Media: 정렬 적용의 undo·redo가 More media options 포커스와 툴바를 유지한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);
  const more = page.getByRole("button", { name: "More media options" });
  await more.click();
  const center = page.getByRole("menuitemcheckbox", { name: "Align center" });
  await center.click();
  await expect(center).toHaveAttribute("aria-checked", "true");
  await focusControl(more);

  await pressHistory(page, "Control+z");

  await expect(mediaToolbar(page)).toBeVisible();
  await expect(more).toBeFocused();

  await pressHistory(page, "Control+Shift+z");

  await expect(mediaToolbar(page)).toBeVisible();
  await expect(more).toBeFocused();
});

test("Media: 문단 입력의 redo는 NodeSelection이 풀려 툴바가 닫히고 에디터가 포커스를 받는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);
  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("img") });
  // 이미지 삽입과 입력을 다른 history 이벤트로 가른다.
  await page.waitForTimeout(HISTORY_GROUP_DELAY_MS);
  const lastParagraph = editable.locator("p").last();
  await lastParagraph.click();
  await page.keyboard.type("xyz");
  await expect(lastParagraph).toHaveText("xyz");
  await page.waitForTimeout(HISTORY_GROUP_DELAY_MS);
  await page.keyboard.press("Control+z");
  await expect(lastParagraph).toHaveText("");
  await wrapper.click();
  const more = page.getByRole("button", { name: "More media options" });
  await expect(more).toBeVisible();
  await focusControl(more);

  await pressHistory(page, "Control+Shift+z");

  await expect(lastParagraph).toHaveText("xyz");
  await expect(mediaToolbar(page)).toHaveCount(0);
  await expect(editable).toBeFocused();
});

/** BlockSelection 시나리오가 싣는 문단 id. */
const BLOCK_IDS = ["b1", "b2", "b3", "b4", "b5"];

/**
 * 문단 5개 문서를 "Document source"로 싣고 b1을 b3 범위로 드래그 선택해
 * BlockSelectionToolbar를 연다.
 */
const selectBlockRange = async (page: Page) => {
  const { editable } = await openDemo(page);
  const document = {
    formatVersion: 1,
    revision: 0,
    blocks: BLOCK_IDS.map((id) => ({
      id,
      type: "paragraph",
      content: [{ text: `block ${id}` }],
    })),
  };
  await page.getByLabel("Document source").fill(JSON.stringify(document));
  await page.getByRole("button", { name: "Load JSON" }).click();
  await expect(editable.locator("p")).toHaveCount(BLOCK_IDS.length);
  // 핸들 드래그는 편집기에 초점을 주지 않는다. 먼저 클릭해 둔다.
  await editable.locator('[data-geul-block-id="b1"] > p').click();
  await page.locator('[data-geul-block-id="b1"] > p').hover();
  const handle = page.getByRole("button", { name: "Drag to reorder" });
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  const targetBox = await page
    .locator('[data-geul-block-id="b3"] > p')
    .boundingBox();
  if (handleBox === null || targetBox === null) {
    throw new Error("Bounding boxes were not available");
  }
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(blockSelectionToolbar(page)).toBeVisible();
  return { editable };
};

test("BlockSelection: 이동의 undo·redo가 버튼 포커스와 툴바를 유지한다", async ({
  page,
}) => {
  const { editable } = await selectBlockRange(page);
  const down = moveSelectionDownButton(page);
  await down.click();
  await expect
    .poll(() => domBlockIds(editable))
    .toEqual(["b4", ...BLOCK_IDS.filter((id) => id !== "b4")]);
  await focusControl(down);

  await pressHistory(page, "Control+z");

  await expect.poll(() => domBlockIds(editable)).toEqual(BLOCK_IDS);
  await expect(blockSelectionToolbar(page)).toBeVisible();
  await expect(down).toBeFocused();

  await pressHistory(page, "Control+Shift+z");

  await expect(blockSelectionToolbar(page)).toBeVisible();
  await expect(down).toBeFocused();
});

test("StaticToolbar: 입력의 undo·redo가 Bold 포커스를 유지한다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const paragraph = page
    .getByRole("textbox", { name: "Editor" })
    .locator("p")
    .first();
  await paragraph.click();
  await expect(
    page.getByRole("button", { name: "Block type" }),
  ).toHaveAttribute("aria-disabled", "false");
  await page.keyboard.press("End");
  await settle(page);
  await page.keyboard.type("ABC");
  await expect(paragraph).toContainText("ABC");
  const bold = page.getByRole("button", { name: "Bold" });
  await focusControl(bold);

  await pressHistory(page, "Control+z");

  await expect(paragraph).not.toContainText("ABC");
  await expect(bold).toBeFocused();

  await pressHistory(page, "Control+Shift+z");

  await expect(paragraph).toContainText("ABC");
  await expect(bold).toBeFocused();
});
