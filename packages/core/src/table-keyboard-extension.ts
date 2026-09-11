import type { IdFactory } from "@cp949/geul-model";
import { type Editor, Extension } from "@tiptap/core";
import { type EditorState, Selection, TextSelection } from "@tiptap/pm/state";
import {
  CellSelection,
  goToNextCell,
  isInTable,
  moveCellForward,
  nextCell,
  selectedRect,
  selectionCell,
} from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

import { insertTableRow } from "./table-commands.js";

// 클릭 직후 Chromium은 selectionchange를 비동기로 처리한다 — 클릭 직후 곧바로
// Tab/Shift+Tab이 눌리면 이 핸들러가 그 비동기 갱신보다 먼저 실행돼
// editor.state.selection이 클릭 이전 값을 그대로 들고 있을 수 있다(Issue
// #118). 네이티브 DOM selection은 이미 정확하므로, 그 값으로 다시 계산한
// EditorState를 판정·이동에 쓴다. 파생 state는 dispatch하지 않고 그 위에서
// 만든 기존 명령의 단일 view.dispatch에 그대로 흘려보낸다(G-EDT-001, "한
// 사용자 조작 = 하나의 transaction" — derivedState.doc는 view.state.doc와
// 같은 참조라 안전하다). CellSelection(범위 선택)은 네이티브 Selection API로
// 대표되지 않으므로 건드리지 않는다.
const resolveSelectionAwareState = (editor: Editor): EditorState => {
  const { view } = editor;
  const liveState = view.state;
  if (liveState.selection instanceof CellSelection) return liveState;
  const domSelection = view.dom.ownerDocument.getSelection();
  if (domSelection === null || domSelection.focusNode === null)
    return liveState;
  // view.posAtDOM은 뷰 밖 노드에서 항상 예외를 던지지 않는다 — 음수
  // sentinel(-1)을 돌려주는 경우를 실측했다. doc.resolve(pos)까지 같은
  // try에 넣어 그 경우도 조용히 원래 state로 폴백한다.
  try {
    const pos = view.posAtDOM(domSelection.focusNode, domSelection.focusOffset);
    const resynced = TextSelection.near(liveState.doc.resolve(pos));
    if (resynced.eq(liveState.selection)) return liveState;
    return liveState.apply(liveState.tr.setSelection(resynced));
  } catch {
    return liveState;
  }
};

// Tab/Shift+Tab 셀 탐색(spec 7.2, TBL-010/TBL-011). 표 밖에서는 아무 일도
// 하지 않고 false를 반환해 브라우저 기본 Tab(포커스 이동)에 맡긴다.
export const goToNextTableCellOrInsertRow = (
  editor: Editor,
  createId: IdFactory,
): boolean => {
  const state = resolveSelectionAwareState(editor);
  if (!isInTable(state)) return false;

  if (goToNextCell(1)(state, editor.view.dispatch)) return true;

  // 마지막 셀의 Tab: 새 행을 추가하고 그 첫 셀로 캐럿을 옮긴다(TBL-011).
  // insertTableRow가 명령 정의 자체에 selectCellId(새 행 0열 셀)를
  // 내장하므로(G-TBL-001) 이 caller는 별도 콜백을 넘기지 않는다.
  const rect = selectedRect(state);
  const tableBlockId = rect.table.attrs.blockId;
  if (typeof tableBlockId !== "string" || tableBlockId.length === 0) {
    return false;
  }
  const atIndex = rect.map.height;
  const result = insertTableRow(editor, tableBlockId, atIndex, createId);
  return result.ok;
};

export const goToPreviousTableCell = (editor: Editor): boolean => {
  const state = resolveSelectionAwareState(editor);
  if (!isInTable(state)) return false;
  goToNextCell(-1)(state, editor.view.dispatch);
  // 첫 셀에서는 이동할 곳이 없어도(dispatch가 일어나지 않아도) 표 밖으로
  // 포커스가 빠지지 않게 소비한다.
  return true;
};

