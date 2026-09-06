// GFM table 노드를 model TableBlock으로 옮긴다. 열 개수는 가장 넓은 행
// 기준으로 정하고, 셀 부족 행은 빈 셀로 채운다. 크기 위반은
// MarkdownDocumentInvalidError로 던져 importMarkdown이 잡는다.
import {
  type Block,
  type IdFactory,
  tableSizeViolationMessage,
  validateTableSize,
} from "@cp949/geul-model";

import { MarkdownDocumentInvalidError } from "./import-markdown-helpers.js";
import type { MarkdownNode } from "./import-markdown-helpers.js";
import { inlineContentFromNodes } from "./import-markdown-inline.js";
import type { ImportWarning } from "./import-markdown-warnings.js";

const DEFAULT_COLUMN_WIDTH = 160;

export const tableFromNode = (
  node: MarkdownNode,
  createId: IdFactory,
  warnings: ImportWarning[],
): Block => {
  const tableId = createId();
  const sourceRows = node.children ?? [];
  const columnCount = sourceRows.reduce(
    (maximum, row) => Math.max(maximum, row.children?.length ?? 0),
    0,
  );
  const sizeViolation = validateTableSize({
    columnCount,
    rowCount: sourceRows.length,
  });
  if (sizeViolation !== undefined) {
    throw new MarkdownDocumentInvalidError(
      tableSizeViolationMessage(sizeViolation),
    );
  }

  const columns = Array.from({ length: columnCount }, () => ({
    id: createId(),
    width: DEFAULT_COLUMN_WIDTH,
  }));
  const rows = sourceRows.map((sourceRow) => {
    const rowId = createId();
    return {
      id: rowId,
      cells: columns.map((column, columnIndex) => {
        const cellId = createId();
        const sourceCell = sourceRow.children?.[columnIndex];
        const align = node.align?.[columnIndex] ?? null;
        return {
          id: cellId,
          columnId: column.id,
          rowSpan: 1,
          columnSpan: 1,
          content: inlineContentFromNodes(
            sourceCell?.children ?? [],
            warnings,
            {
              blockId: tableId,
              rowId,
              cellId,
              inTableCell: true,
            },
          ),
          ...(align === null ? {} : { align }),
        };
      }),
    };
  });

  return {
    id: tableId,
    type: "table",
    columns,
    rows,
    headerRows: rows.length === 0 ? 0 : 1,
    headerColumns: 0,
  };
};
