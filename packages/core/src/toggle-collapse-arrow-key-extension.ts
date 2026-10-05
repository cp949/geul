import { type Editor, Extension } from "@tiptap/core";
import { Selection, TextSelection } from "@tiptap/pm/state";

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
// 첫 숨은 자식이 문단·표여도 소비한다(Issue #261). 네이티브 이동에 맡기면
// 뒤 보이는 atom을 건너뛰거나 엔진마다 착지가 다르다.
//
// 키를 소비하는 조건은 아래 넷이다. 하나라도 어긋나면 false를 반환해
// 네이티브 이동에 맡긴다.
// - selection이 빈 TextSelection이다. Shift 등 조합 키는 바인딩에서 걸러진다.
// - $head가 접힌 toggle 라벨 안이다. ArrowRight는 라벨 끝만 소비한다.
//   ArrowDown은 라벨 어디서든 소비한다(Issue #255). endOfTextblock이
//   레이아웃을 읽으므로 라벨 판정 뒤에 부른다.
// - 방향 이동이 고를 첫 위치가 숨은 자손이다. Selection 종류는 보지 않는다.
//   숨은 문단·표 셀이면 TextSelection, 숨은 atom이면 NodeSelection이다.
//   자식 없는 접힌 toggle은 첫 위치가 다음 보이는 블록이라 소비하지 않는다.
// - endOfTextblock가 throw하지 않는다.
//
// 라벨 중간의 ArrowRight는 글자 한 칸 이동이라 가로채지 않는다. 라벨 중간의
// ArrowDown은 endOfTextblock("down")이 마지막 줄만 통과시킨다. 여러 줄 라벨의
// 첫 줄이면 거짓이라 네이티브가 다음 줄로 보낸다. ArrowDown 착지는 시작 고정이다.
// goal column은 유지하지 않는다.
//
// 클릭 직후 DOM 캐럿이 대상 밖이면 live selection이 라벨 끝이어도 소비하지
// 않고 폴스루한다(G-EDT-002의 소비형 규칙을 적용하지 않는다). 폴스루한 기본
// 동작이 파괴적이지 않다. 숨은 NodeSelection이 생겨도 가드가 라벨 끝으로
// 되돌릴 뿐 문서는 바뀌지 않는다.

type ArrowKey = "down" | "forward";

// 접힌 toggle container 뒤 첫 선택 가능 위치. 소비 조건에 안 맞으면 null이다.
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
  // 라벨 끝 요구는 ArrowRight만 갖는다. ArrowDown은 endOfTextblock이 마지막 줄을 가른다.
  if (
    direction === "forward" &&
    $head.parentOffset !== $head.parent.content.size
  ) {
    return null;
  }
  try {
    if (!editor.view.endOfTextblock(direction, state)) return null;
  } catch {
    // jsdom처럼 레이아웃이 없으면 던진다. 판정 불가로 보고 개입하지 않는다.
    return null;
  }
  // 라벨 뒤 첫 선택 가능 위치(Selection.findFrom)가 숨은 자손인지 본다.
  const first = Selection.findFrom(state.doc.resolve($head.after()), 1);
  if (
    first === null ||
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
