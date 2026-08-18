import { type TabularData, validateTabularData } from "@cp949/geul-io";
import type { IdFactory, Result, TableBlock } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection, isInTable, selectedRect } from "@tiptap/pm/tables";

import {
  DEFAULT_COLUMN_WIDTH,
  deleteColumn as deleteGridColumn,
  deleteRow as deleteGridRow,
  insertColumn as insertGridColumn,
  insertRow as insertGridRow,
  mergeCells as mergeGridCells,
  moveColumn as moveGridColumn,
  moveRow as moveGridRow,
  pasteInto as pasteGridInto,
  projectTableGrid,
  resizeColumn as resizeGridColumn,
  setCellAlign as setGridCellAlign,
  setCellColor as setGridCellColor,
  splitCell as splitGridCell,
  type TableCellTarget,
  type TableGridError,
  toggleHeaderColumn as toggleGridHeaderColumn,
  toggleHeaderRow as toggleGridHeaderRow,
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
  | { code: "INVALID_TABLE_SIZE" }
  | { code: "TABULAR_DATA_INVALID"; message: string }
  | { code: "PASTE_TARGET_NOT_FOUND" };

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

// 표 밖 붙여넣기 전용 골격: 열과 행만 만들고 셀은 만들지 않는다.
// pasteInto가 anchor (0,0)에서 모든 행·열을 덮어쓰므로 여기서 만든 셀은
// 하나도 살아남지 못한다 — buildInitialTable을 쓰면 100x100 붙여넣기에서
// 버려질 셀 10,000개를 만들고 id도 그만큼 더 뽑는다. 셀 없는 중간 상태는
// pasteInto가 결과를 validateTableGrid로 검증하므로 밖으로 새지 않는다.
const buildPasteTableSkeleton = (
  size: { rows: number; columns: number },
  createId: IdFactory,
): TableBlock => ({
  id: createId(),
  type: "table",
  columns: Array.from({ length: size.columns }, () => ({
    id: createId(),
    width: DEFAULT_COLUMN_WIDTH,
  })),
  rows: Array.from({ length: size.rows }, () => ({
    id: createId(),
    cells: [],
  })),
  headerRows: 0,
  headerColumns: 0,
});

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

// nextNode 안에서 cellId가 가리키는 셀 경계의 상대 좌표를 찾는다.
const findCellBoundaryOffset = (
  nextNode: ProseMirrorNode,
  cellId: string,
): number | null => {
  let offset: number | null = null;
  nextNode.descendants((child, pos) => {
    if (offset !== null) return false;
    if (child.type.name === "tableCell" && child.attrs.cellId === cellId) {
      offset = pos;
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
  options?: {
    selectCellId?: (table: TableBlock) => string | null;
    preserveSelection?: boolean;
  },
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

  // 표 서식은 선택된 셀의 id를 바꾸지 않는다. 교체 전
  // CellSelection의 양 끝을 id로 저장해 새 표에서 다시 만든다.
  const currentSelection = editor.state.selection;
  const preservedSelection =
    options?.preserveSelection !== true
      ? null
      : currentSelection instanceof CellSelection
        ? {
            kind: "cells" as const,
            anchorCellId: currentSelection.$anchorCell.nodeAfter?.attrs.cellId,
            headCellId: currentSelection.$headCell.nodeAfter?.attrs.cellId,
          }
        : currentSelection instanceof TextSelection
          ? {
              kind: "text" as const,
              from: currentSelection.from,
              to: currentSelection.to,
            }
          : null;

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
  if (
    preservedSelection?.kind === "cells" &&
    typeof preservedSelection.anchorCellId === "string" &&
    typeof preservedSelection.headCellId === "string"
  ) {
    const anchorOffset = findCellBoundaryOffset(
      nextNode,
      preservedSelection.anchorCellId,
    );
    const headOffset = findCellBoundaryOffset(
      nextNode,
      preservedSelection.headCellId,
    );
    if (anchorOffset !== null && headOffset !== null) {
      transaction = transaction.setSelection(
        CellSelection.create(
          transaction.doc,
          position + 1 + anchorOffset,
          position + 1 + headOffset,
        ),
      );
    }
  } else if (preservedSelection?.kind === "text") {
    transaction = transaction.setSelection(
      TextSelection.create(
        transaction.doc,
        preservedSelection.from,
        preservedSelection.to,
      ),
    );
  } else if (targetCellId !== null) {
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
  options?: { selectCellId?: (table: TableBlock) => string | null },
): Result<void, TableCommandError> =>
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => insertGridRow(table, atIndex, createId),
    options,
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

export const toggleTableHeaderRow = (
  editor: Editor,
  tableBlockId: string,
): Result<void, TableCommandError> =>
  applyTableGridOperation(editor, tableBlockId, (table) =>
    toggleGridHeaderRow(table),
  );

export const toggleTableHeaderColumn = (
  editor: Editor,
  tableBlockId: string,
): Result<void, TableCommandError> =>
  applyTableGridOperation(editor, tableBlockId, (table) =>
    toggleGridHeaderColumn(table),
  );

export const setTableCellColor = (
  editor: Editor,
  tableBlockId: string,
  target: TableCellTarget,
  property: "textColor" | "backgroundColor",
  color: string | null,
): Result<void, TableCommandError> =>
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => setGridCellColor(table, target, property, color),
    { preserveSelection: true },
  );

export const setTableCellAlign = (
  editor: Editor,
  tableBlockId: string,
  target: TableCellTarget,
  align: "left" | "center" | "right" | null,
): Result<void, TableCommandError> =>
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => setGridCellAlign(table, target, align),
    { preserveSelection: true },
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

// 캐럿(to)이 닿는 최상위 블록의 id를 찾는다(findTopLevelBlockPosition과
// 같은 스캔 방식) — 표 밖 붙여넣기의 삽입 위치를 정하는 데 쓴다. 이 함수는
// isInTable(state)가 false일 때만 호출되므로 결과가 table 노드일 일은 없다.
// 선택 삭제 후의 doc을 받으므로 to는 항상 접힌 캐럿 위치다.
const currentTopLevelBlockId = (
  doc: ProseMirrorNode,
  to: number,
): string | null => {
  let blockId: string | null = null;
  doc.forEach((node, offset) => {
    if (to < offset) return;
    const id = node.attrs.blockId;
    if (typeof id === "string" && id.length > 0) blockId = id;
  });
  return blockId;
};

// pasteInto가 만든 결과 표에서 anchor 좌표를 덮는 셀의 id. selectCellId
// 콜백이 operate 결과(붙여넣기 후 표)를 넘겨받으므로, 여기서 찾는 id는
// 항상 방금 붙여넣은 셀의 새 id다(원래 셀 id가 아니다).
const cellIdAtAnchor = (
  table: TableBlock,
  anchor: { row: number; column: number },
): string | null => {
  const projected = projectTableGrid(table);
  if (!projected.ok) return null;
  return projected.value.cellAt(anchor.row, anchor.column)?.cellId ?? null;
};

// 표 안이면 selectedRect의 좌상단을 anchor로 삼아 pasteInto로 덮어쓰고,
// 표 밖이면 현재 최상위 블록 뒤에 pasteInto로 채운 새 표를 끼운다. 두
// 경로 모두 격자 레벨 연산(TableGrid.pasteInto)을 공유한다.
export const pasteTabularData = (
  editor: Editor,
  data: TabularData,
  createId: IdFactory,
): Result<{ blockId: string }, TableCommandError> => {
  const state = editor.state;

  // pasteTabularData는 공개 API다 — 클립보드 파서를 거치지 않은 TabularData도
  // 들어온다. 뮤테이션 전에 구조(직사각형 커버리지)와 셀 인라인 텍스트를
  // 모두 검증해야 잘못된 데이터가 문서를 깨뜨리지 않는다.
  if (data.rows.length < 1 || data.columnCount < 1) {
    return { ok: false, error: { code: "INVALID_TABLE_SIZE" } };
  }
  const validated = validateTabularData(data);
  if (!validated.ok) {
    // NOT_RECTANGULAR는 병합 명령(비직사각형 선택) 전용이다 — 여기서 쓰면
    // 텍스트 계약·서식·정렬 위반까지 "직사각형 아님"으로 오도된다. io가
    // 만든 원인 message를 그대로 전달한다.
    return {
      ok: false,
      error: {
        code: "TABULAR_DATA_INVALID",
        message:
          validated.error.code === "CLIPBOARD_TABLE_INVALID"
            ? validated.error.message
            : "Tabular data is not tabular",
      },
    };
  }

  if (isInTable(state)) {
    const rect = selectedRect(state);
    const tableBlockId = rect.table.attrs.blockId;
    if (typeof tableBlockId !== "string" || tableBlockId.length === 0) {
      return { ok: false, error: { code: "PASTE_TARGET_NOT_FOUND" } };
    }
    const anchor = { row: rect.top, column: rect.left };

    const result = applyTableGridOperation(
      editor,
      tableBlockId,
      (table) => pasteGridInto(table, anchor, data, createId),
      { selectCellId: (table) => cellIdAtAnchor(table, anchor) },
    );
    return result.ok ? { ok: true, value: { blockId: tableBlockId } } : result;
  }

  // 표 밖 분기는 buildPasteTableSkeleton으로 새 표를 만든다 — 0행/0열 TableBlock이
  // tableBlockToTiptapNode(스키마 비검증 NodeType.create)를 거쳐 문서에
  // 삽입되는 것은 함수 앞머리의 크기 가드가 막는다. 표를 먼저 만들어 실패
  // (셀 한도 등)를 트랜잭션 구성 전에 확정한다 — 거절 경로는 아무것도
  // dispatch하지 않아야 한다(PIT-0003).
  const emptyTable = buildPasteTableSkeleton(
    { rows: data.rows.length, columns: data.columnCount },
    createId,
  );
  const filled = pasteGridInto(
    emptyTable,
    { row: 0, column: 0 },
    data,
    createId,
  );
  if (!filled.ok) return filled;

  // 붙여넣기는 선택을 대체한다 — 선택 삭제와 표 삽입, 캐럿 이동을 한
  // 트랜잭션에 담아 undo 1회로 함께 복원되게 한다. 삭제로 두 문단이
  // 병합되면 병합된 블록(캐럿 위치)이 삽입 기준이 된다.
  let transaction = state.tr;
  if (!state.selection.empty) {
    transaction = transaction.deleteSelection();
  }

  const afterBlockId = currentTopLevelBlockId(
    transaction.doc,
    transaction.selection.to,
  );
  if (afterBlockId === null) {
    return { ok: false, error: { code: "PASTE_TARGET_NOT_FOUND" } };
  }

  const afterPosition = findTopLevelBlockPosition(
    transaction.doc,
    afterBlockId,
  );
  if (afterPosition === null) return blockNotFound(afterBlockId);
  const afterNode = transaction.doc.nodeAt(afterPosition);
  if (afterNode === null) return blockNotFound(afterBlockId);

  const tableNode = tableBlockToTiptapNode(editor.schema, filled.value);
  const insertPosition = afterPosition + afterNode.nodeSize;
  transaction = transaction.insert(insertPosition, tableNode);

  // 표 안 분기의 selectCellId와 대칭 — 캐럿을 붙여넣은 표의 좌상단 셀
  // 안으로 옮긴다.
  const firstCellId = cellIdAtAnchor(filled.value, { row: 0, column: 0 });
  if (firstCellId !== null) {
    const relativeOffset = findCellContentOffset(tableNode, firstCellId);
    if (relativeOffset !== null) {
      const absolutePosition = Math.min(
        insertPosition + 1 + relativeOffset,
        transaction.doc.content.size,
      );
      transaction = transaction.setSelection(
        TextSelection.near(transaction.doc.resolve(absolutePosition)),
      );
    }
  }

  editor.view.dispatch(closeHistory(transaction));

  return { ok: true, value: { blockId: filled.value.id } };
};
