import type { Editor } from "@tiptap/core";
import { type EditorState, TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";

// 클릭 직후 keydown은 PM state보다 native DOM selection이 먼저 갱신될 수
// 있다(G-EDT-002). 실제 document transaction을 만들지 않고 selection 판정용
// EditorState만 파생한다. 호출부는 파생 state로 document를 바꾸는 transaction을
// 만들지 않으며, 실제 selection-only dispatch도 live state에서 시작한다.
export const resolveSelectionAwareState = (editor: Editor): EditorState => {
  const { view } = editor;
  const liveState = view.state;
  if (liveState.selection instanceof CellSelection) return liveState;
  const domSelection = view.dom.ownerDocument.getSelection();
  if (
    domSelection === null ||
    domSelection.anchorNode === null ||
    domSelection.focusNode === null
  ) {
    return liveState;
  }
  // view.posAtDOM은 뷰 밖 노드에서 음수 sentinel(-1)을 반환할 수 있다.
  // doc.resolve까지 같은 try에 두어 예외와 무효 위치를 모두 폴백한다.
  try {
    const anchor = view.posAtDOM(
      domSelection.anchorNode,
      domSelection.anchorOffset,
    );
    const head = view.posAtDOM(
      domSelection.focusNode,
      domSelection.focusOffset,
    );
    const resynced = TextSelection.between(
      liveState.doc.resolve(anchor),
      liveState.doc.resolve(head),
    );
    if (resynced.eq(liveState.selection)) return liveState;
    return liveState.apply(liveState.tr.setSelection(resynced));
  } catch {
    return liveState;
  }
};
