/**
 * 클립보드 붙여넣기로 표가 만들어지는 실제 브라우저 동작을 검증한다.
 * Google Sheets/Excel HTML(서식 포함), TSV, 탭 없는 일반 텍스트, 표와
 * 문단이 섞인 혼합 HTML(Issue #71, 문단·표 구조 모두 무손실 보존)을
 * 함께 다룬다. 여러 셀을 고른 상태(CellSelection)에 서식 있는 html을 붙이는
 * 경로(Issue #308)도 실제 브라우저에서 확인한다.
 */
import { expect, test } from "@playwright/test";

import { dispatchPaste } from "./support/clipboard.js";
import { insertTable, openDemo } from "./support/demo.js";
import { dragSelectCells } from "./support/table-selection.js";

test("Google Sheets 대표 HTML을 표 밖에 붙이면 서식이 있는 표가 생긴다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();

  const googleSheetsHtml =
    "<google-sheets-html-origin>" +
    '<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" ' +
    'style="table-layout:fixed;font-size:10pt;font-family:Arial;border-collapse:collapse;border:none">' +
    '<colgroup><col width="100"/><col width="100"/></colgroup><tbody>' +
    '<tr style="height:21px;">' +
    '<td style="overflow:hidden;padding:2px 3px;font-weight:bold;background-color:#FF0000;text-align:center;">Name</td>' +
    '<td style="overflow:hidden;padding:2px 3px;text-align:right;">Score</td>' +
    "</tr>" +
    '<tr style="height:21px;">' +
    '<td style="overflow:hidden;padding:2px 3px;">Alice</td>' +
    '<td style="overflow:hidden;padding:2px 3px;text-align:right;">90</td>' +
    "</tr></tbody></table>";

  await editable.evaluate(dispatchPaste, { html: googleSheetsHtml });

  const table = editable.locator("table");
  await expect(table).toHaveCount(1);
  const cells = table.locator("td");
  await expect(cells.nth(0)).toContainText("Name");
  await expect(cells.nth(2)).toContainText("Alice");
  await expect(cells.nth(3)).toContainText("90");
  await expect(cells.nth(3)).toHaveCSS("text-align", "right");
});

test("Excel 대표 HTML을 표 밖에 붙이면 서식이 있는 표가 생긴다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();

  // Excel은 background-color 대신 background 축약형을 쓰고 mso-* 선언과
  // 조건부 주석을 함께 심는다. 마크업 들여쓰기가 셀 텍스트 노드에 그대로
  // 실리는 것도 Excel 클립보드 HTML의 실제 특징이다.
  const excelHtml =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel">' +
    "<head><meta name=ProgId content=Excel.Sheet>" +
    "<style>.xl65 {background:#FFFF00;}</style></head><body>" +
    "<table border=0 cellpadding=0 cellspacing=0 width=128 " +
    "style='border-collapse:collapse;width:96pt'>" +
    "<!--StartFragment-->" +
    "<col width=64 style='width:48pt'><col width=64 style='width:48pt'>" +
    "<tr height=20 style='height:15.0pt'>" +
    "<td height=20 style='height:15.0pt;background:#FFFF00;color:#FF0000;" +
    "mso-number-format:General'>\n\tName\t</td>" +
    "<td style='text-align:right;mso-number-format:General'>Score</td></tr>" +
    "<tr height=20 style='height:15.0pt'>" +
    "<td height=20 style='height:15.0pt'>Alice</td>" +
    "<td style='text-align:right'>90</td></tr>" +
    "<!--EndFragment--></table></body></html>";

  await editable.evaluate(dispatchPaste, { html: excelHtml });

  const table = editable.locator("table");
  await expect(table).toHaveCount(1);
  const cells = table.locator("td");
  await expect(cells).toHaveCount(4);
  await expect(cells.nth(0)).toHaveText("Name");
  await expect(cells.nth(0)).toHaveCSS("background-color", "rgb(255, 255, 0)");
  await expect(cells.nth(0)).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(cells.nth(1)).toHaveCSS("text-align", "right");
  await expect(cells.nth(2)).toContainText("Alice");
  await expect(cells.nth(3)).toContainText("90");
});

