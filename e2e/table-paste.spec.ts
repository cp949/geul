/**
 * 클립보드 붙여넣기로 표가 만들어지는 실제 브라우저 동작을 검증한다.
 * Google Sheets/Excel HTML(서식 포함), TSV, 탭 없는 일반 텍스트를 함께 다룬다.
 */
import { expect, type Page, test } from "@playwright/test";

/** demo를 열고 편집 가능한 영역이 준비될 때까지 기다린다. */
const openDemo = async (page: Page) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  return { editor, editable };
};

/**
 * 대상 엘리먼트에 ClipboardEvent("paste")를 직접 디스패치한다.
 * 실제 브라우저의 클립보드 접근 권한 없이도 text/html·text/plain 붙여넣기를 재현한다.
 *
 * Firefox는 ClipboardEvent 생성자의 clipboardData 초기값을 합성(untrusted)
 * 이벤트에 반영하지 않는다 — clipboardData 자체는 null이 아니지만 types가
 * 빈 배열로 나온다. 대신 평범한 Event에 clipboardData를 defineProperty로
 * 얹으면 세 엔진(Chromium/Firefox/WebKit) 모두 types가 채워진다.
 */
const dispatchPaste = (
  target: Element,
  input: { html?: string; text?: string },
): void => {
  const data = new DataTransfer();
  if (input.html !== undefined) data.setData("text/html", input.html);
  if (input.text !== undefined) data.setData("text/plain", input.text);
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: data,
    configurable: true,
  });
  target.dispatchEvent(event);
};

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

test("Excel 대표 HTML을 표 밖에 붙이면 서식이 있는 표가 생긴다 @core", async ({
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

test("표 앞뒤에 문단이 섞인 HTML은 표를 만들지 않고 문단을 보존한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();

  const mixedHtml =
    "<p>intro</p>" +
    "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>" +
    "<p>outro</p>";

  await editable.evaluate(dispatchPaste, { html: mixedHtml });

  // 표가 fragment의 유일한 실질 콘텐츠가 아니므로 가로채지 않는다(spec
  // §4.1, Issue #37) — NOT_TABULAR로 Tiptap 기본 붙여넣기에 넘겨 표 노드를
  // 만들지 않고(표 세 노드는 parseHTML을 정의하지 않는다) intro/outro
  // 문단을 보존한다.
  await expect(editable.locator("table")).toHaveCount(0);
  await expect(editable).toContainText("intro");
  await expect(editable).toContainText("outro");
});
