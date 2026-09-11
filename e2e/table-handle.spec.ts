/**
 * `table-handles.tsx`가 표 둘레에 그리는 fixed 오버레이(행/열 재정렬
 * 핸들, 리사이즈 strip, 행/열 추가 버튼)의 동작을 검증한다 — 드래그
 * 재정렬, 리사이즈, 핸들 재클릭의 메뉴 열기/닫기, 빠른 확장 버튼, 그리고
 * 오버레이 좌표가 표의 실제 경계와 어긋나 셀 클릭을 가로채지 않는지.
 */
import { expect, test } from "@playwright/test";

import { domBlockIds } from "./support/block-order.js";
import {
  blockSelectionToolbar,
  deleteSelectedBlocksButton,
  moveSelectionDownButton,
  moveSelectionUpButton,
} from "./support/block-selection-toolbar.js";
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

// ADR-0013 회귀(Issue #155): useDismissOnOutsideOrEscape의 12개 소비처 중
// 구조가 다른 대표 3곳 중 하나. Table row menu는 이미 `position: fixed`로
// 올바르게 스타일돼 있어(다른 대표 소비처 media-toolbar와 달리 페이지
// layout에 영향을 주지 않는다) 원인 수정을 되돌려도 이 e2e는 계속
// GREEN이다(실측 확인) — Issue #155가 실제로 재현되는 소비처는 아니지만,
// ADR-0013이 요구하는 "바깥 클릭은 예외 없이 dismiss와 클릭 대상의 동작을
// 함께 실행한다" 계약을 이 구조에서도 고정한다.
test("표 행 메뉴가 열린 채로 바깥의 Save JSON을 클릭하면 메뉴가 닫히고 Save JSON도 실행된다(ADR-0013)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);
  const source = page.getByLabel("Document source");
  await expect(source).toHaveValue("");

  await cell(0, 0).hover();
  const rowHandle = page
    .getByRole("button", { name: "Drag to reorder row" })
    .first();
  await expect(rowHandle).toBeVisible();
  await rowHandle.click();
  await expect(
    page.getByRole("menu", { name: "Table row menu" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save JSON" }).click();

  await expect(
    page.getByRole("menu", { name: "Table row menu" }),
  ).not.toBeVisible();
  await expect(source).not.toHaveValue("");
});

test("열 경계를 드래그해 너비를 조절하고 undo 1회로 복원한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);

  await table.locator("tr").first().locator("td").first().hover();
  const resizeHandle = page.locator("[data-geul-table-resize-handle]").first();
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
  const resizeHandle = page.locator("[data-geul-table-resize-handle]").first();
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
  const resizeHandle = page.locator("[data-geul-table-resize-handle]").first();
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
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);
  const addRowButton = page.getByRole("button", { name: "Add row" });
  const addColumnButton = page.getByRole("button", { name: "Add column" });

  // Notion 참고(사용자 요청) — 두 버튼 모두 평소엔 opacity:0이다. 표
  // 가운데 셀에 hover해도 가장 아래 행도 가장 오른쪽 열도 아니라면
  // 둘 다 가려져 있어야 한다(table-handle-helpers.ts
  // computeExpandButtonVisibility).
  await cell(0, 0).hover();
  await expect(addRowButton).toHaveCSS("opacity", "0");
  await expect(addColumnButton).toHaveCSS("opacity", "0");

  // 가장 아래 행(마지막 tr)에 hover하면 Add row만 보인다.
  await cell(2, 0).hover();
  await expect(addRowButton).toHaveCSS("opacity", "1");
  await expect(addColumnButton).toHaveCSS("opacity", "0");
  await addRowButton.click();

  await expect(table.locator("tr")).toHaveCount(4);

  await page.keyboard.press("Control+z");
  await expect(table.locator("tr")).toHaveCount(3);

  // 가장 오른쪽 열(마지막 td)에 hover하면 Add column만 보인다.
  await cell(0, 2).hover();
  await expect(addColumnButton).toHaveCSS("opacity", "1");
  await expect(addRowButton).toHaveCSS("opacity", "0");
  await addColumnButton.click();

  await expect(table.locator("tr").first().locator("td")).toHaveCount(4);

  await page.keyboard.press("Control+z");
  await expect(table.locator("tr").first().locator("td")).toHaveCount(3);
});

