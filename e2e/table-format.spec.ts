/**
 * 표 핸들 메뉴와 셀 선택 서식의 실제 브라우저 동작을 검증한다.
 * pointer 선택, undo, 메뉴 종료와 viewport 클램프를 함께 다룬다.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import { CLAMP_BOUNDARY_MIN_MARGIN_PX } from "./support/clamp.js";
import { insertTable, openDemo } from "./support/demo.js";
import { dragSelectCells } from "./support/table-selection.js";

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

test("행 핸들 메뉴에서 헤더 행을 켜고 undo 1회로 복원한다", async ({
  page,
}) => {
  const { table } = await openDemoWithTable(page);
  await openHandleMenu(page, "row");

  await page.getByRole("menuitemcheckbox", { name: "Header row" }).click();

  await expect(table).toHaveAttribute("data-geul-header-rows", "1");
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
  await expect(table).toHaveAttribute("data-geul-header-rows", "0");
});

test("열 핸들 메뉴에서 헤더 열을 켠다", async ({ page }) => {
  const { table } = await openDemoWithTable(page);
  await openHandleMenu(page, "column");

  await page.getByRole("menuitemcheckbox", { name: "Header column" }).click();

  await expect(table).toHaveAttribute("data-geul-header-columns", "1");
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
    "data-geul-background-color",
    "#FEF7E0",
  );
  await expect(firstRowCell).toHaveCSS(
    "background-color",
    "rgb(254, 247, 224)",
  );
  await expect(secondRowCell).not.toHaveAttribute("data-geul-background-color");

  await page.keyboard.press("Control+z");
  await expect(firstRowCell).not.toHaveAttribute("data-geul-background-color");
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

/**
 * "Add row" 버튼은 `position: fixed`로 표 바로 아래 뜨고, scroll 이벤트로만
 * 위치를 다시 계산한다(table-handles.tsx) — 실제 마우스 휠 스크롤에는
 * 정확히 따라오지만, 브라우저 네이티브 `scrollIntoView`(Playwright의
 * 클릭 전 자동 스크롤이 여기 기댄다)는 fixed 요소를 움직이지 못한다(fixed는
 * 정의상 스크롤에 영향받지 않으므로 스크롤할 필요가 없다고 판단해 실제로
 * 0px만 스크롤한다 — 실측: `element.scrollIntoView()` 호출 뒤에도 scrollY
 * 불변, `window.scrollBy`는 정상 추적). 표가 자라 버튼이 뷰포트 밖으로
 * 나가면 그래서 Playwright의 자동 스크롤이 "element is outside of the
 * viewport" 재시도만 반복하다 타임아웃한다. 실제 사용자가 마우스 휠로
 * 스크롤해 버튼을 따라잡는 것과 같은 효과를 직접 낸다.
 */
const scrollIntoViewportBounds = async (page: Page, locator: Locator) => {
  const viewport = page.viewportSize();
  const box = await locator.boundingBox();
  if (viewport === null || box === null) return;
  const margin = 40;
  if (box.y < margin) {
    await page.evaluate((delta) => window.scrollBy(0, delta), box.y - margin);
  } else if (box.y + box.height > viewport.height - margin) {
    await page.evaluate(
      (delta) => window.scrollBy(0, delta),
      box.y + box.height - (viewport.height - margin),
    );
  }
};

/**
 * "Add row"를 8번 눌러 표를 11행까지 늘린다. 버튼이 fixed라 표가 자라며
 * 뷰포트 밖으로 나가면 매 클릭 전 `scrollIntoViewportBounds`로 따라간다
 * (위 주석). 표 하단 행 시나리오(PIT-0011) 두 테스트가 공유하는 setup이다.
 */
const growTableTo11Rows = async (page: Page, table: Locator) => {
  // 확장 버튼은 표 hover 중에만 렌더된다.
  await table.locator("td").first().hover();
  const addRow = page.getByRole("button", { name: "Add row" });
  for (let index = 0; index < 8; index += 1) {
    await scrollIntoViewportBounds(page, addRow);
    await addRow.click();
  }
  await expect(table.locator("tr")).toHaveCount(11);
};