test("Excel 대표 HTML을 기존 표 안에 붙이면 좌상단부터 서식과 함께 덮어쓴다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/table");
  await expect(page.getByRole("option", { name: /Table/ })).toBeVisible();
  await page.keyboard.press("Enter");

  const table = editable.locator("table");
  await expect(table).toBeVisible();
  // 슬래시 메뉴 기본 표는 3x3이다 — 2x2 fixture로 덮어써도 새 표를 만들지
  // 않고 크기가 유지되는지 함께 확인한다.
  await expect(table.locator("tr")).toHaveCount(3);
  await expect(table.locator("tr").first().locator("td")).toHaveCount(3);

  await table.locator("td").first().click();

  const excelHtml =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel">' +
    "<head><meta name=ProgId content=Excel.Sheet>" +
    "<style>.xl65 {background:#FFFF00;}</style></head><body>" +
    "<table border=0 cellpadding=0 cellspacing=0 width=128 " +
    "style='border-collapse:collapse;width:96pt'>" +
    "<!--StartFragment-->" +
    "<col width=64 style='width:48pt'><col width=64 style='width:48pt'>" +
    "<tr height=20 style='height:15.0pt'>" +
    "<td height=20 style='height:15.0pt;background:#FFFF00;color:#FF0000;" +
    "mso-number-format:General'>\n\tName\t</td>" +
    "<td style='text-align:right;mso-number-format:General'>Score</td></tr>" +
    "<tr height=20 style='height:15.0pt'>" +
    "<td height=20 style='height:15.0pt'>Alice</td>" +
    "<td style='text-align:right'>90</td></tr>" +
    "<!--EndFragment--></table></body></html>";

  await editable.evaluate(dispatchPaste, { html: excelHtml });

  // 표는 여전히 1개, 크기도 그대로 3x3 — 새 표를 만들지 않고 기존 표를
  // 덮어썼다(TBL-014).
  await expect(editable.locator("table")).toHaveCount(1);
  await expect(table.locator("tr")).toHaveCount(3);
  await expect(table.locator("tr").first().locator("td")).toHaveCount(3);

  const firstRowCells = table.locator("tr").first().locator("td");
  await expect(firstRowCells.nth(0)).toHaveText("Name");
  await expect(firstRowCells.nth(0)).toHaveCSS(
    "background-color",
    "rgb(255, 255, 0)",
  );
  await expect(firstRowCells.nth(0)).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(firstRowCells.nth(1)).toHaveText("Score");
  await expect(firstRowCells.nth(1)).toHaveCSS("text-align", "right");
  // fixture가 채우지 못한 3번째 열은 비어 있는 채로 남는다.
  await expect(firstRowCells.nth(2)).toHaveText("");

  const secondRowCells = table.locator("tr").nth(1).locator("td");
  await expect(secondRowCells.nth(0)).toHaveText("Alice");
  await expect(secondRowCells.nth(1)).toHaveText("90");
  await expect(secondRowCells.nth(1)).toHaveCSS("text-align", "right");

  // fixture가 채우지 못한 3번째 행은 비어 있는 채로 남는다.
  await expect(table.locator("tr").last().locator("td").first()).toHaveText("");

  // 단일 트랜잭션 교체 계약(AC-02) — undo 1회로 붙여넣기 전 상태로 복원된다.
  await page.keyboard.press("Control+z");
  await expect(firstRowCells.nth(0)).toHaveText("");
});

test("TSV를 표 밖에 붙이면 서식 없는 표가 생긴다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();

  await editable.evaluate(dispatchPaste, { text: "a\tb\nc\td" });

  const table = editable.locator("table");
  await expect(table).toHaveCount(1);
  await expect(table.locator("td")).toHaveCount(4);
  await expect(table.locator("td").nth(3)).toContainText("d");
});

test("탭 없는 일반 텍스트 붙여넣기는 표를 만들지 않는다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();

  await editable.evaluate(dispatchPaste, { text: "hello world" });

  await expect(editable.locator("table")).toHaveCount(0);
  await expect(editable.locator("p").first()).toContainText("hello world");
});

