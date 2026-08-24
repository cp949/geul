/**
 * 표 핸들 메뉴와 셀 선택 서식의 실제 브라우저 동작을 검증한다.
 * pointer 선택, undo, 메뉴 종료와 viewport 클램프를 함께 다룬다.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import { CLAMP_BOUNDARY_MIN_MARGIN_PX } from "./support/clamp.js";
import { insertTable, openDemo } from "./support/demo.js";

/**
 * 데모를 열고 슬래시 메뉴로 기본 3×3 표를 만들어 브라우저 조작 fixture를
 * 준비한다. 이 파일의 테스트는 대부분 빈 데모에 표 하나만 있으면 된다.
 *
 * 공용 `insertTable`과 달리 `openDemo`를 안에서 부르므로 — 시그니처가
 * 다르다 — 이름을 재사용하지 않고 지역 wrapper로 둔다. 반환의 `editable`은
 * 메뉴를 닫은 뒤 편집기로 초점이 돌아왔는지 보는 일부 테스트가 쓴다.
 */
const openDemoWithTable = async (page: Page) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
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

test("행 핸들 메뉴에서 헤더 행을 켜고 undo 1회로 복원한다 @core", async ({
  page,
}) => {
  const { table } = await openDemoWithTable(page);
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
  const { table } = await openDemoWithTable(page);
  await openHandleMenu(page, "column");

  await page.getByRole("menuitemcheckbox", { name: "Header column" }).click();

  await expect(table).toHaveAttribute("data-be-header-columns", "1");
});

test("행 핸들 메뉴에서 배경색을 고르면 그 행에만 색이 적용되고 undo 1회로 복원한다", async ({
  page,
}) => {
  const { table } = await openDemoWithTable(page);
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
  const { table } = await openDemoWithTable(page);
  await expect(table.locator("tr")).toHaveCount(3);
  await openHandleMenu(page, "row");

  await page.getByRole("menuitem", { name: "Delete row" }).click();

  await expect(table.locator("tr")).toHaveCount(2);

  await page.keyboard.press("Control+z");
  await expect(table.locator("tr")).toHaveCount(3);
});

test("열 핸들 메뉴에서 열을 삭제한다", async ({ page }) => {
  const { table } = await openDemoWithTable(page);
  await expect(table.locator("tr").first().locator("td")).toHaveCount(3);
  await openHandleMenu(page, "column");

  await page.getByRole("menuitem", { name: "Delete column" }).click();

  await expect(table.locator("tr").first().locator("td")).toHaveCount(2);
});

test("Escape로 표 메뉴를 닫으면 편집기로 초점을 복구한다", async ({ page }) => {
  const { editable } = await openDemoWithTable(page);
  const menu = await openHandleMenu(page, "row");

  await page.keyboard.press("Escape");

  await expect(menu).toHaveCount(0);
  await expect(editable).toBeFocused();
});

test("표 메뉴 바깥을 클릭하면 클릭한 컨트롤에 초점을 유지한다 (G-UI-001)", async ({
  page,
}) => {
  await openDemoWithTable(page);
  const menu = await openHandleMenu(page, "row");

  const saveButton = page.getByRole("button", { name: "Save JSON" });
  await saveButton.click();

  await expect(menu).toHaveCount(0);
  await expect(saveButton).toBeFocused();
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
  const { table } = await openDemoWithTable(page);
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
    (viewportSize?.height ?? 0) - CLAMP_BOUNDARY_MIN_MARGIN_PX,
  );

  // 팔레트 맨 마지막 항목이 실제로 클릭 가능해야 클램프가 유효하다 —
  // 클램프가 없으면 이 항목이 뷰포트 밖으로 나가 클릭이 "element is
  // outside of the viewport"로 타임아웃한다(PIT-0011 실측 시나리오).
  await menu.getByRole("menuitem", { name: "Background color None" }).click();
});

