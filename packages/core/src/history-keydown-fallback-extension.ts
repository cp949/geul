import { Extension, isMacOS, isiOS } from "@tiptap/core";
import { redo, undo } from "@tiptap/pm/history";
import { Plugin } from "@tiptap/pm/state";

import { getCustomKeyboardShortcutsStorage } from "./custom-keyboard-shortcuts-extension.js";
import { isElementNode, isNode } from "./dom-node.js";

// Issue #219, Issue #222 — 툴바 버튼처럼 에디터 밖 비편집 요소에 포커스가
// 있을 때 `Mod-Shift-z`·`Mod-y`가 redo하지 않고, `Mod-z`가 툴바 명령을
// undo하지 않던 결함.
//
// redo 원인 조사(Issue #219, Chromium 153 실측):
// - 포커스가 버튼에 있으면 keydown의 target이 그 버튼이라 view.dom의
//   keymap(`@tiptap/extensions`의 UndoRedo)이 이벤트를 보지 못한다.
// - 이때 브라우저는 `beforeinput`(`historyRedo`)을 보내지 않는다.
//   `document.execCommand("redo")`도 `false`다.
// - 순수 contenteditable 대조군에서도 `historyUndo`를 `preventDefault`하면
//   이후 `historyRedo`가 오지 않는다. 가설: 네이티브 redo 스택이 비는 것이
//   원인이다. Blink 소스는 확인하지 않았다.
// - 결론: `beforeinput` 경로로는 redo를 라우팅할 수 없다. keydown 단계에서
//   가로챈다.
//
// undo 원인 조사(Issue #222, Chromium 실측):
// - 툴바 명령(Quote 등) 뒤 버튼 포커스의 `Mod-z`는 keydown만 온다.
//   `beforeinput`(`historyUndo`)이 오지 않는다.
// - 글자를 입력한 뒤에는 `historyUndo`가 온다. 그래서 입력은 되돌려지고
//   툴바 명령은 되돌려지지 않았다.
// - 가설: 툴바 명령은 브라우저 native undo 스택에 항목을 남기지 않는다.
//   스택이 비면 브라우저가 `historyUndo`를 보내지 않는다.
// - 결론: undo도 keydown 단계에서 가로챈다. keydown을 `preventDefault`하면
//   `beforeinput`이 오지 않는다. `beforeinput` 경로
//   (HistoryNativeUndoFallbackExtension, `prosemirror-history`)와 이중
//   실행되지 않는다.
//
// 가로채기 조건(모두 만족할 때만 실행, G-EDT-004). undo와 redo가 공유한다.
// 1. 다른 핸들러가 이미 처리하지 않았다(`defaultPrevented`).
// 2. view가 편집 가능하다.
// 3. 조합 입력 중이 아니다.
// 4. 키가 `Mod-z`(undo) 또는 `Mod-Shift-z`·`Mod-y`(redo)다.
// 5. target이 view.dom 밖의 Node다. 안쪽은 keymap이 처리한다.
// 6. target이 입력 컨트롤(input·textarea·select)이나 편집 영역이 아니다.
//    그 컨트롤 자신의 undo·redo를 훔치지 않는다.
// 7. `document.getSelection()`이 이 view.dom 안에 있다. 다른 편집기
//    인스턴스의 undo·redo를 훔치지 않는 유일한 신호다(focus가 아니라
//    selection 기준).
//
// 8. 소비자 우선(Issue #319). `CreateEditorOptions.keyboardShortcuts`에
//    등록한 handler가 이 키와 맞고 `true`를 반환하면 `preventDefault`만 하고
//    내장 undo·redo를 건너뛴다. `false`거나 등록이 없으면 내장 동작이 이어진다.
//    조건 1–7을 통과한 keydown에서만 부른다. 호출 대상은 이 확장이 undo·redo로
//    판정한 세 키뿐이다.
// 9. 실행. `preventDefault` 뒤 `undo`·`redo`를 호출한다. 8번에서 소비자가
//    처리했으면 건너뛴다.
//
// 리스너는 document bubble 단계에 둔다. React 합성 이벤트나 툴바 자체
// onKeyDown이 먼저 처리할 기회를 주고, `defaultPrevented`로 양보한다.