test("표 2개가 있는 HTML을 표 밖에 붙이면 두 표 모두 문서에 생긴다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();

  const twoTablesHtml =
    "<table><tbody><tr><td>A1</td><td>A2</td></tr></tbody></table>" +
    "<table><tbody><tr><td>B1</td><td>B2</td></tr></tbody></table>";

  await editable.evaluate(dispatchPaste, { html: twoTablesHtml });

  // 형제 최상위 데이터 표가 각각 독립된 <table> 노드로 문서 순서대로
  // 남는다(Issue #73, spec §4.1 구현 반영) — 두 번째 표가 첫 표 안으로
  // 흡수되거나 텍스트로 뭉개지지 않는다.
  const tables = editable.locator("table");
  await expect(tables).toHaveCount(2);

  const firstCells = tables.nth(0).locator("td");
  await expect(firstCells).toHaveCount(2);
  await expect(firstCells.nth(0)).toHaveText("A1");
  await expect(firstCells.nth(1)).toHaveText("A2");

  const secondCells = tables.nth(1).locator("td");
  await expect(secondCells).toHaveCount(2);
  await expect(secondCells.nth(0)).toHaveText("B1");
  await expect(secondCells.nth(1)).toHaveText("B2");
});

test("표 앞뒤에 문단이 섞인 HTML은 문단과 표 구조를 모두 보존한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();

  const mixedHtml =
    "<p>intro</p>" +
    "<table><tbody><tr><td>cellA</td><td>cellB</td></tr>" +
    "<tr><td>cellC</td><td>cellD</td></tr></tbody></table>" +
    "<p>outro</p>";

  // 실제 붙여넣기 이벤트는 항상 text/html과 text/plain을 함께 담는다.
  await editable.evaluate(dispatchPaste, {
    html: mixedHtml,
    text: "intro\ncellA\tcellB\ncellC\tcellD\noutro",
  });

  // 표가 실제 <table> 노드로 살아남는다 — 셀·행 경계가 더 이상 하나의
  // 인라인 런으로 뭉개지지 않는다(Issue #71, spec §4.1 구현 반영).
  const table = editable.locator("table");
  await expect(table).toHaveCount(1);
  const cells = table.locator("td");
  await expect(cells).toHaveCount(4);
  await expect(cells.nth(0)).toHaveText("cellA");
  await expect(cells.nth(1)).toHaveText("cellB");
  await expect(cells.nth(2)).toHaveText("cellC");
  await expect(cells.nth(3)).toHaveText("cellD");

  // 표 앞뒤 문단도 그대로 보존된다. 표 밖 붙여넣기는 커서가 있던 블록을
  // 지우지 않고 그 뒤에 새 블록을 잇는 기존 계약이다(table-commands.test.ts
  // "블록 전체를 선택하고 호출하면 내용을 지우고 빈 문단 뒤에 표를
  // 만든다"와 동일) — 그래서 데모가 기본으로 갖는 빈 문단이 맨 앞에 그대로
  // 남고, 그 뒤로 문단·표·문단이 이어진다.
  // D19(컨테이너 스키마)부터 문단은 blockContainer(<div data-geul-block-id>)로
  // 감싸이고 표만 컨테이너 없이 그대로 들어간다(DELTA-02e 정정) — 편집기
  // 루트의 직속 자식은 이제 div/div/table/div다.
  const blockTags = await editable.evaluate((node) =>
    Array.from(node.children).map((child) => child.tagName.toLowerCase()),
  );
  expect(blockTags).toEqual(["div", "div", "table", "div"]);
  await expect(editable.locator("p").nth(1)).toHaveText("intro");
  await expect(editable.locator("p").last()).toHaveText("outro");

  // 붙여넣기 전체가 undo 1회로 복원된다(문단+표 삽입이 한 트랜잭션).
  // 표만 사라졌는지 보면 문단 삽입이 별도 history 이벤트로 갈라져 intro/outro가
  // 남는 경우를 놓친다 — 삽입 전 블록 구성으로 완전히 되돌아왔는지 확인한다.
  await page.keyboard.press("Control+z");
  await expect(editable.locator("table")).toHaveCount(0);
  await expect
    .poll(() =>
      editable.evaluate((node) =>
        Array.from(node.children).map((child) => child.tagName.toLowerCase()),
      ),
    )
    .toEqual(["div"]);
  await expect(editable.locator("p")).toHaveText("");
});

