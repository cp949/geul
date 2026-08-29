import type { Result } from "@cp949/geul-model";
import { type Editor, Extension } from "@tiptap/core";
import { type EditorState, TextSelection } from "@tiptap/pm/state";
import { CellSelection, isInTable } from "@tiptap/pm/tables";

import type { EditorError } from "./errors.js";
import { indentBlockCommand, outdentBlockCommand } from "./indent-commands.js";

// table-keyboard-extension.ts의 resolveSelectionAwareState와 동일 로직의
// 복제본이다. 원본은 export하지 않는 모듈 비공개 함수라 그대로 가져다 쓸 수
// 없고, 공유 모듈로 뽑으면 원본 파일에 diff가 생겨 완료 조건("diff 0")과
// 충돌한다(구현 판단 — 복제를 택했다). 클릭 직후 Tab/Shift+Tab이 눌리면
// Chromium의 비동기 selectionchange 처리 탓에 editor.state.selection이 클릭
// 이전 값을 그대로 들고 있을 수 있다(G-EDT-002, Issue #118과 같은 부류).
// 실제 DOM selection으로 다시 계산한 EditorState를 **판정에만** 쓴다 —
// isInTable 가드와 대상 blockId 추출이 전부이고, 파생 state는 dispatch하지
// 않으며 이후 호출하는 기존 명령(indentBlockCommand/outdentBlockCommand)은
// live editor state 위에서 자체적으로 단일 dispatch를 만든다(파생 state를
// 명령에 넘기지 않으므로 mismatched-transaction 위험도 없다).
// CellSelection(범위 선택)은 네이티브 Selection API로 대표되지 않으므로
// 건드리지 않는다.
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

// 캐럿(state.selection.$from)에서 가장 가까운 blockContainer 조상의
// blockId를 찾는다. depth 역순으로 올라가며 첫 blockContainer를 찾으면 그
// attrs.blockId를 반환한다 — 스키마상 blockContainer는 항상 유효한
// blockId를 갖지만 방어적으로 없으면 null이다.
const nearestBlockContainerId = (state: EditorState): string | null => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "blockContainer") {
      const blockId = node.attrs.blockId;
      return typeof blockId === "string" && blockId.length > 0 ? blockId : null;
    }
  }
  return null;
};

// 표 셀 안이면 표 셀 탐색(TableKeyboardNavigationExtension)에 양보하고
// (false), 표 밖이면 캐럿이 속한 blockContainer를 대상으로 command를
// 호출한다. command가 성공한 경우에만 true를 반환해 키 이벤트를 소비한다.
// 적용할 block이 없거나 command가 COMMAND_NOT_APPLICABLE 등으로 실패하면
// false를 반환해 브라우저 기본 순차 포커스 이동을 허용한다.
const routeToBlockCommand = (
  editor: Editor,
  command: (editor: Editor, blockId: string) => Result<void, EditorError>,
): boolean => {
  const state = resolveSelectionAwareState(editor);
  if (isInTable(state)) return false;

  const blockId = nearestBlockContainerId(state);
  if (blockId === null) return false;
  return command(editor, blockId).ok;
};

export const indentBlockShortcut = (editor: Editor): boolean =>
  routeToBlockCommand(editor, indentBlockCommand);

export const outdentBlockShortcut = (editor: Editor): boolean =>
  routeToBlockCommand(editor, outdentBlockCommand);

// 표 밖 Tab/Shift+Tab을 indentBlockCommand/outdentBlockCommand로 라우팅한다
// (spec §5.2 Tab 3분기 중 "그 외 → indent/outdent" 분기). 옵션이 없다 — 두
// 명령 모두 createId를 쓰지 않는다. Tiptap 3.30.1은 같은 priority에서 나중
// 등록된 확장의 keymap을 먼저 실행하므로(sortExtensions(...).reverse()) 이
// 확장과 TableKeyboardNavigationExtension의 등록 순서는 정확성을 보장하지
// 않는다 — 이 확장은 자체 isInTable 가드로 정확성을 보장하므로 등록 순서에
// 기대지 않는다(Ruling D4).
export const IndentKeyboardExtension = Extension.create({
  name: "indentKeyboard",

  addKeyboardShortcuts() {
    return {
      Tab: () => indentBlockShortcut(this.editor),
      "Shift-Tab": () => outdentBlockShortcut(this.editor),
    };
  },
});
