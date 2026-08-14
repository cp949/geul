import {
  type Document as BlockDocument,
  type IdFactory,
  isSupportedLinkHref,
  parseDocument,
  type Result,
} from "@cp949/geul-model";
import { Editor, type JSONContent } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
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
  replaceDocument(next: unknown): Result<void, EditorError>;
  readonly commands: {
    setText(blockId: string, text: string): Result<void, EditorError>;
    undo(): Result<void, EditorError>;
    redo(): Result<void, EditorError>;
  };
}

export type CreateEditorOptions = {
  initialDocument: BlockDocument;
  createId?: IdFactory;
  onChange?: (event: DocumentChangeEvent) => void;
};

type ChangeReason = DocumentChangeEvent["reason"];

const defaultIdFactory: IdFactory = () => globalThis.crypto.randomUUID();

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
      undo: () =>
        runDocumentCommand("undo", "undo", () => tiptapEditor.commands.undo()),
      redo: () =>
        runDocumentCommand("redo", "redo", () => tiptapEditor.commands.redo()),
    },
  };
};