test("표 앞 문단의 자기 style 색은 붙여넣은 뒤 그 문단 블록의 textColor로 남는다", async ({
  page,
}) => {
  // 수정 전에는 클립보드 파서가 표 옆 p의 style을 읽지 않아 색이
  // 사라졌다(Issue #343). 블록 색은 편집 화면에 시각 렌더가 없어
  // "Save JSON"으로 읽은 문서 값으로 확인한다(block-handle.spec.ts와 같은 패턴).
  const { editable } = await openDemo(page);
  await editable.click();

  const mixedHtml =
    '<p style="color:#0000FF">P</p>' +
    "<table><tbody><tr><td>cellA</td><td>cellB</td></tr>" +
    "<tr><td>cellC</td><td>cellD</td></tr></tbody></table>";

  await editable.evaluate(dispatchPaste, {
    html: mixedHtml,
    text: "P\ncellA\tcellB\ncellC\tcellD",
  });
  await expect(editable.locator("table")).toHaveCount(1);
  await expect(editable.locator("p").nth(1)).toHaveText("P");

  await page.getByRole("button", { name: "Save JSON" }).click();
  const saved = JSON.parse(
    await page.getByLabel("Document source").inputValue(),
  ) as { blocks: Array<{ type: string; textColor?: string }> };
  // 데모 기본 빈 문단 뒤에 P 문단과 표가 이어진다. 표 뒤 블록은 보지 않는다.
  expect(saved.blocks.slice(0, 3).map((block) => block.type)).toEqual([
    "paragraph",
    "paragraph",
    "table",
  ]);
  expect(saved.blocks[1]?.textColor).toBe("#0000FF");
});

test("표 셀 안 캐럿에 목록과 표가 든 html을 붙이면 목록 글자가 좌상단 셀에 줄로 남는다", async ({
  page,
}) => {
  // 수정 전에는 표 안 분기가 목록 항목을 버려 L1·L2가 무신호로 사라졌다
  // (Issue #345). 이제 목록 항목은 문단처럼 셀 줄이 된다.
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const firstRowCells = table.locator("tr").first().locator("td");

  await firstRowCells.first().click();
  await editable.evaluate(dispatchPaste, {
    html:
      "<ul><li>L1</li><li>L2</li></ul>" +
      "<table><tbody><tr><td>a</td><td>b</td></tr>" +
      "<tr><td>c</td><td>d</td></tr></tbody></table>",
    text: "L1\nL2\na\tb\nc\td",
  });

  await expect(editable.locator("table")).toHaveCount(1);
  // 셀 안 줄바꿈은 hardBreak라 innerText가 줄 사이를 줄바꿈으로 읽는다.
  await expect(firstRowCells.nth(0)).toHaveText(/^L1\s*L2\s*a$/);
  await expect(firstRowCells.nth(1)).toHaveText("b");
  await expect(table.locator("tr").nth(1).locator("td").nth(0)).toHaveText("c");
  await expect(table.locator("tr").nth(1).locator("td").nth(1)).toHaveText("d");
});

test("여러 셀을 고르고 서식 있는 html을 붙이면 첫 셀에 굵은 글자가 들어가고 나머지 선택 셀은 비며 셀 id가 유지된다", async ({
  page,
}) => {
  // 수정 전에는 prosemirror-tables가 cellId 없는 셀을 만들어 되돌림 guard가
  // 붙여넣기를 지웠다(Issue #308). 문서가 그대로 A|B|C로 남았다.
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const cell = (column: number) =>
    table.locator("tr").first().locator("td").nth(column);

  for (const [column, text] of ["A", "B", "C"].entries()) {
    await cell(column).click();
    await page.keyboard.type(text);
  }
  await expect(cell(2)).toHaveText("C");
  const idsBefore = await table
    .locator("tr")
    .first()
    .locator("td")
    .evaluateAll((cells) =>
      cells.map((node) => node.getAttribute("data-geul-cell-id")),
    );
  expect(idsBefore.every((id) => id !== null && id.length > 0)).toBe(true);

  // 드래그 전 클릭으로 포커스를 표 안에 둔다(table-cell-selection.spec.ts와
  // 같은 이유: 첫 포커스 mousedown은 CellSelection 추적을 시작하지 않을 수 있다).
  await cell(0).click();
  await dragSelectCells(page, cell(0), cell(1));
  await expect(
    page.getByRole("toolbar", { name: "Table selection" }),
  ).toBeVisible();

  await editable.evaluate(dispatchPaste, { html: "<b>x</b>", text: "ab" });

  await expect(cell(0)).toHaveText("x");
  await expect(cell(0).locator("strong")).toHaveText("x");
  await expect(cell(1)).toHaveText("");
  await expect(cell(2)).toHaveText("C");
  await expect(editable.locator("table")).toHaveCount(1);
  const idsAfter = await table
    .locator("tr")
    .first()
    .locator("td")
    .evaluateAll((cells) =>
      cells.map((node) => node.getAttribute("data-geul-cell-id")),
    );
  expect(idsAfter).toEqual(idsBefore);
});
