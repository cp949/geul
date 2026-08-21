import { expect, type Page, test } from "@playwright/test";

import { insertTable, openDemo } from "./support/demo.js";

// Tab/Shift+Tab은 ProseMirror selection만 옮기고 새 DOM 요소를 만들지 않는다
// — 타이핑을 곧바로 이어붙이면 headless 병렬 실행(예: --workers=5)에서
// 이동 반영 전에 키 입력이 도착하는 레이스가 관측된다(PIT-0009와 같은 종류의
// 헤드리스 타이밍 이슈). 다음 셀로 캐럿이 실제로 옮겨갔음을 selection에서
// 직접 폴링해 확인한 뒤에만 타이핑한다.
const waitForCaretInCell = async (page: Page, cellId: string) => {
  await page.waitForFunction((expectedCellId) => {
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    const element =
      anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    const cell = element?.closest("td");
    return cell?.getAttribute("data-be-cell-id") === expectedCellId;
  }, cellId);
};

test("Tab은 같은 행의 다음 셀로, 마지막 열에서는 다음 행의 첫 셀로 이동한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  // 표 오른쪽에는 열 추가 핸들이, 각 열 경계에는 리사이즈 strip이 fixed로
  // 떠 있다(spec 7.2). 중간에 다시 클릭해 셀로 들어가면 그 오버레이를 맞힐
  // 수 있으므로, 첫 셀만 클릭하고 이후로는 Tab만으로 셀을 옮겨 다닌다.
  const secondCellId = await cell(0, 1).getAttribute("data-be-cell-id");
  const thirdCellId = await cell(0, 2).getAttribute("data-be-cell-id");
  const nextRowFirstCellId = await cell(1, 0).getAttribute("data-be-cell-id");
  if (
    secondCellId === null ||
    thirdCellId === null ||
    nextRowFirstCellId === null
  ) {
    throw new Error("셀 fixture 준비 실패");
  }

  await cell(0, 0).click();
  await page.keyboard.press("Tab");
  await waitForCaretInCell(page, secondCellId);
  await page.keyboard.type("B");
  await expect(cell(0, 1)).toHaveText("B");

  await page.keyboard.press("Tab");
  await waitForCaretInCell(page, thirdCellId);
  await page.keyboard.type("C");
  await expect(cell(0, 2)).toHaveText("C");

  // 슬래시 메뉴 기본 표는 3열이다 — 마지막 열(0,2)에서 Tab을 누르면
  // 다음 행 첫 셀(1,0)로 넘어간다.
  await page.keyboard.press("Tab");
  await waitForCaretInCell(page, nextRowFirstCellId);
  await page.keyboard.type("D");
  await expect(cell(1, 0)).toHaveText("D");
});

test("Shift+Tab은 이전 셀로 캐럿을 옮긴다", async ({ page }) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  const firstCellId = await cell(0, 0).getAttribute("data-be-cell-id");
  if (firstCellId === null) throw new Error("셀 fixture 준비 실패");

  await cell(0, 1).click();
  await page.keyboard.type("B");
  await page.keyboard.press("Shift+Tab");
  await waitForCaretInCell(page, firstCellId);
  await page.keyboard.type("A");

  await expect(cell(0, 0)).toHaveText("A");
  await expect(cell(0, 1)).toHaveText("B");
});

test("표의 첫 셀에서 Shift+Tab은 표 밖으로 포커스를 넘기지 않는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("A");

  await expect(cell(0, 0)).toHaveText("A");
});

test("표의 마지막 셀에서 Tab은 새 행을 추가하고 undo 1회로 복원한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await expect(table.locator("tr")).toHaveCount(3);
  await cell(2, 2).click();

  await page.keyboard.press("Tab");
  await expect(table.locator("tr")).toHaveCount(4);
  await page.keyboard.type("새 행");
  await expect(cell(3, 0)).toHaveText("새 행");

  await page.keyboard.press("Control+z");
  await expect(table.locator("tr")).toHaveCount(3);
});
