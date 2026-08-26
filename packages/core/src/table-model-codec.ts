import type {
  InlineContent,
  Result,
  TableBlock,
  TextMark,
} from "@cp949/geul-model";
import {
  canonicalizeTextMarks,
  decodeTextMark,
  parseDocument,
} from "@cp949/geul-model";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { TableMap } from "@tiptap/pm/tables";

import { tableBlockToTiptapJson } from "./model-to-tiptap.js";
import type { TableCodecError } from "./table-command-error.js";

// TableBlock → tiptap 매핑(G-TBL-001 열 재정렬 포함)의 권위는 문서 로드 경로와
// 공유하는 tableBlockToTiptapJson 하나다 — 붙여넣기(PM 노드)와 로드(JSON)가
// 서로 다른 매핑으로 갈라지지 않게 한다.
export const tableBlockToTiptapNode = (
  schema: Schema,
  table: TableBlock,
): ProseMirrorNode => {
  if (
    schema.nodes.tableCell === undefined ||
    schema.nodes.tableRow === undefined ||
    schema.nodes.table === undefined
  ) {
    throw new TypeError("Schema is missing table/tableRow/tableCell nodes");
  }

  return schema.nodeFromJSON(tableBlockToTiptapJson(table));
};

type TableCellFields = Omit<
  TableBlock["rows"][number]["cells"][number],
  "content"
>;

// "attrs 객체 → TableCell 필드"의 유일한 권위. PM 노드의 .attrs도 tiptap
// JSON의 cell attrs도 구조적으로 Record<string, unknown>이라 이 판단을
// 공유할 수 있다(tiptap-to-model.ts가 이 함수를 가져다 쓴다). 방어적
// 스타일(누락/오염된 값은 기본값으로 접는다)로 통일한다 —
// TableCellExtension의 cellId·columnId 스키마 기본값이 null이라, 라이브 PM
// attrs도 "항상 채워져 있다"고 무조건 가정할 수 없다.
export const tableCellFieldsFromAttrs = (
  attrs: Record<string, unknown>,
): TableCellFields => ({
  id: typeof attrs.cellId === "string" ? attrs.cellId : "",
  columnId: typeof attrs.columnId === "string" ? attrs.columnId : "",
  rowSpan: typeof attrs.rowspan === "number" ? attrs.rowspan : 1,
  columnSpan: typeof attrs.colspan === "number" ? attrs.colspan : 1,
  ...(typeof attrs.textColor === "string"
    ? { textColor: attrs.textColor }
    : {}),
  ...(typeof attrs.backgroundColor === "string"
    ? { backgroundColor: attrs.backgroundColor }
    : {}),
  ...(typeof attrs.align === "string"
    ? { align: attrs.align as "left" | "center" | "right" }
    : {}),
});

const inlineContentFromNode = (
  cellNode: ProseMirrorNode,
): Result<InlineContent, TableCodecError> => {
  const content: InlineContent = [];
  const textNodes: ProseMirrorNode[] = [];
  cellNode.content.forEach((child) => textNodes.push(child));

  for (const textNode of textNodes) {
    if (!textNode.isText || textNode.text === undefined) {
      return {
        ok: false,
        error: {
          code: "TABLE_NODE_INVALID",
          message: `Unsupported inline node: ${textNode.type.name}`,
        },
      };
    }

    const marks: TextMark[] = [];
    for (const mark of textNode.marks) {
      const decoded = decodeTextMark({
        type: mark.type.name,
        href: mark.attrs.href,
      });
      if (!decoded.ok) {
        return {
          ok: false,
          error: { code: "TABLE_NODE_INVALID", message: decoded.error },
        };
      }
      marks.push(decoded.value);
    }

    const canonicalMarks = canonicalizeTextMarks(marks);
    content.push({
      text: textNode.text,
      ...(canonicalMarks.length === 0 ? {} : { marks: canonicalMarks }),
    });
  }
  return { ok: true, value: content };
};

export const tiptapNodeToTableBlock = (
  tableNode: ProseMirrorNode,
): Result<TableBlock, TableCodecError> => {
  if (tableNode.type.name !== "table") {
    return {
      ok: false,
      error: {
        code: "TABLE_NODE_INVALID",
        message: `Expected a table node, got ${tableNode.type.name}`,
      },
    };
  }

  const map = TableMap.get(tableNode);
  const tableAttrs = tableNode.attrs as Record<string, unknown>;
  const columns = (tableAttrs.columns ?? []) as TableBlock["columns"];

  const rows: TableBlock["rows"] = [];
  // TableMap.map은 격자 좌표마다 그 좌표를 채우는 셀 노드의 시작 위치를 담는다.
  // rowSpan/colSpan으로 병합된 셀은 자신이 덮는 모든 좌표에서 같은 position 값이
  // 반복되므로, 처음 등장하는 좌표(기준 좌표)에서만 셀을 한 번 push해야 한다.
  const seenPositions = new Set<number>();

  for (let rowIndex = 0; rowIndex < map.height; rowIndex += 1) {
    const rowNode = tableNode.child(rowIndex);
    const rowAttrs = rowNode.attrs as Record<string, unknown>;
    const cells: TableBlock["rows"][number]["cells"] = [];

    for (let columnIndex = 0; columnIndex < map.width; columnIndex += 1) {
      const position = map.map[rowIndex * map.width + columnIndex];
      if (position === undefined || seenPositions.has(position)) continue;
      seenPositions.add(position);

      const cellNode = tableNode.nodeAt(position);
      if (cellNode === null) continue;

      const content = inlineContentFromNode(cellNode);
      if (!content.ok) return content;

      cells.push({
        ...tableCellFieldsFromAttrs(cellNode.attrs as Record<string, unknown>),
        content: content.value,
      });
    }

    rows.push({
      id: typeof rowAttrs.rowId === "string" ? rowAttrs.rowId : "",
      cells,
    });
  }

  const table: TableBlock = {
    id: tableNode.attrs.blockId as string,
    type: "table",
    columns,
    rows,
    headerRows: (tableAttrs.headerRows ?? 0) as 0 | 1,
    headerColumns: (tableAttrs.headerColumns ?? 0) as 0 | 1,
  };

  const parsed = parseDocument({
    formatVersion: 1,
    revision: 0,
    blocks: [table],
  });
  if (!parsed.ok) {
    return {
      ok: false,
      error: { code: "TABLE_NODE_INVALID", message: parsed.error.message },
    };
  }

  const parsedTable = parsed.value.blocks[0];
  if (parsedTable?.type !== "table") {
    return {
      ok: false,
      error: { code: "TABLE_NODE_INVALID", message: "Expected a table block" },
    };
  }
  return { ok: true, value: parsedTable };
};
