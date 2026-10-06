/**
 * 표 셀에서 뒤 문단으로 걸친 범위 선택의 Enter·Backspace를 실제 브라우저에서
 * 확인한다(Issue #289). 이전에는 Enter가 예외를 던졌고 Backspace는 선택하지
 * 않은 뒷부분 텍스트를 셀로 옮기거나 셀을 지웠다.
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - 실제 DOM selection이 셀 텍스트에서 뒤 문단 텍스트로 걸칠 때 편집기가
 *   그 선택을 경계 범위 TextSelection으로 읽는지는 jsdom이 재현하지 못한다.
 *   키 핸들러 앞단이 DOM 파생 selection 판정이라 실제 선택과 키 입력으로만
 *   확인된다.
 * 경계 범위 판정과 삭제 규칙, 구조(셀·행·열)·캐럿·undo·수식 키 계약은 단위
 * 테스트(packages/core/test/block-join/table-boundary-range.test.ts)가
 * 소유한다.
 *
 * 문서는 showcase document-io 예제의 Import JSON으로 배치하고 Export JSON으로
 * 읽는다. Firefox는 표 셀 사이 범위를 다중 range로 만들어 selection 모양이
 * 달라질 수 있어 chromium만 돌린다(@core 편입 없음).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { exportedBlocks, importBlocks } from "./support/document-io.js";
import { trackPageErrors } from "./support/ids.js";
import { yieldFrame } from "./support/yield-frame.js";

// 2x2 표. 셀 텍스트는 `c<행><열>`이다.
const table2x2 = {
  id: "t",
  type: "table",
  columns: [
    { id: "col-0", width: 160 },
    { id: "col-1", width: 160 },
  ],
  rows: [0, 1].map((row) => ({
    id: `row-${row}`,
    cells: [0, 1].map((column) => ({
      id: `cell-${row}${column}`,
      columnId: `col-${column}`,
      rowSpan: 1,
      columnSpan: 1,
      content: [{ text: `c${row}${column}` }],
    })),
  })),
  headerRows: 0,
  headerColumns: 0,
};

const blocks = () => [
  table2x2,
  { id: "w", type: "paragraph", content: [{ text: "wxyz" }] },
  { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
];

/**
 * 문단·셀 텍스트 위치 둘 사이에 실제 DOM selection을 만들고 selectionchange를
 * 보내 편집기 selection을 동기화한다(G-EDT-002). 먼저 시작 위치를 눌러
 * 편집기에 포커스를 준다.
 */
type Point = { id: string } | { cell: number };
const selectBetween = async (
  page: Page,
  editable: Locator,
  anchor: Point & { offset: number },
  focus: Point & { offset: number },
) => {
  const first =
    "cell" in anchor
      ? editable.locator("td").nth(anchor.cell)
      : editable.locator(`[data-geul-block-id="${anchor.id}"] p`).first();
  await first.click();
  await yieldFrame(page);
  await editable.evaluate(
    (root, input) => {
      const textOf = (point: Point): Text => {
        const element =
          "cell" in point
            ? root.querySelectorAll("td")[point.cell]
            : root.querySelector(`[data-geul-block-id="${point.id}"]`);
        const text =
          element === undefined || element === null
            ? null
            : element.ownerDocument
                .createTreeWalker(element, NodeFilter.SHOW_TEXT)
                .nextNode();
        if (!(text instanceof Text)) throw new Error("텍스트 노드가 없다");
        return text;
      };
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.setBaseAndExtent(
        textOf(input.anchor),
        input.anchor.offset,
        textOf(input.focus),
        input.focus.offset,
      );
      document.dispatchEvent(new Event("selectionchange"));
    },
    { anchor, focus },
  );
  await yieldFrame(page);
};

const selectFromCellToParagraph = (
  page: Page,
  editable: Locator,
  cell: { index: number; offset: number },
  paragraph: { id: string; offset: number },
) =>
  selectBetween(
    page,
    editable,
    { cell: cell.index, offset: cell.offset },
    paragraph,
  );

const selectFromParagraphToCell = (
  page: Page,
  editable: Locator,
  paragraph: { id: string; offset: number },
  cell: { index: number; offset: number },
) =>
  selectBetween(page, editable, paragraph, {
    cell: cell.index,
    offset: cell.offset,
  });

test("표 셀(1,1)에서 뒤 문단으로 걸친 범위를 Backspace하면 양쪽 선택 텍스트만 지우고 표 구조를 유지한다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const editable = await importBlocks(page, blocks());

  await selectFromCellToParagraph(
    page,
    editable,
    { index: 3, offset: 2 },
    { id: "w", offset: 2 },
  );
  await page.keyboard.press("Backspace");
  await yieldFrame(page);

  const expected = structuredClone(table2x2);
  expected.rows[1]!.cells[1]!.content = [{ text: "c1" }];
  expect(await exportedBlocks(page)).toEqual([
    expected,
    { id: "w", type: "paragraph", content: [{ text: "yz" }] },
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ]);
  expect(pageErrors).toEqual([]);
});

test("표 셀에서 뒤 문단으로 걸친 범위를 Enter하면 예외 없이 문서가 그대로다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const editable = await importBlocks(page, blocks());

  await selectFromCellToParagraph(
    page,
    editable,
    { index: 3, offset: 2 },
    { id: "w", offset: 2 },
  );
  await page.keyboard.press("Enter");
  await yieldFrame(page);

  expect(await exportedBlocks(page)).toEqual(blocks());
  expect(pageErrors).toEqual([]);
});

test("앞 문단에서 표 셀로 걸친 범위를 Enter하면 문단이 분할되지 않고 표가 그대로다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const before = [
    { id: "a", type: "paragraph", content: [{ text: "abcd" }] },
    table2x2,
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ];
  const editable = await importBlocks(page, before);

  await selectFromParagraphToCell(
    page,
    editable,
    { id: "a", offset: 2 },
    { index: 3, offset: 1 },
  );
  await page.keyboard.press("Enter");
  await yieldFrame(page);

  expect(await exportedBlocks(page)).toEqual(before);
  expect(pageErrors).toEqual([]);
});