/**
 * 두 셀 좌표를 마우스 드래그로 잇는다. 포커스를 표 안에 두는 것은 호출부의
 * 몫이다 — 이 헬퍼는 클릭하지 않고, 아래 호출부 넷이 모두 드래그 직전에
 * 시작 셀을 클릭한다. 포커스 전환과 드래그 시작 mousedown을 같은 제스처로
 * 묶으면 tableEditing이 CellSelection 추적을 시작하지 않는 브라우저 동작
 * 차이가 있기 때문이다.
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

test("셀 하나를 트리플클릭으로 선택해 배경색을 적용하고 undo로 되돌린다 @core", async ({
  page,
}) => {
  const { table } = await openDemoWithTable(page);
  const cell = table.locator("td").first();
  await cell.click({ clickCount: 3 });

  await page.getByRole("button", { name: "Cell formatting" }).click();
  await page.getByRole("menuitem", { name: "Background color Yellow" }).click();

  await expect(cell).toHaveCSS("background-color", "rgb(254, 247, 224)");

  await page.keyboard.press("Control+z");
  await expect(cell).not.toHaveCSS("background-color", "rgb(254, 247, 224)");
});

test("여러 셀을 드래그 선택해 글자색을 함께 적용한다", async ({ page }) => {
  const { table } = await openDemoWithTable(page);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  await dragSelectCells(page, cell(0, 0), cell(0, 1));

  await page.getByRole("button", { name: "Cell formatting" }).click();
  await page.getByRole("menuitem", { name: "Text color Red" }).click();

  await expect(cell(0, 0)).toHaveCSS("color", "rgb(217, 48, 37)");
  await expect(cell(0, 1)).toHaveCSS("color", "rgb(217, 48, 37)");
});

test("셀 범위를 다시 선택하지 않고 색상과 정렬을 연속 적용한다", async ({
  page,
}) => {
  const { table } = await openDemoWithTable(page);
  /** 행·열 좌표로 실제 표 셀을 조회한다. */
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);
  const selectedCells = table.locator(".selectedCell");
  const formatTrigger = page.getByRole("button", { name: "Cell formatting" });

  await cell(0, 0).click();
  await dragSelectCells(page, cell(0, 0), cell(0, 1));
  await expect(selectedCells).toHaveCount(2);

  await formatTrigger.click();
  await page.getByRole("menuitem", { name: "Text color Red" }).click();
  await expect(selectedCells).toHaveCount(2);
  await expect(formatTrigger).toBeVisible();

  await formatTrigger.click();
  await page.getByRole("menuitem", { name: "Background color Yellow" }).click();
  await expect(selectedCells).toHaveCount(2);

  await formatTrigger.click();
  await page.getByRole("menuitem", { name: "Align center" }).click();
  await expect(selectedCells).toHaveCount(2);
  await expect(cell(0, 0)).toHaveCSS("color", "rgb(217, 48, 37)");
  await expect(cell(0, 1)).toHaveCSS("background-color", "rgb(254, 247, 224)");
  await expect(cell(0, 0)).toHaveCSS("text-align", "center");
});

test("병합 셀 커서를 유지하며 색상과 정렬을 연속 적용한다", async ({
  page,
}) => {
  const { table } = await openDemoWithTable(page);
  /** 첫 행의 열 인덱스로 병합 대상 셀을 조회한다. */
  const cell = (column: number) =>
    table.locator("tr").first().locator("td").nth(column);
  await cell(0).click();
  await dragSelectCells(page, cell(0), cell(1));
  await page.getByRole("button", { name: "Merge cells" }).click();

  const formatTrigger = page.getByRole("button", { name: "Cell formatting" });
  const splitTrigger = page.getByRole("button", { name: "Split cell" });
  await expect(formatTrigger).toBeVisible();
  await expect(splitTrigger).toBeVisible();

  await formatTrigger.click();
  await page.getByRole("menuitem", { name: "Text color Red" }).click();
  await expect(formatTrigger).toBeVisible();
  await expect(splitTrigger).toBeVisible();

  await formatTrigger.click();
  await page.getByRole("menuitem", { name: "Align center" }).click();
  await expect(formatTrigger).toBeVisible();
  await expect(splitTrigger).toBeVisible();
  await expect(cell(0)).toHaveCSS("color", "rgb(217, 48, 37)");
  await expect(cell(0)).toHaveCSS("text-align", "center");
});

test("셀 정렬을 적용하고 undo로 되돌린다 @core", async ({ page }) => {
  const { table } = await openDemoWithTable(page);
  const cell = table.locator("td").first();
  await cell.click({ clickCount: 3 });

  await page.getByRole("button", { name: "Cell formatting" }).click();
  await page.getByRole("menuitem", { name: "Align center" }).click();

  await expect(cell).toHaveCSS("text-align", "center");

  await page.keyboard.press("Control+z");
  await expect(cell).not.toHaveCSS("text-align", "center");
});

