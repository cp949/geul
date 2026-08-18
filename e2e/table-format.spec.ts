import { expect, type Locator, type Page, test } from "@playwright/test";

const openDemo = async (page: Page) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  return { editor, editable };
};

const insertTable = async (page: Page) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/table");
  await expect(page.getByRole("option", { name: /Table/ })).toBeVisible();
  await page.keyboard.press("Enter");
  const table = editable.locator("table");
  await expect(table).toBeVisible();
  return { editable, table };
};

/** 첫 행/첫 열 핸들을 눌러 메뉴를 연다. 핸들은 표 hover 시에만 나타난다. */
const openHandleMenu = async (page: Page, kind: "row" | "column") => {
  const table = page.locator("table").first();
  await table.locator("tr").first().locator("td").first().hover();
  const handle = page
    .getByRole("button", {
      name: kind === "row" ? "Drag to reorder row" : "Drag to reorder column",
    })
    .first();
  await expect(handle).toBeVisible();
  await handle.click();
  const menu = page.getByRole("menu", {
    name: kind === "row" ? "Table row menu" : "Table column menu",
  });
  await expect(menu).toBeVisible();
  return menu;
};

test("행 핸들 메뉴에서 헤더 행을 켜고 undo 1회로 복원한다", async ({
  page,
}) => {
  const { table } = await insertTable(page);
  await openHandleMenu(page, "row");

  await page.getByRole("menuitemcheckbox", { name: "Header row" }).click();

  await expect(table).toHaveAttribute("data-be-header-rows", "1");
  // CSS가 실제로 연결됐는지 계산된 스타일로 확인한다 — 속성만 보면
  // styles.css 규칙이 빠져도 통과한다.
  const headerWeight = await table
    .locator("tr")
    .first()
    .locator("td")
    .first()
    .evaluate((cell) => getComputedStyle(cell).fontWeight);
  expect(headerWeight).toBe("600");

  await page.keyboard.press("Control+z");
  await expect(table).toHaveAttribute("data-be-header-rows", "0");
});

test("열 핸들 메뉴에서 헤더 열을 켠다", async ({ page }) => {
  const { table } = await insertTable(page);
  await openHandleMenu(page, "column");

  await page.getByRole("menuitemcheckbox", { name: "Header column" }).click();

  await expect(table).toHaveAttribute("data-be-header-columns", "1");
});

test("행 핸들 메뉴에서 배경색을 고르면 그 행에만 색이 적용되고 undo 1회로 복원한다", async ({
  page,
}) => {
  const { table } = await insertTable(page);
  await openHandleMenu(page, "row");

  await page.getByRole("menuitem", { name: "Background color Yellow" }).click();

  const firstRowCell = table.locator("tr").first().locator("td").first();
  const secondRowCell = table.locator("tr").nth(1).locator("td").first();
  await expect(firstRowCell).toHaveAttribute(
    "data-be-background-color",
    "#FEF7E0",
  );
  await expect(firstRowCell).toHaveCSS(
    "background-color",
    "rgb(254, 247, 224)",
  );
  await expect(secondRowCell).not.toHaveAttribute("data-be-background-color");

  await page.keyboard.press("Control+z");
  await expect(firstRowCell).not.toHaveAttribute("data-be-background-color");
});

test("행 핸들 메뉴에서 행을 삭제하고 undo 1회로 복원한다", async ({ page }) => {
  const { table } = await insertTable(page);
  await expect(table.locator("tr")).toHaveCount(3);
  await openHandleMenu(page, "row");

  await page.getByRole("menuitem", { name: "Delete row" }).click();

  await expect(table.locator("tr")).toHaveCount(2);

  await page.keyboard.press("Control+z");
  await expect(table.locator("tr")).toHaveCount(3);
});

test("열 핸들 메뉴에서 열을 삭제한다", async ({ page }) => {
  const { table } = await insertTable(page);
  await expect(table.locator("tr").first().locator("td")).toHaveCount(3);
  await openHandleMenu(page, "column");

  await page.getByRole("menuitem", { name: "Delete column" }).click();

  await expect(table.locator("tr").first().locator("td")).toHaveCount(2);
});

test("Escape로 표 메뉴를 닫는다", async ({ page }) => {
  await insertTable(page);
  const menu = await openHandleMenu(page, "row");

  await page.keyboard.press("Escape");

  await expect(menu).toHaveCount(0);
});

