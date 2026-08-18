/**
 * 클립보드 붙여넣기로 표가 만들어지는 실제 브라우저 동작을 검증한다.
 * Google Sheets HTML(서식 포함), TSV, 탭 없는 일반 텍스트를 함께 다룬다.
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
 */
const dispatchPaste = (
  target: Element,
  input: { html?: string; text?: string },
): void => {
  const data = new DataTransfer();
  if (input.html !== undefined) data.setData("text/html", input.html);
  if (input.text !== undefined) data.setData("text/plain", input.text);
  target.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    }),
  );
};

test("Google Sheets 대표 HTML을 표 밖에 붙이면 서식이 있는 표가 생긴다", async ({
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
