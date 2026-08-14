import {
  type Document as BlockDocument,
  type IdFactory,
  isSupportedLinkHref,
  parseDocument,
  type Result,
  type TextMark,
} from "@cp949/geul-model";
import { Editor, type JSONContent } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";

import { BlockIdExtension } from "./block-id-extension.js";
import type { EditorError } from "./errors.js";
import { LinkPolicyExtension } from "./link-policy-extension.js";
import { modelToTiptap, type TiptapJsonNode } from "./model-to-tiptap.js";
import { RevisionGuardExtension } from "./revision-guard-extension.js";
import { tiptapToModel } from "./tiptap-to-model.js";

export type DocumentChangeEvent = {
  revision: number;
  changedBlockIds: readonly string[];
  reason: "local" | "replace" | "undo" | "redo";
};

export interface EditorController {
  mount(element: HTMLElement): void;
  unmount(): void;
  destroy(): void;
  getDocument(): BlockDocument;
  getSelectionMarks(): TextMark["type"][];
  getSelectionLink(): { href: string } | null;
  getCaretBlockContext(): {
    blockId: string;
    blockType: BlockTypeDescriptor;
    text: string;
  } | null;
  getSelectionBlockType(): {
    blockId: string;
    blockType: BlockTypeDescriptor;
  } | null;
  replaceDocument(next: unknown): Result<void, EditorError>;
  readonly commands: {
    setText(blockId: string, text: string): Result<void, EditorError>;
    insertParagraphAfter(
      blockId: string,
    ): Result<{ blockId: string }, EditorError>;
    setBlockType(
      blockId: string,
      blockType: BlockTypeDescriptor,
      options?: { clearContent?: boolean },
    ): Result<void, EditorError>;
    moveBlockBefore(
      blockId: string,
      beforeBlockId: string | null,
    ): Result<void, EditorError>;
    duplicateBlock(blockId: string): Result<{ blockId: string }, EditorError>;
    deleteBlock(blockId: string): Result<void, EditorError>;
    toggleBold(): Result<void, EditorError>;
    toggleItalic(): Result<void, EditorError>;
    toggleUnderline(): Result<void, EditorError>;
    toggleStrike(): Result<void, EditorError>;
    toggleCode(): Result<void, EditorError>;
    setLink(href: string): Result<void, EditorError>;
    unsetLink(): Result<void, EditorError>;
    undo(): Result<void, EditorError>;
    redo(): Result<void, EditorError>;
  };
}

export type BlockTypeDescriptor =
  | { type: "paragraph" }
  | { type: "heading"; level: 1 | 2 | 3 };

export type CreateEditorOptions = {
  initialDocument: BlockDocument;
  createId?: IdFactory;
  onChange?: (event: DocumentChangeEvent) => void;
};

type ChangeReason = DocumentChangeEvent["reason"];

const defaultIdFactory: IdFactory = () => globalThis.crypto.randomUUID();

const toggleableMarkTypes: ReadonlyArray<TextMark["type"]> = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
];

