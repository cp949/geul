import type {
  InlineContent,
  Result,
  TableBlock,
  TextMark,
} from "@cp949/geul-model";
import { canonicalizeTextMarks, parseDocument } from "@cp949/geul-model";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { TableMap } from "@tiptap/pm/tables";

import { tableBlockToTiptapJson } from "./model-to-tiptap.js";

// TableBlock → tiptap 매핑(PIT-0004 열 재정렬 포함)의 권위는 문서 로드 경로와
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

export type TableCodecError = { code: "TABLE_NODE_INVALID"; message: string };

const markTypeNames = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
] as const;

const inlineContentFromNode = (cellNode: ProseMirrorNode): InlineContent => {
  const content: InlineContent = [];
  cellNode.content.forEach((textNode) => {
    if (!textNode.isText || textNode.text === undefined) return;
    const marks: TextMark[] = textNode.marks.flatMap((mark): TextMark[] => {
      if (mark.type.name === "link") {
        const href = mark.attrs.href;
        return typeof href === "string" ? [{ type: "link", href }] : [];
      }
      const markType = markTypeNames.find((name) => name === mark.type.name);
      return markType === undefined ? [] : [{ type: markType }];
    });
    const canonicalMarks = canonicalizeTextMarks(marks);
    content.push({
      text: textNode.text,
      ...(canonicalMarks.length === 0 ? {} : { marks: canonicalMarks }),
    });
  });
  return content;
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
  const columns = tableNode.attrs.columns as TableBlock["columns"];

  const rows: TableBlock["rows"] = [];
  // TableMap.map은 격자 좌표마다 그 좌표를 채우는 셀 노드의 시작 위치를 담는다.
  // rowSpan/colSpan으로 병합된 셀은 자신이 덮는 모든 좌표에서 같은 position 값이
  // 반복되므로, 처음 등장하는 좌표(기준 좌표)에서만 셀을 한 번 push해야 한다.
  const seenPositions = new Set<number>();

  for (let rowIndex = 0; rowIndex < map.height; rowIndex += 1) {
    const rowNode = tableNode.child(rowIndex);
    const cells: TableBlock["rows"][number]["cells"] = [];

    for (let columnIndex = 0; columnIndex < map.width; columnIndex += 1) {
      const position = map.map[rowIndex * map.width + columnIndex];
      if (position === undefined || seenPositions.has(position)) continue;
      seenPositions.add(position);

      const cellNode = tableNode.nodeAt(position);
      if (cellNode === null) continue;

      cells.push({
        id: cellNode.attrs.cellId as string,
        columnId: cellNode.attrs.columnId as string,
        rowSpan: cellNode.attrs.rowspan as number,
        columnSpan: cellNode.attrs.colspan as number,
        content: inlineContentFromNode(cellNode),
        ...(typeof cellNode.attrs.textColor === "string"
          ? { textColor: cellNode.attrs.textColor as string }
          : {}),
        ...(typeof cellNode.attrs.backgroundColor === "string"
          ? { backgroundColor: cellNode.attrs.backgroundColor as string }
          : {}),
        ...(typeof cellNode.attrs.align === "string"
          ? { align: cellNode.attrs.align as "left" | "center" | "right" }
          : {}),
      });
    }

    rows.push({ id: rowNode.attrs.rowId as string, cells });
  }

  const table: TableBlock = {
    id: tableNode.attrs.blockId as string,
    type: "table",
    columns,
    rows,
    headerRows: tableNode.attrs.headerRows as 0 | 1,
    headerColumns: tableNode.attrs.headerColumns as 0 | 1,
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
