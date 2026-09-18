import { isValidInlineText, type Result } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";

import { findEditableBlockContent } from "./block-position.js";
import type { EditorError } from "./errors.js";

const commandNotApplicable = (command: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

/**
 * callout의 `icon`을 교체한다(Issue #209 RD-002 DELTA-02).
 * `toggleListItemCollapseCommand`(`toggle-collapse-commands.ts`)와 동일한
 * 얕은 attrs setter 패턴 — icon은 blockContainer가 아니라 콘텐츠 노드
 * (callout) 자신의 attrs다. 빈 문자열·제어문자를 포함한 icon은 신규
 * EditorError 코드를 만들지 않고 COMMAND_NOT_APPLICABLE로 수렴한다
 * (block-type-commands.ts D2와 동일 원칙) — isValidInlineText는 model
 * (string-invariants.ts)을 재사용한다(G-CNV-001).
 */
export const setCalloutIconCommand = (
  editor: Editor,
  blockId: string,
  icon: string,
): Result<void, EditorError> => {
  const found = findEditableBlockContent(editor.state.doc, blockId);
  if (found === null) {
    return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
  }
  if (found.node.type.name !== "callout") {
    return commandNotApplicable("setCalloutIcon");
  }
  if (icon.length === 0 || !isValidInlineText(icon)) {
    return commandNotApplicable("setCalloutIcon");
  }

  const transaction = editor.state.tr.setNodeMarkup(found.position, undefined, {
    ...found.node.attrs,
    icon,
  });
  editor.view.dispatch(closeHistory(transaction));
  return { ok: true, value: undefined };
};
