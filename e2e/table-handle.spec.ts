import { expect, type Locator, type Page, test } from "@playwright/test";

const openDemo = async (page: Page) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  return { editor, editable };
};

const insertTable = async (page: Page, editable: Locator) => {
  await editable.click();
  await page.keyboard.type("/table");
  await expect(page.getByRole("option", { name: /Table/ })).toBeVisible();
  await page.keyboard.press("Enter");
  const table = editable.locator("table");
  await expect(table).toBeVisible();
  return table;
};

test("슬래시 메뉴에서 표를 삽입하고 undo 1회로 복원한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);

  await expect(table.locator("tr")).toHaveCount(3);
  await expect(table.locator("tr").first().locator("td")).toHaveCount(3);

  await page.keyboard.press("Control+z");

  await expect(editable.locator("table")).toHaveCount(0);
  await expect(editable.locator("p")).toHaveText("/table");
});

test("행 핸들을 드래그해 행 순서를 재정렬하고 undo 1회로 복원한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  await page.keyboard.type("row-a");
  await cell(1, 0).click();
  await page.keyboard.type("row-b");

  await cell(0, 0).hover();
  const rowHandle = page
    .getByRole("button", { name: "Drag to reorder row" })
    .first();
  await expect(rowHandle).toBeVisible();

  const handleBox = await rowHandle.boundingBox();
  const secondRowBox = await cell(1, 0).boundingBox();
  if (handleBox === null || secondRowBox === null) {
    throw new Error("Bounding boxes were not available");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    secondRowBox.x + secondRowBox.width / 2,
    secondRowBox.y + secondRowBox.height - 2,
    { steps: 5 },
  );
  await page.mouse.up();

  await expect(cell(0, 0)).toHaveText("row-b");
  await expect(cell(1, 0)).toHaveText("row-a");

  await page.keyboard.press("Control+z");

  await expect(cell(0, 0)).toHaveText("row-a");
  await expect(cell(1, 0)).toHaveText("row-b");
});

test("열 핸들을 드래그해 열 순서를 재정렬하고 undo 1회로 복원한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  await page.keyboard.type("col-a");
  await cell(0, 1).click();
  await page.keyboard.type("col-b");

  await cell(0, 0).hover();
  const columnHandle = page
    .getByRole("button", { name: "Drag to reorder column" })
    .first();
  await expect(columnHandle).toBeVisible();

  const handleBox = await columnHandle.boundingBox();
  const secondColumnBox = await cell(0, 1).boundingBox();
  if (handleBox === null || secondColumnBox === null) {
    throw new Error("Bounding boxes were not available");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    secondColumnBox.x + secondColumnBox.width - 2,
    secondColumnBox.y + secondColumnBox.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();

  await expect(cell(0, 0)).toHaveText("col-b");
  await expect(cell(0, 1)).toHaveText("col-a");

  await page.keyboard.press("Control+z");

  await expect(cell(0, 0)).toHaveText("col-a");
  await expect(cell(0, 1)).toHaveText("col-b");
});

