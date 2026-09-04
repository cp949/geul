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
import type { MediaUploadState, UploadFile } from "./media-upload.js";
import { modelToTiptap, type TiptapJsonNode } from "./model-to-tiptap.js";
import type { PasteRejectedReason } from "./table-command-error.js";
import { tiptapToModel } from "./tiptap-to-model.js";
import { createProductionEditor } from "./production-editor-assembly.js";

type ChangeReason = "local" | "replace" | "undo" | "redo";

// spec §5.3 — ProseMirror Selection과 독립적인 core 자체 상태. 세션 밖으로는
// getBlockSelection()/setBlockSelection() 두 메서드로만 노출한다. editor-controller.ts의
// 공개 `BlockSelection` 타입과 구조가 같지만 import는 하지 않는다 — 이 파일의
// ChangeReason과 DocumentChangeEvent.reason이 이미 같은 방식으로 유니온을
// 복제한다(순환 의존 회피 관례).
type BlockSelectionRange = { fromBlockId: string; toBlockId: string };

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
  private blockSelection: BlockSelectionRange | null = null;
  // spec §4.2 — blockSelection과 같은 세션 전용 상태(모델 스키마 밖,
  // runDocumentCommand 밖). uploadState는 "uploading" | 에러 상태만 담는다
  // (성공·취소는 흔적을 남기지 않고 항목을 지운다). uploadControllers는
  // 진행 중인 업로드의 AbortController만 담고 완료 즉시 제거한다 —
  // cancelMediaUpload(editor-controller.ts)가 이 맵으로 취소 대상을 찾는다.
  private readonly uploadState = new Map<string, MediaUploadState>();
  private readonly uploadControllers = new Map<string, AbortController>();

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
      uploadFile?: UploadFile;
      onUploadStateChange?: (
        blockId: string,
        state: MediaUploadState | null,
      ) => void;
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

  // 문서 비저장 세션 필드 조회·갱신. runDocumentCommand를 거치지 않아
  // revision·onChange·undo 스택 어느 것도 건드리지 않는다(spec §5.3,
  // DELTA-01 완료 조건 7) — 호출자(generic-block-commands.ts의
  // selectBlockRange/clearBlockSelection)가 그 대신 유효성 가드를 진다.
  getBlockSelection(): BlockSelectionRange | null {
    return this.blockSelection;
  }

  setBlockSelection(next: BlockSelectionRange | null): void {
    this.blockSelection = next;
  }

  get uploadFile(): UploadFile | undefined {
    return this.options.uploadFile;
  }

  getMediaUploadState(blockId: string): MediaUploadState | null {
    return this.uploadState.get(blockId) ?? null;
  }

  getMediaUploadController(blockId: string): AbortController | null {
    return this.uploadControllers.get(blockId) ?? null;
  }

  // 업로드 시작 — 컨트롤러를 등록하고 상태를 "uploading"으로 알린다.
  // 호출자(editor-controller.ts::runMediaUpload)가 같은 블록의 진행 중
  // 업로드가 없는지 먼저 확인한다(getMediaUploadController).
  beginMediaUpload(blockId: string): AbortController {
    const controller = new AbortController();
    this.uploadControllers.set(blockId, controller);
    this.setMediaUploadState(blockId, "uploading");
    return controller;
  }

  // 업로드 종료 — 진행 중 컨트롤러를 제거하고 최종 상태를 알린다.
  // outcome이 null이면 성공·취소(흔적 없음)이고, 에러면 code·message가
  // pending 상태로 남는다(spec §4.2).
  endMediaUpload(blockId: string, outcome: MediaUploadState | null): void {
    this.uploadControllers.delete(blockId);
    this.setMediaUploadState(blockId, outcome);
  }

  private setMediaUploadState(
    blockId: string,
    state: MediaUploadState | null,
  ): void {
    if (state === null) {
      this.uploadState.delete(blockId);
    } else {
      this.uploadState.set(blockId, state);
    }
    this.options.onUploadStateChange?.(blockId, state);
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
      // BlockMoveKeyboardExtension이 활성 블록 선택 범위를 읽는 유일한
      // 경로다 — this.blockSelection은 이 생성자 실행 시점엔 아직
      // 초기화 전이어도 클로저 자체는 유효하고, 실제 호출(키보드
      // shortcut 발동)은 생성자 완료 이후라 안전하다(RD-004.md "결정"
      // (c), production-editor-assembly.ts·block-move-keyboard-extension.ts
      // 배선 참고).
      getBlockSelection: () => this.getBlockSelection(),
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
