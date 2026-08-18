import type { IdFactory, Result, TableBlock } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

import {
  DEFAULT_COLUMN_WIDTH,
  deleteColumn as deleteGridColumn,
  deleteRow as deleteGridRow,
  insertColumn as insertGridColumn,
  insertRow as insertGridRow,
  mergeCells as mergeGridCells,
  moveColumn as moveGridColumn,
  moveRow as moveGridRow,
  projectTableGrid,
  resizeColumn as resizeGridColumn,
  splitCell as splitGridCell,
  type TableGridError,
} from "./table-grid.js";
import {
  type TableCodecError,
  tableBlockToTiptapNode,
  tiptapNodeToTableBlock,
} from "./table-model-codec.js";

export type TableCommandError =
  | TableGridError
  | TableCodecError
  | { code: "BLOCK_NOT_FOUND"; blockId: string }
  | { code: "TABLE_NOT_FOUND"; blockId: string }
  | { code: "INVALID_TABLE_SIZE" };

const blockNotFound = (blockId: string): Result<never, TableCommandError> => ({
  ok: false,
  error: { code: "BLOCK_NOT_FOUND", blockId },
});

const tableNotFound = (blockId: string): Result<never, TableCommandError> => ({
  ok: false,
  error: { code: "TABLE_NOT_FOUND", blockId },
});

const findTopLevelBlockPosition = (
  document: ProseMirrorNode,
  blockId: string,
): number | null => {
  let blockPosition: number | null = null;
  document.forEach((node, offset) => {
    if (node.attrs.blockId === blockId) blockPosition = offset;
  });
  return blockPosition;
};

const buildInitialTable = (
  size: { rows: number; columns: number },
  createId: IdFactory,
): TableBlock => {
  const columns = Array.from({ length: size.columns }, () => ({
    id: createId(),
    width: DEFAULT_COLUMN_WIDTH,
  }));
  const rows = Array.from({ length: size.rows }, () => ({
    id: createId(),
    cells: columns.map((column) => ({
      id: createId(),
      columnId: column.id,
      rowSpan: 1,
      columnSpan: 1,
      content: [],
    })),
  }));
  return {
    id: createId(),
    type: "table",
    columns,
    rows,
    headerRows: 0,
    headerColumns: 0,
  };
};

const findTable = (
  editor: Editor,
  blockId: string,
): Result<{ position: number; node: ProseMirrorNode }, TableCommandError> => {
  const position = findTopLevelBlockPosition(editor.state.doc, blockId);
  if (position === null) return tableNotFound(blockId);
  const node = editor.state.doc.nodeAt(position);
  if (node === null || node.type.name !== "table") {
    return tableNotFound(blockId);
  }
  return { ok: true, value: { position, node } };
};

// nextNode(치환 직후의 독립 표 노드) 안에서 cellId가 가리키는 셀의
// 콘텐츠 시작 위치를 nextNode 기준 상대 좌표로 찾는다. 찾지 못하면 null.
const findCellContentOffset = (
  nextNode: ProseMirrorNode,
  cellId: string,
): number | null => {
  let offset: number | null = null;
  nextNode.descendants((child, pos) => {
    if (offset !== null) return false;
    if (child.type.name === "tableCell" && child.attrs.cellId === cellId) {
      offset = pos + 1;
      return false;
    }
    return true;
  });
  return offset;
};

const applyTableGridOperation = (
  editor: Editor,
  tableBlockId: string,
  operate: (table: TableBlock) => Result<TableBlock, TableGridError>,
  options?: { selectCellId?: (table: TableBlock) => string | null },
): Result<void, TableCommandError> => {
  const found = findTable(editor, tableBlockId);
  if (!found.ok) return found;
  const { position, node } = found.value;

  const decoded = tiptapNodeToTableBlock(node);
  if (!decoded.ok) return decoded;

  const operated = operate(decoded.value);
  if (!operated.ok) return operated;

  // no-op 연산(동일 인덱스 이동, 동일 너비 리사이즈)은 입력 표를 참조 그대로
  // 반환한다 — 트랜잭션을 만들면 문서는 안 바뀌는데 undo 단계만 쌓인다.
  if (operated.value === decoded.value) {
    return { ok: true, value: undefined };
  }

  const nextNode = tableBlockToTiptapNode(editor.schema, operated.value);
  let transaction = editor.state.tr.replaceWith(
    position,
    position + node.nodeSize,
    nextNode,
  );

  // 병합/분할 직후에는 결과 셀 안으로 캐럿을 명시적으로 옮긴다. replaceWith가
  // 표 서브트리 전체를 바꾸는 탓에 옛 selection을 그대로 매핑하면 예측할 수
  // 없는 위치(흔히 표의 마지막 셀)로 떨어진다 — duplicateBlock과 같은 원칙.
  const targetCellId = options?.selectCellId?.(operated.value) ?? null;
  if (targetCellId !== null) {
    const relativeOffset = findCellContentOffset(nextNode, targetCellId);
    if (relativeOffset !== null) {
      const absolutePosition = Math.min(
        position + 1 + relativeOffset,
        transaction.doc.content.size,
      );
      transaction = transaction.setSelection(
        TextSelection.near(transaction.doc.resolve(absolutePosition)),
      );
    }
  }

  editor.view.dispatch(closeHistory(transaction));

  return { ok: true, value: undefined };
};

