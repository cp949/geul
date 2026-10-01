import { Extension, isMacOS, isiOS } from "@tiptap/core";
import { redo } from "@tiptap/pm/history";
import { Plugin } from "@tiptap/pm/state";

// Issue #219 — 툴바 버튼처럼 에디터 밖 비편집 요소에 포커스가 있을 때
// `Mod-Shift-z`·`Mod-y`가 redo하지 않던 결함.
//
// 원인 조사(Chromium 153 실측):
// - 포커스가 버튼에 있으면 keydown의 target이 그 버튼이라 view.dom의
//   keymap(`@tiptap/extensions`의 UndoRedo)이 이벤트를 보지 못한다.
// - 이때 브라우저는 `beforeinput`(`historyRedo`)을 보내지 않는다.
//   `document.execCommand("redo")`도 `false`다.
// - undo는 HistoryNativeUndoFallbackExtension이 `beforeinput(historyUndo)`
//   로 처리하고 `preventDefault`한다. 순수 contenteditable 대조군에서도
//   `historyUndo`를 `preventDefault`하면 이후 `historyRedo`가 오지 않는다.
//   가설: 네이티브 redo 스택이 비는 것이 원인이다. Blink 소스는 확인하지
//   않았다.
// - 결론: `beforeinput` 경로로는 redo를 라우팅할 수 없다. keydown 단계에서
//   가로챈다. undo(beforeinput)와 redo(keydown)의 경로가 비대칭인 이유다.
//
// 가로채기 조건(모두 만족할 때만 실행, G-EDT-004):
// 1. 다른 핸들러가 이미 처리하지 않았다(`defaultPrevented`).
// 2. view가 편집 가능하다.
// 3. 조합 입력 중이 아니다.
// 4. 키가 `Mod-Shift-z` 또는 `Mod-y`다.
// 5. target이 view.dom 밖의 Node다. 안쪽은 keymap이 처리한다.
// 6. target이 입력 컨트롤(input·textarea·select)이나 편집 영역이 아니다.
//    그 컨트롤 자신의 redo를 훔치지 않는다.
// 7. `document.getSelection()`이 이 view.dom 안에 있다. 다른 편집기
//    인스턴스의 redo를 훔치지 않는 유일한 신호다(focus가 아니라
//    selection 기준).
//
// 리스너는 document bubble 단계에 둔다. React 합성 이벤트나 툴바 자체
// onKeyDown이 먼저 처리할 기회를 주고, `defaultPrevented`로 양보한다.

/** `event.key`가 가시 ASCII 문자만으로 이루어졌는지 본다. */
const isAsciiKey = (key: string): boolean => /^[ -~]+$/.test(key);

/**
 * keydown이 redo 단축키(`Shift-Mod-z` 또는 `Mod-y`)인지 정확히 판별한다.
 *
 * - `Mod`는 `apple`이면 Meta, 아니면 Ctrl이다. 반대쪽 modifier와 Alt는
 *   눌려 있으면 안 된다.
 * - 키는 `event.key`를 소문자로 비교한다. `event.key`가 비ASCII(한글
 *   두벌식 등)이면 `event.code`(`KeyZ`·`KeyY`)로 폴백한다. ProseMirror
 *   keymap이 같은 상황에서 `keyCode`로 폴백하는 것과 맞춘 것이다.
 */
export const isHistoryRedoShortcut = (
  event: KeyboardEvent,
  apple: boolean,
): boolean => {
  const mod = apple ? event.metaKey : event.ctrlKey;
  const otherMod = apple ? event.ctrlKey : event.metaKey;
  if (!mod || otherMod || event.altKey) return false;

  const key = event.key.toLowerCase();
  const letter = isAsciiKey(key)
    ? key
    : event.code === "KeyZ"
      ? "z"
      : event.code === "KeyY"
        ? "y"
        : key;

  if (event.shiftKey) return letter === "z";
  return letter === "y";
};

/** keydown target이 자기 selection·undo 스택을 가진 입력 대상인지 본다. */
export const isInputTarget = (target: Element): boolean => {
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (target as HTMLElement).isContentEditable === true
  );
};

export const HistoryRedoKeydownFallbackExtension = Extension.create({
  name: "historyRedoKeydownFallback",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(editorView) {
          const ownerDocument = editorView.dom.ownerDocument;
          const apple = isMacOS() || isiOS();
          const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || !editorView.editable) return;
            if (event.isComposing) return;
            if (!isHistoryRedoShortcut(event, apple)) return;

            const target = event.target;
            if (!(target instanceof Node)) return;
            if (editorView.dom.contains(target)) return;
            if (target instanceof Element && isInputTarget(target)) return;

            const selection = ownerDocument.getSelection();
            const anchor =
              selection?.focusNode ?? selection?.anchorNode ?? null;
            if (anchor === null || !editorView.dom.contains(anchor)) return;

            // redo할 것이 없어도 막는다. 막지 않으면 브라우저 기본 동작이
            // 이어진다.
            event.preventDefault();
            redo(editorView.state, editorView.dispatch);
          };
          ownerDocument.addEventListener("keydown", handleKeyDown);
          return {
            destroy() {
              ownerDocument.removeEventListener("keydown", handleKeyDown);
            },
          };
        },
      }),
    ];
  },
});
