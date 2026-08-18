import {
  type InlineContent,
  isCanonicalCellAlign,
  isCanonicalCellColor,
  isValidInlineText,
  validateGridCoverage,
} from "@cp949/geul-model";

import type { ClipboardParseError } from "../errors.js";
import type { Result } from "../result.js";

export type TabularCell = {
  columnIndex: number;
  rowSpan: number;
  columnSpan: number;
  content: InlineContent;
  textColor?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
};

export type TabularData = {
  columnCount: number;
  rows: Array<{ cells: TabularCell[] }>;
};

const invalidTable = (message: string): Result<never, ClipboardParseError> => ({
  ok: false,
  error: { code: "CLIPBOARD_TABLE_INVALID", message },
});

// TabularData 자체의 구조 검증(직사각형, 0셀 아님) — 대상 표와의 병합
// 충돌 검사(core의 TableGrid.pasteInto)와는 다른 층위다.
export const validateTabularData = (
  data: TabularData,
): Result<undefined, ClipboardParseError> => {
  // NaN은 `=== 0`도 `< 1`도 false라 아래 빈 데이터 가드를 통과하고,
  // validateGridCoverage의 new Array(rowCount * columnCount)가 RangeError를
  // 던져 Result 계약 밖으로 예외가 새어나간다 — 산술에 쓰기 전에 막는다.
  if (!Number.isInteger(data.columnCount) || data.columnCount < 0) {
    return invalidTable("columnCount must be a positive integer");
  }
  if (data.rows.length === 0 || data.columnCount === 0) {
    return {
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID", message: "Table is empty" },
    };
  }

  // 셀 텍스트가 model의 인라인 텍스트 계약을 어기면 붙여넣기 결과가 문서로
  // 커밋될 때 parseDocument가 터진다 — 뮤테이션 전에 여기서 거절한다.
  for (const [rowIndex, row] of data.rows.entries()) {
    for (const [cellIndex, cellEntry] of row.cells.entries()) {
      for (const item of cellEntry.content) {
        if (isValidInlineText(item.text)) continue;
        return {
          ok: false,
          error: {
            code: "CLIPBOARD_TABLE_INVALID",
            message: `Cell text at row ${rowIndex}, cell ${cellIndex} is not valid inline text`,
          },
        };
      }
    }
  }

  // 서식 값이 model의 정규 형식(대문자 #RRGGBB, left|center|right)을 어기면
  // 텍스트 계약 위반과 똑같이 parseDocument가 커밋 시점에 거절한다 — 문서를
  // 건드리기 전에 여기서 막아야 model과 에디터가 영구 desync되지 않는다.
  for (const [rowIndex, row] of data.rows.entries()) {
    for (const [cellIndex, cellEntry] of row.cells.entries()) {
      const at = `row ${rowIndex}, cell ${cellIndex}`;
      if (
        cellEntry.textColor !== undefined &&
        !isCanonicalCellColor(cellEntry.textColor)
      ) {
        return invalidTable(`Cell textColor at ${at} is not a canonical color`);
      }
      if (
        cellEntry.backgroundColor !== undefined &&
        !isCanonicalCellColor(cellEntry.backgroundColor)
      ) {
        return invalidTable(
          `Cell backgroundColor at ${at} is not a canonical color`,
        );
      }
      if (
        cellEntry.align !== undefined &&
        !isCanonicalCellAlign(cellEntry.align)
      ) {
        return invalidTable(`Cell align at ${at} is not a canonical align`);
      }
    }
  }

  // TableGrid.pasteInto는 각 행의 cells가 columnIndex 오름차순이라고 보고
  // 배열 순서대로 열에 대응시킨다. 정렬을 조용히 고쳐주면 계약이 흐려지므로
  // 경계에서 거절한다.
  for (const [rowIndex, row] of data.rows.entries()) {
    let previousColumnIndex = -1;
    for (const cellEntry of row.cells) {
      if (cellEntry.columnIndex <= previousColumnIndex) {
        return invalidTable(
          `Cells in row ${rowIndex} are not sorted by ascending columnIndex`,
        );
      }
      previousColumnIndex = cellEntry.columnIndex;
    }
  }

  const cells = data.rows.flatMap((row, rowIndex) =>
    row.cells.map((cellEntry) => ({
      row: rowIndex,
      column: cellEntry.columnIndex,
      rowSpan: cellEntry.rowSpan,
      columnSpan: cellEntry.columnSpan,
    })),
  );

  const validation = validateGridCoverage(
    data.rows.length,
    data.columnCount,
    cells,
  );
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_TABLE_INVALID",
        message: `Table layout is invalid: ${validation.error.reason}`,
      },
    };
  }
  return { ok: true, value: undefined };
};
