import { expect, test } from "@playwright/test";

const openDemo = async (page: Parameters<typeof test>[0]["page"]) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  return { editor, editable };
};

test("JSON·HTML·markdown을 편집하고 복원한다", async ({ page }) => {
  const { editor, editable } = await openDemo(page);
  const source = page.getByLabel("Document source");

  await editable.fill("Hello R0");
  await page.getByRole("button", { name: "Save JSON" }).click();
  await expect(source).toContainText("Hello R0");
  const json = await source.inputValue();

  await editable.fill("Temporary JSON text");
  await source.fill(json);
  await page.getByRole("button", { name: "Load JSON" }).click();
  await expect(editor).toContainText("Hello R0");
  await expect(editor).not.toContainText("Temporary JSON text");

  await page.getByRole("button", { name: "Export HTML" }).click();
  await expect(source).toHaveValue(/<p[^>]*>Hello R0<\/p>/);
  const html = await source.inputValue();

  await editable.fill("Temporary HTML text");
  await source.fill(html);
  await page.getByRole("button", { name: "Import HTML" }).click();
  await expect(editor).toContainText("Hello R0");
  await expect(editor).not.toContainText("Temporary HTML text");

  await page.getByRole("button", { name: "Export GFM strict" }).click();
  await expect(source).toHaveValue(/^Hello R0\s*$/);
  const markdown = await source.inputValue();

  await editable.fill("Temporary GFM text");
  await source.fill(markdown);
  await page.getByRole("button", { name: "Import GFM" }).click();
  await expect(editor).toContainText("Hello R0");
  await expect(editor).not.toContainText("Temporary GFM text");
});

test("화면의 가져오기·내보내기 컨트롤을 거쳐 위험한 HTML을 정화한다", async ({
  page,
}) => {
  const { editor } = await openDemo(page);
  const source = page.getByLabel("Document source");
  await source.fill(
    '<p data-be-block-id="safe" onclick="alert(1)" style="position:fixed"><a href="javascript:alert(1)">Unsafe link</a><img src=x onerror="alert(1)">Visible text</p><script>alert(1)</script>',
  );

  await page.getByRole("button", { name: "Import HTML" }).click();
  await expect(editor).toContainText("Unsafe linkVisible text");
  await expect(page.getByLabel("Conversion feedback")).toContainText(
    "UNSAFE_ELEMENT_REMOVED",
  );
  await expect(page.getByLabel("Conversion feedback")).toContainText(
    "UNSAFE_ATTRIBUTE_REMOVED",
  );
  await expect(page.getByLabel("Conversion feedback")).toContainText(
    "UNSAFE_URL_REMOVED",
  );
  await page.getByRole("button", { name: "Export HTML" }).click();

  const exported = await source.inputValue();
  expect(exported).toContain("Unsafe linkVisible text");
  expect(exported).not.toMatch(
    /script|onclick|onerror|javascript:|position\s*:|<img/i,
  );
});

test("병합된 표를 에디터에 로드하고 strict GFM은 거절, lossy GFM은 성공한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const source = page.getByLabel("Document source");
  const feedback = page.getByLabel("Conversion feedback");
  const tableHtml =
    '<table data-be-block-id="table-e2e"><thead><tr data-be-row-id="row-head"><th data-be-cell-id="cell-head" colspan="2">Header</th></tr></thead><tbody><tr data-be-row-id="row-body"><td data-be-cell-id="cell-left">Left</td><td data-be-cell-id="cell-right">Right</td></tr></tbody></table>';

  await editable.fill("Editor stays intact");
  await source.fill(tableHtml);
  await page.getByRole("button", { name: "Import HTML" }).click();

  // 슬라이스 12: 표 문서 로드 차단이 풀려 병합 표가 에디터에 직접 로드된다.
  await expect(feedback).toContainText("HTML conversion succeeded.");
  const importedTable = editable.locator("table");
  await expect(importedTable).toHaveCount(1);
  await expect(importedTable).toContainText("Header");
  await expect(importedTable).toContainText("Left");
  await expect(
    importedTable.locator('td[colspan="2"], th[colspan="2"]'),
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Export GFM strict" }).click();
  await expect(feedback).toContainText("Strict GFM export failed.");
  await expect(feedback).toContainText("MARKDOWN_LOSS_NOT_ALLOWED");
  await expect(feedback).toContainText("MERGED_CELL");
  await expect(source).toHaveValue(tableHtml);

  await page.getByRole("button", { name: "Export GFM lossy" }).click();
  await expect(feedback).toContainText("Lossy GFM export succeeded.");
  await expect(feedback).toContainText("MERGED_CELL");
  await expect(feedback).toContainText('"blockId": "table-e2e"');
  await expect(feedback).toContainText('"rowId": "row-head"');
  await expect(feedback).toContainText('"cellId": "cell-head"');
  await expect(source).toHaveValue(/\| Header\s+\|/);
});