test("표 바로 아래 블록으로 마우스가 넘어가면 Add row rail이 사라진다", async ({
  page,
}) => {
  // 재현: HANDLE_HOVER_MARGIN(28px) 여백 안(표 바로 아래 블록 포함)에서
  // hoverRowId가 얼어붙은 채면, 그 블록 위로 마우스가 넘어간 뒤에도 rail이
  // 계속 떠서 그 블록과 겹쳐 보인다(사용자 스크린샷 재현). 문단의
  // "맨 위"를 골라 hover한다 — 문단 중앙은 표 하단에서 28px보다 멀어
  // hoverTableId 자체가 풀리며 클러스터 전체가 사라지므로, 이 테스트가
  // 노리는 "여백 안이지만 다른 블록" 경로를 못 탄다.
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);
  const addRowButton = page.getByRole("button", { name: "Add row" });

  await cell(2, 0).hover();
  await expect(addRowButton).toHaveCSS("opacity", "1");

  await editable
    .locator("p")
    .last()
    .hover({ position: { x: 10, y: 2 } });
  await expect(addRowButton).toHaveCSS("opacity", "0");
});

test("Add row rail이 보일 때 표 바로 아래 블록과 겹치지 않는다", async ({
  page,
}) => {
  // 실측 기반 회귀 방지 — 특정 픽셀값이 아니라 "겹치지 않는다"는
  // 불변식을 직접 확인한다. 나중에 블록 간격(host CSS)이 바뀌어도 이
  // 테스트가 그 변화를 잡아낸다.
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (row: number, column: number) =>
    table.locator("tr").nth(row).locator("td").nth(column);
  const addRowButton = page.getByRole("button", { name: "Add row" });
  const nextBlock = editable.locator("p").last();

  await cell(2, 0).hover();
  await expect(addRowButton).toHaveCSS("opacity", "1");

  const [buttonBox, nextBlockBox] = await Promise.all([
    addRowButton.boundingBox(),
    nextBlock.boundingBox(),
  ]);
  if (buttonBox === null || nextBlockBox === null) {
    throw new Error("Bounding boxes were not available");
  }
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(nextBlockBox.y);
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
      '[data-geul-block-id="before"] > [data-geul-block-group] > [data-geul-block-id="table-1"]',
    ),
  ).toHaveCount(1);

  await page.keyboard.press("Control+z");

  await expect(page.locator("[data-geul-block-group]")).toHaveCount(0);
  await expect(
    editable.locator(':scope > [data-geul-block-id="table-1"]'),
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
      '[data-geul-block-id="toggle-1"] > [data-geul-block-group] > [data-geul-block-id="table-1"]',
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
    editable.locator(':scope > [data-geul-block-id="table-1"]'),
  ).toHaveCount(1);
  await expect(page.locator("[data-geul-block-group]")).toHaveCount(0);

  await page.keyboard.press("Control+z");

  await expect(
    editable.locator(
      '[data-geul-block-id="toggle-1"] > [data-geul-block-group] > [data-geul-block-id="table-1"]',
    ),
  ).toHaveCount(1);
});

// Issue #149 — 표 앞뒤에 형제 문단을 둔 문서. Delete(before/after만 남음)와
// 위로 이동(table-1이 before 앞으로) 두 e2e가 같은 모양을 공유한다.
const tableWithSiblingsDocument = () => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    { id: "before", type: "paragraph", content: [{ text: "before" }] },
    minimalTableBlock("table-1"),
    { id: "after", type: "paragraph", content: [{ text: "after" }] },
  ],
});

