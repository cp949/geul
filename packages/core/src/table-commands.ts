import {
  type ClipboardContent,
  type ClipboardContentBlock,
  type TabularData,
  validateTabularData,
  withParagraphsMergedIntoCells,
} from "@cp949/geul-io";
import {
  type IdFactory,
  type InlineContent,
  MAX_TABLE_LOGICAL_CELLS,
  type Result,
  type TableBlock,
} from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import { CellSelection, isInTable, selectedRect } from "@tiptap/pm/tables";
import { findTopLevelBlockPosition } from "./block-position.js";
import { inlineContentViolation } from "./model-to-tiptap.js";
import { buildOutOfTableSequence } from "./table-paste-sequence.js";
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
const setCaretInCell = (
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
// 오탐한다. 아래 4개 호출부는 모두 dispatch 전에 반드시 replaceWith/insert로
// 문서를 바꾸므로 안전하다 — selection만 옮기는 트랜잭션(예:
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

const applyTableGridOperation = (
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

  // 네이티브 명령들처럼 결과 selection이 화면 안에 오도록 표시한다 —
  // 뷰포트 밖으로 커진 표에서 캐럿만 옮기면 no-op처럼 보인다.
  const dispatched = dispatchAndVerify(
    editor,
    closeHistory(transaction.scrollIntoView()),
  );
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
  const dispatched = dispatchAndVerify(editor, closeHistory(transaction));
  if (!dispatched.ok) return dispatched;

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
// 데이터가 문서를 깨뜨리지 않는다(G-EDT-001).
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

// 표 밖 삽입 조립+마무리: 클립보드 시퀀스(문단+표+문단 등, 표 하나짜리
// 시퀀스도 포함)를 노드로 조립하고 트랜잭션(선택 삭제 판단→삽입 위치
// 계산→노드 삽입→캐럿 이동→dispatch)까지 마무리한다. pasteTabularData(표
// 하나짜리 시퀀스로 감싸 호출)와 pasteClipboardContent(문단이 섞인
// 시퀀스)가 공유한다(4차 아키텍처 리뷰 카드 T) — content 검증은 호출부
// 책임으로 남긴다, buildOutOfTableSequence와 같은 계약이다.
const pasteOutOfTable = (
  editor: Editor,
  content: ClipboardContent,
  createId: IdFactory,
): Result<{ blockId: string }, TableCommandError> => {
  const state = editor.state;
  const sequence = buildOutOfTableSequence(editor.schema, content, createId);
  if (!sequence.ok) return sequence;
  const { nodes, firstTable } = sequence.value;

  if (firstTable === null) {
    // parseClipboardTable은 표를 하나도 못 찾으면 이 시퀀스를 만들지
    // 않는다 — 여기 도달하는 유일한 길은 파서를 거치지 않고 직접 구성한
    // 순수 문단 ClipboardContent다. 반환할 blockId가 없으므로 거절한다.
    return { ok: false, error: { code: "PASTE_TARGET_NOT_FOUND" } };
  }

  // 붙여넣기는 선택을 대체한다 — 선택 삭제와 삽입, 캐럿 이동을 한
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

  const insertPosition = tableInsertPosition(
    transaction.doc,
    transaction.selection.to,
  );
  transaction = transaction.insert(insertPosition, nodes);

  // 표 안 분기의 selectCellId와 대칭 — 시퀀스의 첫 표 좌상단 셀 안으로
  // 캐럿을 옮긴다. firstTable.offset은 그 표 앞에 삽입된 노드들의 누적
  // 크기다(표가 시퀀스 첫 원소면 0 — 표 하나짜리 호출도 이 공식을 그대로
  // 만족한다).
  const firstCellId = cellIdAtAnchor(firstTable.data, { row: 0, column: 0 });
  transaction = setCaretInCell(
    transaction,
    firstTable.node,
    insertPosition + firstTable.offset + 1,
    firstCellId,
  );

  // 네이티브 doPaste가 보장하는 scrollIntoView와 동일 — 캐럿이 옮겨간 새
  // 콘텐츠가 뷰포트 밖이면 화면이 따라가야 한다.
  const dispatched = dispatchAndVerify(
    editor,
    closeHistory(transaction.scrollIntoView()),
  );
  if (!dispatched.ok) return dispatched;

  return { ok: true, value: { blockId: firstTable.data.id } };
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

  // 표 밖 분기는 표 하나짜리 시퀀스로 감싸 pasteOutOfTable에 위임한다 —
  // pasteClipboardContent의 표 밖 분기(문단이 섞인 시퀀스)와 조립·트랜잭션
  // 마무리를 공유한다(4차 아키텍처 리뷰 카드 T).
  return pasteOutOfTable(editor, [{ type: "table", data }], createId);
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

  // 뮤테이션 전에 시퀀스 전체를 검증한다(G-EDT-001) — 표 부분은
  // pasteTabularData와 같은 구조·서식·셀 한도 검증, 문단과 제목은 편집 가능
  // 콘텐츠 계약만 적용한다.
  for (const block of content) {
    if (block.type === "paragraph" || block.type === "heading") {
      const violation = inlineContentViolation(block.content);
      if (violation !== null) {
        const blockTypeLabel =
          block.type === "heading" ? "Heading" : "Paragraph";
        return {
          ok: false,
          error: {
            code: "CLIPBOARD_CONTENT_INVALID",
            message: `${blockTypeLabel} content ${violation}`,
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
    // 표 블록이 둘 이상인 경우 다중 표를 명시적으로 거절한다 — 표 안
    // 분기에서는 문단을 별도 블록으로 끼울 수 없으므로 다중 표를 지원할 수
    // 없다. TBL-012(성능 계약)는 표 크기 한도이지 "표 1개" 제품 계약이 아니다.
    const tableCount = content.filter((entry) => entry.type === "table").length;
    if (tableCount > 1) {
      return {
        ok: false,
        error: {
          code: "CLIPBOARD_CONTENT_INVALID",
          message: "Cannot paste multiple tables inside an existing table cell",
        },
      };
    }

    const tableIndex = content.findIndex((entry) => entry.type === "table");
    const tableBlock = content[tableIndex];
    if (tableIndex === -1 || tableBlock?.type !== "table") {
      return { ok: false, error: { code: "PASTE_TARGET_NOT_FOUND" } };
    }

    // 문단과 heading 둘 다 셀에 병합될 자격이 있다(표는 블록 자식을 가질
    // 수 없어 heading의 level도 문단과 동일하게 텍스트만 남긴다, DELTA-04
    // Issue #72) — 이름을 paragraphContent에서 넓혀 그 사실을 반영한다.
    const mergeableInlineContent = (
      blocks: readonly ClipboardContentBlock[],
    ): InlineContent[] =>
      blocks
        .filter(
          (
            entry,
          ): entry is Extract<
            ClipboardContentBlock,
            { type: "paragraph" | "heading" }
          > => entry.type === "paragraph" || entry.type === "heading",
        )
        .map((entry) => [...entry.content]);

    return pasteTabularData(
      editor,
      withParagraphsMergedIntoCells(
        tableBlock.data,
        mergeableInlineContent(content.slice(0, tableIndex)),
        mergeableInlineContent(content.slice(tableIndex + 1)),
      ),
      createId,
    );
  }

  // 표 밖: 조립과 트랜잭션 마무리(선택 삭제 판단→삽입→캐럿 이동→dispatch)는
  // pasteTabularData의 표 밖 분기와 pasteOutOfTable을 공유한다(4차
  // 아키텍처 리뷰 카드 T).
  return pasteOutOfTable(editor, content, createId);
};
