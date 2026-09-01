import {
  canonicalizeCodeBlockLanguage,
  isInlineContentBlockType,
  isListItemBlockType,
  isNestableBlockType,
  isValidCodeBlockLanguage,
  isValidInlineText,
  parseDocument,
  type Block,
  type Result,
} from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";

import {
  findBlockPosition,
  findEditableBlockContent,
} from "./block-position.js";
import { toggleCheckListItemCheckedCommand } from "./check-list-item-commands.js";
import {
  collectDocumentIdentityIds,
  createUniqueDocumentId,
} from "./document-id-factory.js";
import type { EditorError } from "./errors.js";
import type { SetBlockTypeDescriptor } from "./editor-controller.js";
import { indentBlockCommand, outdentBlockCommand } from "./indent-commands.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";

const findBlockInTree = (
  blocks: readonly Block[],
  blockId: string,
): { block: Block; siblings: readonly Block[]; index: number } | null => {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index !== -1) {
    const block = blocks[index];
    return block === undefined ? null : { block, siblings: blocks, index };
  }
  for (const block of blocks) {
    if (!("children" in block) || block.children === undefined) {
      continue;
    }
    const found = findBlockInTree(block.children, blockId);
    if (found !== null) return found;
  }
  return null;
};

const hasChildren = (block: Block): boolean =>
  "children" in block &&
  block.children !== undefined &&
  block.children.length > 0;