/** `event.key`가 가시 ASCII 문자만으로 이루어졌는지 본다. */
const isAsciiKey = (key: string): boolean => /^[ -~]+$/.test(key);

/**
 * keydown의 modifier가 정확히 `Mod`(Shift는 호출부가 판정)이면 누른 글자를
 * 소문자로 돌려준다. 아니면 `null`이다.
 *
 * - `Mod`는 `apple`이면 Meta, 아니면 Ctrl이다. 반대쪽 modifier와 Alt는
 *   눌려 있으면 안 된다.
 * - 글자는 `event.key`를 소문자로 읽는다. `event.key`가 비ASCII(한글
 *   두벌식 등)이면 `event.code`(`KeyZ`·`KeyY`)로 폴백한다. ProseMirror
 *   keymap이 같은 상황에서 `keyCode`로 폴백하는 것과 맞춘 것이다.
 */
const historyShortcutLetter = (
  event: KeyboardEvent,
  apple: boolean,
): string | null => {
  const mod = apple ? event.metaKey : event.ctrlKey;
  const otherMod = apple ? event.ctrlKey : event.metaKey;
  if (!mod || otherMod || event.altKey) return null;

  const key = event.key.toLowerCase();
  return isAsciiKey(key)
    ? key
    : event.code === "KeyZ"
      ? "z"
      : event.code === "KeyY"
        ? "y"
        : key;
};

/**
 * keydown이 redo 단축키(`Shift-Mod-z` 또는 `Mod-y`)인지 정확히 판별한다.
 * modifier와 글자 판별은 `historyShortcutLetter`를 따른다.
 */
export const isHistoryRedoShortcut = (
  event: KeyboardEvent,
  apple: boolean,
): boolean => {
  const letter = historyShortcutLetter(event, apple);
  if (letter === null) return false;
  if (event.shiftKey) return letter === "z";
  return letter === "y";
};

/**
 * keydown이 undo 단축키(`Mod-z`)인지 정확히 판별한다. Shift가 있으면
 * redo라 거절한다. modifier와 글자 판별은 `historyShortcutLetter`를 따른다.
 */
export const isHistoryUndoShortcut = (
  event: KeyboardEvent,
  apple: boolean,
): boolean => !event.shiftKey && historyShortcutLetter(event, apple) === "z";

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

export const HistoryKeydownFallbackExtension = Extension.create({
  name: "historyKeydownFallback",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        view(editorView) {
          const ownerDocument = editorView.dom.ownerDocument;
          const apple = isMacOS() || isiOS();
          const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || !editorView.editable) return;
            if (event.isComposing) return;
            const command = isHistoryUndoShortcut(event, apple)
              ? undo
              : isHistoryRedoShortcut(event, apple)
                ? redo
                : null;
            if (command === null) return;

            // iframe 문서의 target은 다른 realm 인스턴스다. 전역 생성자
            // `instanceof` 대신 `nodeType`으로 판정한다(Issue #272).
            const target = event.target;
            if (!isNode(target)) return;
            if (editorView.dom.contains(target)) return;
            if (isElementNode(target) && isInputTarget(target)) return;

            const selection = ownerDocument.getSelection();
            const anchor =
              selection?.focusNode ?? selection?.anchorNode ?? null;
            if (anchor === null || !editorView.dom.contains(anchor)) return;

            // 소비자 우선(조건 8, Issue #319). 등록한 keyboardShortcuts
            // handler가 true를 반환하면 내장 undo·redo를 건너뛴다. storage는
            // keyboardShortcuts를 지정한 편집기에만 있다.
            const consumed =
              getCustomKeyboardShortcutsStorage(editor)?.handleKeyDown(
                editorView,
                event,
              ) === true;

            // undo·redo할 것이 없어도 막는다. 막지 않으면 브라우저 기본
            // 동작이 이어진다.
            event.preventDefault();
            if (consumed) return;
            command(editorView.state, editorView.dispatch);
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
