import { expect, test } from "@playwright/test";

const openDemo = async (page: Parameters<typeof test>[0]["page"]) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  return { editor, editable };
};

const insertTable = async (
  page: Parameters<typeof test>[0]["page"],
  editable: ReturnType<typeof openDemo> extends Promise<infer T>
    ? T["editable"]
    : never,
) => {
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
