import {
  type ClipboardContent,
  type ClipboardContentBlock,
  type TabularCell,
  type TabularData,
  validateTabularData,
} from "@cp949/geul-io";
import {
  type IdFactory,
  type InlineContent,
  MAX_TABLE_LOGICAL_CELLS,
  type Result,
  type TableBlock,
  type TextMark,
} from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type {
  Node as ProseMirrorNode,
  ResolvedPos,
  Schema,
} from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection, isInTable, selectedRect } from "@tiptap/pm/tables";
import {
  inlineContentToTiptap,
  inlineContentViolation,
} from "./model-to-tiptap.js";
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
  | { code: "CLIPBOARD_CONTENT_INVALID"; message: string }
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

  // 네이티브 명령들처럼 결과 selection이 화면 안에 오도록 표시한다 —
  // 뷰포트 밖으로 커진 표에서 캐럿만 옮기면 no-op처럼 보인다.
  editor.view.dispatch(closeHistory(transaction.scrollIntoView()));

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

// $pos가 표 노드 안에 있는지 — 조상 depth를 거슬러 올라가며 검사한다.
// isInTable은 $head만 보므로 선택의 양 끝을 각각 판정하는 데 쓴다.
const positionInsideTable = (position: ResolvedPos): boolean => {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    if (position.node(depth).type.name === "table") return true;
  }
  return false;
};

