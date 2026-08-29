import type { Block, HeadingBlock, Result } from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

import { findBlockPosition } from "./block-position.js";
import {
  collectDocumentIdentityIds,
  createUniqueDocumentId,
} from "./document-id-factory.js";
import type { EditorError } from "./errors.js";
import { indentBlockCommand, outdentBlockCommand } from "./indent-commands.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";

type BlockTypeDescriptor =
  | { type: "paragraph" }
  | { type: "heading"; level: HeadingBlock["level"] }
  | { type: "quote" };

type RuntimeBlockTypeDescriptor =
  BlockTypeDescriptor | { type: "codeBlock"; language?: string };

const findEditableBlockContent = (
  document: ProseMirrorNode,
  blockId: string,
): { position: number; node: ProseMirrorNode } | null => {
  const matchPosition = findBlockPosition(document, blockId);
  if (matchPosition === null) return null;
  const matchNode = document.nodeAt(matchPosition);
  if (matchNode === null) return null;
  if (matchNode.type.name !== "blockContainer") {
    return { position: matchPosition, node: matchNode };
  }
  const contentPosition = matchPosition + 1;
  const contentNode = document.nodeAt(contentPosition);
  return contentNode === null
    ? null
    : { position: contentPosition, node: contentNode };
};

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
      (target.node.type.name !== "paragraph" &&
        target.node.type.name !== "heading" &&
        target.node.type.name !== "quote") ||
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
    blockType: RuntimeBlockTypeDescriptor,
    options?: { clearContent?: boolean },
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("setBlockType");
    if (blockType.type === "codeBlock") {
      return commandNotApplicable("setBlockType");
    }
    const target = findEditableBlockContent(session.editor.state.doc, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const currentTypeName = target.node.type.name;
    if (
      currentTypeName !== "paragraph" &&
      currentTypeName !== "heading" &&
      currentTypeName !== "quote"
    ) {
      return commandNotApplicable("setBlockType");
    }
    const currentLevel =
      typeof target.node.attrs.level === "number"
        ? target.node.attrs.level
        : null;
    const currentContentSize = target.node.content.size;
    const clearContent = options?.clearContent ?? false;
    const isSameType =
      blockType.type === "heading"
        ? currentTypeName === "heading" && currentLevel === blockType.level
        : currentTypeName === blockType.type;
    if (isSameType && (!clearContent || currentContentSize === 0)) {
      return commandNotApplicable("setBlockType");
    }
    return session.runDocumentCommand("setBlockType", "local", () => {
      const nodeType = session.editor.schema.nodes[blockType.type];
      if (nodeType === undefined) return false;
      let transaction = session.editor.state.tr;
      if (clearContent && currentContentSize > 0) {
        transaction = transaction.delete(
          target.position + 1,
          target.position + 1 + currentContentSize,
        );
      }
      transaction = transaction.setNodeMarkup(
        target.position,
        nodeType,
        blockType.type === "heading" ? { level: blockType.level } : {},
      );
      transaction.setSelection(
        TextSelection.create(transaction.doc, target.position + 1),
      );
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

  return {
    setText,
    insertParagraphAfter,
    setBlockType,
    moveBlockBefore,
    duplicateBlock,
    deleteBlock,
    indentBlock,
    outdentBlock,
  };
};
