import {
  type IdFactory,
  type Result,
  type TableBlock,
} from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import { CellSelection, selectedRect } from "@tiptap/pm/tables";
import { findTopLevelBlockPosition } from "./block-position.js";
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
  | { code: "PASTE_TARGET_NOT_FOUND" }
  | { code: "MERGE_TARGET_NOT_FOUND" }
  | { code: "TRANSACTION_REJECTED" };

const blockNotFound = (blockId: string): Result<never, TableCommandError> => ({
  ok: false,
  error: { code: "BLOCK_NOT_FOUND", blockId },
});

const tableNotFound = (blockId: string): Result<never, TableCommandError> => ({
  ok: false,
  error: { code: "TABLE_NOT_FOUND", blockId },
});

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

// nextNode(치환 직후의 독립 표 노드) 안에서 cellId가 가리키는 셀의 경계
// 위치(boundary)와 콘텐츠 시작 위치(content)를 nextNode 기준 상대 좌표로
// 찾는다. 찾지 못하면 null.
const findCellOffset = (
  nextNode: ProseMirrorNode,
  cellId: string,
): { boundary: number; content: number } | null => {
  let found: { boundary: number; content: number } | null = null;
  nextNode.descendants((child, pos) => {
    if (found !== null) return false;
    if (child.type.name === "tableCell" && child.attrs.cellId === cellId) {
      found = { boundary: pos, content: pos + 1 };
      return false;
    }
    return true;
  });
  return found;
};

// findCellOffset으로 찾은 셀 안에 캐럿을 놓는다. applyTableGridOperation의
// 병합/분할 직후 캐럿 이동과 pasteTabularData/pasteClipboardContent의
// 붙여넣은 표 좌상단 셀 진입이 모두 같은 절차(오프셋 조회 → 문서 크기로
// clamp → TextSelection.near)를 쓴다 - base(표 노드 시작 위치 + 1, 호출부마다
// 다름)와 node(캐럿을 놓을 표의 tiptap 노드), cellId만 다르다. cellId가 없거나
// 그 셀을 못 찾으면 tr을 그대로 돌려준다 - 캐럿 이동은 no-op이지 실패가 아니다.
export const setCaretInCell = (
  tr: Transaction,
  node: ProseMirrorNode,
  base: number,
  cellId: string | null,
): Transaction => {
  if (cellId === null) return tr;
  const cell = findCellOffset(node, cellId);
  if (cell === null) return tr;
  const absolutePosition = Math.min(base + cell.content, tr.doc.content.size);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(absolutePosition)));
};

// 그리드 연산(applyTableGridOperation) 또는 pasteInto 결과 표에서 anchor
// 좌표를 덮는 셀의 id를 찾는다 — selectCellId 콜백이 operate 결과(연산
// 후 표)를 넘겨받으므로, 여기서 찾는 id는 항상 연산 후 새 id다(연산 전
// id가 아니다). insertTableRow 등 grid-CRUD 명령 7개와 pasteTabularData/
// pasteOutOfTable(table-paste-commands.ts)가 함께 쓴다 — paste 전용이
// 아니다(그릴링 C8, 2026-08-27: 카드 원안은 이 함수를 paste 쪽으로
// 옮기려 했는데, grid 명령이 이미 이 함수에 의존해 순환 참조가 됐다).
export const cellIdAtAnchor = (
  table: TableBlock,
  anchor: { row: number; column: number },
): string | null => {
  const projected = projectTableGrid(table);
  if (!projected.ok) return null;
  return projected.value.cellAt(anchor.row, anchor.column)?.cellId ?? null;
};