test("Escape로 셀 서식 메뉴를 닫는다 (G-TST-001)", async ({ page }) => {
  const { editable, table } = await openDemoWithTable(page);
  const cell = table.locator("td").first();
  await cell.click({ clickCount: 3 });

  const trigger = page.getByRole("button", { name: "Cell formatting" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Cell formatting" });
  await expect(menu).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(menu).toHaveCount(0);
  await expect(editable).toBeFocused();
});

test("셀 서식 메뉴 바깥을 클릭하면 초점을 강제로 옮기지 않는다 (G-UI-001)", async ({
  page,
}) => {
  const { table } = await openDemoWithTable(page);
  const cell = table.locator("td").first();
  await cell.click({ clickCount: 3 });

  const trigger = page.getByRole("button", { name: "Cell formatting" });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Cell formatting" });
  await expect(menu).toBeVisible();

  const saveButton = page.getByRole("button", { name: "Save JSON" });
  await saveButton.click();

  await expect(menu).toHaveCount(0);
  await expect(saveButton).toBeFocused();
});

test("키보드로 셀 서식을 적용한 뒤 편집 초점과 셀 선택을 복구한다", async ({
  page,
}) => {
  const { editable, table } = await openDemoWithTable(page);
  /** 첫 행의 열 인덱스로 키보드 선택 대상을 조회한다. */
  const cell = (column: number) =>
    table.locator("tr").first().locator("td").nth(column);
  await cell(0).click();
  await dragSelectCells(page, cell(0), cell(1));

  const trigger = page.getByRole("button", { name: "Cell formatting" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const alignCenter = page.getByRole("menuitem", { name: "Align center" });
  await alignCenter.focus();
  await page.keyboard.press("Enter");

  await expect(editable).toBeFocused();
  await expect(table.locator(".selectedCell")).toHaveCount(2);
  await expect(cell(0)).toHaveCSS("text-align", "center");
  await expect(cell(1)).toHaveCSS("text-align", "center");
});

test("표 하단 행에서 셀 서식 메뉴를 열어도 정렬 버튼까지 뷰포트 안에서 클릭할 수 있다 (PIT-0011)", async ({
  page,
}) => {
  const { table } = await openDemoWithTable(page);
  // 확장 버튼은 표 hover 중에만 렌더된다.
  await table.locator("td").first().hover();
  const addRow = page.getByRole("button", { name: "Add row" });
  for (let index = 0; index < 8; index += 1) {
    await addRow.click();
  }
  await expect(table.locator("tr")).toHaveCount(11);

  const lastCell = table.locator("tr").last().locator("td").first();
  await lastCell.click({ clickCount: 3 });
  await page.getByRole("button", { name: "Cell formatting" }).click();

  const firstOpenMenu = page.getByRole("menu", { name: "Cell formatting" });
  await expect(firstOpenMenu).toBeVisible();
  await firstOpenMenu.getByRole("menuitem", { name: "Align center" }).click();
  await expect(lastCell).toHaveCSS("text-align", "center");

  // 메뉴를 다시 열어 팔레트 맨 마지막 항목(Align none)까지 클램프가
  // 뷰포트 안으로 접어 넣었는지 확인한다 — 클램프가 없으면 이 항목이
  // 뷰포트 밖으로 나가 클릭이 "element is outside of the viewport"로
  // 타임아웃한다(PIT-0011 실측 시나리오).
  await lastCell.click({ clickCount: 3 });
  await page.getByRole("button", { name: "Cell formatting" }).click();
  const menu = page.getByRole("menu", { name: "Cell formatting" });
  await expect(menu).toBeVisible();

  const menuBox = await menu.boundingBox();
  const viewportSize = page.viewportSize();
  expect(menuBox).not.toBeNull();
  expect(viewportSize).not.toBeNull();
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual(
    (viewportSize?.height ?? 0) - CLAMP_BOUNDARY_MIN_MARGIN_PX,
  );

  await menu.getByRole("menuitem", { name: "Align none" }).click();
  await expect(lastCell).not.toHaveCSS("text-align", "center");
});

test("표 상단 행에서 셀을 선택해도 Table selection 툴바가 화면 안에서 Cell formatting 버튼까지 클릭할 수 있다 (PIT-0011)", async ({
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

  const firstCell = table.locator("td").first();
  const cellBox = await firstCell.boundingBox();
  expect(cellBox).not.toBeNull();

  // 첫 셀이 뷰포트 맨 위(y≈2)에 붙도록 정확히 그만큼만 스크롤한다 —
  // TableSelectionToolbar의 메인 툴바는 선택 위(translateY(-100%-0.5rem))에
  // 뜨므로, 클램프가 없으면 이 위치에서 뷰포트 밖(음수 y)으로 밀려난다
  // (PIT-0011).
  await page.evaluate(
    (delta) => window.scrollBy(0, delta),
    (cellBox?.y ?? 0) - 2,
  );

  await firstCell.click({ clickCount: 3 });
  const toolbar = page.getByRole("toolbar", { name: "Table selection" });
  await expect(toolbar).toBeVisible();
  await expect
    .poll(async () => (await toolbar.boundingBox())?.y ?? -1)
    .toBeGreaterThanOrEqual(CLAMP_BOUNDARY_MIN_MARGIN_PX);

  // 클램프가 없으면 Cell formatting 버튼이 뷰포트 밖으로 나가 클릭이
  // "element is outside of the viewport"로 타임아웃한다(PIT-0011 실측
  // 시나리오).
  await page.getByRole("button", { name: "Cell formatting" }).click();
  await expect(
    page.getByRole("menu", { name: "Cell formatting" }),
  ).toBeVisible();
});