// 선택 삭제 후 캐럿(to)이 새 표를 끼울 최상위 위치: 캐럿이 안쪽에 닿은
// (offset < to) 마지막 최상위 블록 바로 뒤. 첫 블록 앞 GapCursor(to === 0)는
// 어떤 블록도 조건을 만족하지 않아 문서 맨 앞이 된다 — 커서가 '가리키기
// 직전인' 블록 뒤에 붙이면 표가 한 블록 아래로 밀린다. blockId에 의존하지
// 않으므로 AllSelection 삭제가 남긴 필러 문단(BlockIdExtension은
// appendTransaction에서야 id를 부여한다) 뒤에도 정상 삽입된다.
const tableInsertPosition = (doc: ProseMirrorNode, to: number): number => {
  let position = 0;
  doc.forEach((node, offset) => {
    if (offset < to) position = offset + node.nodeSize;
  });
  return position;
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

// pasteTabularData/pasteClipboardContent 공용 검증이다 — 둘 다 공개 API라
// 클립보드 파서를 거치지 않은 TabularData도 직접 들어온다. 뮤테이션 전에
// 구조(직사각형 커버리지)와 셀 인라인 텍스트를 모두 검증해야 잘못된
// 데이터가 문서를 깨뜨리지 않는다(PIT-0003).
// NaN·비정수 columnCount는 `< 1` 비교를 통과해 하류 산술(new Array 등)에서
// RangeError로 터진다 — 크기 가드가 정수성까지 함께 판정한다.
const validateTabularDataForPaste = (
  data: TabularData,
): Result<undefined, TableCommandError> => {
  if (
    !Number.isInteger(data.columnCount) ||
    data.rows.length < 1 ||
    data.columnCount < 1
  ) {
    return { ok: false, error: { code: "INVALID_TABLE_SIZE" } };
  }

  if (data.rows.length * data.columnCount > MAX_TABLE_LOGICAL_CELLS) {
    return { ok: false, error: { code: "CELL_LIMIT_EXCEEDED" } };
  }

  const validated = validateTabularData(data);
  if (!validated.ok) {
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

  for (const [rowIndex, row] of data.rows.entries()) {
    for (const [cellIndex, cellEntry] of row.cells.entries()) {
      const violation = inlineContentViolation(cellEntry.content);
      if (violation !== null) {
        return {
          ok: false,
          error: {
            code: "TABULAR_DATA_INVALID",
            message: `Cell content at row ${rowIndex}, cell ${cellIndex} ${violation}`,
          },
        };
      }
    }
  }

  return { ok: true, value: undefined };
};

export const pasteTabularData = (
  editor: Editor,
  data: TabularData,
  createId: IdFactory,
): Result<{ blockId: string }, TableCommandError> => {
  const state = editor.state;

  const validated = validateTabularDataForPaste(data);
  if (!validated.ok) return validated;

  // 표 안이면 selectedRect의 좌상단을 anchor로 삼아 pasteInto로 덮어쓰고,
  // 표 밖이면 현재 최상위 블록 뒤에 pasteInto로 채운 새 표를 끼운다. 두
  // 경로 모두 격자 레벨 연산(TableGrid.pasteInto)을 공유한다.
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
  //
  // 단, 끝점이 표 안에 있는 범위(표를 부분적으로 걸친 선택)는 지우지
  // 않는다: 그런 범위를 deleteSelection으로 지우면 ReplaceStep이 스키마
  // 필러로 cellId 없는 셀을 만들어 모델과 에디터가 영구 desync된다.
  // 표를 통째로 포함하는 선택은 노드 단위로 깔끔하게 지워지므로 끝점
  // 검사만으로 충분하다.
  let transaction = state.tr;
  if (
    !state.selection.empty &&
    !positionInsideTable(state.selection.$from) &&
    !positionInsideTable(state.selection.$to)
  ) {
    transaction = transaction.deleteSelection();
  }

  const tableNode = tableBlockToTiptapNode(editor.schema, filled.value);
  const insertPosition = tableInsertPosition(
    transaction.doc,
    transaction.selection.to,
  );
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

  // 네이티브 doPaste가 보장하는 scrollIntoView와 동일 — 캐럿이 옮겨간 새
  // 표가 뷰포트 밖이면 화면이 따라가야 한다.
  editor.view.dispatch(closeHistory(transaction.scrollIntoView()));

  return { ok: true, value: { blockId: filled.value.id } };
};

const buildSequenceNode = (
  schema: Schema,
  block: ClipboardContentBlock,
  createId: IdFactory,
): Result<
  { node: ProseMirrorNode; table: TableBlock | null },
  TableCommandError
> => {
  if (block.type === "paragraph") {
    // blockId 없이 만든다 — BlockIdExtension.appendTransaction이 같은
    // dispatch 안에서 사후 배정한다(tableInsertPosition 근처 주석의 필러
    // 문단 처리와 같은 확립된 패턴).
    const node = schema.nodeFromJSON({
      type: "paragraph",
      content: inlineContentToTiptap(block.content),
    });
    return { ok: true, value: { node, table: null } };
  }

  const emptyTable = buildPasteTableSkeleton(
    { rows: block.data.rows.length, columns: block.data.columnCount },
    createId,
  );
  const filled = pasteGridInto(
    emptyTable,
    { row: 0, column: 0 },
    block.data,
    createId,
  );
  if (!filled.ok) return filled;

  return {
    ok: true,
    value: {
      node: tableBlockToTiptapNode(schema, filled.value),
      table: filled.value,
    },
  };
};

const markRunKey = (marks: TextMark[] | undefined): string =>
  JSON.stringify(
    (marks ?? []).map((mark) =>
      mark.type === "link" ? `link:${mark.href}` : mark.type,
    ),
  );

// 인라인 런을 이어 붙이되 이웃한 같은 마크 런은 하나로 합치고 빈 런은
// 버린다 — inlineContentViolation이 인접 동일 마크 런과 빈 텍스트 런을 모두
// 거절하므로, 구분자를 끼워 넣는 쪽이 io의 normalizeCellContent와 같은 병합
// 형태를 유지해야 한다. 원본 런 객체는 수정하지 않고 교체한다(호출자가 넘긴
// ClipboardContent를 건드리지 않는다).
const appendInlineRuns = (target: InlineContent, runs: InlineContent): void => {
  for (const run of runs) {
    if (run.text.length === 0) continue;
    const previous = target.at(-1);
    if (
      previous !== undefined &&
      markRunKey(previous.marks) === markRunKey(run.marks)
    ) {
      target[target.length - 1] = {
        ...previous,
        text: previous.text + run.text,
      };
      continue;
    }
    target.push(run);
  }
};

// 세그먼트들을 LF 하나로 이어 붙인다. 빈 세그먼트는 건너뛰므로 빈 셀 앞뒤에
// 구분자만 남는 일이 없다. 셀 안 줄바꿈을 LF로 표현하는 것은 기존 셀 텍스트
// 계약과 같다(inlineContentFromNodes가 `<br>`을 LF로 바꾼다).
const joinInlineSegments = (segments: InlineContent[]): InlineContent => {
  const joined: InlineContent = [];
  for (const segment of segments) {
    if (segment.every((run) => run.text.length === 0)) continue;
    if (joined.length > 0) appendInlineRuns(joined, [{ text: "\n" }]);
    appendInlineRuns(joined, segment);
  }
  return joined;
};

// 논리 열 좌표가 가장 작은/큰 셀의 배열 인덱스. TabularData.rows[].cells의
// 배열 순서는 열 순서의 권위가 아니므로(공개 API로 직접 들어온 데이터는
// 정렬돼 있지 않을 수 있다) columnIndex로 판정한다.
const extremeCellIndex = (
  cells: TabularCell[],
  pick: "min" | "max",
): number | null => {
  let found: number | null = null;
  for (const [index, cell] of cells.entries()) {
    const current = cells[found ?? -1];
    if (
      current === undefined ||
      (pick === "min"
        ? cell.columnIndex < current.columnIndex
        : cell.columnIndex > current.columnIndex)
    ) {
      found = index;
    }
  }
  return found;
};

// 표 셀은 블록 자식을 가질 수 없다(model `TableCell.content: InlineContent`).
// 커서가 이미 표 안이면 문단을 별도 블록으로 끼울 자리가 없는데, 그렇다고
// 버리면 조용한 텍스트 손실이다(변경 전에는 같은 클립보드가 NOT_TABULAR로
// Tiptap 기본 붙여넣기에 넘어가 텍스트가 셀에 남았다). 읽기 순서를 지켜
// 셀 인라인 콘텐츠에 합친다 — 표 앞 문단은 좌상단 셀 앞에, 표 뒤 문단은
// 마지막 셀 뒤에 붙는다. 1×1 표에서는 두 셀이 같으므로 앞뒤가 한 셀에
// 순서대로 쌓인다.
const withParagraphsMergedIntoCells = (
  data: TabularData,
  leading: InlineContent[],
  trailing: InlineContent[],
): TabularData => {
  if (leading.length === 0 && trailing.length === 0) return data;

  const rows = data.rows.map((row) => ({ cells: [...row.cells] }));
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  if (firstRow === undefined || lastRow === undefined) return data;

  if (leading.length > 0) {
    const index = extremeCellIndex(firstRow.cells, "min");
    const cell = index === null ? undefined : firstRow.cells[index];
    if (index !== null && cell !== undefined) {
      firstRow.cells[index] = {
        ...cell,
        content: joinInlineSegments([...leading, cell.content]),
      };
    }
  }

  if (trailing.length > 0) {
    const index = extremeCellIndex(lastRow.cells, "max");
    const cell = index === null ? undefined : lastRow.cells[index];
    if (index !== null && cell !== undefined) {
      lastRow.cells[index] = {
        ...cell,
        content: joinInlineSegments([cell.content, ...trailing]),
      };
    }
  }

  return { columnCount: data.columnCount, rows };
};

// 클립보드가 준 시퀀스(문단+표+문단 등)를 붙인다. parseClipboardTable이
// 표가 fragment의 유일한 실질 콘텐츠일 때 반환하는 단일 표 시퀀스는
// pasteTabularData에 그대로 위임해 기존 표 안/밖 계약(TBL-012~014)을
// 한 글자도 바꾸지 않는다 — 새 경로는 문단이 섞인 시퀀스에서만 탄다.
export const pasteClipboardContent = (
  editor: Editor,
  content: ClipboardContent,
  createId: IdFactory,
): Result<{ blockId: string }, TableCommandError> => {
  const onlyBlock = content.length === 1 ? content[0] : undefined;
  if (onlyBlock?.type === "table") {
    return pasteTabularData(editor, onlyBlock.data, createId);
  }
  if (content.length === 0) {
    return { ok: false, error: { code: "PASTE_TARGET_NOT_FOUND" } };
  }

  // 뮤테이션 전에 시퀀스 전체를 검증한다(PIT-0003) — 표 부분은
  // pasteTabularData와 같은 구조·서식·셀 한도 검증, 문단은 편집 가능
  // 콘텐츠 계약만 적용한다.
  for (const block of content) {
    if (block.type === "paragraph") {
      const violation = inlineContentViolation(block.content);
      if (violation !== null) {
        return {
          ok: false,
          error: {
            code: "CLIPBOARD_CONTENT_INVALID",
            message: `Paragraph content ${violation}`,
          },
        };
      }
      continue;
    }
    const validated = validateTabularDataForPaste(block.data);
    if (!validated.ok) return validated;
  }

  const state = editor.state;

  if (isInTable(state)) {
    // 시퀀스의 표 부분은 기존 grid-paste 경로로 붙이고, 문단은 블록으로
    // 끼울 자리가 없으므로 withParagraphsMergedIntoCells가 셀 텍스트에
    // 합친다. 표 블록이 둘 이상인 시퀀스는 parseClipboardTable이 만들지
    // 않는다(findDataTable이 표 하나만 고른다, TBL-012) — 공개 API로 직접
    // 들어온 경우에만 가능하고, 그때는 첫 표만 붙인다.
    const tableIndex = content.findIndex((entry) => entry.type === "table");
    const tableBlock = content[tableIndex];
    if (tableIndex === -1 || tableBlock?.type !== "table") {
      return { ok: false, error: { code: "PASTE_TARGET_NOT_FOUND" } };
    }

    const paragraphContent = (
      blocks: readonly ClipboardContentBlock[],
    ): InlineContent[] =>
      blocks
        .filter(
          (
            entry,
          ): entry is Extract<ClipboardContentBlock, { type: "paragraph" }> =>
            entry.type === "paragraph",
        )
        .map((entry) => [...entry.content]);

    return pasteTabularData(
      editor,
      withParagraphsMergedIntoCells(
        tableBlock.data,
        paragraphContent(content.slice(0, tableIndex)),
        paragraphContent(content.slice(tableIndex + 1)),
      ),
      createId,
    );
  }

  // 표 밖: 시퀀스를 순서대로 노드로 조립한다. 실패 가능한 계산
  // (pasteGridInto)을 전부 먼저 끝내고 dispatch는 마지막에 한 번만 한다 —
  // pasteTabularData의 표 밖 분기와 같은 원자성 패턴(PIT-0003).
  let firstTable: {
    data: TableBlock;
    node: ProseMirrorNode;
    offset: number;
  } | null = null;
  let runningOffset = 0;
  const nodes: ProseMirrorNode[] = [];

  for (const block of content) {
    const built = buildSequenceNode(editor.schema, block, createId);
    if (!built.ok) return built;
    if (firstTable === null && built.value.table !== null) {
      firstTable = {
        data: built.value.table,
        node: built.value.node,
        offset: runningOffset,
      };
    }
    nodes.push(built.value.node);
    runningOffset += built.value.node.nodeSize;
  }

  if (firstTable === null) {
    // parseClipboardTable은 표를 하나도 못 찾으면 이 시퀀스를 만들지
    // 않는다 — 여기 도달하는 유일한 길은 파서를 거치지 않고 직접 구성한
    // 순수 문단 ClipboardContent다. 반환할 blockId가 없으므로 거절한다.
    return { ok: false, error: { code: "PASTE_TARGET_NOT_FOUND" } };
  }

  let transaction = state.tr;
  if (
    !state.selection.empty &&
    !positionInsideTable(state.selection.$from) &&
    !positionInsideTable(state.selection.$to)
  ) {
    transaction = transaction.deleteSelection();
  }

  const insertPosition = tableInsertPosition(
    transaction.doc,
    transaction.selection.to,
  );
  transaction = transaction.insert(insertPosition, nodes);

  // 표 안 분기의 selectCellId, pasteTabularData 표 밖 분기의 캐럿 이동과
  // 대칭 — 시퀀스의 첫 표 좌상단 셀 안으로 캐럿을 옮긴다. firstTable.offset은
  // 그 표 앞에 삽입된 문단들의 누적 크기다(표가 시퀀스 첫 원소면 0이라
  // pasteTabularData의 기존 공식과 동일해진다).
  const firstCellId = cellIdAtAnchor(firstTable.data, { row: 0, column: 0 });
  if (firstCellId !== null) {
    const relativeOffset = findCellContentOffset(firstTable.node, firstCellId);
    if (relativeOffset !== null) {
      const absolutePosition = Math.min(
        insertPosition + firstTable.offset + 1 + relativeOffset,
        transaction.doc.content.size,
      );
      transaction = transaction.setSelection(
        TextSelection.near(transaction.doc.resolve(absolutePosition)),
      );
    }
  }

  editor.view.dispatch(closeHistory(transaction.scrollIntoView()));

  return { ok: true, value: { blockId: firstTable.data.id } };
};
