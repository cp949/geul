import { Extension } from "@tiptap/core";
import { isHistoryTransaction } from "@tiptap/pm/history";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { isInputTarget } from "./history-redo-keydown-fallback-extension.js";

// Issue #221 — 툴바 버튼처럼 에디터 밖 요소에 포커스가 있을 때 undo·redo하면
// `document.activeElement`가 `BODY`로 유실되던 결함.
//
// 원인 조사(Chromium 153, prosemirror-view@1.42.3 실측):
// - history가 selection을 복원해도 에디터가 포커스를 갖지 않으면 ProseMirror가
//   그 selection을 DOM에 반영하지 않는다(`editorOwnsSelection`).
// - 문서 DOM이 바뀌면 텍스트 노드에 앵커된 DOM selection이 접힌다.
// - Formatting·Link 툴바는 DOM selection이 접힌 것을 보고 닫힌다. Table의
//   `Split cell`↔`Merge cells`처럼 버튼만 교체되는 경우도 있다. 포커스된
//   버튼이 unmount되면 포커스가 `BODY`로 간다.
// - unmount 시점은 프레임이 아니라 이벤트를 따른다. DOM selection이 바뀌면
//   `selectionchange`, 바뀌지 않으면 `keyup`이다. 키를 누른 채 두면 그만큼
//   뒤다.
//
// 처리(history transaction마다, 아래 가드를 모두 통과할 때만):
// 1. 재동기화: `TextSelection`이면 DOM selection을 ProseMirror selection에
//    맞춘다. 툴바가 범위 selection을 그대로 본다.
// 2. 포커스 복구: 포커스된 에디터 밖 요소가 제거되면 `view.focus()`로
//    에디터에 포커스를 돌려준다. 포커스가 `BODY`로 유실될 때만 한다.
//
// 가드(모두 만족):
// 1. view가 편집 가능하다.
// 2. 에디터가 포커스를 갖지 않는다. 포커스가 있으면 ProseMirror가 직접
//    selection을 반영한다.
// 3. `document.getSelection()`이 이 view.dom 안에 있다. 다른 편집기
//    인스턴스를 건드리지 않는 유일한 신호다(focus가 아니라 selection 기준,
//    G-EDT-004).
// 4. 포커스된 요소가 입력 컨트롤(input·textarea·select)이나 편집 영역이
//    아니다. 그 컨트롤 자신의 selection과 포커스를 건드리지 않는다.
//
// 재동기화는 `contenteditable`을 잠시 끈다. Chromium은 편집 영역 안으로
// selection을 옮기면 포커스를 그 editing host로 옮긴다. 끄면 포커스·blur
// 이벤트 없이 포커스가 버튼에 남는다. ProseMirror는 이 attribute 변경을
// 무시한다.
//
// 포커스 복구의 감시는 `MutationObserver`다. 제거 시점이 `keyup`처럼 사용자
// 타이밍이라 프레임이나 타이머로 덮을 수 없다. 감시는 복구, 다른 요소로의
// `focusin`, 포인터 누름(`pointerdown`), 다음 history transaction의
// 재무장, view destroy에서 끝난다.

/** history transaction 수를 센다. view `update`가 증가를 보고 처리한다. */
const historyCountKey = new PluginKey<number>("historyFocusSyncCount");

/**
 * DOM selection을 ProseMirror `TextSelection`에 맞춘다.
 *
 * 호출 동안 `view.dom`의 `contenteditable`을 끄고 `finally`에서 호출 전
 * 값으로 되돌린다. `setBaseAndExtent`가 던져도 되돌리고, 오류는 삼킨다.
 * 재동기화는 최선 노력이라 실패해도 undo·redo와 view 갱신을 막지 않는다.
 */
const resyncDomSelection = (view: EditorView, selection: TextSelection) => {
  const domSelection = view.dom.ownerDocument.getSelection();
  if (domSelection === null) return;
  const original = view.dom.getAttribute("contenteditable");
  view.dom.setAttribute("contenteditable", "false");
  try {
    const anchor = view.domAtPos(selection.anchor);
    const head = view.domAtPos(selection.head);
    domSelection.setBaseAndExtent(
      anchor.node,
      anchor.offset,
      head.node,
      head.offset,
    );
  } catch {
    // 최선 노력이다. 실패하면 이전 동작(재동기화 없음)으로 남는다.
  } finally {
    if (original === null) view.dom.removeAttribute("contenteditable");
    else view.dom.setAttribute("contenteditable", original);
  }
};

export const HistoryFocusSyncExtension = Extension.create({
  name: "historyFocusSync",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: historyCountKey,
        state: {
          init: () => 0,
          apply: (tr, count) => (isHistoryTransaction(tr) ? count + 1 : count),
        },
        view(initialView) {
          const ownerDocument = initialView.dom.ownerDocument;
          let disarm: (() => void) | null = null;

          /** 기억한 요소가 제거되고 포커스가 유실되면 에디터로 복구한다. */
          const arm = (view: EditorView, remembered: Element) => {
            disarm?.();
            const ObserverCtor = ownerDocument.defaultView?.MutationObserver;
            if (ObserverCtor === undefined) return;
            const observer = new ObserverCtor(() => {
              if (remembered.isConnected) return;
              const active = ownerDocument.activeElement;
              disarm?.();
              if (active === null || active === ownerDocument.body) {
                view.focus();
              }
            });
            const handleFocusIn = (event: FocusEvent) => {
              if (event.target !== remembered) disarm?.();
            };
            // 비포커스 영역 클릭은 포커스를 BODY로 옮기지만 `focusin`이 없다.
            // 이어서 툴바가 닫혀 요소가 제거돼도 사용자가 포커스를 뺀 것이라
            // 복구하지 않는다.
            const handlePointerDown = () => disarm?.();
            observer.observe(ownerDocument, { childList: true, subtree: true });
            ownerDocument.addEventListener("focusin", handleFocusIn, true);
            ownerDocument.addEventListener(
              "pointerdown",
              handlePointerDown,
              true,
            );
            disarm = () => {
              observer.disconnect();
              ownerDocument.removeEventListener("focusin", handleFocusIn, true);
              ownerDocument.removeEventListener(
                "pointerdown",
                handlePointerDown,
                true,
              );
              disarm = null;
            };
          };

          const handleHistoryTransaction = (view: EditorView) => {
            if (!view.editable || view.hasFocus()) return;
            const domSelection = ownerDocument.getSelection();
            const anchor =
              domSelection?.focusNode ?? domSelection?.anchorNode ?? null;
            if (anchor === null || !view.dom.contains(anchor)) return;
            const active = ownerDocument.activeElement;
            if (active !== null && isInputTarget(active)) return;

            const { selection } = view.state;
            if (selection instanceof TextSelection) {
              resyncDomSelection(view, selection);
            }
            if (
              active !== null &&
              active !== ownerDocument.body &&
              !view.dom.contains(active)
            ) {
              arm(view, active);
            }
          };

          return {
            update(view, prevState) {
              if (
                historyCountKey.getState(view.state) ===
                historyCountKey.getState(prevState)
              ) {
                return;
              }
              handleHistoryTransaction(view);
            },
            destroy() {
              disarm?.();
            },
          };
        },
      }),
    ];
  },
});