// dispatch 전후 editor.state.doc 참조 동일성으로 필터(LinkPolicyExtension
// 등)의 트랜잭션 거절을 감지한다. EditorState.applyTransaction은 filterTransaction이
// false를 반환하면 새 EditorState를 만들지 않고 이전 state를 참조 그대로
// 돌려준다(실측: node_modules/.pnpm/prosemirror-state@1.4.4/.../dist/index.js:793-795).
// 이 저장소는 EditorView의 기본 dispatch 처리를 타지 않는다 — Tiptap이 자신의
// dispatchTransaction을 view prop으로 등록해 가로챈다. 거절되면 그 함수가
// view.updateState 호출 전에 조기 return해 editor.state 참조 자체가 안 바뀐다
// (실측: @tiptap/core@3.30.1/dist/index.js:7020-7046, rootTrWasApplied 체크).
// 결과적으로 editor.state.doc이 dispatch 전후 동일 참조로 남는다 — 이 동일성이
// "필터가 트랜잭션을 버렸다"는 신호다(G-EDT-001의 반대쪽 누락 예방).
// 주의: 이 신호는 트랜잭션에 문서를 바꾸는 스텝이 하나 이상 있을 때만 유효하다
// — 스텝 없는(docChanged: false) 트랜잭션은 필터를 통과해도 doc 참조가 그대로라
// 오탐한다. 아래 3개 호출부(finalizeAndDispatch 경유)는 모두 dispatch 전에 반드시
// replaceWith/insert로 문서를 바꾸므로 안전하다 — selection만 옮기는 트랜잭션(예:
// table-keyboard-extension.ts의 goToNextCell)에는 이 헬퍼를 재사용하지 않는다.
const dispatchAndVerify = (
  editor: Editor,
  transaction: Transaction,
): Result<undefined, TableCommandError> => {
  const before = editor.state.doc;
  editor.view.dispatch(transaction);
  if (editor.state.doc === before) {
    return { ok: false, error: { code: "TRANSACTION_REJECTED" } };
  }
  return { ok: true, value: undefined };
};

// 네이티브 명령들처럼 결과 selection이 화면 안에 오도록 표시하고(뷰포트 밖으로
// 커진 표에서 캐럿만 옮기면 no-op처럼 보인다) undo를 한 스텝으로 닫은 뒤
// dispatchAndVerify로 넘긴다. applyTableGridOperation·insertTable·pasteOutOfTable
// 3곳 전부가 이 마무리를 공유해야 한다 — 예전엔 호출부마다 직접
// closeHistory(tr.scrollIntoView())를 반복했는데, insertTable 한 곳이
// scrollIntoView를 빠뜨려 실제 동작 drift가 났다(그릴링 C7, 2026-08-27).
export const finalizeAndDispatch = (
  editor: Editor,
  transaction: Transaction,
): Result<undefined, TableCommandError> =>
  dispatchAndVerify(editor, closeHistory(transaction.scrollIntoView()));

// findTable(경로 탐색) + tiptapNodeToTableBlock(디코드)를 한 번에 수행한다 —
// applyTableGridOperation(쓰기)과 getTableBlock(읽기)이 공유하는 유일한 조회
// 경로다. applyTableGridOperation은 이후 replaceWith에 position/node가 그대로
// 필요해 세 값을 함께 돌려준다.
const decodeTable = (
  editor: Editor,
  tableBlockId: string,
): Result<
  { position: number; node: ProseMirrorNode; table: TableBlock },
  TableCommandError
> => {
  const found = findTable(editor, tableBlockId);
  if (!found.ok) return found;
  const decoded = tiptapNodeToTableBlock(found.value.node);
  if (!decoded.ok) return decoded;
  return {
    ok: true,
    value: {
      position: found.value.position,
      node: found.value.node,
      table: decoded.value,
    },
  };
};

export const applyTableGridOperation = (
  editor: Editor,
  tableBlockId: string,
  operate: (table: TableBlock) => Result<TableBlock, TableGridError>,
  options?: {
    selectCellId?: (table: TableBlock) => string | null;
    preserveSelection?: boolean;
  },
): Result<void, TableCommandError> => {
  const found = decodeTable(editor, tableBlockId);
  if (!found.ok) return found;
  const { position, node, table: decoded } = found.value;

  const operated = operate(decoded);
  if (!operated.ok) return operated;

  // no-op 연산(동일 인덱스 이동, 동일 너비 리사이즈)은 입력 표를 참조 그대로
  // 반환한다 — 트랜잭션을 만들면 문서는 안 바뀌는데 undo 단계만 쌓인다.
  if (operated.value === decoded) {
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
    const anchorCell = findCellOffset(
      nextNode,
      preservedSelection.anchorCellId,
    );
    const headCell = findCellOffset(nextNode, preservedSelection.headCellId);
    if (anchorCell !== null && headCell !== null) {
      transaction = transaction.setSelection(
        CellSelection.create(
          transaction.doc,
          position + 1 + anchorCell.boundary,
          position + 1 + headCell.boundary,
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
  } else {
    transaction = setCaretInCell(
      transaction,
      nextNode,
      position + 1,
      targetCellId,
    );
  }

  const dispatched = finalizeAndDispatch(editor, transaction);
  if (!dispatched.ok) return dispatched;

  return { ok: true, value: undefined };
};

// decodeTable의 읽기 전용 대응물 — position/node 없이 TableBlock만 필요한
// 호출자가 표 결과를 확인하려고 Tiptap 내부 트리(attrs.cellId/rowspan/colspan
// 등)를 직접 순회하지 않게 한다.
export const getTableBlock = (
  editor: Editor,
  tableBlockId: string,
): Result<TableBlock, TableCommandError> => {
  const found = decodeTable(editor, tableBlockId);
  if (!found.ok) return found;
  return { ok: true, value: found.value.table };
};

export const insertTableRow = (
  editor: Editor,
  tableBlockId: string,
  atIndex: number,
  createId: IdFactory,
): Result<void, TableCommandError> =>
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => insertGridRow(table, atIndex, createId),
    {
      selectCellId: (table) =>
        cellIdAtAnchor(table, { row: atIndex, column: 0 }),
    },
  );

export const insertTableColumn = (
  editor: Editor,
  tableBlockId: string,
  atIndex: number,
  createId: IdFactory,
): Result<void, TableCommandError> =>
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => insertGridColumn(table, atIndex, createId),
    {
      selectCellId: (table) =>
        cellIdAtAnchor(table, { row: 0, column: atIndex }),
    },
  );

export const deleteTableRow = (
  editor: Editor,
  tableBlockId: string,
  index: number,
): Result<void, TableCommandError> =>
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => deleteGridRow(table, index),
    {
      selectCellId: (table) =>
        cellIdAtAnchor(table, {
          row: Math.min(index, table.rows.length - 1),
          column: 0,
        }),
    },
  );

