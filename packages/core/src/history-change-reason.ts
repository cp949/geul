import { history, isHistoryTransaction } from "@tiptap/pm/history";
import type { PluginKey, Transaction } from "@tiptap/pm/state";

// Issue #231 — undo·redo가 어느 진입점(StarterKit keymap, keydown 폴백,
// beforeinput 폴백)으로 들어와도 `DocumentChangeEvent.reason`이 같은 값이
// 되도록 세션이 transaction meta로 판정한다. 진입점은 reason을 모른다.
//
// `prosemirror-history`는 undo·redo transaction에 `{ redo, historyState }`
// meta를 붙인다. meta 키는 그 플러그인의 `PluginKey("history")`가 만든다.
// 키 문자열은 모듈 로드 순서가 정한다. 같은 이름의 `PluginKey`가 먼저
// 만들어지면 `"history$1"`이 된다. 그래서 문자열을 하드코딩하지 않고
// `history()` 플러그인이 쓰는 키 객체를 한 번 꺼내 쓴다.
// - 키 객체는 공개 API인 `history().spec.key`로 얻는다.
// - 플러그인 인스턴스는 키를 꺼내는 데만 쓰고 버린다.
// - 키가 선점돼도 판정이 유지되는지는 history-key-collision.test.ts가
//   감시한다. 정상 키 환경은 history-change-reason.test.ts가 감시한다.

const resolveHistoryKey = (): PluginKey => {
  const key = history().spec.key;
  if (key === undefined) {
    throw new Error("prosemirror-history 플러그인에서 meta 키를 얻지 못했다");
  }
  return key;
};

const HISTORY_KEY = resolveHistoryKey();

/**
 * root transaction이 history의 undo·redo면 그 종류를, 아니면 `null`을
 * 돌려준다. meta에 `redo: true`가 없으면 undo로 본다.
 */
export const historyReasonOf = (tr: Transaction): "undo" | "redo" | null => {
  if (!isHistoryTransaction(tr)) return null;
  return tr.getMeta(HISTORY_KEY)?.redo === true ? "redo" : "undo";
};