test("순서가 뒤집힌 앵커도 브라우저 그리드 순서로 내보내고 걸친 헤더 메타데이터를 보존한다", async ({
  page,
}) => {
  await openDemo(page);
  const source = page.getByLabel("Document source");
  const tableDocument = {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "browser-table",
        type: "table",
        columns: [
          { id: "browser-column-1", width: 160 },
          { id: "browser-column-2", width: 160 },
        ],
        rows: [
          {
            id: "browser-row-1",
            cells: [
              {
                id: "browser-cell-2",
                columnId: "browser-column-2",
                rowSpan: 1,
                columnSpan: 1,
                content: [{ text: "Column header" }],
              },
              {
                id: "browser-cell-1",
                columnId: "browser-column-1",
                rowSpan: 2,
                columnSpan: 1,
                content: [{ text: "Crossing header" }],
              },
            ],
          },
          {
            id: "browser-row-2",
            cells: [
              {
                id: "browser-cell-3",
                columnId: "browser-column-2",
                rowSpan: 1,
                columnSpan: 1,
                content: [{ text: "Body" }],
              },
            ],
          },
        ],
        headerRows: 1,
        headerColumns: 1,
      },
    ],
  };

  await source.fill(JSON.stringify(tableDocument));
  await page.getByRole("button", { name: "Load JSON" }).click();
  await page.getByRole("button", { name: "Export HTML" }).click();
  const html = await source.inputValue();
  const browserLayout = await page.evaluate((value) => {
    const template = document.createElement("template");
    template.innerHTML = value;
    const table = template.content.querySelector("table");
    const firstRow = table?.rows[0];
    return {
      headerRows: table?.getAttribute("data-be-header-rows"),
      headerColumns: table?.getAttribute("data-be-header-columns"),
      hasThead: table?.tHead !== null,
      bodyCount: table?.tBodies.length,
      firstRowCells: Array.from(firstRow?.cells ?? []).map((cell) => ({
        text: cell.textContent,
        rowSpan: cell.rowSpan,
        tagName: cell.tagName,
      })),
    };
  }, html);

  expect(browserLayout).toEqual({
    headerRows: "1",
    headerColumns: "1",
    hasThead: false,
    bodyCount: 1,
    firstRowCells: [
      { text: "Crossing header", rowSpan: 2, tagName: "TH" },
      { text: "Column header", rowSpan: 1, tagName: "TH" },
    ],
  });

  await source.fill(html);
  await page.getByRole("button", { name: "Import HTML" }).click();
  await page.getByRole("button", { name: "Save JSON" }).click();
  const roundTripped = JSON.parse(await source.inputValue());
  expect(roundTripped.blocks[0]).toMatchObject({
    headerRows: 1,
    headerColumns: 1,
    rows: [
      {
        cells: [
          { id: "browser-cell-1", columnId: "browser-column-1", rowSpan: 2 },
          { id: "browser-cell-2", columnId: "browser-column-2", rowSpan: 1 },
        ],
      },
      { cells: [{ id: "browser-cell-3", columnId: "browser-column-2" }] },
    ],
  });
});