test("메뉴를 연 채 스크롤해도 메뉴가 핸들 위치를 따라간다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.type(`line ${index}`);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type("/table");
  await expect(page.getByRole("option", { name: /Table/ })).toBeVisible();
  await page.keyboard.press("Enter");
  const table = editable.locator("table");
  await expect(table).toBeVisible();

  const menu = await openHandleMenu(page, "row");
  const beforeBox = await menu.boundingBox();
  expect(beforeBox).not.toBeNull();

  await page.evaluate(() => window.scrollBy(0, 300));

  // 메뉴는 앵커(핸들)와 함께 움직여야 한다. 위치를 click 시점에 고정하면
  // 스크롤 후에도 옛 좌표에 그대로 남는다.
  await expect
    .poll(async () => (await menu.boundingBox())?.y ?? null)
    .toBeLessThan((beforeBox?.y ?? Number.POSITIVE_INFINITY) - 150);
});

test("표 하단 행에서 메뉴를 열어도 팔레트 마지막 항목까지 뷰포트 안에서 클릭할 수 있다 (PIT-0011)", async ({
  page,
}) => {
  const { table } = await insertTable(page);
  // 확장 버튼은 표 hover 중에만 렌더된다.
  await table.locator("td").first().hover();
  const addRow = page.getByRole("button", { name: "Add row" });
  for (let index = 0; index < 8; index += 1) {
    await addRow.click();
  }
  await expect(table.locator("tr")).toHaveCount(11);

  const lastRow = table.locator("tr").last();
  await lastRow.locator("td").first().hover();
  const handle = page
    .getByRole("button", { name: "Drag to reorder row" })
    .last();
  await expect(handle).toBeVisible();
  await handle.click();

  const menu = page.getByRole("menu", { name: "Table row menu" });
  await expect(menu).toBeVisible();

  const menuBox = await menu.boundingBox();
  const viewportSize = page.viewportSize();
  expect(menuBox).not.toBeNull();
  expect(viewportSize).not.toBeNull();
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual(
    (viewportSize?.height ?? 0) - 4,
  );

  // 팔레트 맨 마지막 항목이 실제로 클릭 가능해야 클램프가 유효하다 —
  // 클램프가 없으면 이 항목이 뷰포트 밖으로 나가 클릭이 "element is
  // outside of the viewport"로 타임아웃한다(PIT-0011 실측 시나리오).
  await menu.getByRole("menuitem", { name: "Background color None" }).click();
});

/**
 * 두 셀 좌표를 마우스 드래그로 잇는다. table-cell-selection.spec.ts와 같은
 * 패턴 — 드래그를 시작하기 전 시작 셀을 먼저 클릭해 포커스를 표 안에 둔다.
 * mousedown을 첫 포커스 이벤트로 겸하면 tableEditing이 CellSelection
 * 추적을 시작하지 않는 브라우저 차이가 있다.
 */
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

test("셀 하나를 트리플클릭으로 선택해 배경색을 적용하고 undo로 되돌린다", async ({
  page,
}) => {
  const { table } = await insertTable(page);
  const cell = table.locator("td").first();
  await cell.click({ clickCount: 3 });

  await page.getByRole("button", { name: "Cell formatting" }).click();
  await page.getByRole("menuitem", { name: "Background color Yellow" }).click();

  await expect(cell).toHaveCSS("background-color", "rgb(254, 247, 224)");

  await page.keyboard.press("Control+z");
  await expect(cell).not.toHaveCSS("background-color", "rgb(254, 247, 224)");
});

test("여러 셀을 드래그 선택해 글자색을 함께 적용한다", async ({ page }) => {
  const { table } = await insertTable(page);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  await dragSelectCells(page, cell(0, 0), cell(0, 1));

  await page.getByRole("button", { name: "Cell formatting" }).click();
  await page.getByRole("menuitem", { name: "Text color Red" }).click();

  await expect(cell(0, 0)).toHaveCSS("color", "rgb(217, 48, 37)");
  await expect(cell(0, 1)).toHaveCSS("color", "rgb(217, 48, 37)");
});

test("셀 정렬을 적용하고 undo로 되돌린다", async ({ page }) => {
  const { table } = await insertTable(page);
  const cell = table.locator("td").first();
  await cell.click({ clickCount: 3 });

  await page.getByRole("button", { name: "Cell formatting" }).click();
  await page.getByRole("menuitem", { name: "Align center" }).click();

  await expect(cell).toHaveCSS("text-align", "center");

  await page.keyboard.press("Control+z");
  await expect(cell).not.toHaveCSS("text-align", "center");
});
