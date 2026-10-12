import { isValidInlineText, type Result } from "@cp949/geul-model";

import { runBlockAttrCommand } from "./block-attr-command.js";
import { toggleCheckListItemCheckedCommand } from "./check-list-item-commands.js";
import { toggleListItemCollapseCommand } from "./toggle-collapse-commands.js";
import { indentBlockCommand, outdentBlockCommand } from "./indent-commands.js";
import type { EditorError } from "./errors.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";
import { findBlockEntryInTree } from "./generic-block-tree-lookup.js";

export const createGenericBlockNestingCommands = (
  session: ProductionEditorSession,
) => {
  const indentBlock = (blockId: string): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("indentBlock");
    if (findBlockEntryInTree(session.document.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    return session.runDocumentCommand(
      "indentBlock",
      "local",
      () => indentBlockCommand(session.editor, blockId).ok,
    );
  };

  const outdentBlock = (blockId: string): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("outdentBlock");
    if (findBlockEntryInTree(session.document.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    return session.runDocumentCommand(
      "outdentBlock",
      "local",
      () => outdentBlockCommand(session.editor, blockId).ok,
    );
  };

  const toggleCheckListItemChecked = (
    blockId: string,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) {
      return commandNotApplicable("toggleCheckListItemChecked");
    }
    // runDocumentCommand의 run()은 boolean만 돌려받아 BLOCK_NOT_FOUND와
    // COMMAND_NOT_APPLICABLE을 구분하지 못한다 — indentBlock/outdentBlock과
    // 같은 이유로 모델 트리 조회를 여기서 먼저 해 정확한 오류 코드를 낸다.
    if (findBlockEntryInTree(session.document.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    return session.runDocumentCommand(
      "toggleCheckListItemChecked",
      "local",
      () => toggleCheckListItemCheckedCommand(session.editor, blockId).ok,
    );
  };

  const toggleListItemCollapse = (
    blockId: string,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) {
      return commandNotApplicable("toggleListItemCollapse");
    }
    if (findBlockEntryInTree(session.document.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    return session.runDocumentCommand(
      "toggleListItemCollapse",
      "local",
      () => toggleListItemCollapseCommand(session.editor, blockId).ok,
    );
  };

  // callout의 `icon`을 교체한다(Issue #209 RD-002 DELTA-02). icon은
  // blockContainer가 아니라 콘텐츠 노드(callout) 자신의 attrs라 target이
  // "content"다. 빈 문자열·제어문자를 포함한 icon은 신규 EditorError 코드를
  // 만들지 않고 COMMAND_NOT_APPLICABLE로 수렴한다(block-type-commands.ts D2와
  // 동일 원칙). isValidInlineText는 model(string-invariants.ts)을 재사용한다
  // (G-CNV-001). 모델 트리 조회를 먼저 해서 top-level CustomBlock id를
  // BLOCK_NOT_FOUND로 거절한다 — runBlockAttrCommand의 PM 조회는 CustomBlock
  // atom을 찾아 COMMAND_NOT_APPLICABLE이 된다(indentBlock 등과 같은 이유).
  const setCalloutIcon = (
    blockId: string,
    icon: string,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("setCalloutIcon");
    if (findBlockEntryInTree(session.document.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    return runBlockAttrCommand(session, {
      command: "setCalloutIcon",
      blockId,
      target: "content",
      appliesTo: (node) => node.type.name === "callout",
      validate: () =>
        icon.length === 0 || !isValidInlineText(icon)
          ? { code: "COMMAND_NOT_APPLICABLE", command: "setCalloutIcon" }
          : null,
      nextAttrs: (attrs) => ({ ...attrs, icon }),
    });
  };

  return {
    indentBlock,
    outdentBlock,
    toggleCheckListItemChecked,
    toggleListItemCollapse,
    setCalloutIcon,
  };
};