export const createGenericBlockCommands = (
  session: ProductionEditorSession,
) => {
  const setText = (
    blockId: string,
    text: string,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("setText");
    const target = findEditableBlockContent(session.editor.state.doc, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const targetPosition = target.position;
    const targetSize = target.node.content.size;
    if (
      !isNestableBlockType(target.node.type.name) ||
      !isValidInlineText(text) ||
      target.node.textContent === text
    ) {
      return commandNotApplicable("setText");
    }
    return session.runDocumentCommand("setText", "local", () => {
      const from = targetPosition + 1;
      const to = from + targetSize;
      const transaction = session.editor.state.tr;
      if (text.length === 0) transaction.delete(from, to);
      else transaction.replaceWith(from, to, session.editor.schema.text(text));
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const insertParagraphAfter = (
    blockId: string,
  ): Result<{ blockId: string }, EditorError> => {
    if (session.isDestroyed) {
      return commandNotApplicable("insertParagraphAfter");
    }
    if (findBlockInTree(session.document.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const sourcePosition = findBlockPosition(session.editor.state.doc, blockId);
    const sourceNode =
      sourcePosition === null
        ? null
        : session.editor.state.doc.nodeAt(sourcePosition);
    if (sourcePosition === null || sourceNode === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const insertPosition = sourcePosition + sourceNode.nodeSize;
    const result = session.runDocumentCommand(
      "insertParagraphAfter",
      "local",
      () => {
        const paragraphType = session.editor.schema.nodes.paragraph;
        if (paragraphType === undefined) return false;
        const transaction = session.editor.state.tr.insert(
          insertPosition,
          paragraphType.create(),
        );
        transaction.setSelection(
          TextSelection.create(transaction.doc, insertPosition + 2),
        );
        session.editor.view.dispatch(closeHistory(transaction));
        return true;
      },
    );
    if (!result.ok) return result;
    const after = findBlockInTree(session.document.blocks, blockId);
    const createdBlock =
      after === null ? undefined : after.siblings[after.index + 1];
    return createdBlock === undefined
      ? commandNotApplicable("insertParagraphAfter")
      : { ok: true, value: { blockId: createdBlock.id } };
  };

  const setBlockType = (
    blockId: string,
    blockType: SetBlockTypeDescriptor,
    options?: { clearContent?: boolean },
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("setBlockType");
    const modelTarget = findBlockInTree(session.document.blocks, blockId);
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
    // heading의 isToggleable/collapsed는 SetBlockTypeDescriptor가 받는
    // 값이 아니다(level만 받는다) — level만 바뀌는 호출(같은 heading 안
    // 레벨 변경)에서 currentTypeName이 heading일 때만 현재 값을
    // 캐리포워드한다. numberedListItem.startNumber와 같은 이유:
    // setNodeMarkup에 attrs를 부분만 넘기면 PM이 나머지를 schema
    // default(null)로 채워 기존 값을 지운다(RD-003 트랙-3 결함 탐지 F1).
    // heading이 아닌 타입에서 heading으로 새로 바뀌는 경우는 캐리포워드할
    // 원본이 없으므로 null(토글 아님)이 맞다.
    const currentIsToggleable =
      currentTypeName === "heading"
        ? ((target.node.attrs.isToggleable as boolean | null | undefined) ??
          null)
        : null;
    const currentCollapsed =
      currentTypeName === "heading"
        ? ((target.node.attrs.collapsed as boolean | null | undefined) ?? null)
        : null;
    const currentContentSize = target.node.content.size;
    const clearContent = options?.clearContent ?? false;
    const currentIsList = isListItemBlockType(currentTypeName);
    const targetIsList = isListItemBlockType(blockType.type);
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
        const attrs =
          blockType.type === "heading"
            ? { level: blockType.level }
            : blockType.type === "codeBlock"
              ? { language: codeBlockLanguage }
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
          ? {
              level: blockType.level,
              isToggleable: currentIsToggleable,
              collapsed: currentCollapsed,
            }
          : blockType.type === "numberedListItem"
            ? { startNumber: numberedStartNumber }
            : {};
      transaction = transaction.setNodeMarkup(target.position, nodeType, attrs);
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const moveBlockBefore = (
    blockId: string,
    beforeBlockId: string | null,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("moveBlockBefore");
    const source = findBlockInTree(session.document.blocks, blockId);
    if (source === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (hasChildren(source.block))
      return commandNotApplicable("moveBlockBefore");
    let targetIndex = source.siblings.length;
    if (beforeBlockId !== null) {
      const target = findBlockInTree(session.document.blocks, beforeBlockId);
      if (target === null) {
        return {
          ok: false,
          error: { code: "BLOCK_NOT_FOUND", blockId: beforeBlockId },
        };
      }
      if (target.siblings !== source.siblings) {
        return commandNotApplicable("moveBlockBefore");
      }
      targetIndex = target.index;
    }
    if (targetIndex === source.index || targetIndex === source.index + 1) {
      return commandNotApplicable("moveBlockBefore");
    }
    return session.runDocumentCommand("moveBlockBefore", "local", () => {
      const sourcePosition = findBlockPosition(
        session.editor.state.doc,
        blockId,
      );
      if (sourcePosition === null) return false;
      const sourceNode = session.editor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;
      let transaction = session.editor.state.tr.delete(
        sourcePosition,
        sourcePosition + sourceNode.nodeSize,
      );
      let insertPosition: number;
      if (beforeBlockId !== null) {
        const targetPosition = findBlockPosition(
          transaction.doc,
          beforeBlockId,
        );
        if (targetPosition === null) return false;
        insertPosition = targetPosition;
      } else {
        const lastSiblingId = source.siblings[source.siblings.length - 1]?.id;
        if (lastSiblingId === undefined) return false;
        const lastPosition = findBlockPosition(transaction.doc, lastSiblingId);
        if (lastPosition === null) return false;
        const lastNode = transaction.doc.nodeAt(lastPosition);
        if (lastNode === null) return false;
        insertPosition = lastPosition + lastNode.nodeSize;
      }
      transaction = transaction.insert(insertPosition, sourceNode);
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const duplicateBlock = (
    blockId: string,
  ): Result<{ blockId: string }, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("duplicateBlock");
    const source = findBlockInTree(session.document.blocks, blockId);
    if (source === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (source.block.type === "table" || hasChildren(source.block)) {
      return commandNotApplicable("duplicateBlock");
    }
    if (session.revision >= Number.MAX_SAFE_INTEGER) {
      return commandNotApplicable("duplicateBlock");
    }
    const duplicateId = createUniqueDocumentId(
      session.createId,
      collectDocumentIdentityIds(session.document),
    );
    const result = session.runDocumentCommand("duplicateBlock", "local", () => {
      const sourcePosition = findBlockPosition(
        session.editor.state.doc,
        blockId,
      );
      if (sourcePosition === null) return false;
      const sourceNode = session.editor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;
      const insertPosition = sourcePosition + sourceNode.nodeSize;
      const duplicateNode = sourceNode.type.create(
        { ...sourceNode.attrs, blockId: duplicateId },
        sourceNode.content,
        sourceNode.marks,
      );
      const transaction = session.editor.state.tr.insert(
        insertPosition,
        duplicateNode,
      );
      transaction.setSelection(
        duplicateNode.type.name === "blockContainer"
          ? TextSelection.create(
              transaction.doc,
              insertPosition + duplicateNode.nodeSize - 2,
            )
          : NodeSelection.create(transaction.doc, insertPosition),
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;
    const after = findBlockInTree(session.document.blocks, blockId);
    const createdBlock =
      after === null ? undefined : after.siblings[after.index + 1];
    return createdBlock === undefined
      ? commandNotApplicable("duplicateBlock")
      : { ok: true, value: { blockId: createdBlock.id } };
  };

  const deleteBlock = (blockId: string): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("deleteBlock");
    const target = findBlockInTree(session.document.blocks, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (
      target.siblings === session.document.blocks &&
      target.siblings.length <= 1
    ) {
      return commandNotApplicable("deleteBlock");
    }
    return session.runDocumentCommand("deleteBlock", "local", () => {
      const sourcePosition = findBlockPosition(
        session.editor.state.doc,
        blockId,
      );
      if (sourcePosition === null) return false;
      const sourceNode = session.editor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;
      const $source = session.editor.state.doc.resolve(sourcePosition);
      const removesWholeGroup =
        $source.parent.type.name === "blockGroup" &&
        $source.parent.childCount === 1;
      const transaction = session.editor.state.tr.delete(
        removesWholeGroup ? $source.before() : sourcePosition,
        removesWholeGroup
          ? $source.after()
          : sourcePosition + sourceNode.nodeSize,
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const indentBlock = (blockId: string): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("indentBlock");
    if (findBlockInTree(session.document.blocks, blockId) === null) {
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
    if (findBlockInTree(session.document.blocks, blockId) === null) {
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
    if (findBlockInTree(session.document.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    return session.runDocumentCommand(
      "toggleCheckListItemChecked",
      "local",
      () =>
        toggleCheckListItemCheckedCommand(session.editor, blockId).ok,
    );
  };

  return {
    setText,
    insertParagraphAfter,
    setBlockType,
    moveBlockBefore,
    duplicateBlock,
    deleteBlock,
    indentBlock,
    outdentBlock,
    toggleCheckListItemChecked,
  };
};
