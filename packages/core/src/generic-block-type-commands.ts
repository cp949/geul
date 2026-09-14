import {
  canonicalizeCodeBlockLanguage,
  isInlineContentBlockType,
  isListEntryBlockType,
  isValidCodeBlockLanguage,
  isValidInlineText,
  parseDocument,
} from "@cp949/geul-model";
import type { Result } from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";
import { Selection, TextSelection } from "@tiptap/pm/state";

import { findEditableBlockContent } from "./block-position.js";
import type { SetBlockTypeDescriptor } from "./block-type-descriptor.js";
import type { EditorError } from "./errors.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";
import {
  findBlockEntryInTree,
  hasChildren,
} from "./generic-block-tree-lookup.js";

export const createGenericBlockTypeCommands = (
  session: ProductionEditorSession,
) => {
  const setBlockType = (
    blockId: string,
    blockType: SetBlockTypeDescriptor,
    options?: { clearContent?: boolean },
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("setBlockType");
    const modelTarget = findBlockEntryInTree(session.document.blocks, blockId);
    if (modelTarget === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const target = findEditableBlockContent(session.editor.state.doc, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const currentTypeName = target.node.type.name;
    if (!isInlineContentBlockType(currentTypeName)) {
      return commandNotApplicable("setBlockType");
    }
    const currentLevel =
      typeof target.node.attrs.level === "number"
        ? target.node.attrs.level
        : null;
    const currentContentSize = target.node.content.size;
    const clearContent = options?.clearContent ?? false;
    // bulletListItem/numberedListItem/checkListItem/toggleListItem 넷 다
    // "목록"이다(spec 글머리·번호·체크·토글 목록) — isListItemBlockType(io
    // <ul>/<ol> 직렬화 축)이 아니라 isListEntryBlockType(io 축과 분리된 편집
    // UX 축, RD-003 F2)을 써서 toggleListItem도 이 가드에 포함한다. 그러지
    // 않으면 자식 없는 toggleListItem만 codeBlock 변환이 허용되는 비대칭이
    // 생긴다(RD-003 트랙-3 pending 이슈, IMPL-REVIEW-01.md "남은 위험").
    const currentIsList = isListEntryBlockType(currentTypeName);
    const targetIsList = isListEntryBlockType(blockType.type);
    if (
      (currentTypeName === "codeBlock" && targetIsList) ||
      (currentIsList && blockType.type === "codeBlock")
    ) {
      return commandNotApplicable("setBlockType");
    }
    const changesCodeBlockBoundary =
      currentTypeName === "codeBlock" || blockType.type === "codeBlock";
    if (
      blockType.type === "codeBlock" &&
      currentTypeName !== "codeBlock" &&
      hasChildren(modelTarget.block)
    ) {
      return commandNotApplicable("setBlockType");
    }
    if (
      currentTypeName === "codeBlock" &&
      blockType.type !== "codeBlock" &&
      !clearContent &&
      !isValidInlineText(target.node.textContent)
    ) {
      return commandNotApplicable("setBlockType");
    }
    let codeBlockLanguage: string | null = null;
    if (blockType.type === "codeBlock") {
      const requestedLanguage = blockType.language ?? "text";
      const language = requestedLanguage === "" ? "text" : requestedLanguage;
      if (!isValidCodeBlockLanguage(language)) {
        return commandNotApplicable("setBlockType");
      }
      codeBlockLanguage = canonicalizeCodeBlockLanguage(language);
    }
    let numberedStartNumber: number | null = null;
    if (blockType.type === "numberedListItem") {
      numberedStartNumber =
        blockType.startNumber === undefined &&
        currentTypeName === "numberedListItem"
          ? ((target.node.attrs.startNumber as number | null | undefined) ??
            null)
          : (blockType.startNumber ?? null);
      if (
        numberedStartNumber !== null &&
        !parseDocument({
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "set-block-type-number-validation",
              type: "numberedListItem",
              content: [],
              startNumber: numberedStartNumber,
            },
          ],
        }).ok
      ) {
        return commandNotApplicable("setBlockType");
      }
    }
    const isSameType =
      blockType.type === "heading"
        ? currentTypeName === "heading" && currentLevel === blockType.level
        : blockType.type === "codeBlock"
          ? currentTypeName === "codeBlock" &&
            target.node.attrs.language === codeBlockLanguage
          : blockType.type === "numberedListItem"
            ? currentTypeName === "numberedListItem" &&
              ((target.node.attrs.startNumber as number | null | undefined) ??
                null) === numberedStartNumber
            : currentTypeName === blockType.type;
    if (isSameType && (!clearContent || currentContentSize === 0)) {
      // language setter는 UI commit seam이기도 하다. 유효 입력이 이미 같은
      // canonical 상태면 transaction 없이 성공해 caller가 거절과 구분한다.
      if (blockType.type === "codeBlock") {
        return { ok: true, value: undefined };
      }
      return commandNotApplicable("setBlockType");
    }
    return session.runDocumentCommand("setBlockType", "local", () => {
      const nodeType = session.editor.schema.nodes[blockType.type];
      if (nodeType === undefined) return false;
      if (changesCodeBlockBoundary) {
        const source = clearContent ? "" : target.node.textContent;
        const content =
          source === "" ? undefined : session.editor.schema.text(source);
        // codeBlock→codeBlock(언어만 변경)은 replaceWith가 노드를 통째로
        // 새로 만들어 언급하지 않은 attrs가 schema default로 리셋된다 —
        // wrap(RD-001 DELTA-02, Issue #194)을 명시적으로 옮겨 싣지 않으면
        // 언어를 바꿀 때마다 wrap 설정이 조용히 사라진다. 다른 타입에서
        // codeBlock으로 갓 전환하는 경우는 이전 attrs가 의미 없어 null
        // (미설정)이 맞다.
        const attrs =
          blockType.type === "heading"
            ? { level: blockType.level }
            : blockType.type === "codeBlock"
              ? {
                  language: codeBlockLanguage,
                  wrap:
                    currentTypeName === "codeBlock"
                      ? (target.node.attrs.wrap ?? null)
                      : null,
                }
              : {};
        const replacement = nodeType.create(attrs, content);
        const transaction = session.editor.state.tr.replaceWith(
          target.position,
          target.position + target.node.nodeSize,
          replacement,
        );
        if (currentTypeName !== blockType.type || clearContent) {
          transaction.setSelection(
            TextSelection.create(transaction.doc, target.position + 1),
          );
        } else {
          transaction.setSelection(
            Selection.fromJSON(
              transaction.doc,
              session.editor.state.selection.toJSON(),
            ),
          );
        }
        session.editor.view.dispatch(closeHistory(transaction));
        return true;
      }
      let transaction = session.editor.state.tr;
      if (clearContent && currentContentSize > 0) {
        transaction = transaction.delete(
          target.position + 1,
          target.position + 1 + currentContentSize,
        );
      }
      const attrs =
        blockType.type === "heading"
          ? { level: blockType.level }
          : blockType.type === "numberedListItem"
            ? { startNumber: numberedStartNumber }
            : {};
      transaction = transaction.setNodeMarkup(target.position, nodeType, attrs);
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  return { setBlockType };
};