// 셀 안 Enter(spec 7.2, Issue #134). 표 밖에서는 false를 반환해 코어 Enter
// 체인(블록 분할)에 맡긴다. 표 안에서는 무조건 소비한다 — 코어 체인의
// liftEmptyBlock/splitBlock이 행·셀을 분할해 중복·빈 ID로 문서를 손상시키는
// 폴스루를 차단한다("모든 블록, 행, 열과 셀은 안정 ID를 가진다" 불변식).
// 아래 행 같은 열 셀이 있으면 Tab(goToNextCell)과 같은 selection 형태로
// 이동한다 — 병합 셀 격자 판정은 자체 좌표 계산 없이 nextCell이
// 소유한다(G-TBL-001). 마지막 행이면 dispatch 없이 no-op이다(G-EDT-001 —
// no-op은 transaction을 만들지 않는다). CellSelection 중에도 표 안이므로
// 소비한다 — selectionCell이 기준 셀($anchorCell/$headCell 중 뒤쪽)을 준다.
export const goToTableCellBelow = (editor: Editor): boolean => {
  const state = resolveSelectionAwareState(editor);
  // 역방향 stale — DOM 캐럿은 표 밖인데 live selection이 아직 셀 안이면
  // false 폴스루 시 코어 Enter 체인이 live stale selection에 분할 tr을
  // 적용해 행·셀을 손상시킨다. 이동 없이 소비만 한다(no-op true).
  if (!isInTable(state)) return isInTable(editor.view.state);
  const $below = nextCell(selectionCell(state), "vert", 1);
  if ($below === null) return true;
  editor.view.dispatch(
    state.tr
      .setSelection(TextSelection.between($below, moveCellForward($below)))
      .scrollIntoView(),
  );
  return true;
};

// 셀 안 Shift+Enter(spec 7.2). 스키마에 hardBreak가 없어 폴스루 결과가
// 비결정적이므로 표 안에서는 무조건 소비해 no-op으로 만든다(transaction
// 0개, G-EDT-001). 표 밖은 기존 동작에 맡긴다. live state 검사는
// goToTableCellBelow와 같은 역방향 stale 방어다.
export const consumeKeyInsideTable = (editor: Editor): boolean =>
  isInTable(resolveSelectionAwareState(editor)) || isInTable(editor.view.state);

// prosemirror-tables의 tableEditing()이 등록하는 기본 ArrowLeft/Right/Up/Down
// 처리(내부 함수 arrow(), atEndOfCell() — 둘 다 export되지 않는다)는 셀
// 콘텐츠가 paragraph 등으로 한 단계 더 감싸인 스키마를 가정한다: 그
// atEndOfCell은 $head.depth - 1부터 조상을 훑어 tableRole "cell"을 찾는다.
// geul의 tableCell은 content가 "inline*"이라 셀 자신이 곧 텍스트블록이고
// $head.node($head.depth)가 이미 셀이다 — 원본 walk-up은 $head.depth - 1(행)에서
// 시작해 셀 자체를 한 번도 조상으로 만나지 못하고 항상 null을 반환한다.
// 그 결과 atEndOfCell(view, axis, dir)가 항상 null이라 arrow()가 항상 false를
// 반환하고, ArrowLeft/Right/Up/Down 네 방향 모두 표 격자를 모르는 브라우저
// 기본 캐럿 이동(좌표 기반 hit-test)에 통째로 맡겨진다 — 1행1열에서
// ArrowDown이 2행1열로 가지 않는 등 부자연스러운 이동의 원인이다. 셀 깊이를
// $head.depth로 직접 잡아 같은 계약(레이아웃상 셀의 시작/끝일 때만 개입)을
// 이 스키마에 맞게 다시 구현한다.
const atEndOfTableCell = (
  view: EditorView,
  axis: "horiz" | "vert",
  dir: -1 | 1,
): number | null => {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection)) return null;
  const { $head } = selection;
  const cell = $head.node($head.depth);
  const role = cell.type.spec.tableRole;
  if (role !== "cell" && role !== "header_cell") return null;
  const dirName =
    axis === "vert" ? (dir > 0 ? "down" : "up") : dir > 0 ? "right" : "left";
  try {
    // endOfTextblock이 판정 전부를 진다 — 줄바꿈 없는 짧은 셀이면 시작·끝
    // 문자 위치와 무관하게 그 한 줄 전체가 "첫 줄이자 마지막 줄"이고, 줄바꿈
    // 셀이면 실제 렌더 rect(getClientRects)로 시각적 첫/마지막 줄인지를
    // 가린다. 여기서 parentOffset(문자 오프셋)으로 미리 거르면 줄바꿈 셀의
    // 중간 줄 끝에서 오탐한다 — endOfTextblock 위임이 필수다. jsdom처럼
    // 레이아웃이 없는 환경은 세로(up/down) 판정에 필요한
    // Range.getClientRects를 구현하지 않아 던진다(실측, table-selection-toolbar.test.tsx의
    // Shift+Arrow 주석과 같은 한계). 판정 불가로 보고 개입하지 않는다.
    return view.endOfTextblock(dirName) ? $head.before($head.depth) : null;
  } catch {
    return null;
  }
};

