import { Extension } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import {
  Plugin,
  TextSelection,
  type EditorState,
  type Selection,
} from "@tiptap/pm/state";

import { outermostCollapsedContainerDepth } from "./toggle-collapse-hidden.js";

// selection 끝점이 접힌 toggleListItem의 숨은 자손 안에 있으면 가장 바깥
// 접힌 toggle의 라벨 끝으로 옮긴다(Issue #246). 숨은 그룹은 display:none이라
// DOM이 캐럿을 둘 수 없다. 브라우저가 가까운 보이는 텍스트로 캐럿을 옮겨
// 입력이 엉뚱한 블록으로 간다. 명령·키 입력·API 경로마다 막는 대신 이
// 불변식을 한 곳에서 지킨다.
//
// 판정 기준은 ToggleCollapseVisibilityExtension과 같다. `collapsed === true`인
// toggleListItem만 본다. 판정은 끝점의 조상 체인(깊이 O(d))만 훑고 문서
// 전체를 스캔하지 않는다.

// 가장 바깥 접힌 toggle의 라벨 끝 위치. 숨지 않았으면 null이다.
const clampedPosition = ($pos: ResolvedPos): number | null => {
  const depth = outermostCollapsedContainerDepth($pos);
  if (depth === null) return null;
  const container = $pos.node(depth);
  const label = container.child(0);
  // start(depth)는 컨테이너 콘텐츠 시작이다. 라벨 닫는 토큰 앞이 라벨 끝이다.
  return $pos.start(depth) + label.nodeSize - 1;
};

// 보정할 selection을 만든다. 보정이 필요 없으면 null이다.
const clampSelection = (
  state: EditorState,
  selection: Selection,
): Selection | null => {
  if (selection instanceof TextSelection) {
    // 끝점별로 clamp한다. 숨은 쪽만 옮기고 반대편은 유지한다.
    const anchor = clampedPosition(selection.$anchor);
    const head = clampedPosition(selection.$head);
    if (anchor === null && head === null) return null;
    return TextSelection.create(
      state.doc,
      anchor ?? selection.anchor,
      head ?? selection.head,
    );
  }
  // NodeSelection·CellSelection·GapCursor는 끝점을 따로 옮길 수 없다. 하나라도
  // 숨으면 라벨 끝 캐럿으로 바꾼다.
  const target =
    clampedPosition(selection.$from) ?? clampedPosition(selection.$to);
  return target === null ? null : TextSelection.create(state.doc, target);
};

export const ToggleCollapseSelectionGuardExtension = Extension.create({
  name: "toggleCollapseSelectionGuard",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _previousState, nextState) => {
          // doc이나 selection이 바뀐 경우만 검사한다. selection만 바꾸는
          // transaction(setSelection API·방향키)도 대상이라 docChanged만 보지 않는다.
          if (
            !transactions.some(
              (transaction) =>
                transaction.docChanged || transaction.selectionSet,
            )
          ) {
            return null;
          }
          const next = clampSelection(nextState, nextState.selection);
          if (next === null) return null;
          // selection만 바꾸는 appended tr이다. history 단계를 추가하지 않는다.
          return nextState.tr.setSelection(next).setMeta("addToHistory", false);
        },
      }),
    ];
  },
});
