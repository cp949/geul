import { validateGridCoverage, type InlineContent } from "@cp949/geul-model";

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

// TabularData 자체의 구조 검증(직사각형, 0셀 아님) — 대상 표와의 병합
// 충돌 검사(core의 TableGrid.pasteInto)와는 다른 층위다.
export const validateTabularData = (
  data: TabularData,
): Result<undefined, ClipboardParseError> => {
  if (data.rows.length === 0 || data.columnCount === 0) {
    return {
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID", message: "Table is empty" },
    };
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