// Issue #149, Issue #174 RD-002 — BlockSelectionToolbar(Delete·위/아래
// 이동)를 표에도 여는 유일한 진입점. table-handles.tsx의 표 그립
// 버튼(CONTEXT.md, 옛 Select table 버튼을 대체)이 클릭 시
// selectBlockRange(tableBlockId, tableBlockId)를 커밋하면, 표를 거절하지
// 않는 기존 BlockSelectionToolbar(block-selection-toolbar.tsx)가 그대로
// 뜬다 — 새 toolbar 컴포넌트는 만들지 않는다(01-계획.md "결정").
test("표 그립 버튼을 클릭하면 Block selection 툴바가 뜨고 Delete로 표를 삭제한 뒤 undo 1회로 복원한다 (Issue #149)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await page
    .getByLabel("Document source")
    .fill(JSON.stringify(tableWithSiblingsDocument()));
  await page.getByRole("button", { name: "Load JSON" }).click();

  const table = editable.locator("table");
  await expect(table).toBeVisible();
  // Load JSON 직후 포커스는 그 버튼에 있다 — Control+z가 ProseMirror
  // history에 닿으려면 contenteditable을 먼저 클릭해야 한다(위 Indent/Outdent
  // 테스트와 같은 이유).
  await table.locator("td").first().click();
  await table.locator("td").first().hover();

  await page.getByRole("button", { name: "Table menu" }).click();

  await expect(blockSelectionToolbar(page)).toBeVisible();
  await expect(deleteSelectedBlocksButton(page)).toBeVisible();
  await expect(moveSelectionUpButton(page)).toBeVisible();
  await expect(moveSelectionDownButton(page)).toBeVisible();

  await deleteSelectedBlocksButton(page).click();

  await expect(blockSelectionToolbar(page)).toHaveCount(0);
  expect(await domBlockIds(editable)).toEqual(["before", "after"]);

  await page.keyboard.press("Control+z");

  expect(await domBlockIds(editable)).toEqual(["before", "table-1", "after"]);
  await expect(editable.locator("table")).toBeVisible();
});

