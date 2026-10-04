import { type Editor, Extension } from "@tiptap/core";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";

import { resolveSelectionAwareState } from "./selection-aware-state.js";
import {
  isCollapsedToggleContent,
  outermostCollapsedContainerDepth,
} from "./toggle-collapse-hidden.js";

// 접힌 toggle 라벨 끝에서 ArrowDown·ArrowRight가 숨은 첫 자식 atom에 막히는
// 결함을 고친다(Issue #254). ProseMirror는 라벨 끝에서 키를 누르면 다음
// 위치(숨은 첫 자식)가 atom일 때 그 NodeSelection을 만든다(capturekeys의
// moveSelectionBlock). 선택 가드(Issue #246)가 그 NodeSelection을 라벨 끝으로
// 되돌려 캐럿이 제자리에 갇힌다. 이 확장이 키를 먼저 받아 접힌 container 뒤
// 첫 선택 가능 위치로 옮긴다.
//
// 키를 소비하는 조건은 아래 넷이다. 하나라도 어긋나면 false를 반환해
// 네이티브 이동에 맡긴다.
// - selection이 빈 TextSelection이다. Shift 등 조합 키는 바인딩에서 걸러진다.
// - $head가 접힌 toggle 라벨 끝이다. endOfTextblock이 레이아웃을 읽으므로
//   라벨 판정 뒤에 부른다.
// - 방향 이동이 고를 첫 위치가 숨은 자손의 NodeSelection이다. 첫 숨은 자식이
//   텍스트블록이면 네이티브 이동이 이미 맞다(Chromium 실측).
// - endOfTextblock가 throw하지 않는다.
//
// 라벨 중간(한 줄 라벨의 캐럿이 끝이 아닌 경우)의 ArrowDown은 이 확장이 다루지
// 않는다. PM이 만든 숨은 NodeSelection을 가드가 라벨 끝으로 되돌린다.
//
// 클릭 직후 DOM 캐럿이 대상 밖이면 live selection이 라벨 끝이어도 소비하지
// 않고 폴스루한다(G-EDT-002의 소비형 규칙을 적용하지 않는다). 폴스루한 기본
// 동작이 파괴적이지 않다. 숨은 NodeSelection이 생겨도 가드가 라벨 끝으로
// 되돌릴 뿐 문서는 바뀌지 않는다.

type ArrowKey = "down" | "forward";

// 접힌 toggle container 뒤 첫 선택 가능 위치. 라벨 끝 캐럿이 아니면 null이다.
const collapsedToggleExitSelection = (
  editor: Editor,
  direction: ArrowKey,
): { selection: Selection | null } | null => {
  const state = resolveSelectionAwareState(editor);
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  const { $head } = selection;
  if ($head.depth < 2) return null;
  if (!isCollapsedToggleContent($head.parent)) return null;
  if ($head.parentOffset !== $head.parent.content.size) return null;
  try {
    if (!editor.view.endOfTextblock(direction, state)) return null;
  } catch {
    // jsdom처럼 레이아웃이 없으면 던진다. 판정 불가로 보고 개입하지 않는다.
    return null;
  }
  // PM이 고를 첫 위치(moveSelectionBlock과 같은 계산)가 숨은 atom인지 본다.
  const first = Selection.findFrom(state.doc.resolve($head.after()), 1);
  if (
    !(first instanceof NodeSelection) ||
    outermostCollapsedContainerDepth(first.$from) === null
  ) {
    return null;
  }
  // blockContainer 뒤 첫 선택 가능 위치다. 마지막 자식이면 부모 뒤로 올라간다.
  const exit = Selection.findFrom(
    state.doc.resolve($head.after($head.depth - 1)),
    1,
  );
  return { selection: exit };
};

// 키를 소비했으면 true다. 목적지가 없으면 소비만 하고 이동하지 않는다.
const moveOutOfCollapsedToggle = (
  editor: Editor,
  direction: ArrowKey,
): boolean => {
  const exit = collapsedToggleExitSelection(editor, direction);
  if (exit === null) return false;
  if (exit.selection === null) return true;
  // selection만 바꾸는 dispatch 1회다(G-EDT-001). 파생 state와 live state는
  // 같은 doc을 공유한다(G-EDT-002).
  const { view } = editor;
  view.dispatch(view.state.tr.setSelection(exit.selection).scrollIntoView());
  return true;
};

export const ToggleCollapseArrowKeyExtension = Extension.create({
  name: "toggleCollapseArrowKey",

  addKeyboardShortcuts() {
    return {
      ArrowDown: () => moveOutOfCollapsedToggle(this.editor, "down"),
      ArrowRight: () => moveOutOfCollapsedToggle(this.editor, "forward"),
    };
  },
});