const maybeSetTableSelection = (
  editor: Editor,
  state: EditorState,
  next: Selection,
): boolean => {
  if (next.eq(state.selection)) return false;
  editor.view.dispatch(state.tr.setSelection(next).scrollIntoView());
  return true;
};

// 셀 안 화살표 단독 키(Shift 없음)의 표 인지 이동. 캐럿이 셀의 시작/끝(줄바꿈
// 셀은 첫/마지막 줄)이 아니면 false를 반환해 셀 안 일반 캐럿 이동을 그대로
// 둔다. 가로(좌우)는 원본 arrow()와 같은 단순 위치 산술로 옮긴다 — 표 위치는
// 문서 전체에서 연속이라 열 경계에서 다음/이전 행으로 자연스럽게 이어지고
// (Shift-Tab의 읽기 순서 이동과 같은 방향), 표의 첫/마지막 칸에서는 표
// 밖으로 나간다. 세로(상하)는 단순 산술로 "같은 열"을 표현할 수 없어
// nextCell(TableMap 기반, 병합 셀 인지, G-TBL-001)로 같은 열의 다음/이전
// 행을 찾고, 그 열에 해당 행이 없으면(첫/마지막 행) 표 앞/뒤로 나간다.
export const moveTableCellCaret = (
  editor: Editor,
  axis: "horiz" | "vert",
  dir: -1 | 1,
): boolean => {
  const state = resolveSelectionAwareState(editor);
  if (!isInTable(state)) return false;
  const { selection } = state;

  // CellSelection 위 화살표는 헤드 셀 기준으로 캐럿을 접는다(원본 arrow()와
  // 같은 계약) — 셀 범위 선택 중 방향키를 누르면 그 방향의 캐럿으로 좁힌다.
  if (selection instanceof CellSelection) {
    return maybeSetTableSelection(
      editor,
      state,
      Selection.near(selection.$headCell, dir),
    );
  }
  // 세로 이동은 캐럿(빈 선택)에서만 개입한다 — 텍스트 범위 선택 중 상하
  // 화살표는 기본 동작(선택 해제 등)에 맡긴다.
  if (axis === "vert" && !selection.empty) return false;

  const end = atEndOfTableCell(editor.view, axis, dir);
  if (end === null) return false;

  if (axis === "horiz") {
    return maybeSetTableSelection(
      editor,
      state,
      Selection.near(state.doc.resolve(selection.head + dir), dir),
    );
  }

  const $cell = state.doc.resolve(end);
  const $next = nextCell($cell, axis, dir);
  const target =
    $next !== null
      ? Selection.near($next, 1)
      : dir < 0
        ? Selection.near(state.doc.resolve($cell.before(-1)), -1)
        : Selection.near(state.doc.resolve($cell.after(-1)), 1);
  return maybeSetTableSelection(editor, state, target);
};

export type TableKeyboardNavigationOptions = {
  createId: IdFactory;
};

export const TableKeyboardNavigationExtension =
  Extension.create<TableKeyboardNavigationOptions>({
    name: "tableKeyboardNavigation",

    addOptions() {
      return {
        createId: () => {
          throw new Error(
            "TableKeyboardNavigationExtension requires a createId option",
          );
        },
      };
    },

    addKeyboardShortcuts() {
      return {
        Tab: () =>
          goToNextTableCellOrInsertRow(this.editor, this.options.createId),
        "Shift-Tab": () => goToPreviousTableCell(this.editor),
        Enter: () => goToTableCellBelow(this.editor),
        "Shift-Enter": () => consumeKeyInsideTable(this.editor),
        ArrowLeft: () => moveTableCellCaret(this.editor, "horiz", -1),
        ArrowRight: () => moveTableCellCaret(this.editor, "horiz", 1),
        ArrowUp: () => moveTableCellCaret(this.editor, "vert", -1),
        ArrowDown: () => moveTableCellCaret(this.editor, "vert", 1),
      };
    },
  });
