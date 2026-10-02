import { isHistoryTransaction } from "@tiptap/pm/history";
import type { Transaction } from "@tiptap/pm/state";

// Issue #231 — undo·redo가 어느 진입점(StarterKit keymap, keydown 폴백,
// beforeinput 폴백)으로 들어와도 `DocumentChangeEvent.reason`이 같은 값이
// 되도록 세션이 transaction meta로 판정한다. 진입점은 reason을 모른다.
//
// `prosemirror-history`는 undo·redo transaction에 `{ redo, historyState }`
// meta를 붙인다. 키는 그 플러그인의 `PluginKey("history")`가 만든 문자열
// `"history$"`다. 공개 API에는 이 키 객체가 없어 문자열로 읽는다.
// - 저장소 안의 `prosemirror-history` 버전이 키를 바꾸면
//   history-change-reason.test.ts의 진입점 표가 RED가 된다.
// - 같은 이름의 `PluginKey`가 먼저 만들어져 키가 `"history$1"`이 되면
//   redo가 `"undo"`로 보고된다. 이 경로는 표 테스트가 감시하지 못한다.

/**
 * root transaction이 history의 undo·redo면 그 종류를, 아니면 `null`을
 * 돌려준다. meta에 `redo: true`가 없으면 undo로 본다.
 */
export const historyReasonOf = (tr: Transaction): "undo" | "redo" | null => {
  if (!isHistoryTransaction(tr)) return null;
  return tr.getMeta("history$")?.redo === true ? "redo" : "undo";
};
