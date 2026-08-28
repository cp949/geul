import type { IdFactory } from "@cp949/geul-model";
import { type Editor, Extension } from "@tiptap/core";
import { type EditorState, TextSelection } from "@tiptap/pm/state";
import {
  CellSelection,
  goToNextCell,
  isInTable,
  moveCellForward,
  nextCell,
  selectedRect,
  selectionCell,
} from "@tiptap/pm/tables";

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
      };
    },
  });