// Issue #65 항목3 — actionError(alert)가 메뉴 항목보다 먼저 렌더되면, 실패
// 직후 같은 화면 좌표를 재클릭할 때 알림이 밀어낸 다른 항목이 맞아떨어진다.
// 실패는 disabled 가드가 없는 진짜 UI 클릭("Text color None"을 색 없는
// 셀에 누르면 COMMAND_NOT_APPLICABLE)으로 유발한다(테스트 파일 상단의
// 표 핸들 헬퍼 패턴을 그대로 따른다).
//
// 뷰포트를 넉넉히 키운다(기본 1280×720) — 표 행 메뉴는 항목·색상 팔레트
// 둘 다 가진 가장 긴 메뉴라 기본 뷰포트에서는 알림이 추가하는 높이만으로도
// useClampedMenuPosition의 ResizeObserver가 패널 전체를 위로 재클램프한다
// (PIT-0011, 알림 위치와 무관하게 항상 있는 동작 — 계획의 "적용 함정" 절).
// 그 재클램프는 패널 전체를 균일하게 밀어 항목 "사이" 상대 위치는 그대로
// 두지만, 이 테스트가 재사용하는 절대 화면 좌표까지 함께 밀려 이 테스트가
// 검증하려는 것(알림 앞/뒤 배치로 인한 상대 위치 이동)과 뒤섞인다. 뷰포트를
// 키워 클램프가 아예 발동하지 않게 해 그 혼입을 제거한다. test.describe로
// 감싸 이 뷰포트 override가 이 파일의 다른 테스트로 새지 않게 한다.
test.describe("실패 알림 위치 재현(Issue #65)", () => {
  test.use({ viewport: { width: 1280, height: 1400 } });

  test("실패 알림이 뜬 뒤에도 다른 메뉴 항목의 좌표가 그대로 유지되고 재클릭이 그 항목에 맞아떨어진다", async ({
    page,
  }) => {
    const { editable } = await openDemo(page);
    const table = await insertTable(page, editable);

    await table.locator("tr").first().locator("td").first().hover();
    const rowHandle = page
      .getByRole("button", { name: "Drag to reorder row" })
      .first();
    await expect(rowHandle).toBeVisible();
    await rowHandle.click();

    const menu = page.getByRole("menu", { name: "Table row menu" });
    await expect(menu).toBeVisible();
    const deleteRowItem = page.getByRole("menuitem", { name: "Delete row" });
    await expect(deleteRowItem).toBeEnabled();
    const boxBeforeFailure = await deleteRowItem.boundingBox();
    if (boxBeforeFailure === null) {
      throw new Error("Delete row 좌표를 읽지 못했다(실패 전)");
    }

    // 새로 삽입한 표라 첫 행에는 아직 글자색이 없다 — "None" 클릭은
    // disabled 가드 없이 그냥 클릭돼 문서를 바꾸지 못한 채
    // COMMAND_NOT_APPLICABLE로 거절된다.
    await page.getByRole("menuitem", { name: "Text color None" }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText("Action failed");

    const boxAfterFailure = await deleteRowItem.boundingBox();
    if (boxAfterFailure === null) {
      throw new Error("Delete row 좌표를 읽지 못했다(실패 후)");
    }
    // 완료 조건 1 — 알림이 뜨기 전/후로 다른 항목의 좌표가 바뀌지 않는다.
    expect(boxAfterFailure).toEqual(boxBeforeFailure);

    // 실패 전에 읽어둔 좌표를 그대로 재클릭한다 — 알림이 항목 앞으로
    // 렌더돼 있었다면 이 좌표는 밀려난 다른 항목(예: Insert row below)을
    // 맞히게 된다. Delete row가 여전히 그 자리에서 반응하는지는 성공적인
    // 삭제(메뉴가 닫히고 행이 2개로 준다)로 확인한다 — 엉뚱한 항목이
    // 반응했다면 메뉴가 열린 채로 남거나 행 수가 다르게 바뀐다.
    await page.mouse.click(
      boxBeforeFailure.x + boxBeforeFailure.width / 2,
      boxBeforeFailure.y + boxBeforeFailure.height / 2,
    );

    await expect(menu).not.toBeVisible();
    await expect(table.locator("tr")).toHaveCount(2);
  });
});

// Issue #65 항목3 단계-3 결함 탐지에서 발견 — 위 describe의 sticky footer
// 1차 구현은 alert 유무와 무관하게 항상 보이는 것은 맞았지만, 메뉴가 실제로
// overflow-y: auto로 스크롤되는 상태에서는 sticky alert가 스크롤되는 마지막
// 항목 위에 그대로 겹쳐 그려 그 항목의 클릭을 가로챘다(G-UI-001이 보장하는
// "viewport보다 큰 overlay" 상황에서 정확히 재현). alert를
// .geul-menu-panel__scroll 밖 고정 슬롯(별도 flex 자식)으로 옮겨 스크롤
// 영역과 항상 배타적인 공간을 갖게 고쳤다 — 이 테스트는 그 겹침이 다시
// 생기지 않는지를 실제 스크롤 상태에서 확인한다.
test.describe("실패 알림이 스크롤 콘텐츠를 가리지 않는다(Issue #65)", () => {
  // max-height: calc(100vh - 1rem) 안에 항목+색상 팔레트 2벌이 다 들어가지
  // 못할 만큼 뷰포트를 낮춰 실제 오버플로(스크롤)를 강제한다(진단 확인:
  // 이 크기에서 .geul-menu-panel__scroll의 scrollHeight가 clientHeight보다
  // 64px 크다).
  test.use({ viewport: { width: 1280, height: 320 } });

  test("메뉴가 열리자마자(스크롤 전) 뷰포트 하단에 걸린 콘텐츠가 실패 알림에 가려지지 않는다", async ({
    page,
  }) => {
    const { editable } = await openDemo(page);
    const table = await insertTable(page, editable);

    await table.locator("tr").first().locator("td").first().hover();
    const rowHandle = page
      .getByRole("button", { name: "Drag to reorder row" })
      .first();
    await expect(rowHandle).toBeVisible();
    await rowHandle.click();

    const menu = page.getByRole("menu", { name: "Table row menu" });
    await expect(menu).toBeVisible();

    // 새로 삽입한 표라 첫 행에는 아직 글자색이 없다 — "None" 클릭은
    // disabled 가드 없이 그냥 클릭돼 COMMAND_NOT_APPLICABLE로 거절된다
    // (위 describe와 같은 재현 패턴).
    await page.getByRole("menuitem", { name: "Text color None" }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText("Action failed");

    // 스크롤을 전혀 하지 않은 기본 상태(scrollTop 0)가 재현 조건의
    // 핵심이다 — sticky footer 1차 구현(단계-3 결함 탐지에서 발견)은
    // 스크롤이 실제로 필요한 상태가 되자마자, 사용자가 스크롤하지 않아도
    // alert가 뷰포트 하단에 곧바로 겹쳐 그 지점의 콘텐츠를 가렸다. 맨
    // 아래로 스크롤해버리면 sticky의 고정 오프셋과 자연 흐름 위치가
    // 일치해 오히려 겹침이 사라지므로(재현 실패), 스크롤하지 않는다.
    const scrollArea = menu.locator(".geul-menu-panel__scroll");
    expect(await scrollArea.evaluate((el) => el.scrollTop)).toBe(0);
    const overflowPx = await scrollArea.evaluate(
      (el) => el.scrollHeight - el.clientHeight,
    );
    expect(overflowPx).toBeGreaterThan(0);

    // 확인 지점은 .geul-menu-panel(바깥 패널)이 아니라 실제 스크롤
    // 컨테이너(.geul-menu-panel__scroll) 기준이어야 한다 — 패널 자신의
    // padding(0.25rem)만큼 바깥 패널의 하단 경계와 실제 콘텐츠(alert
    // 포함) 하단 경계가 어긋난다.
    const scrollBox = await scrollArea.boundingBox();
    if (scrollBox === null) {
      throw new Error("스크롤 영역 좌표를 읽지 못했다");
    }
    // 스크롤 영역 하단 경계 바로 위 지점 — 겹침이 있었다면 여기가 정확히
    // alert가 그려지는 자리다(단계-3 결함 탐지의 elementFromPoint 재현과
    // 같은 지점). 폭 방향으로 세 지점을 확인해 우연한 통과를 줄인다.
    const probeY = scrollBox.y + scrollBox.height - 5;
    for (const fraction of [0.2, 0.5, 0.8]) {
      const probeX = scrollBox.x + scrollBox.width * fraction;
      const roleAtProbe = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("role"),
        { x: probeX, y: probeY },
      );
      expect(roleAtProbe).not.toBe("alert");
    }
  });
});

test("표 그립 버튼을 클릭한 뒤 위로 이동 버튼으로 표가 앞 형제 앞으로 이동하고 undo 1회로 복원된다 (Issue #149)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await page
    .getByLabel("Document source")
    .fill(JSON.stringify(tableWithSiblingsDocument()));
  await page.getByRole("button", { name: "Load JSON" }).click();

  const table = editable.locator("table");
  await expect(table).toBeVisible();
  await table.locator("td").first().click();
  await table.locator("td").first().hover();

  await page.getByRole("button", { name: "Table menu" }).click();
  await expect(blockSelectionToolbar(page)).toBeVisible();

  await moveSelectionUpButton(page).click();

  expect(await domBlockIds(editable)).toEqual(["table-1", "before", "after"]);

  await page.keyboard.press("Control+z");

  expect(await domBlockIds(editable)).toEqual(["before", "table-1", "after"]);
});