test("행 핸들 드래그 재정렬 직후 합성 click이 행 메뉴를 열지 않는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  await page.keyboard.type("row-a");
  await cell(1, 0).click();
  await page.keyboard.type("row-b");

  await cell(0, 0).hover();
  const rowHandle = page
    .getByRole("button", { name: "Drag to reorder row" })
    .first();
  await expect(rowHandle).toBeVisible();
  // Playwright locator는 동작마다 셀렉터를 다시 매칭한다 — 재정렬로 DOM
  // 순서가 바뀌면 .first()가 다른 행의 핸들을 가리키게 된다.
  // setPointerCapture가 실제로 고정하는 대상은 이 시점의 구체적인 DOM
  // 노드이므로, elementHandle로 그 노드 자체를 붙잡아 계속 재사용한다.
  const rowHandleElement = await rowHandle.elementHandle();
  if (rowHandleElement === null) throw new Error("행 핸들 없음");

  const handleBox = await rowHandleElement.boundingBox();
  const secondRowBox = await cell(1, 0).boundingBox();
  if (handleBox === null || secondRowBox === null) {
    throw new Error("Bounding boxes were not available");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    secondRowBox.x + secondRowBox.width / 2,
    secondRowBox.y + secondRowBox.height - 2,
    { steps: 5 },
  );
  await page.mouse.up();

  await expect(cell(0, 0)).toHaveText("row-b");
  await expect(cell(1, 0)).toHaveText("row-a");

  // 이 코드는 Issue #17의 전제 — 실제 브라우저는 pointerup 뒤
  // setPointerCapture로 고정된 바로 그 버튼에 합성 click을 보낸다 — 가
  // 성립한다고 가정한다. 이 환경(Playwright/CDP)에서는 그 전제 자체를
  // 관측할 수 없다 — 이동거리가 임계값을 넘으면 브라우저가 click을 아예
  // 합성하지 않기 때문이다(PIT-0019). 그래서 브라우저가 보냈어야 할 click을
  // 여기서 명시적으로 재현한다 — 대상은 여전히 setPointerCapture가 실제로
  // 고정했던 바로 그 노드(rowHandleElement)이고, moveTableRow는 실제
  // 커맨드로 이미 위에서 DOM을 갱신했다. 이 전제가 실제 물리 마우스에도
  // 성립하는지는 별도 확인이 필요하다(Issue #63).
  // 대상 노드가 재렌더로 언마운트됐다면 dispatchEvent는 조용히 아무
  // 효과도 없이 "성공"한다 — React 루트 리스너가 이벤트를 못 받아 click이
  // 무의미해진다(Issue #62와 같은 vacuous-pass 클래스). 실제로 여전히
  // 문서에 붙어 있는지 먼저 확인한다.
  expect(await rowHandleElement.evaluate((el) => el.isConnected)).toBe(true);
  await rowHandleElement.dispatchEvent("click", {
    detail: 1,
    bubbles: true,
    cancelable: true,
  });

  await expect(
    page.getByRole("menu", { name: "Table row menu" }),
  ).not.toBeVisible();
});

test("열 핸들 드래그 재정렬 직후 합성 click이 열 메뉴를 열지 않는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  await page.keyboard.type("col-a");
  await cell(0, 1).click();
  await page.keyboard.type("col-b");

  await cell(0, 0).hover();
  const columnHandle = page
    .getByRole("button", { name: "Drag to reorder column" })
    .first();
  await expect(columnHandle).toBeVisible();
  // 행 테스트와 같은 이유(위 주석 참고)로 elementHandle을 붙잡아 재사용한다.
  const columnHandleElement = await columnHandle.elementHandle();
  if (columnHandleElement === null) throw new Error("열 핸들 없음");

  const handleBox = await columnHandleElement.boundingBox();
  const secondColumnBox = await cell(0, 1).boundingBox();
  if (handleBox === null || secondColumnBox === null) {
    throw new Error("Bounding boxes were not available");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    secondColumnBox.x + secondColumnBox.width - 2,
    secondColumnBox.y + secondColumnBox.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();

  await expect(cell(0, 0)).toHaveText("col-b");
  await expect(cell(0, 1)).toHaveText("col-a");

  // 행 테스트와 같은 이유로(PIT-0019) 합성 click을 명시적으로 재현한다.
  expect(await columnHandleElement.evaluate((el) => el.isConnected)).toBe(true);
  await columnHandleElement.dispatchEvent("click", {
    detail: 1,
    bubbles: true,
    cancelable: true,
  });

  await expect(
    page.getByRole("menu", { name: "Table column menu" }),
  ).not.toBeVisible();
});

test("열 경계를 드래그해 너비를 조절하고 undo 1회로 복원한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);

  await table.locator("tr").first().locator("td").first().hover();
  const resizeHandle = page.locator("[data-be-table-resize-handle]").first();
  await expect(resizeHandle).toBeVisible();
  const handleBox = await resizeHandle.boundingBox();
  if (handleBox === null) throw new Error("Bounding box was not available");

  const startX = handleBox.x + handleBox.width / 2;
  const y = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + 60, y, { steps: 5 });

  // 스펙 13절: 커밋 전 드래그 중에도 col 너비가 시각으로 갱신된다.
  const firstColumn = table.locator("colgroup col").first();
  await expect(firstColumn).toHaveAttribute("style", /width:\s*220px/);

  await page.mouse.up();

  await expect(firstColumn).toHaveAttribute("style", /width:\s*220px/);

  await page.keyboard.press("Control+z");

  await expect(firstColumn).toHaveAttribute("style", /width:\s*160px/);
});

