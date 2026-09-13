import type { Result } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";

import { findEditableBlockContent } from "./block-position.js";
import type { EditorError } from "./errors.js";

const blockNotFound = (blockId: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "BLOCK_NOT_FOUND", blockId },
});

const commandNotApplicable = (command: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

/**
 * toggleListItem의 `collapsed`를 반전한다(RD-004 DELTA-01). heading의
 * `toggleHeadingCollapse`와 공유하던 제네릭 헬퍼(`toggleCollapsedAttrCommand`)는
 * heading 토글 제거(2026-09-13)로 호출자가 이 함수 하나만 남아 인라인했다
 * — `!attrs.collapsed`는 PM 기본값 `null`도 falsy로 취급해 최초 호출에서
 * 정확히 `true`로 뒤집는다.
 */
export const toggleListItemCollapseCommand = (
  editor: Editor,
  blockId: string,
): Result<void, EditorError> => {
  const found = findEditableBlockContent(editor.state.doc, blockId);
  if (found === null) return blockNotFound(blockId);
  if (found.node.type.name !== "toggleListItem") {
    return commandNotApplicable("toggleListItemCollapse");
  }

  const transaction = editor.state.tr.setNodeMarkup(found.position, undefined, {
    ...found.node.attrs,
    collapsed: !found.node.attrs.collapsed,
  });
  editor.view.dispatch(closeHistory(transaction));
  return { ok: true, value: undefined };
};