const commandNotApplicable = (command: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

const parseSupportedDocument = (
  input: unknown,
): Result<BlockDocument, EditorError> => {
  const parsed = parseDocument(input);
  if (!parsed.ok) {
    return {
      ok: false,
      error: { code: "DOCUMENT_INVALID", message: parsed.error.message },
    };
  }

  const converted = modelToTiptap(parsed.value);
  return converted.ok ? { ok: true, value: parsed.value } : converted;
};

const blockChanges = (
  previous: BlockDocument,
  next: BlockDocument,
): string[] => {
  const previousBlocks = new Map(
    previous.blocks.map((block, index) => [
      block.id,
      { index, json: JSON.stringify(block) },
    ]),
  );
  const nextBlocks = new Map(
    next.blocks.map((block, index) => [
      block.id,
      { index, json: JSON.stringify(block) },
    ]),
  );
  const changed: string[] = [];

  for (const [index, block] of previous.blocks.entries()) {
    const nextBlock = nextBlocks.get(block.id);
    if (
      nextBlock === undefined ||
      nextBlock.index !== index ||
      nextBlock.json !== JSON.stringify(block)
    ) {
      changed.push(block.id);
    }
  }
  for (const block of next.blocks) {
    if (!previousBlocks.has(block.id)) changed.push(block.id);
  }

  return changed;
};

const sameDocumentContent = (
  previous: BlockDocument,
  next: BlockDocument,
): boolean => blockChanges(previous, next).length === 0;

export const createEditor = (
  options: CreateEditorOptions,
): EditorController => {
  const parsedInitialDocument = parseSupportedDocument(options.initialDocument);
  if (!parsedInitialDocument.ok) {
    throw new TypeError(
      parsedInitialDocument.error.code === "DOCUMENT_INVALID"
        ? parsedInitialDocument.error.message
        : "Tables are not available in the R0 editor",
    );
  }

  const createId = options.createId ?? defaultIdFactory;
  let sessionRevision = parsedInitialDocument.value.revision;
  let currentDocument = structuredClone(parsedInitialDocument.value);
  let destroyed = false;
  let mountedElement: HTMLElement | null = null;
  let activeReason: ChangeReason | null = null;
  let pendingDocument: BlockDocument | null = null;

  const readEditorDocument = (editor: Editor): BlockDocument => {
    const converted = tiptapToModel(
      editor.getJSON() as TiptapJsonNode,
      sessionRevision,
      createId,
    );
    if (!converted.ok) {
      throw new TypeError(
        converted.error.code === "DOCUMENT_INVALID"
          ? converted.error.message
          : "Tables are not available in the R0 editor",
      );
    }
    return converted.value;
  };

  const commitDocument = (
    nextDocument: BlockDocument,
    reason: ChangeReason,
  ): boolean => {
    const changedBlockIds = blockChanges(currentDocument, nextDocument);
    if (changedBlockIds.length === 0) return false;
    if (sessionRevision >= Number.MAX_SAFE_INTEGER) return false;

    sessionRevision += 1;
    currentDocument = structuredClone({
      ...nextDocument,
      revision: sessionRevision,
    });
    options.onChange?.({ revision: sessionRevision, changedBlockIds, reason });
    return true;
  };

  const onTiptapUpdate = (editor: Editor) => {
    const nextDocument = readEditorDocument(editor);
    if (activeReason === null) {
      commitDocument(nextDocument, "local");
      return;
    }
    pendingDocument = nextDocument;
  };

  const createTiptapEditor = (document: BlockDocument): Editor => {
    const converted = modelToTiptap(document);
    if (!converted.ok) throw new TypeError("Tables are not available in R0");

    const editor = new Editor({
      element: null,
      content: converted.value as JSONContent,
      injectCSS: false,
      extensions: [
        StarterKit.configure({
          blockquote: false,
          bulletList: false,
          codeBlock: false,
          hardBreak: false,
          horizontalRule: false,
          listItem: false,
          orderedList: false,
          heading: { levels: [1, 2, 3] },
          link: {
            openOnClick: false,
            isAllowedUri: (url) => isSupportedLinkHref(url),
            shouldAutoLink: (url) => isSupportedLinkHref(url),
          },
          trailingNode: false,
        }),
        BlockIdExtension.configure({ createId }),
        LinkPolicyExtension,
        RevisionGuardExtension.configure({
          canApplyDocumentChange: () =>
            sessionRevision < Number.MAX_SAFE_INTEGER,
        }),
      ],
      onUpdate: ({ editor }) => onTiptapUpdate(editor),
    });
    editor.mount(globalThis.document.createElement("div"));
    editor.unmount();
    return editor;
  };

  let tiptapEditor = createTiptapEditor(currentDocument);

  const runDocumentCommand = (
    command: string,
    reason: ChangeReason,
    run: () => boolean,
  ): Result<void, EditorError> => {
    if (destroyed) return commandNotApplicable(command);
    if (sessionRevision >= Number.MAX_SAFE_INTEGER) {
      return commandNotApplicable(command);
    }

    activeReason = reason;
    pendingDocument = null;
    let applied = false;
    try {
      applied = run();
    } finally {
      activeReason = null;
    }

    if (!applied) return commandNotApplicable(command);
    const nextDocument = pendingDocument ?? readEditorDocument(tiptapEditor);
    pendingDocument = null;
    return commitDocument(nextDocument, reason)
      ? { ok: true, value: undefined }
      : commandNotApplicable(command);
  };

  const setText = (
    blockId: string,
    text: string,
  ): Result<void, EditorError> => {
    if (destroyed) return commandNotApplicable("setText");

    let targetPosition: number | null = null;
    let targetSize = 0;
    let currentText = "";
    tiptapEditor.state.doc.forEach((node, offset) => {
      if (node.attrs.blockId !== blockId) return;
      targetPosition = offset;
      targetSize = node.content.size;
      currentText = node.textContent;
    });

    if (targetPosition === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (currentText === text) return commandNotApplicable("setText");

    return runDocumentCommand("setText", "local", () => {
      if (targetPosition === null) return false;

      const from = targetPosition + 1;
      const to = from + targetSize;
      const transaction = tiptapEditor.state.tr;
      if (text.length === 0) {
        transaction.delete(from, to);
      } else {
        transaction.replaceWith(from, to, tiptapEditor.schema.text(text));
      }
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const insertParagraphAfter = (
    blockId: string,
  ): Result<{ blockId: string }, EditorError> => {
    if (destroyed) return commandNotApplicable("insertParagraphAfter");

    const blockIndex = currentDocument.blocks.findIndex(
      (block) => block.id === blockId,
    );
    if (blockIndex === -1) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    let insertPosition: number | null = null;
    tiptapEditor.state.doc.forEach((node, offset) => {
      if (node.attrs.blockId !== blockId) return;
      insertPosition = offset + node.nodeSize;
    });
    if (insertPosition === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    const result = runDocumentCommand("insertParagraphAfter", "local", () => {
      if (insertPosition === null) return false;
      const paragraphType = tiptapEditor.schema.nodes.paragraph;
      if (paragraphType === undefined) return false;
      const paragraph = paragraphType.create();
      const transaction = tiptapEditor.state.tr.insert(
        insertPosition,
        paragraph,
      );
      transaction.setSelection(
        TextSelection.create(transaction.doc, insertPosition + 1),
      );
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;

    const createdBlock = currentDocument.blocks[blockIndex + 1];
    if (createdBlock === undefined) {
      return commandNotApplicable("insertParagraphAfter");
    }
    return { ok: true, value: { blockId: createdBlock.id } };
  };

  const setBlockType = (
    blockId: string,
    blockType: BlockTypeDescriptor,
    options?: { clearContent?: boolean },
  ): Result<void, EditorError> => {
    if (destroyed) return commandNotApplicable("setBlockType");

    let targetPosition: number | null = null;
    let currentTypeName: string | null = null;
    let currentLevel: number | null = null;
    let currentContentSize = 0;
    tiptapEditor.state.doc.forEach((node, offset) => {
      if (node.attrs.blockId !== blockId) return;
      targetPosition = offset;
      currentTypeName = node.type.name;
      currentLevel =
        typeof node.attrs.level === "number" ? node.attrs.level : null;
      currentContentSize = node.content.size;
    });

    if (targetPosition === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    const clearContent = options?.clearContent ?? false;
    const isSameType =
      blockType.type === "paragraph"
        ? currentTypeName === "paragraph"
        : currentTypeName === "heading" && currentLevel === blockType.level;
    if (isSameType && (!clearContent || currentContentSize === 0)) {
      return commandNotApplicable("setBlockType");
    }

    return runDocumentCommand("setBlockType", "local", () => {
      if (targetPosition === null) return false;
      const nodeType =
        blockType.type === "paragraph"
          ? tiptapEditor.schema.nodes.paragraph
          : tiptapEditor.schema.nodes.heading;
      if (nodeType === undefined) return false;
      const attrs =
        blockType.type === "paragraph"
          ? { blockId }
          : { blockId, level: blockType.level };

      let transaction = tiptapEditor.state.tr;
      if (clearContent && currentContentSize > 0) {
        transaction = transaction.delete(
          targetPosition + 1,
          targetPosition + 1 + currentContentSize,
        );
      }
      transaction = transaction.setNodeMarkup(targetPosition, nodeType, attrs);
      transaction.setSelection(
        TextSelection.create(transaction.doc, targetPosition + 1),
      );
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const moveBlockBefore = (
    blockId: string,
    beforeBlockId: string | null,
  ): Result<void, EditorError> => {
    if (destroyed) return commandNotApplicable("moveBlockBefore");

    const blocks = currentDocument.blocks;
    const sourceIndex = blocks.findIndex((block) => block.id === blockId);
    if (sourceIndex === -1) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    let targetIndex = blocks.length;
    if (beforeBlockId !== null) {
      targetIndex = blocks.findIndex((block) => block.id === beforeBlockId);
      if (targetIndex === -1) {
        return {
          ok: false,
          error: { code: "BLOCK_NOT_FOUND", blockId: beforeBlockId },
        };
      }
    }
    if (targetIndex === sourceIndex || targetIndex === sourceIndex + 1) {
      return commandNotApplicable("moveBlockBefore");
    }

    return runDocumentCommand("moveBlockBefore", "local", () => {
      let sourcePosition: number | null = null;
      tiptapEditor.state.doc.forEach((node, offset) => {
        if (node.attrs.blockId !== blockId) return;
        sourcePosition = offset;
      });
      if (sourcePosition === null) return false;
      const sourceNode = tiptapEditor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;

      let transaction = tiptapEditor.state.tr.delete(
        sourcePosition,
        sourcePosition + sourceNode.nodeSize,
      );
      let insertPosition = transaction.doc.content.size;
      if (beforeBlockId !== null) {
        let mappedTargetPosition: number | null = null;
        transaction.doc.forEach((node, offset) => {
          if (node.attrs.blockId === beforeBlockId)
            mappedTargetPosition = offset;
        });
        if (mappedTargetPosition === null) return false;
        insertPosition = mappedTargetPosition;
      }
      transaction = transaction.insert(insertPosition, sourceNode);
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const duplicateBlock = (
    blockId: string,
  ): Result<{ blockId: string }, EditorError> => {
    if (destroyed) return commandNotApplicable("duplicateBlock");

    const blockIndex = currentDocument.blocks.findIndex(
      (block) => block.id === blockId,
    );
    if (blockIndex === -1) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    const result = runDocumentCommand("duplicateBlock", "local", () => {
      let sourcePosition: number | null = null;
      tiptapEditor.state.doc.forEach((node, offset) => {
        if (node.attrs.blockId !== blockId) return;
        sourcePosition = offset;
      });
      if (sourcePosition === null) return false;
      const sourceNode = tiptapEditor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;

      const insertPosition = sourcePosition + sourceNode.nodeSize;
      const duplicateNode = sourceNode.type.create(
        { ...sourceNode.attrs, blockId: createId() },
        sourceNode.content,
        sourceNode.marks,
      );
      const transaction = tiptapEditor.state.tr.insert(
        insertPosition,
        duplicateNode,
      );
      transaction.setSelection(
        TextSelection.create(
          transaction.doc,
          insertPosition + duplicateNode.nodeSize - 1,
        ),
      );
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;

    const createdBlock = currentDocument.blocks[blockIndex + 1];
    if (createdBlock === undefined) {
      return commandNotApplicable("duplicateBlock");
    }
    return { ok: true, value: { blockId: createdBlock.id } };
  };

  const deleteBlock = (blockId: string): Result<void, EditorError> => {
    if (destroyed) return commandNotApplicable("deleteBlock");
    if (currentDocument.blocks.length <= 1) {
      return commandNotApplicable("deleteBlock");
    }

    const blockIndex = currentDocument.blocks.findIndex(
      (block) => block.id === blockId,
    );
    if (blockIndex === -1) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    return runDocumentCommand("deleteBlock", "local", () => {
      let sourcePosition: number | null = null;
      tiptapEditor.state.doc.forEach((node, offset) => {
        if (node.attrs.blockId !== blockId) return;
        sourcePosition = offset;
      });
      if (sourcePosition === null) return false;
      const sourceNode = tiptapEditor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;

      const transaction = tiptapEditor.state.tr.delete(
        sourcePosition,
        sourcePosition + sourceNode.nodeSize,
      );
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const runSelectionCommand = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> => {
    if (tiptapEditor.state.selection.empty) {
      return commandNotApplicable(command);
    }
    return runDocumentCommand(command, "local", run);
  };

  const runLinkCommand = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> => {
    if (tiptapEditor.state.selection.empty && !tiptapEditor.isActive("link")) {
      return commandNotApplicable(command);
    }
    return runDocumentCommand(command, "local", run);
  };

  return {
    mount(element) {
      if (destroyed) return;
      if (mountedElement !== null) tiptapEditor.unmount();
      tiptapEditor.mount(element);
      mountedElement = element;
    },
    unmount() {
      if (destroyed || mountedElement === null) return;
      tiptapEditor.unmount();
      mountedElement = null;
    },
    destroy() {
      if (destroyed) return;
      currentDocument = readEditorDocument(tiptapEditor);
      currentDocument.revision = sessionRevision;
      tiptapEditor.destroy();
      mountedElement = null;
      destroyed = true;
    },
    getDocument() {
      return structuredClone(currentDocument);
    },
    getSelectionMarks() {
      if (destroyed) return [];
      return toggleableMarkTypes.filter((type) => tiptapEditor.isActive(type));
    },
    getSelectionLink() {
      if (destroyed) return null;
      const href = tiptapEditor.getAttributes("link").href;
      return typeof href === "string" ? { href } : null;
    },
    getCaretBlockContext() {
      if (destroyed) return null;
      const { selection } = tiptapEditor.state;
      if (!selection.empty) return null;

      const node = selection.$from.parent;
      if (node.type.name !== "paragraph" && node.type.name !== "heading") {
        return null;
      }
      const blockId = node.attrs.blockId;
      if (typeof blockId !== "string" || blockId.length === 0) return null;

      const blockType: BlockTypeDescriptor =
        node.type.name === "heading"
          ? { type: "heading", level: node.attrs.level as 1 | 2 | 3 }
          : { type: "paragraph" };
      return { blockId, blockType, text: node.textContent };
    },
    getSelectionBlockType() {
      if (destroyed) return null;
      const { selection, doc } = tiptapEditor.state;
      const { from, to } = selection;

      let result: { blockId: string; blockType: BlockTypeDescriptor } | null =
        null;
      doc.forEach((node, offset) => {
        if (result !== null) return;
        if (from < offset || to > offset + node.nodeSize) return;
        if (node.type.name !== "paragraph" && node.type.name !== "heading") {
          return;
        }
        const blockId = node.attrs.blockId;
        if (typeof blockId !== "string" || blockId.length === 0) return;

        const blockType: BlockTypeDescriptor =
          node.type.name === "heading"
            ? { type: "heading", level: node.attrs.level as 1 | 2 | 3 }
            : { type: "paragraph" };
        result = { blockId, blockType };
      });
      return result;
    },
    replaceDocument(next) {
      if (destroyed) return commandNotApplicable("replaceDocument");

      const parsed = parseSupportedDocument(next);
      if (!parsed.ok) return parsed;
      if (sameDocumentContent(currentDocument, parsed.value)) {
        return commandNotApplicable("replaceDocument");
      }
      if (sessionRevision >= Number.MAX_SAFE_INTEGER) {
        return commandNotApplicable("replaceDocument");
      }

      const replacement = createTiptapEditor(parsed.value);
      tiptapEditor.destroy();
      tiptapEditor = replacement;
      if (mountedElement !== null) tiptapEditor.mount(mountedElement);

      commitDocument(parsed.value, "replace");
      return { ok: true, value: undefined };
    },
    commands: {
      setText,
      insertParagraphAfter,
      setBlockType,
      moveBlockBefore,
      duplicateBlock,
      deleteBlock,
      toggleBold: () =>
        runSelectionCommand("toggleBold", () =>
          tiptapEditor.commands.toggleBold(),
        ),
      toggleItalic: () =>
        runSelectionCommand("toggleItalic", () =>
          tiptapEditor.commands.toggleItalic(),
        ),
      toggleUnderline: () =>
        runSelectionCommand("toggleUnderline", () =>
          tiptapEditor.commands.toggleUnderline(),
        ),
      toggleStrike: () =>
        runSelectionCommand("toggleStrike", () =>
          tiptapEditor.commands.toggleStrike(),
        ),
      toggleCode: () =>
        runSelectionCommand("toggleCode", () =>
          tiptapEditor.commands.toggleCode(),
        ),
      setLink: (href) => {
        if (!isSupportedLinkHref(href)) {
          return { ok: false, error: { code: "LINK_HREF_REJECTED", href } };
        }
        if (tiptapEditor.isActive("link", { href })) {
          return commandNotApplicable("setLink");
        }
        return runLinkCommand("setLink", () => {
          const chain = tiptapEditor.chain();
          if (tiptapEditor.state.selection.empty) {
            chain.extendMarkRange("link");
          }
          return chain.setLink({ href }).run();
        });
      },
      unsetLink: () =>
        runLinkCommand("unsetLink", () => {
          const chain = tiptapEditor.chain();
          if (tiptapEditor.state.selection.empty) {
            chain.extendMarkRange("link");
          }
          return chain.unsetLink().run();
        }),
      undo: () =>
        runDocumentCommand("undo", "undo", () => tiptapEditor.commands.undo()),
      redo: () =>
        runDocumentCommand("redo", "redo", () => tiptapEditor.commands.redo()),
    },
  };
};