test("Escape로 리사이즈를 취소하면 너비가 원래대로 복원된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);

  await table.locator("tr").first().locator("td").first().hover();
  const resizeHandle = page.locator("[data-be-table-resize-handle]").first();
  const handleBox = await resizeHandle.boundingBox();
  if (handleBox === null) throw new Error("Bounding box was not available");

  const startX = handleBox.x + handleBox.width / 2;
  const y = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + 60, y, { steps: 5 });

  const firstColumn = table.locator("colgroup col").first();
  await expect(firstColumn).toHaveAttribute("style", /width:\s*220px/);

  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(firstColumn).toHaveAttribute("style", /width:\s*160px/);
  await expect(editable).toBeVisible();
});

test("열 너비가 저장 JSON에 보존되고 로드 후 복원된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);

  await table.locator("tr").first().locator("td").first().hover();
  const resizeHandle = page.locator("[data-be-table-resize-handle]").first();
  const handleBox = await resizeHandle.boundingBox();
  if (handleBox === null) throw new Error("Bounding box was not available");

  const startX = handleBox.x + handleBox.width / 2;
  const y = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + 60, y, { steps: 5 });
  await page.mouse.up();

  const firstColumn = table.locator("colgroup col").first();
  await expect(firstColumn).toHaveAttribute("style", /width:\s*220px/);

  await page.getByRole("button", { name: "Save JSON" }).click();
  const source = page.getByLabel("Document source");
  const json = await source.inputValue();
  expect(json).toContain('"width": 220');

  // 슬라이스 12: 저장한 JSON을 다시 로드하면 열 너비가 복원돼야 한다.
  // 로드 전에 셀 내용을 바꿔 두어, 로드가 저장 시점 상태로 실제로
  // 되돌리는지(동일 문서 재적용 최적화에 걸리지 않는지) 확인한다.
  await table.locator("td").first().click();
  await page.keyboard.type("temp");
  await expect(table).toContainText("temp");

  await source.fill(json);
  await page.getByRole("button", { name: "Load JSON" }).click();

  await expect(page.getByText("JSON parsing succeeded.")).toBeVisible();
  await expect(editable.locator("table")).toHaveCount(1);
  await expect(editable.locator("table")).not.toContainText("temp");
  await expect(editable.locator("table colgroup col").first()).toHaveAttribute(
    "style",
    /width:\s*220px/,
  );
});

test("외부 HTML 표를 붙여넣으면 표가 생기고 편집이 계속된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("before");

  await page.evaluate(() => {
    const target = document.querySelector('[contenteditable="true"]');
    if (target === null) throw new Error("Editable not found");
    const data = new DataTransfer();
    data.setData(
      "text/html",
      "<table><tbody><tr><td>ext</td></tr></tbody></table>",
    );
    // Firefox는 ClipboardEvent 생성자의 clipboardData 초기값을 합성
    // (untrusted) 이벤트에 반영하지 않는다 — clipboardData 자체는 null이
    // 아니지만 types가 빈 배열로 나온다. 대신 평범한 Event에 clipboardData를
    // defineProperty로 얹으면 세 엔진 모두 types가 채워진다.
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: data,
      configurable: true,
    });
    target.dispatchEvent(event);
  });

  await expect(editable.locator("table")).toHaveCount(1);
  await expect(editable.locator("table td").first()).toContainText("ext");

  // 캐럿이 붙여넣은 표의 좌상단 셀로 이동한다(Issue #29) — 이어서 입력하면
  // 셀 안에 들어가고 원래 문단은 그대로 남는다. 입력이 반영된다는 것
  // 자체가 붙여넣기 이후에도 편집이 계속 동작한다는 증거다(영구 desync 없음).
  await page.keyboard.type("-after");
  await expect(editable.locator("p").first()).toContainText("before");
  await expect(editable.locator("table td").first()).toContainText("after");
});

test("빠른 확장 버튼으로 행과 열을 추가하고 undo 1회로 복원한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);

  await table.locator("tr").first().locator("td").first().hover();
  const addRowButton = page.getByRole("button", { name: "Add row" });
  await expect(addRowButton).toBeVisible();
  await addRowButton.click();

  await expect(table.locator("tr")).toHaveCount(4);

  await page.keyboard.press("Control+z");
  await expect(table.locator("tr")).toHaveCount(3);

  await table.locator("tr").first().locator("td").first().hover();
  const addColumnButton = page.getByRole("button", { name: "Add column" });
  await expect(addColumnButton).toBeVisible();
  await addColumnButton.click();

  await expect(table.locator("tr").first().locator("td")).toHaveCount(4);

  await page.keyboard.press("Control+z");
  await expect(table.locator("tr").first().locator("td")).toHaveCount(3);
});
