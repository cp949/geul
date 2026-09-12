import { Extension } from "@tiptap/core";
import { redo, undo } from "@tiptap/pm/history";
import { Plugin } from "@tiptap/pm/state";

// Issue #183 — Chrome83(Debian 스냅샷 고정 바이너리, ADR-0008 floor 근접
// 실검증 대상)에서만 재현된 회귀. 원인은 우리 command/transaction이 아니라
// 브라우저 자체의 `beforeinput`(inputType `historyUndo`/`historyRedo`)
// target 계산 차이다(현장 조사, 01-계획.md "## 결정" 근거).
//
// 정상 경로: 포커스가 실제로 ProseMirror view.dom 안에 있으면 `Mod-z`
// keymap(`@tiptap/extensions`의 UndoRedo)이 keydown 단계에서 바로
// `undo()`를 호출하고 preventDefault해, 아래 네이티브 undo 자체가 시도되지
// 않는다.
//
// 이 shim이 다루는 경로: 메뉴 버튼처럼 mousedown을 막아 selection을
// 보존하는 컨트롤(preserveFocusOnMouseDown, menu-item-button.tsx)이 아닌
// 외부 버튼(예: "Save JSON")을 클릭해 focus만 옮겨간 뒤 Ctrl+Z를 누르는
// 경우다. keydown의 target이 그 버튼이라 view.dom의 keymap이 이벤트를 보지
// 못하고, 브라우저의 기본 동작(네이티브 undo)이 대신 실행된다. 이때 표준
// 스펙은 `beforeinput`을 "현재 selection이 속한 editing host"로 보내야
// 하는데(Chromium 최신판 실측: target이 view.dom), Chrome83은 이 target을
// 대신 "현재 focus된 무관한 요소"로 잘못 계산한다(실측:
// `check-beforeinput.mjs` 스파이크 — target이 그 버튼). `prosemirror-history`의
// `history()` 플러그인은 이 이벤트를 `handleDOMEvents.beforeinput`으로
// view.dom에서만 가로채므로(prosemirror-history/dist/index.js:386-394),
// Chrome83에서는 그 가로채기가 아예 실행되지 않고 네이티브 DOM 삭제가
// 그대로 반영된다 — 그 결과가 MutationObserver를 거쳐 "새 순방향
// transaction"으로 기록되어 undo 스택은 오히려 깊어지고(pop이 아니라
// push), textColor 같은 노드 attrs는 애초에 그 DOM 변형 대상이 아니라
// 그대로 남는다.
//
// 고치는 방법: 같은 가로채기를 `document`(view.dom의 owner document)
// 수준에서 한 번 더 시도한다. `defaultPrevented`를 먼저 확인해 view.dom
// 자신의 가로채기가 이미 처리한 경우(정상 엔진 경로, view.editable이
// false라 그 플러그인이 스스로 건너뛴 경우 포함해 직접 재확인)는
// 건너뛰어 중복 실행을 막는다. 이 editor가 대상이 맞는지는
// `event.target`(Chrome83에서는 무관한 요소라 못 믿는다) 대신 실제
// `document.getSelection()`이 이 view.dom 안에 있는지로 판정한다 —
// 무관한 input/textarea나 다른 geul-core 인스턴스가 만든 historyUndo를
// 가로채지 않기 위한 유일한 신뢰 가능한 신호다(input/textarea에 focus가
// 있으면 그 컨트롤 자신의 selection 개념이 따로 있어 DOM Selection이 이
// view.dom을 가리키지 않는다 — 실측).
export const HistoryNativeUndoFallbackExtension = Extension.create({
  name: "historyNativeUndoFallback",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(editorView) {
          const ownerDocument = editorView.dom.ownerDocument;
          const handleBeforeInput = (event: InputEvent) => {
            if (event.defaultPrevented || !editorView.editable) return;
            const command =
              event.inputType === "historyUndo"
                ? undo
                : event.inputType === "historyRedo"
                  ? redo
                  : null;
            if (command === null) return;

            const selection = ownerDocument.getSelection();
            const anchor =
              selection?.focusNode ?? selection?.anchorNode ?? null;
            if (anchor === null || !editorView.dom.contains(anchor)) return;

            event.preventDefault();
            command(editorView.state, editorView.dispatch);
          };
          // capture 없이 document bubble 단계에 둔다 — view.dom 자신의
          // handleDOMEvents.beforeinput(prosemirror-history)이 target
          // 단계에서 먼저 실행되고 나서(정상 엔진 경로) 이 리스너에
          // 닿으므로, 그 시점의 defaultPrevented가 이미 그 판단을
          // 반영한다.
          ownerDocument.addEventListener("beforeinput", handleBeforeInput);
          return {
            destroy() {
              ownerDocument.removeEventListener(
                "beforeinput",
                handleBeforeInput,
              );
            },
          };
        },
      }),
    ];
  },
});
