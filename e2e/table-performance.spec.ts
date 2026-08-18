/**
 * 100×100(10,000셀) TSV 붙여넣기의 실제 브라우저 wall-clock 성능을 기록한다.
 * spec 13 "10,000셀 fixture의 선택, 붙여넣기, undo" 최초 기준선 측정용이다.
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

/** rows×columns 크기의 TSV 텍스트를 만든다. 셀 값은 "row-column" 형태다. */
const buildTsv = (rows: number, columns: number): string =>
  Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => `${row}-${column}`).join(
      "\t",
    ),
  ).join("\n");

test("10,000셀 표 로드·선택·붙여넣기·undo 성능을 기록한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();

  const tsv = buildTsv(100, 100);

  const pasteStart = Date.now();
  await page.evaluate((text) => {
    const target = document.querySelector('[contenteditable="true"]');
    if (target === null) throw new Error("Editable not found");
    const data = new DataTransfer();
    data.setData("text/plain", text);
    target.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, tsv);
  await expect(page.locator("table td").last()).toContainText("99-99");
  const pasteMs = Date.now() - pasteStart;

  const selectStart = Date.now();
  const firstCell = page.locator("table td").first();
  const lastCell = page.locator("table td").last();
  await firstCell.click();
  await page.keyboard.down("Shift");
  await lastCell.click();
  await page.keyboard.up("Shift");
  const selectMs = Date.now() - selectStart;

  const undoStart = Date.now();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("table")).toHaveCount(0);
  const undoMs = Date.now() - undoStart;

  console.log(
    `[perf] 10,000-cell paste=${pasteMs}ms select=${selectMs}ms undo=${undoMs}ms`,
  );

  // 하드 임계값 게이트는 슬라이스 13(CI 20% 회귀 게이트) 범위다.
  // 이 시나리오는 기준선 기록용이라 통과 여부는 표가 만들어졌는지만 본다.
  expect(pasteMs).toBeGreaterThan(0);
});
