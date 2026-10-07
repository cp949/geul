/**
 * 표 경계 범위 e2e(Issue #289·#292)가 공유하는 fixture와 DOM selection
 * 헬퍼다. 두 번째 소비 spec(table-boundary-input.spec.ts)이 생겨 사본 대신
 * 여기로 올렸다(G-TST-002).
 *
 * selectBetween은 문단·셀 텍스트 위치 둘 사이에 실제 DOM selection을 만든다.
 * 브라우저가 그 선택을 경계 범위 TextSelection으로 읽는지는 jsdom이 재현하지
 * 못한다.
 */
import type { Locator, Page } from "@playwright/test";

import { yieldFrame } from "./yield-frame.js";

// 2x2 표. 셀 텍스트는 `c<행><열>`이다.
export const table2x2 = {
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

export const blocks = () => [
  table2x2,
  { id: "w", type: "paragraph", content: [{ text: "wxyz" }] },
  { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
];

/**
 * 문단·셀 텍스트 위치 둘 사이에 실제 DOM selection을 만들고 selectionchange를
 * 보내 편집기 selection을 동기화한다(G-EDT-002). 먼저 시작 위치를 눌러
 * 편집기에 포커스를 준다.
 */
export type Point = { id: string } | { cell: number };
export const selectBetween = async (
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

export const selectFromCellToParagraph = (
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

export const selectFromParagraphToCell = (
  page: Page,
  editable: Locator,
  paragraph: { id: string; offset: number },
  cell: { index: number; offset: number },
) =>
  selectBetween(page, editable, paragraph, {
    cell: cell.index,
    offset: cell.offset,
  });