export const insertTableRow = (
  editor: Editor,
  tableBlockId: string,
  atIndex: number,
  createId: IdFactory,
): Result<void, TableCommandError> =>
  applyTableGridOperation(editor, tableBlockId, (table) =>
    insertGridRow(table, atIndex, createId),
  );

export const insertTableColumn = (
  editor: Editor,
  tableBlockId: string,
  atIndex: number,
  createId: IdFactory,
): Result<void, TableCommandError> =>
  applyTableGridOperation(editor, tableBlockId, (table) =>
    insertGridColumn(table, atIndex, createId),
  );

export const deleteTableRow = (
  editor: Editor,
  tableBlockId: string,
  index: number,
): Result<void, TableCommandError> =>
  applyTableGridOperation(editor, tableBlockId, (table) =>
    deleteGridRow(table, index),
  );

export const deleteTableColumn = (
  editor: Editor,
  tableBlockId: string,
  index: number,
): Result<void, TableCommandError> =>
  applyTableGridOperation(editor, tableBlockId, (table) =>
    deleteGridColumn(table, index),
  );

export const moveTableRow = (
  editor: Editor,
  tableBlockId: string,
  fromIndex: number,
  toIndex: number,
): Result<void, TableCommandError> =>
  applyTableGridOperation(editor, tableBlockId, (table) =>
    moveGridRow(table, fromIndex, toIndex),
  );

export const moveTableColumn = (
  editor: Editor,
  tableBlockId: string,
  fromIndex: number,
  toIndex: number,
): Result<void, TableCommandError> =>
  applyTableGridOperation(editor, tableBlockId, (table) =>
    moveGridColumn(table, fromIndex, toIndex),
  );

export const resizeTableColumn = (
  editor: Editor,
  tableBlockId: string,
  index: number,
  width: number,
): Result<void, TableCommandError> =>
  applyTableGridOperation(editor, tableBlockId, (table) =>
    resizeGridColumn(table, index, width),
  );

// 병합 결과에서 살아남는 기준 셀의 id. 실패하면 null(선택 이동을 생략하고
// replaceWith의 기본 selection 매핑에 맡긴다).
const anchorCellIdAfterMerge = (
  table: TableBlock,
  from: { row: number; column: number },
  to: { row: number; column: number },
): string | null => {
  const projected = projectTableGrid(table);
  if (!projected.ok) return null;
  const row = Math.min(from.row, to.row);
  const column = Math.min(from.column, to.column);
  return projected.value.cellAt(row, column)?.cellId ?? null;
};

export const mergeTableCells = (
  editor: Editor,
  tableBlockId: string,
  from: { row: number; column: number },
  to: { row: number; column: number },
): Result<void, TableCommandError> =>
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => mergeGridCells(table, from, to),
    { selectCellId: (table) => anchorCellIdAfterMerge(table, from, to) },
  );

export const splitTableCell = (
  editor: Editor,
  tableBlockId: string,
  cellId: string,
  createId: IdFactory,
): Result<void, TableCommandError> =>
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => splitGridCell(table, cellId, createId),
    { selectCellId: () => cellId },
  );

export const insertTable = (
  editor: Editor,
  afterBlockId: string,
  size: { rows: number; columns: number },
  createId: IdFactory,
  options?: { clearAfterBlockText?: boolean },
): Result<{ blockId: string }, TableCommandError> => {
  if (
    !Number.isInteger(size.rows) ||
    size.rows < 1 ||
    !Number.isInteger(size.columns) ||
    size.columns < 1
  ) {
    return { ok: false, error: { code: "INVALID_TABLE_SIZE" } };
  }

  const afterPosition = findTopLevelBlockPosition(
    editor.state.doc,
    afterBlockId,
  );
  if (afterPosition === null) return blockNotFound(afterBlockId);
  const afterNode = editor.state.doc.nodeAt(afterPosition);
  if (afterNode === null) return blockNotFound(afterBlockId);
  const insertPosition = afterPosition + afterNode.nodeSize;

  const table = buildInitialTable(size, createId);
  const tableNode = tableBlockToTiptapNode(editor.schema, table);

  let transaction = editor.state.tr;
  // content 삭제는 textblock에만 안전하다 — 표 같은 구조 노드의 content를
  // 지우면 노드 자체가 스키마에 맞지 않아 통째로 사라진다.
  if (
    options?.clearAfterBlockText === true &&
    afterNode.isTextblock &&
    afterNode.content.size > 0
  ) {
    transaction = transaction.delete(
      afterPosition + 1,
      afterPosition + 1 + afterNode.content.size,
    );
  }
  transaction = transaction.insert(
    transaction.mapping.map(insertPosition),
    tableNode,
  );
  editor.view.dispatch(closeHistory(transaction));

  return { ok: true, value: { blockId: table.id } };
};
