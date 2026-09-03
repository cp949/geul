/**
 * `table-handles.tsx`가 표 둘레에 그리는 fixed 오버레이(행/열 재정렬
 * 핸들, 리사이즈 strip, 행/열 추가 버튼)의 동작을 검증한다 — 드래그
 * 재정렬, 리사이즈, 핸들 재클릭의 메뉴 열기/닫기, 빠른 확장 버튼, 그리고
 * 오버레이 좌표가 표의 실제 경계와 어긋나 셀 클릭을 가로채지 않는지.
 */
import { expect, test } from "@playwright/test";

import { insertTable, openDemo } from "./support/demo.js";

test("슬래시 메뉴에서 표를 삽입하고 undo 1회로 복원한다", async ({ page }) => {
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
  // 합성하지 않기 때문이다(G-UI-002). 그래서 브라우저가 보냈어야 할 click을
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

  // 행 테스트와 같은 이유로(G-UI-002) 합성 click을 명시적으로 재현한다.
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

test("재정렬 뒤 브라우저가 click을 합성하지 않아도 다음 진짜 click은 행 메뉴를 연다", async ({
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

  // 위 두 테스트와 달리 합성 click을 재현하지 않는다 — 이 환경의 Chromium은
  // 임계값을 넘는 드래그 뒤 click을 실제로 보내지 않는다(G-UI-002). 그러면
  // 억제 키를 소비할 click이 없어 키가 그대로 남는다. 사용자가 방금 옮긴
  // 행의 핸들을 다시 진짜로 클릭하는 이 동작이 한 번 삼켜지면 안 된다.
  const movedHandleBox = await rowHandleElement.boundingBox();
  if (movedHandleBox === null) throw new Error("이동 후 행 핸들 없음");
  await page.mouse.click(
    movedHandleBox.x + movedHandleBox.width / 2,
    movedHandleBox.y + movedHandleBox.height / 2,
  );

  await expect(
    page.getByRole("menu", { name: "Table row menu" }),
  ).toBeVisible();
});

test("열 경계를 드래그해 너비를 조절하고 undo 1회로 복원한다", async ({
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

test("열 너비가 저장 JSON에 보존되고 로드 후 복원된다", async ({ page }) => {
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

test("외부 HTML 표를 붙여넣으면 표가 생기고 편집이 계속된다", async ({
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

test("표 셀 편집으로 레이아웃이 밀린 뒤에도 표 핸들 오버레이가 마지막 열 셀 클릭을 가로채지 않는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);

  await cell(0, 0).click();
  // 데모 앱의 "Changed block IDs" 디버그 패널(app.tsx)이 편집마다 갱신되며
  // 줄바꿈 여부가 바뀌어, 표를 담은 상위 패널의 높이와 함께 표 자체의
  // 화면 top이 움직인다(Issue #15). table-handles.tsx는 이 렌더 함수
  // 본문에서 geometry를 읽는데, React가 이 DOM 변경(패널 줄바꿈)을 아직
  // commit하기 전이라 그 읽기는 "이 렌더 이전" 표 위치를 담는다 — 핸들이
  // 표 실제 경계보다 최대 한 렌더만큼 낡은 좌표에 그려진다.
  await page.keyboard.type("A");

  const lastCell = cell(0, 2);
  const box = await lastCell.boundingBox();
  if (box === null) throw new Error("표 마지막 열 셀의 좌표를 읽지 못했다");
  // Locator.click()의 actionability 재시도(대상이 클릭 가능해질 때까지
  // 기다리는 로직)를 거치면 재시도 사이 다른 렌더가 끼어들어 오버레이
  // 낡음이 우연히 사라진다 — 실제 마우스 클릭이 좌표에 곧장 꽂히는
  // 상황을 재현하려면 page.mouse.click으로 재시도 없이 좌표를 그대로
  // 보내야 한다(이슈 본문의 elementFromPoint 재현과 같은 방식).
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.type("Z");

  // 클릭이 열 재정렬 핸들 등 오버레이에 가로채이면 캐럿이 셀에 없어
  // 이 타이핑이 어디에도 닿지 않는다(이슈 증상과 동일).
  await expect(lastCell).toHaveText("Z");
});

// 최소 유효 표 하나짜리 model JSON. 열 너비·헤더 플래그는 table-test-support.ts의
// core fixture와 같은 모양이다(model.TableBlock 계약, packages/model/src/types.ts).
const minimalTableBlock = (blockId: string) => ({
  id: blockId,
  type: "table",
  columns: [
    { id: "col-1", width: 160 },
    { id: "col-2", width: 160 },
  ],
  rows: [
    {
      id: "row-1",
      cells: [
        {
          id: "cell-1",
          columnId: "col-1",
          rowSpan: 1,
          columnSpan: 1,
          content: [{ text: "a" }],
        },
        {
          id: "cell-2",
          columnId: "col-2",
          rowSpan: 1,
          columnSpan: 1,
          content: [{ text: "b" }],
        },
      ],
    },
  ],
  headerRows: 0,
  headerColumns: 0,
});

test("최상위 표 hover 시 Indent 버튼이 앞 형제의 자식으로 표를 옮기고 undo 1회로 복원된다 (Issue #126)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const sourceDocument = {
    formatVersion: 1,
    revision: 0,
    blocks: [
      { id: "before", type: "paragraph", content: [{ text: "before" }] },
      minimalTableBlock("table-1"),
    ],
  };
  await page.getByLabel("Document source").fill(JSON.stringify(sourceDocument));
  await page.getByRole("button", { name: "Load JSON" }).click();

  const table = editable.locator("table");
  await expect(table).toBeVisible();
  // Load JSON 직후에는 포커스가 그 버튼에 있다 — contenteditable 안을 먼저
  // 클릭해야 이어지는 Control+z가 ProseMirror history로 라우팅된다(그렇지
  // 않으면 view.dom 바깥 포커스라 keydown이 편집기에 닿지 않는다).
  await table.locator("td").first().click();
  await table.locator("td").first().hover();

  const indentButton = page.getByRole("button", { name: "Indent table" });
  const outdentButton = page.getByRole("button", { name: "Outdent table" });
  await expect(indentButton).toBeEnabled();
  // 최상위(depth 0)라 canOutdent는 false다(indent-commands.ts).
  await expect(outdentButton).toBeDisabled();

  await indentButton.click();

  await expect(
    editable.locator(
      '[data-be-block-id="before"] > [data-be-block-group] > [data-be-block-id="table-1"]',
    ),
  ).toHaveCount(1);

  await page.keyboard.press("Control+z");

  await expect(page.locator("[data-be-block-group]")).toHaveCount(0);
  await expect(
    editable.locator(':scope > [data-be-block-id="table-1"]'),
  ).toHaveCount(1);
});

test("다른 블록의 자식인 표 hover 시 Outdent 버튼이 표를 형제로 되돌리고 undo 1회로 복원된다 (Issue #126)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const sourceDocument = {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "toggle-1",
        type: "toggleListItem",
        content: [{ text: "toggle" }],
        children: [minimalTableBlock("table-1")],
      },
    ],
  };
  await page.getByLabel("Document source").fill(JSON.stringify(sourceDocument));
  await page.getByRole("button", { name: "Load JSON" }).click();

  await expect(
    editable.locator(
      '[data-be-block-id="toggle-1"] > [data-be-block-group] > [data-be-block-id="table-1"]',
    ),
  ).toHaveCount(1);

  const table = editable.locator("table");
  await expect(table).toBeVisible();
  // 위 top-level 테스트와 같은 이유로 contenteditable 안을 먼저 클릭해
  // Control+z가 ProseMirror history에 닿게 한다.
  await table.locator("td").first().click();
  await table.locator("td").first().hover();

  const indentButton = page.getByRole("button", { name: "Indent table" });
  const outdentButton = page.getByRole("button", { name: "Outdent table" });
  // 앞 형제가 없는 유일한 자식이라 canIndent는 false다(indent-commands.ts).
  await expect(indentButton).toBeDisabled();
  await expect(outdentButton).toBeEnabled();

  await outdentButton.click();

  await expect(
    editable.locator(':scope > [data-be-block-id="table-1"]'),
  ).toHaveCount(1);
  await expect(page.locator("[data-be-block-group]")).toHaveCount(0);

  await page.keyboard.press("Control+z");

  await expect(
    editable.locator(
      '[data-be-block-id="toggle-1"] > [data-be-block-group] > [data-be-block-id="table-1"]',
    ),
  ).toHaveCount(1);
});
