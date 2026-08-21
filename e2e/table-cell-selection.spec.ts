import { expect, type Locator, type Page, test } from "@playwright/test";

import { insertTable, openDemo } from "./support/demo.js";

const dragSelectCells = async (
  page: Page,
  fromCell: Locator,
  toCell: Locator,
) => {
  const fromBox = await fromCell.boundingBox();
  const toBox = await toCell.boundingBox();
  if (fromBox === null || toBox === null) {
    throw new Error("Bounding boxes were not available");
  }
  await page.mouse.move(
    fromBox.x + fromBox.width / 2,
    fromBox.y + fromBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
};

test("셀 범위를 드래그 선택해 병합하고 undo 1회로 복원한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  // 드래그를 시작하기 전 클릭으로 먼저 포커스를 표 안에 둔다 — 포커스
  // 전환과 드래그 시작 mousedown을 같은 제스처로 묶으면 tableEditing이
  // CellSelection 추적을 시작하지 않는 경우가 있다(브라우저 첫 포커스
  // mousedown의 알려진 동작 차이).
  await cell(0, 0).click();
  await dragSelectCells(page, cell(0, 0), cell(1, 1));

  const mergeButton = page.getByRole("button", { name: "Merge cells" });
  await expect(mergeButton).toBeVisible();
  await mergeButton.click();

  await expect(cell(0, 0)).toHaveAttribute("colspan", "2");
  await expect(cell(0, 0)).toHaveAttribute("rowspan", "2");
  await expect(table.locator("tr").nth(0).locator("td")).toHaveCount(2);
  await expect(table.locator("tr").nth(1).locator("td")).toHaveCount(1);

  await page.keyboard.press("Control+z");

  await expect(table.locator("tr").nth(0).locator("td")).toHaveCount(3);
  await expect(table.locator("tr").nth(1).locator("td")).toHaveCount(3);
  await expect(cell(0, 0)).not.toHaveAttribute("colspan");
});

test("병합 직후 분할 툴바가 뜨고 분할하면 undo 1회로 병합 상태가 복원된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  await dragSelectCells(page, cell(0, 0), cell(1, 1));
  const mergeButton = page.getByRole("button", { name: "Merge cells" });
  await expect(mergeButton).toBeVisible();
  await mergeButton.click();

  // 병합 명령은 결과 셀 안으로 캐럿을 명시적으로 옮긴다(duplicateBlock과
  // 같은 원칙 — replaceWith가 표 서브트리 전체를 바꾸므로 옛 selection을
  // 그대로 매핑하면 예측할 수 없는 위치로 떨어진다). 그래서 추가 클릭
  // 없이도 분할 툴바가 곧바로 뜬다.
  const splitButton = page.getByRole("button", { name: "Split cell" });
  await expect(splitButton).toBeVisible();
  await splitButton.click();

  await expect(table.locator("tr").nth(0).locator("td")).toHaveCount(3);
  await expect(table.locator("tr").nth(1).locator("td")).toHaveCount(3);
  await expect(cell(0, 0)).not.toHaveAttribute("colspan");

  await page.keyboard.press("Control+z");

  await expect(cell(0, 0)).toHaveAttribute("colspan", "2");
  await expect(cell(0, 0)).toHaveAttribute("rowspan", "2");
});

test("일반 텍스트 편집 중에는 병합·분할 버튼을 노출하지 않는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  await page.keyboard.type("plain text");

  await expect(page.getByRole("button", { name: "Merge cells" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Split cell" })).toHaveCount(0);
});

test("셀 하나만 삼중 클릭한 선택에는 병합 버튼을 노출하지 않는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  await page.keyboard.type("hello");
  // tableEditing 플러그인의 handleTripleClick은 셀 하나만 감싸는
  // CellSelection을 만든다 — 병합할 대상이 하나뿐이라 병합 후보가 아니다.
  await cell(0, 0).click({ clickCount: 3 });
  await expect(table.locator(".selectedCell")).toHaveCount(1);

  await expect(page.getByRole("button", { name: "Merge cells" })).toHaveCount(
    0,
  );
});

test("병합된 셀을 삼중 클릭하면 분할 버튼을 노출한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  await dragSelectCells(page, cell(0, 0), cell(1, 1));
  const mergeButton = page.getByRole("button", { name: "Merge cells" });
  await expect(mergeButton).toBeVisible();
  await mergeButton.click();

  await cell(0, 0).click({ clickCount: 3 });
  await expect(table.locator(".selectedCell")).toHaveCount(1);

  await expect(page.getByRole("button", { name: "Split cell" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Merge cells" })).toHaveCount(
    0,
  );
});

test("내용이 있는 두 셀을 병합하면 두 텍스트가 모두 남는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  await page.keyboard.type("왼쪽");
  await cell(0, 1).click();
  await page.keyboard.type("오른쪽");

  await cell(0, 0).click();
  await dragSelectCells(page, cell(0, 0), cell(0, 1));
  const mergeButton = page.getByRole("button", { name: "Merge cells" });
  await expect(mergeButton).toBeVisible();
  await mergeButton.click();

  await expect(cell(0, 0)).toHaveAttribute("colspan", "2");
  await expect(cell(0, 0)).toHaveText("왼쪽 오른쪽");
});