export const deleteTableColumn = (
  editor: Editor,
  tableBlockId: string,
  index: number,
): Result<void, TableCommandError> =>
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => deleteGridColumn(table, index),
    {
      selectCellId: (table) =>
        cellIdAtAnchor(table, {
          row: 0,
          column: Math.min(index, table.columns.length - 1),
        }),
    },
  );

export const moveTableRow = (
  editor: Editor,
  tableBlockId: string,
  fromIndex: number,
  toIndex: number,
): Result<void, TableCommandError> =>
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => moveGridRow(table, fromIndex, toIndex),
    {
      selectCellId: (table) =>
        cellIdAtAnchor(table, { row: toIndex, column: 0 }),
    },
  );

export const moveTableColumn = (
  editor: Editor,
  tableBlockId: string,
  fromIndex: number,
  toIndex: number,
): Result<void, TableCommandError> =>
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => moveGridColumn(table, fromIndex, toIndex),
    {
      selectCellId: (table) =>
        cellIdAtAnchor(table, { row: 0, column: toIndex }),
    },
  );

export const resizeTableColumn = (
  editor: Editor,
  tableBlockId: string,
  index: number,
  width: number,
): Result<void, TableCommandError> =>
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => resizeGridColumn(table, index, width),
    { preserveSelection: true },
  );

export const mergeTableCells = (
  editor: Editor,
  tableBlockId: string,
): Result<void, TableCommandError> => {
  // 병합 범위의 유일한 권위는 현재 CellSelection이다(spec 6.2) — 호출자는
  // 좌표를 다시 계산해 넘기지 않는다. 선택이 이미 바뀌었거나 다른 표를
  // 가리키면 조작 불가로 거절한다.
  if (!(editor.state.selection instanceof CellSelection)) {
    return { ok: false, error: { code: "MERGE_TARGET_NOT_FOUND" } };
  }
  const rect = selectedRect(editor.state);
  if (rect.table.attrs.blockId !== tableBlockId) {
    return { ok: false, error: { code: "MERGE_TARGET_NOT_FOUND" } };
  }
  const from = { row: rect.top, column: rect.left };
  const to = { row: rect.bottom - 1, column: rect.right - 1 };

  return applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => mergeGridCells(table, from, to),
    // 병합 결과에서 살아남는 기준 셀은 두 코너 중 row/column이 더 작은 쪽 —
    // cellIdAtAnchor에 미리 min을 적용해 넘긴다. 실패하면 null(선택 이동을
    // 생략하고 replaceWith의 기본 selection 매핑에 맡긴다).
    {
      selectCellId: (table) =>
        cellIdAtAnchor(table, {
          row: Math.min(from.row, to.row),
          column: Math.min(from.column, to.column),
        }),
    },
  );
};

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
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => toggleGridHeaderRow(table),
    { preserveSelection: true },
  );

export const toggleTableHeaderColumn = (
  editor: Editor,
  tableBlockId: string,
): Result<void, TableCommandError> =>
  applyTableGridOperation(
    editor,
    tableBlockId,
    (table) => toggleGridHeaderColumn(table),
    { preserveSelection: true },
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
  const dispatched = finalizeAndDispatch(editor, transaction);
  if (!dispatched.ok) return dispatched;

  return { ok: true, value: { blockId: table.id } };
};