test("표 하단 행에서 메뉴를 열어도 팔레트 마지막 항목까지 뷰포트 안에서 클릭할 수 있다 (PIT-0011)", async ({
  page,
}) => {
  const { table } = await openDemoWithTable(page);
  await growTableTo11Rows(page, table);

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
test("셀 하나를 트리플클릭으로 선택해 배경색을 적용하고 undo로 되돌린다", async ({
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

test("셀 정렬을 적용하고 undo로 되돌린다", async ({ page }) => {
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
  await growTableTo11Rows(page, table);

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

/**
 * Issue #163 RD-001 DELTA-01은 이 테스트로 버그를 재현 확인했다(뷰포트
 * 밖 Add row 버튼에 Tab 포커스가 이동해도 scrollY·bounding box가
 * 그대로였다 — `position: fixed`가 네이티브 scroll-into-view를 no-op으로
 * 만든 결과). RD-002 DELTA-01이 오버레이 6종을 `position: absolute` +
 * page-relative 좌표로 전환한 뒤(G-UI-003/ADR-0012)로는 그 결함이
 * 사라졌다 — 이 테스트는 그 수정을 고정하는 회귀 방지 테스트로 뒤집는다.
 * `preserveFocusOnMouseDown`(icon-button.tsx)이 마우스로는 오버레이
 * 버튼에 초점을 주지 않으므로, Add row 버튼(`[data-geul-table-expand-row]`)의
 * 유일한 정상 키보드 진입 경로는 여전히 Tab이다.
 */
test("뷰포트 밖으로 밀려난 표 확장 버튼도 키보드 Tab 포커스만으로 뷰포트 안까지 스크롤된다 (Issue #163 RD-002 DELTA-01 수정 확인)", async ({
  page,
}) => {
  const { table } = await openDemoWithTable(page);
  await growTableTo11Rows(page, table);

  // growTableTo11Rows는 매 클릭 전 scrollIntoViewportBounds로 스크롤을
  // 보정하며 진행하므로, 끝난 시점의 scrollY는 0이 아니다 — 맨 위로
  // 되돌려야 Add row 버튼이 뷰포트 아래로 밀려난 상태를 만들 수 있다.
  await page.evaluate(() => window.scrollTo(0, 0));

  // 확장 버튼은 표 hover 중에만 렌더된다. 첫 셀은 맨 위라 스크롤 없이
  // hover할 수 있어야 하지만, Playwright의 자동 스크롤이 개입할 수 있어
  // hover 직후 다시 맨 위로 보정한다(실측: 이 보정이 실제로 필요했다 —
  // hover 자체가 스크롤을 유발하지는 않았지만 방어적으로 유지한다).
  await table.locator("td").first().hover();
  await page.evaluate(() => window.scrollTo(0, 0));

  const addRowButton = page.locator("[data-geul-table-expand-row]");
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  // sanity check: setup이 의도대로 버튼을 뷰포트 밖에 뒀는지 사전 확인한다.
  // 이게 깨지면 테스트 설계 자체가 틀린 것이다.
  const initialBox = await addRowButton.boundingBox();
  expect(initialBox === null || initialBox.y >= (viewport?.height ?? 0)).toBe(
    true,
  );

  // Add row 버튼보다 DOM/tab 순서상 바로 앞에 오는 tabbable 요소(마지막
  // 열 핸들)에 프로그래밍 방식으로 초점을 둔다 — 이 자체는 setup이지
  // 검증 대상이 아니다.
  await page.locator("[data-geul-table-column-handle]").last().focus();

  const scrollYBefore = await page.evaluate(() => window.scrollY);

  await page.keyboard.press("Tab");

  // 실측 1: 초점이 실제로 Add row 버튼까지 이동한다.
  await expect(addRowButton).toBeFocused();

  // 실측 2: absolute + page-relative 좌표로는 브라우저가 네이티브
  // scroll-into-view를 실제로 수행한다 — fixed일 때와 달리 scrollY가
  // 움직인다.
  const scrollYAfter = await page.evaluate(() => window.scrollY);
  expect(scrollYAfter).toBeGreaterThan(scrollYBefore);

  // 실측 3: 버튼이 초점을 받은 뒤에는 뷰포트 안에서 보인다(더 이상 화면
  // 밖에 갇히지 않는다).
  await expect(addRowButton).toBeInViewport();

  // 실측 4: 이 표 hover는 첫 셀(맨 위)뿐이라 마우스로는 이 rail이 평소
  // opacity:0(Notion 참고, 사용자 요청)이다 — 키보드 Tab만으로도
  // :focus가 opacity:1로 보이게 하는지 확인한다(마우스 hover 없이도
  // 키보드 사용자가 놓치지 않아야 한다).
  await expect(addRowButton).toHaveCSS("opacity", "1");
});

/**
 * DELTA-01은 Add row(표 아래) 1종만 실측했다. 이 테스트는 표 "안쪽 하단"에
 * 앵커된 나머지 두 종(마지막 행의 재정렬 핸들, 마지막 리사이즈 세그먼트)이
 * 같은 방식(표를 키운 뒤 맨 위로 되돌려 화면 밖으로 미는 것)으로 화면
 * 밖에 놓여도 Playwright의 클릭·hover 자동 스크롤(G-UI-003 "검증" 절의
 * "Playwright 클릭" 경로)로 도달 가능한지 확인한다.
 */
test("표 하단 행 재정렬 핸들과 리사이즈 스트립도 뷰포트 밖으로 밀려난 뒤 클릭·hover만으로 도달 가능하다 (Issue #163 RD-002 DELTA-02)", async ({
  page,
}) => {
  const { table } = await openDemoWithTable(page);
  await growTableTo11Rows(page, table);
  await page.evaluate(() => window.scrollTo(0, 0));
  await table.locator("td").first().hover();
  await page.evaluate(() => window.scrollTo(0, 0));

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  const lastRowHandle = page
    .getByRole("button", { name: "Drag to reorder row" })
    .last();
  const lastResizeHandle = page
    .locator("[data-geul-table-resize-handle]")
    .last();

  // sanity check: 둘 다 뷰포트 밖(아래)에서 시작해야 한다 — 깨지면 setup
  // 자체가 틀린 것이다.
  for (const locator of [lastRowHandle, lastResizeHandle]) {
    const box = await locator.boundingBox();
    expect(box === null || box.y >= (viewport?.height ?? 0)).toBe(true);
  }

  // 실측 1: 행 핸들은 클릭까지 성공해 메뉴를 연다 — "화면 밖이라 실패하지
  // 않는다"보다 강한 증거다.
  await lastRowHandle.click();
  await expect(
    page.getByRole("menu", { name: "Table row menu" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // 실측 2: 리사이즈 스트립은 클릭 대상이 아니다(드래그 전용) — hover로
  // 같은 자동 스크롤 경로를 확인한다.
  await lastResizeHandle.hover();
  await expect(lastResizeHandle).toBeInViewport();
});

/**
 * 오버레이 하나를 골라 현재 스크롤 위치 기준 page 좌표를 읽고, 그 요소를
 * 완전히 지나칠 만큼 아래로 스크롤한다(요소가 새 뷰포트 위쪽 밖에 남는다).
 * 상단·중앙·하단 어디에 앵커된 오버레이든 좌표만 읽으면 재사용 가능해
 * 오버레이 종류별로 다른 setup을 짤 필요가 없다 — 표를 키워 페이지를
 * 충분히 길게 만든 뒤(`growTableTo11Rows`) 이 헬퍼로 어느 오버레이든
 * "지나쳐 스크롤"할 수 있다.
 */
const scrollPastOverlay = async (page: Page, locator: Locator) => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("오버레이 boundingBox 없음");
  const currentScrollY = await page.evaluate(() => window.scrollY);
  const pageY = box.y + currentScrollY;
  await page.evaluate((y) => window.scrollTo(0, y), pageY + box.height + 40);
};

/**
 * 열 재정렬 핸들·Add column은 표 "위쪽"에 앵커돼(`geometry.top - 24`,
 * 표 전체 높이의 중앙) 표를 키워도 위치 자체가 표 밖으로 밀려나지 않는다
 * — 대신 표를 지나쳐 스크롤하면(`scrollPastOverlay`) 화면 밖(위)으로
 * 나간다. G-UI-003 "검증" 절의 "명시적 scrollIntoView()"·"Playwright
 * 클릭" 두 경로를 나눠 확인한다.
 */
test("표 상단 열 재정렬 핸들과 Add column 버튼도 스크롤로 지나친 뒤 도달 가능하다 (Issue #163 RD-002 DELTA-02)", async ({
  page,
}) => {
  const { table } = await openDemoWithTable(page);
  await growTableTo11Rows(page, table);
  await page.evaluate(() => window.scrollTo(0, 0));
  await table.locator("td").first().hover();
  await page.evaluate(() => window.scrollTo(0, 0));

  const columnHandle = page
    .getByRole("button", { name: "Drag to reorder column" })
    .first();
  const addColumnButton = page.getByRole("button", { name: "Add column" });

  // 실측 1: 명시적 scrollIntoViewIfNeeded()(Issue #163 실측이 직접 쓴
  // element.scrollIntoView()와 같은 네이티브 API)로 열 핸들에 도달한다.
  await scrollPastOverlay(page, columnHandle);
  await expect(columnHandle).not.toBeInViewport();
  await columnHandle.scrollIntoViewIfNeeded();
  await expect(columnHandle).toBeInViewport();

  // 실측 2: Add column은 클릭까지 성공해 실제로 열이 늘어나는지 함께
  // 확인한다(도달 확인보다 강한 증거). Add column은 이제 표 전체
  // 높이를 덮는 rail이라(Notion 참고, 사용자 요청) growTableTo11Rows로
  // 키운 표에서는 뷰포트보다 커진다 — scrollPastOverlay로 "완전히
  // 뷰포트 밖"을 만드는 전제 자체가 성립하지 않는다(항상 어딘가는
  // 걸쳐 보인다). 페이지 맨 아래로 스크롤해 클릭 지점에서 멀어진 뒤에도
  // Playwright의 자동 scroll-into-view로 클릭이 성공하는지만 본다.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const columnsBefore = await table.locator("tr").first().locator("td").count();
  await addColumnButton.click();
  await expect(table.locator("tr").first().locator("td")).toHaveCount(
    columnsBefore + 1,
  );
});

/**
 * indent·outdent도 열 핸들·Add column과 같은 이유(표 위쪽 anchor)로
 * `scrollPastOverlay`가 필요하다. indent는 앞 형제 블록이 있어야
 * `canIndentTable`이 참이다(`indent-commands.ts`, `table-handle.spec.ts`
 * Issue #126 테스트와 같은 전제) — 표 앞에 문단 하나를 둔다.
 * `HTMLElement.focus()`의 기본값(`preventScroll: false`)은 Tab과 같은
 * 네이티브 scroll-into-view를 호출한다(MDN, DELTA-01 테스트 주석이 이미
 * 인용) — Tab 키 시퀀스 대신 `.focus()`를 쓰는 이유는 이 표의 tab 순서를
 * 정확히 재현할 필요 없이 같은 API를 직접 검증할 수 있어서다.
 *
 * outdent 버튼은 Issue #65 항목8 RD-003이 네이티브 `disabled`를
 * `aria-disabled`로 바꿨다 — tab 순서·`.focus()`를 막지 않는다("disabled라
 * focus 불가"라는 전제 자체를 없애는 것이 그 수정 목표다). 그래서 초기
 * 상태는 `toBeDisabled()`/`toBeEnabled()`(둘 다 `aria-disabled`도
 * disabled로 인식해 이 전환으로는 깨지지 않는다) 대신 `aria-disabled`
 * 속성으로 직접 확인하고, 도달성은 indent와 같은 `.focus()` 경로로
 * 통일한다(`scrollIntoViewIfNeeded()` 특수 경로는 제거).
 */
test("indent·outdent 버튼도 표를 지나쳐 스크롤한 뒤 포커스로 도달 가능하다 (Issue #163 RD-002 DELTA-02, Issue #65 항목8 RD-006)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("before");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/table");
  await expect(page.getByRole("option", { name: /Table/ })).toBeVisible();
  await page.keyboard.press("Enter");
  const table = editable.locator("table");
  await expect(table).toBeVisible();

  await growTableTo11Rows(page, table);
  await page.evaluate(() => window.scrollTo(0, 0));
  await table.locator("td").first().hover();
  await page.evaluate(() => window.scrollTo(0, 0));

  const indentButton = page.getByRole("button", { name: "Indent table" });
  const outdentButton = page.getByRole("button", { name: "Outdent table" });
  // 앞에 문단이 있어 최상위 표라도 indent는 활성, outdent는 비활성이다.
  await expect(indentButton).toHaveAttribute("aria-disabled", "false");
  await expect(outdentButton).toHaveAttribute("aria-disabled", "true");

  // 실측 1: indent는 활성 상태라 .focus()로 실제 초점 이동 + 네이티브
  // scroll-into-view를 함께 확인한다.
  await scrollPastOverlay(page, indentButton);
  await expect(indentButton).not.toBeInViewport();
  const scrollYBeforeIndentFocus = await page.evaluate(() => window.scrollY);
  await indentButton.focus();
  await expect(indentButton).toBeFocused();
  const scrollYAfterIndentFocus = await page.evaluate(() => window.scrollY);
  expect(scrollYAfterIndentFocus).not.toBe(scrollYBeforeIndentFocus);
  await expect(indentButton).toBeInViewport();

  // 실측 2: outdent는 aria-disabled라도 네이티브 disabled가 아니라 tab
  // 순서·포커스를 그대로 유지한다 — indent와 같은 .focus() 경로로 초점
  // 이동 + 네이티브 scroll-into-view를 함께 확인한다.
  await scrollPastOverlay(page, outdentButton);
  await expect(outdentButton).not.toBeInViewport();
  const scrollYBeforeOutdentFocus = await page.evaluate(() => window.scrollY);
  await outdentButton.focus();
  await expect(outdentButton).toBeFocused();
  const scrollYAfterOutdentFocus = await page.evaluate(() => window.scrollY);
  expect(scrollYAfterOutdentFocus).not.toBe(scrollYBeforeOutdentFocus);
  await expect(outdentButton).toBeInViewport();
});

/**
 * Issue #163 본문이 재현 방법으로 직접 지목한 시나리오다 — "우회
 * (scrollIntoViewportBounds)를 걷어내고 원래의 단순 반복 클릭 루프로
 * 되돌리면 재현한다." `growTableTo11Rows`/`scrollIntoViewportBounds`
 * 자체와 그걸 쓰는 두 PIT-0011 테스트(위)는 손대지 않는다(Issue #163·
 * RD-002.md "제외 범위") — 이 테스트는 그 우회 없이도 이제 성공함을
 * 별도로 증명해 "우회 처리된 두 테스트"를 네이티브 기반으로 재검증한다.
 */
test("Add row를 스크롤 보정 없이 반복 클릭해도 표가 계속 늘어난다 (Issue #163 RD-002 DELTA-02 네이티브 재검증)", async ({
  page,
}) => {
  const { table } = await openDemoWithTable(page);
  await table.locator("td").first().hover();
  const addRow = page.getByRole("button", { name: "Add row" });
  for (let index = 0; index < 8; index += 1) {
    await addRow.click();
  }
  await expect(table.locator("tr")).toHaveCount(11);
});

/**
 * DELTA-01 "남은 위험" 1번을 해소한다 — `computeReorderTargetIndex`가
 * page-relative `row.top`과 비교하는 좌표가 실제로 `event.pageY`(page-
 * relative)인지 되돌아간 `event.clientY`(viewport-relative)인지는
 * jsdom(30, `MouseEvent.pageX/pageY` 미구현)으로 구분할 수 없었다 —
 * 표를 20줄 뒤에 둬 자연스럽게 만든 실제 `scrollY > 0` 상태에서 이
 * Chromium e2e가 그 차이를 드러낸다.
 */
test("스크롤이 있는 페이지에서도 행 재정렬 드래그가 올바른 목표 행에 놓인다 (Issue #163 RD-002 DELTA-02 회귀, DELTA-01 남은 위험 해소)", async ({
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
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  await page.keyboard.type("row-a");
  await cell(1, 0).click();
  await page.keyboard.type("row-b");
  await cell(2, 0).click();
  await page.keyboard.type("row-c");

  // 표가 20줄 뒤에 있어 위 클릭들이 이미 페이지를 스크롤시켰다 — 인위적
  // window.scrollBy 없이 자연스럽게 만든 실제 scrollY > 0 상태다.
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(0);

  await cell(0, 0).hover();
  const rowHandle = page
    .getByRole("button", { name: "Drag to reorder row" })
    .first();
  await expect(rowHandle).toBeVisible();

  const handleBox = await rowHandle.boundingBox();
  const thirdRowBox = await cell(2, 0).boundingBox();
  if (handleBox === null || thirdRowBox === null) {
    throw new Error("Bounding boxes were not available");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    thirdRowBox.x + thirdRowBox.width / 2,
    thirdRowBox.y + thirdRowBox.height - 2,
    { steps: 5 },
  );
  await page.mouse.up();

  // clientY 기반이었다면 scrollY만큼 어긋난 목표 인덱스가 나와 row-a가
  // 맨 끝에 오지 않는다.
  await expect(cell(0, 0)).toHaveText("row-b");
  await expect(cell(1, 0)).toHaveText("row-c");
  await expect(cell(2, 0)).toHaveText("row-a");
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
