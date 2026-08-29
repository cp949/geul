import {
  type Block,
  type Document as BlockDocument,
  createRandomDocumentId,
  type IdFactory,
  parseDocument,
  type Result,
} from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";

import type { EditorError } from "./errors.js";
import { modelToTiptap, type TiptapJsonNode } from "./model-to-tiptap.js";
import type { PasteRejectedReason } from "./table-command-error.js";
import { tiptapToModel } from "./tiptap-to-model.js";
import { createProductionEditor } from "./production-editor-assembly.js";

type ChangeReason = "local" | "replace" | "undo" | "redo";

export const commandNotApplicable = (
  command: string,
): Result<never, EditorError> => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

const cloneDocument = (document: BlockDocument): BlockDocument =>
  JSON.parse(JSON.stringify(document)) as BlockDocument;

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

const flattenBlockTree = (
  blocks: readonly Block[],
  parentId: string | null = null,
): Map<string, { parentId: string | null; index: number; ownJson: string }> => {
  const map = new Map<
    string,
    { parentId: string | null; index: number; ownJson: string }
  >();
  blocks.forEach((block, index) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { children, ...blockWithoutChildren } = block as Block & {
      children?: unknown;
    };
    map.set(block.id, {
      parentId,
      index,
      ownJson: JSON.stringify(blockWithoutChildren),
    });
    if ("children" in block && block.children !== undefined) {
      for (const [childId, childData] of flattenBlockTree(
        block.children,
        block.id,
      )) {
        map.set(childId, childData);
      }
    }
  });
  return map;
};

const blockChanges = (
  previous: BlockDocument,
  next: BlockDocument,
): string[] => {
  const previousMap = flattenBlockTree(previous.blocks);
  const nextMap = flattenBlockTree(next.blocks);
  const changed: string[] = [];
  for (const [blockId, previousData] of previousMap) {
    const nextData = nextMap.get(blockId);
    if (
      nextData === undefined ||
      nextData.parentId !== previousData.parentId ||
      nextData.index !== previousData.index ||
      nextData.ownJson !== previousData.ownJson
    ) {
      changed.push(blockId);
    }
  }
  for (const [blockId] of nextMap) {
    if (!previousMap.has(blockId)) changed.push(blockId);
  }
  return changed;
};

export class ProductionEditorSession {
  readonly createId: IdFactory;
  private sessionRevision: number;
  private currentDocument: BlockDocument;
  private tiptapEditor: Editor;
  private destroyed = false;
  private mountedElement: HTMLElement | null = null;
  private activeReason: ChangeReason | null = null;
  private pendingDocument: BlockDocument | null = null;

  constructor(
    private readonly options: {
      initialDocument: BlockDocument;
      createId?: IdFactory;
      onChange?: (event: {
        revision: number;
        changedBlockIds: readonly string[];
        reason: ChangeReason;
      }) => void;
      onPasteRejected?: (reason: PasteRejectedReason) => void;
    },
  ) {
    const parsed = parseSupportedDocument(options.initialDocument);
    if (!parsed.ok) {
      throw new TypeError(
        parsed.error.code === "DOCUMENT_INVALID"
          ? parsed.error.message
          : parsed.error.code,
      );
    }
    this.createId = options.createId ?? createRandomDocumentId;
    this.sessionRevision = parsed.value.revision;
    this.currentDocument = cloneDocument(parsed.value);
    this.tiptapEditor = this.createTiptapEditor(parsed.value);
    this.currentDocument = this.readEditorDocument(this.tiptapEditor);
  }

  get editor(): Editor {
    return this.tiptapEditor;
  }

  get document(): BlockDocument {
    return this.currentDocument;
  }

  get revision(): number {
    return this.sessionRevision;
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  mount(element: HTMLElement): void {
    if (this.destroyed) return;
    if (this.mountedElement !== null) this.tiptapEditor.unmount();
    this.tiptapEditor.mount(element);
    this.mountedElement = element;
  }

  unmount(): void {
    if (this.destroyed || this.mountedElement === null) return;
    this.tiptapEditor.unmount();
    this.mountedElement = null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.currentDocument = this.readEditorDocument(this.tiptapEditor);
    this.currentDocument.revision = this.sessionRevision;
    this.tiptapEditor.destroy();
    this.mountedElement = null;
    this.destroyed = true;
  }

  getDocument(): BlockDocument {
    return cloneDocument(this.currentDocument);
  }

  replaceDocument(next: unknown): Result<void, EditorError> {
    if (this.destroyed) return commandNotApplicable("replaceDocument");
    const parsed = parseSupportedDocument(next);
    if (!parsed.ok) return parsed;
    if (blockChanges(this.currentDocument, parsed.value).length === 0) {
      return commandNotApplicable("replaceDocument");
    }
    if (this.sessionRevision >= Number.MAX_SAFE_INTEGER) {
      return commandNotApplicable("replaceDocument");
    }

    const replacement = this.createTiptapEditor(parsed.value);
    this.tiptapEditor.destroy();
    this.tiptapEditor = replacement;
    if (this.mountedElement !== null) {
      this.tiptapEditor.mount(this.mountedElement);
    }
    this.commitDocument(this.readEditorDocument(this.tiptapEditor), "replace");
    return { ok: true, value: undefined };
  }

  runDocumentCommand(
    command: string,
    reason: ChangeReason,
    run: () => boolean,
  ): Result<void, EditorError> {
    if (this.destroyed || this.sessionRevision >= Number.MAX_SAFE_INTEGER) {
      return commandNotApplicable(command);
    }
    this.activeReason = reason;
    this.pendingDocument = null;
    let applied: boolean;
    try {
      applied = run();
    } finally {
      this.activeReason = null;
    }
    if (!applied) return commandNotApplicable(command);
    const nextDocument =
      this.pendingDocument ?? this.readEditorDocument(this.tiptapEditor);
    this.pendingDocument = null;
    return this.commitDocument(nextDocument, reason)
      ? { ok: true, value: undefined }
      : commandNotApplicable(command);
  }

  private createTiptapEditor(document: BlockDocument): Editor {
    return createProductionEditor({
      document,
      createId: this.createId,
      onUpdate: (editor) => this.onTiptapUpdate(editor),
      ...(this.options.onPasteRejected === undefined
        ? {}
        : { onPasteRejected: this.options.onPasteRejected }),
      canApplyDocumentChange: () =>
        this.sessionRevision < Number.MAX_SAFE_INTEGER,
    });
  }

  private readEditorDocument(editor: Editor): BlockDocument {
    const converted = tiptapToModel(
      editor.getJSON() as TiptapJsonNode,
      this.sessionRevision,
      this.createId,
    );
    if (!converted.ok) {
      throw new TypeError(
        converted.error.code === "DOCUMENT_INVALID"
          ? converted.error.message
          : converted.error.code,
      );
    }
    return converted.value;
  }

  private commitDocument(next: BlockDocument, reason: ChangeReason): boolean {
    const changedBlockIds = blockChanges(this.currentDocument, next);
    if (changedBlockIds.length === 0) return false;
    if (this.sessionRevision >= Number.MAX_SAFE_INTEGER) return false;
    this.sessionRevision += 1;
    this.currentDocument = cloneDocument({
      ...next,
      revision: this.sessionRevision,
    });
    this.options.onChange?.({
      revision: this.sessionRevision,
      changedBlockIds,
      reason,
    });
    return true;
  }

  private onTiptapUpdate(editor: Editor): void {
    const nextDocument = this.readEditorDocument(editor);
    if (this.activeReason === null) {
      this.commitDocument(nextDocument, "local");
      return;
    }
    this.pendingDocument = nextDocument;
  }
}
