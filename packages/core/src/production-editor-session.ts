import {
  type Block,
  type Document as BlockDocument,
  type DocumentBlock,
  createRandomDocumentId,
  type IdFactory,
  parseDocument,
  type Result,
} from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

// EditorController/CustomBlockDefinition/CustomInlineContentDefinition을
// import type으로만 참조한다(RD-002-DELTA-11 "결정" 4 —
// production-editor-assembly.ts와 동일 근거, 값 import가 아니라 컴파일
// 시 지워져 런타임 순환 의존이 생기지 않는다).
import type {
  CustomBlockDefinition,
  CustomInlineContentDefinition,
  CustomStyleDefinition,
} from "./custom-extension-definitions.js";
import { DEFAULT_DICTIONARY, type Dictionary } from "./dictionary.js";
import type { EditorController } from "./editor-controller-types.js";
import type { EditorError } from "./errors.js";
import { collectLocalPreviewBlocks } from "./media-local-preview-lifecycle-extension.js";
import type { LocalPreviewAttrs } from "./media-local-preview.js";
import type { MediaUploadState, UploadFile } from "./media-upload.js";
import {
  type EnabledBlockTypes,
  modelToTiptap,
  type TiptapJsonNode,
} from "./model-to-tiptap.js";
import { MediaUploadTracker } from "./production-editor-media-upload.js";
import type { SyntaxHighlighter } from "./syntax-highlight.js";
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
  customBlockTypes: ReadonlySet<string>,
  customInlineContentTypes: ReadonlySet<string>,
  customStyleTypes: ReadonlySet<string>,
  enabledBlockTypes: EnabledBlockTypes | undefined,
): Result<BlockDocument, EditorError> => {
  const parsed = parseDocument(input);
  if (!parsed.ok) {
    return {
      ok: false,
      error: { code: "DOCUMENT_INVALID", message: parsed.error.message },
    };
  }
  const converted = modelToTiptap(parsed.value, {
    customBlockTypes,
    customInlineContentTypes,
    customStyleTypes,
    ...(enabledBlockTypes === undefined ? {} : { enabledBlockTypes }),
  });
  return converted.ok ? { ok: true, value: parsed.value } : converted;
};

const flattenBlockTree = (
  blocks: readonly DocumentBlock[],
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
  // Issue #168 roadmap RD-002 DELTA-03 — MediaLocalPreviewLifecycleExtension의
  // `pending`(삭제됐지만 undo-불가 판정 전) 최신 스냅샷 미러. destroy()가
  // doc 순회(collectLocalPreviewBlocks)만으로는 보지 못하는 이 블록들도
  // 함께 정리 신호를 내기 위해 읽는다 — 그 외 용도로 쓰지 않는다.
  private pendingUnreachableLocalPreviews: ReadonlyMap<
    string,
    LocalPreviewAttrs
  > = new Map();
  private activeReason: ChangeReason | null = null;
  private pendingDocument: BlockDocument | null = null;
  private blockSelection: BlockSelectionRange | null = null;
  // spec §4.2 — uploadState/uploadControllers 맵과 그 상태 기계는
  // production-editor-media-upload.ts::MediaUploadTracker가 소유한다. 이
  // 세션은 MediaUploadHost 표면(isDestroyed/editor/uploadFile/
  // runDocumentCommand/notifyUploadStateChange)만 구현해 트래커에
  // 주입한다.
  private readonly mediaUpload = new MediaUploadTracker(this);
  // spec §3.4(DOC-013), RD-005-DELTA-01 — blockSelection/uploadState와
  // 같은 이유로 세션이 소유한다. replaceDocument()가 tiptap Editor를
  // 완전히 새로 만들 때마다(createTiptapEditor) 이 값을 그대로 넘겨야
  // 문서 교체가 읽기 전용 상태를 조용히 풀지 않는다 — Tiptap 자신의
  // Editor.isEditable/options.editable에만 맡기면 재구성마다 Tiptap
  // 기본값(true)으로 리셋된다.
  private editableState = true;

  // registry(RD-002-DELTA-11)에 등록된 커스텀 block type 이름 집합 —
  // modelToTiptap/tiptapToModel의 top-level 거절·복원 분기가 소비한다.
  // 매 접근마다 계산한다(호출 빈도가 낮고 options.customBlocks가 세션
  // 생애주기 동안 불변이라 캐싱 이점이 없다).
  private get customBlockTypes(): ReadonlySet<string> {
    return new Set(Object.keys(this.options.customBlocks ?? {}));
  }

  // registry(RD-002-DELTA-18)에 등록된 커스텀 inline 원소 type 이름
  // 집합 — customBlockTypes와 동일 패턴(매 접근마다 계산, 캐싱 이점
  // 없음).
  private get customInlineContentTypes(): ReadonlySet<string> {
    return new Set(Object.keys(this.options.customInlineContent ?? {}));
  }

  // registry(RD-002-DELTA-19)에 등록된 커스텀 스타일 type 이름 집합 —
  // customBlockTypes/customInlineContentTypes와 동일 패턴.
  private get customStyleTypes(): ReadonlySet<string> {
    return new Set(Object.keys(this.options.customStyles ?? {}));
  }

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
      // spec §10(IO-008), RD-001-DELTA-01 — customBlocks/keyboardShortcuts와
      // 동일 시점·동일 지연 바인딩 참조(controllerEditor) 구조로
      // createTiptapEditor에 전달한다.
      pasteHandler?: (context: {
        event: ClipboardEvent;
        editor: EditorController;
        defaultPasteHandler: () => boolean;
      }) => boolean | undefined;
      uploadFile?: UploadFile;
      onUploadStateChange?: (
        blockId: string,
        state: MediaUploadState | null,
      ) => void;
      // Issue #168 roadmap RD-001 DELTA-05 — CreateEditorOptions와 동일
      // 필드(editor-controller-types.ts 주석 참고). onUploadStateChange와
      // 같은 자리에 둔다(둘 다 "문서 변경이 아닌 media 관련 push 알림").
      onLocalPreviewCleanup?: (
        blockId: string,
        cleared: LocalPreviewAttrs,
      ) => void;
      onMount?: () => void;
      onUnmount?: () => void;
      onSelectionChange?: () => void;
      onBeforeChange?: (context: {
        changes: {
          revision: number;
          changedBlockIds: readonly string[];
          reason: ChangeReason;
        };
      }) => boolean | void;
      // spec §4.4, RD-002-DELTA-11 — createTiptapEditor가 등록된 타입마다
      // PM atom 노드를 조건부로 추가한다(production-editor-assembly.ts).
      customBlocks?: Record<string, CustomBlockDefinition>;
      // spec §4.4(EXT-002), RD-002-DELTA-18 — customBlocks와 동일 시점에
      // PM inline atom 노드를 조건부로 추가한다.
      customInlineContent?: Record<string, CustomInlineContentDefinition>;
      // spec §4.4(EXT-003), RD-002-DELTA-19 — customBlocks와 동일 시점에
      // PM Mark를 조건부로 추가한다.
      customStyles?: Record<string, CustomStyleDefinition>;
      // spec §4.4(EXT-004), RD-002-DELTA-12 — 기존 14종 대상 allow/deny
      // 목록. 세션 생애주기 동안 불변이라(재설정 API 없음) 매번 이
      // 옵션에서 다시 읽는다(customBlocks와 같은 패턴).
      enabledBlockTypes?: EnabledBlockTypes;
      // spec §5(EXT-005), RD-002-DELTA-01 — customBlocks와 동일 시점·동일
      // 지연 바인딩 참조(controllerEditor) 구조로 createTiptapEditor에
      // 전달한다.
      keyboardShortcuts?: Record<string, (editor: EditorController) => boolean>;
      // spec §7(EXT-008), R4 슬라이스5 RD-002-DELTA-01 — createTiptapEditor가
      // 매 재구성마다 그대로 전달한다(customBlocks와 동일 패턴).
      attributeOverrides?: {
        editor?: Record<string, string>;
        blockContainer?: Record<string, string>;
        blockGroup?: Record<string, string>;
      };
      // spec §8(EXT-009), RD-001-DELTA-01 — attributeOverrides와 동일하게
      // createTiptapEditor가 매 재구성마다 그대로 전달한다.
      dictionary?: Dictionary;
      // spec §3(BLK-017), RD-001-DELTA-01 — attributeOverrides/dictionary와
      // 동일 패턴으로 createTiptapEditor가 매 재구성마다 그대로 전달한다.
      syntaxHighlighter?: SyntaxHighlighter;
    },
    // createEditor(editor-controller.ts)가 세션 생성 전에 미리 만들어 둔
    // 지연 바인딩 참조다 — 이 세션 생성이 끝나기 전(생성자 안에서
    // createTiptapEditor가 트리거하는 dummy mount/unmount 구간)에는 아직
    // 완성되지 않은 EditorController를 가리킨다(DELTA-11.md "결정" 2).
    // 이 세션은 이 값을 그대로 createProductionEditor에 전달만 하고
    // 스스로 호출하지 않는다.
    private readonly controllerEditor: EditorController,
  ) {
    const parsed = parseSupportedDocument(
      options.initialDocument,
      new Set(Object.keys(options.customBlocks ?? {})),
      new Set(Object.keys(options.customInlineContent ?? {})),
      new Set(Object.keys(options.customStyles ?? {})),
      options.enabledBlockTypes,
    );
    if (!parsed.ok) {
      throw new TypeError(
        parsed.error.code === "DOCUMENT_INVALID" ||
          parsed.error.code === "EDITOR_FEATURE_UNAVAILABLE"
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

  // spec §3.4(DOC-013) — 파괴된 세션은 항상 false를 반환한다(다른
  // isDestroyed 가드와 동일 원칙, editor-controller.ts의
  // isUploadEnabled() 선례). Tiptap 자신의 Editor.isEditable에
  // 위임하지 않는다 — destroy 후 그 getter는 editorView 대신 반환하는
  // stub proxy가 editable: true를 하드코딩해(@tiptap/core 실측)
  // 항상 true를 돌려준다.
  get isEditable(): boolean {
    return !this.destroyed && this.editableState;
  }

  set isEditable(value: boolean) {
    if (this.destroyed) return;
    this.editableState = value;
    this.tiptapEditor.setEditable(value, false);
  }

  mount(element: HTMLElement): void {
    if (this.destroyed) return;
    if (this.mountedElement !== null) this.tiptapEditor.unmount();
    this.tiptapEditor.mount(element);
    this.mountedElement = element;
    this.options.onMount?.();
  }

  unmount(): void {
    if (this.destroyed || this.mountedElement === null) return;
    this.options.onUnmount?.();
    this.tiptapEditor.unmount();
    this.mountedElement = null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.currentDocument = this.readEditorDocument(this.tiptapEditor);
    this.currentDocument.revision = this.sessionRevision;
    // Issue #168 roadmap RD-002 DELTA-03 — 세션이 영구히 사라지기 직전, 아직
    // 정리되지 않은 로컬 프리뷰(ADR 0015)가 남아 있으면 같은
    // onLocalPreviewCleanup 채널로 알려 react(RD-002)가 남은 Blob URL을
    // revoke할 기회를 준다. MediaLocalPreviewLifecycleExtension의 undo-불가
    // 판정과 달리 재판정이 필요 없다 — 세션이 끝나면 그 뒤로는 undo도
    // 불가능해지므로 doc에 남은 로컬 프리뷰는 전부 무조건 정리 대상이다.
    // unmount()(재마운트 가능한 DOM 분리)가 아니라 destroy()에만 건다 —
    // external ownership이 같은 컨트롤러를 유지한 채 EditorContent를 껐다
    // 켤 수 있어(RD-002.md "결정"), unmount()마다 정리 신호를 내면 재마운트
    // 시 이미 revoke된 Blob URL을 다시 그리려 해 이미지가 깨진다. doc은
    // tiptapEditor.destroy() 이전 상태를 읽어야 하므로 반드시 그 호출보다
    // 앞에 둔다.
    for (const [blockId, attrs] of collectLocalPreviewBlocks(
      this.tiptapEditor.state.doc,
    )) {
      this.notifyLocalPreviewCleared(blockId, attrs);
    }
    // 위 doc 순회는 삭제됐지만 undo-불가 판정 전이라 doc에 이미 없는
    // 블록은 보지 못한다(구현 중 실측 — "삭제 직후 destroy()" 회귀) —
    // MediaLocalPreviewLifecycleExtension의 pending 미러를 함께 훑는다.
    // 두 순회는 겹치지 않는다: pending은 doc에서 사라진 블록만 담는다.
    for (const [blockId, attrs] of this.pendingUnreachableLocalPreviews) {
      this.notifyLocalPreviewCleared(blockId, attrs);
    }
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

  // spec §8(EXT-009), RD-002-DELTA-01 — construction-time 옵션 readback,
  // uploadFile getter와 동일 자리·근거. dictionary는 세션 생애주기 동안
  // 불변이라(재설정 API 없음) 매 호출마다 다시 읽어도 항상 같은 값이다.
  getDictionary(): Dictionary {
    return this.options.dictionary ?? DEFAULT_DICTIONARY;
  }

  getMediaUploadState(blockId: string): MediaUploadState | null {
    return this.mediaUpload.getMediaUploadState(blockId);
  }

  getMediaUploadController(blockId: string): AbortController | null {
    return this.mediaUpload.getMediaUploadController(blockId);
  }

  // 업로드 시작 — 컨트롤러를 등록하고 상태를 "uploading"으로 알린다.
  // 호출자(editor-controller.ts::runMediaUpload)가 같은 블록의 진행 중
  // 업로드가 없는지 먼저 확인한다(getMediaUploadController).
  beginMediaUpload(blockId: string): AbortController {
    return this.mediaUpload.beginMediaUpload(blockId);
  }

  // 업로드 종료 — 진행 중 컨트롤러를 제거하고 최종 상태를 알린다.
  // outcome이 null이면 성공·취소(흔적 없음)이고, 에러면 code·message가
  // pending 상태로 남는다(spec §4.2).
  endMediaUpload(blockId: string, outcome: MediaUploadState | null): void {
    this.mediaUpload.endMediaUpload(blockId, outcome);
  }

  // MediaUploadHost 표면 — production-editor-media-upload.ts::
  // MediaUploadTracker가 상태 변경을 알릴 때 호출한다. options가
  // private라 트래커에 직접 넘길 수 없어 이 위임 메서드로 대신한다.
  notifyUploadStateChange(
    blockId: string,
    state: MediaUploadState | null,
  ): void {
    this.options.onUploadStateChange?.(blockId, state);
  }

  // MediaUploadHost 표면(production-editor-media-upload.ts::
  // applyUploadedMediaAttrs)과 block-attribute-commands.ts::setMediaBlockUrl
  // 공용 — url 확정 시 정리된 로컬 프리뷰를 알린다(Issue #168 roadmap
  // RD-001 DELTA-05). notifyUploadStateChange와 동일한 "options private라
  // 위임 메서드로 대신한다" 근거.
  notifyLocalPreviewCleared(blockId: string, cleared: LocalPreviewAttrs): void {
    this.options.onLocalPreviewCleanup?.(blockId, cleared);
  }

  // spec §4 — uploadMediaFile/replaceMediaBlockFile(editor-controller.ts)와
  // MediaDropPasteExtension의 drop/paste 트리거(RD-002 DELTA-02) 공용
  // 본체다. 실제 상태 기계는 production-editor-media-upload.ts::
  // MediaUploadTracker가 소유한다(RD-002 DELTA-02가 editor-controller.ts에서
  // 이 세션으로 이동시킨 로직을 분리 작업이 다시 트래커로 옮겼다) — 이
  // 메서드는 이 세션 자신을 MediaUploadHost로 넘겨 위임하는 thin
  // wrapper다.
  async uploadMediaFile(
    command: string,
    blockId: string,
    file: File,
  ): Promise<Result<void, EditorError>> {
    return this.mediaUpload.uploadMediaFile(command, blockId, file);
  }

  replaceDocument(next: unknown): Result<void, EditorError> {
    if (this.destroyed) return commandNotApplicable("replaceDocument");
    const parsed = parseSupportedDocument(
      next,
      this.customBlockTypes,
      this.customInlineContentTypes,
      this.customStyleTypes,
      this.options.enabledBlockTypes,
    );
    if (!parsed.ok) return parsed;
    if (blockChanges(this.currentDocument, parsed.value).length === 0) {
      return commandNotApplicable("replaceDocument");
    }
    if (this.sessionRevision >= Number.MAX_SAFE_INTEGER) {
      return commandNotApplicable("replaceDocument");
    }

    const replacement = this.createTiptapEditor(parsed.value);
    // Issue #169 roadmap RD-001 DELTA-01 — 구 Editor를 폐기하기 직전, 그
    // 상태에 남아 있던 로컬 프리뷰(ADR 0015) 전체를 destroy()(RD-002
    // DELTA-03)와 동일한 패턴으로 onLocalPreviewCleanup에 통지한다. 새
    // Editor(replacement)는 자신만의 빈 pending에서 시작하고
    // EditorState.create()는 appendTransaction을 거치지 않아
    // notifyLocalPreviewPendingChange가 생성 시점에 호출되지 않으므로,
    // createTiptapEditor() 호출 뒤에도 this.pendingUnreachableLocalPreviews는
    // 구 Editor 값 그대로다.
    for (const [blockId, attrs] of collectLocalPreviewBlocks(
      this.tiptapEditor.state.doc,
    )) {
      this.notifyLocalPreviewCleared(blockId, attrs);
    }
    for (const [blockId, attrs] of this.pendingUnreachableLocalPreviews) {
      this.notifyLocalPreviewCleared(blockId, attrs);
    }
    // 위 스윕이 통지한 blockId를 리셋한다 — 리셋하지 않으면 이 세션 필드가
    // 구 Editor의 blockId를 그대로 가리킨 채 남아, 이후 destroy()가 같은
    // blockId를 다시 순회해 중복 통지한다("정확히 1회" 위반).
    this.pendingUnreachableLocalPreviews = new Map();
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
      editable: this.editableState,
      ...(this.options.customBlocks === undefined
        ? {}
        : {
            customBlocks: this.options.customBlocks,
            customBlockEditor: this.controllerEditor,
          }),
      ...(this.options.customInlineContent === undefined
        ? {}
        : {
            customInlineContent: this.options.customInlineContent,
            customInlineContentEditor: this.controllerEditor,
          }),
      // customStyles(RD-002-DELTA-19)는 customBlocks/customInlineContent와
      // 달리 editor 참조가 필요 없다(CustomStyleDefinition.render는 값만
      // 받는다, spec §4.4) — 지연 바인딩 Proxy 배선이 없다.
      ...(this.options.customStyles === undefined
        ? {}
        : { customStyles: this.options.customStyles }),
      // spec §5(EXT-005), RD-002-DELTA-01 — customBlocks/customInlineContent와
      // 동일 근거로 controllerFacade를 keyboardShortcutsEditor로 넘긴다.
      ...(this.options.keyboardShortcuts === undefined
        ? {}
        : {
            keyboardShortcuts: this.options.keyboardShortcuts,
            keyboardShortcutsEditor: this.controllerEditor,
          }),
      ...(this.options.enabledBlockTypes === undefined
        ? {}
        : { enabledBlockTypes: this.options.enabledBlockTypes }),
      ...(this.options.onPasteRejected === undefined
        ? {}
        : { onPasteRejected: this.options.onPasteRejected }),
      // spec §10(IO-008), RD-001-DELTA-01 — customBlocks/keyboardShortcuts와
      // 동일 근거로 controllerFacade를 pasteHandlerEditor로 넘긴다.
      ...(this.options.pasteHandler === undefined
        ? {}
        : {
            pasteHandler: this.options.pasteHandler,
            pasteHandlerEditor: this.controllerEditor,
          }),
      ...(this.options.onSelectionChange === undefined
        ? {}
        : { onSelectionChange: this.options.onSelectionChange }),
      // spec §7(EXT-008), RD-002-DELTA-01 — replaceDocument()가 재구성하는
      // 매 Tiptap Editor 생성마다 다시 넘겨야 override가 유지된다
      // (onPasteRejected 등 위 옵션들과 동일 실수 클래스,
      // editor-controller-editable.test.ts의 isEditable 선례와 동형).
      ...(this.options.attributeOverrides === undefined
        ? {}
        : { attributeOverrides: this.options.attributeOverrides }),
      // spec §8(EXT-009), RD-001-DELTA-01 — attributeOverrides와 동일 근거로
      // replaceDocument()가 재구성하는 매 Tiptap Editor 생성마다 다시
      // 넘겨야 override가 유지된다.
      ...(this.options.dictionary === undefined
        ? {}
        : { dictionary: this.options.dictionary }),
      // spec §3(BLK-017), RD-001-DELTA-01 — dictionary와 동일 근거로
      // replaceDocument()가 재구성하는 매 Tiptap Editor 생성마다 다시
      // 넘겨야 override가 유지된다.
      ...(this.options.syntaxHighlighter === undefined
        ? {}
        : { syntaxHighlighter: this.options.syntaxHighlighter }),
      canApplyDocumentChange: (transaction, loadNormalizing) =>
        this.evaluateBeforeChange(transaction, loadNormalizing),
      // Issue #167 roadmap RD-001-DELTA-01 — revisionGuard의
      // appendTransaction 훅 전용(위 isDocumentStructurallyValid 주석).
      validateDocumentStructure: (doc) => this.isDocumentStructurallyValid(doc),
      // BlockMoveKeyboardExtension이 활성 블록 선택 범위를 읽는 유일한
      // 경로다 — this.blockSelection은 이 생성자 실행 시점엔 아직
      // 초기화 전이어도 클로저 자체는 유효하고, 실제 호출(키보드
      // shortcut 발동)은 생성자 완료 이후라 안전하다(RD-004.md "결정"
      // (c), production-editor-assembly.ts·block-move-keyboard-extension.ts
      // 배선 참고).
      getBlockSelection: () => this.getBlockSelection(),
      // MediaDropPasteExtension 전용 — uploadFile 콜백 등록 여부는 세션
      // 생애주기 동안 불변이라(재설정 API 없음) 매 재구성(replaceDocument
      // 포함)마다 여기서 다시 계산해도 항상 같은 값이다(RD-002 readiness
      // probe, production-editor-assembly.ts 배선 참고).
      isUploadEnabled: this.options.uploadFile !== undefined,
      // MediaDropPasteExtension 전용(RD-002 DELTA-02) — getBlockSelection과
      // 같은 모양의 클로저다. drop/paste가 삽입한 media 블록마다 이 세션의
      // uploadMediaFile을 fire-and-forget으로 호출한다(반환 Promise는
      // 버린다 — 결과는 getMediaUploadState/onUploadStateChange로만
      // 관찰한다). command 라벨("mediaDropPasteUpload")은 공개 API에
      // 노출되지 않는 내부 에러 분류용 문자열이다.
      triggerMediaUpload: (blockId: string, file: File) => {
        void this.uploadMediaFile("mediaDropPasteUpload", blockId, file);
      },
      // MediaLocalPreviewLifecycleExtension 전용(RD-002 DELTA-02) — url
      // 확정 정리(notifyLocalPreviewCleared, MediaUploadHost 구현)와 같은
      // onLocalPreviewCleanup 채널을 그대로 재사용한다(RD-002.md "결정" —
      // 신호 채널 재사용, 신규 공개 옵션 아님).
      notifyLocalPreviewUnreachable: (
        blockId: string,
        cleared: LocalPreviewAttrs,
      ) => {
        this.notifyLocalPreviewCleared(blockId, cleared);
      },
      // MediaLocalPreviewLifecycleExtension 전용(RD-002 DELTA-03) — 그
      // 확장의 `pending`(삭제됐지만 undo-불가 판정 전) 스냅샷을 세션
      // 필드로 미러링해 둔다. destroy()가 doc 순회만으로는 보지 못하는 이
      // 블록들을 세션 종료 시 함께 정리하기 위해서다(아래 destroy() 참고).
      notifyLocalPreviewPendingChange: (pending) => {
        this.pendingUnreachableLocalPreviews = pending;
      },
    });
  }

  // spec §3.3(DOC-010), RD-004-DELTA-02 — canApplyDocumentChange 목록의
  // 평가 순서를 소유한다: (1) 기존 revision overflow 가드(항상 먼저,
  // loadNormalizing 여부와 무관 — 회귀 없음), (2) load-normalizing
  // 내부 transaction은 제외(RD-004-DELTA-01이 onMount/onUnmount에 적용한
  // "생성 시점 미발화" 원칙의 연장), (3) 소비자가 onBeforeChange를
  // 등록하지 않았으면 조회 자체를 생략, (4) BlockIdExtension 등이
  // root transaction에 이어 붙이는 appended transaction은 제외(한
  // 논리적 편집당 정확히 1회만 평가하기 위함). "appendedTransaction"
  // meta로는 구분할 수 없다 — prosemirror-state의 applyTransaction이
  // 그 meta를 appended transaction의 filterTransaction 판정 **이후에만**
  // 설정한다(실측, prosemirror-state/dist/index.js). 대신
  // `transaction.before`(이 transaction이 만들어질 때의 시작 문서)가
  // `this.tiptapEditor.state.doc`(전체 dispatch가 끝나기 전까지는
  // 갱신되지 않는, 이 batch 시작 시점의 문서)와 같은지로 판정한다 —
  // root transaction만 이 값이 같다. (5) 구조 검증 실패(preview build
  // 실패)면 onBeforeChange를 부르지 않고 통과시킨다 — 이 root transaction
  // 시점엔 아직 유효하지 않아도 BlockIdExtension 같은 이어지는
  // appendTransaction이 고쳐 최종적으로 유효해질 수 있다(Issue #167
  // roadmap RD-001-DELTA-01 결함 탐지 — root 시점 preview로 거절하면
  // ID 충돌 재발급(document-id-factory.test.ts) 같은 정상 fixup 경로가
  // 막힌다). 최종 유효성 판정은 이 함수가 아니라
  // `isDocumentStructurallyValid`(모든 appendTransaction이 끝난 뒤,
  // `revisionGuard`의 appendTransaction 훅)가 전담한다. (6) 실제 모델
  // 블록 변경이 없으면 제외(commitDocument의 no-op 판정과 동일 기준),
  // (7) 소비자 onBeforeChange 호출 — false 반환 시에만 거절한다.
  private evaluateBeforeChange(
    transaction: Transaction,
    loadNormalizing: boolean,
  ): boolean {
    if (this.sessionRevision >= Number.MAX_SAFE_INTEGER) return false;
    if (loadNormalizing) return true;
    const onBeforeChange = this.options.onBeforeChange;
    if (onBeforeChange === undefined) return true;
    if (transaction.before !== this.tiptapEditor.state.doc) return true;
    const preview = this.buildBeforeChangeDocument(transaction.doc);
    if (preview === null) return true;
    const changedBlockIds = blockChanges(this.currentDocument, preview);
    if (changedBlockIds.length === 0) return true;
    return (
      onBeforeChange({
        changes: {
          revision: this.sessionRevision + 1,
          changedBlockIds,
          reason: this.activeReason ?? "local",
        },
      }) !== false
    );
  }

  // onBeforeChange preview 전용 변환 — this.createId(세션 공유
  // 시퀀스)를 여기서 소비하면 실제 커밋 시점에 BlockIdExtension의
  // appendTransaction이 같은 factory를 다시 호출해 카운터가 어긋난다.
  // 이 평가 1회 전용의 격리된 placeholder factory를 대신 쓴다 —
  // BlockIdExtension이 아직 배정하지 않은 신규 노드는 이 placeholder
  // id로 changedBlockIds에 나타날 수 있고, 실제 커밋 id와 다를 수
  // 있다(RD-004-DELTA-02 "## 계획"의 설계 결정, 새 블록을 만들지 않는
  // 대다수 편집은 기존 id를 그대로 읽어 이 placeholder가 관여하지
  // 않는다). 검증 실패(`!converted.ok`)는 throw하지 않고 `null`을
  // 반환한다 — 이 root transaction 시점의 실패가 곧 최종 실패를 뜻하지
  // 않으므로(위 evaluateBeforeChange 주석), 여기서 거절을 확정하지
  // 않는다(Issue #167 roadmap RD-001-DELTA-01). `isDocumentStructurallyValid`
  // 도 이 메서드를 재사용한다 — 같은 변환, 다른 시점(전체 batch 완료 후).
  private buildBeforeChangeDocument(
    doc: ProseMirrorNode,
  ): BlockDocument | null {
    let previewIdSeq = 0;
    const previewCreateId: IdFactory = () =>
      `__pending-block-${(previewIdSeq += 1)}__`;
    const converted = tiptapToModel(
      doc.toJSON() as TiptapJsonNode,
      this.sessionRevision,
      previewCreateId,
      {
        customBlockTypes: this.customBlockTypes,
        customInlineContentTypes: this.customInlineContentTypes,
        customStyleTypes: this.customStyleTypes,
      },
    );
    return converted.ok ? converted.value : null;
  }

  // Issue #167 roadmap RD-001-DELTA-01 — `revisionGuard`의 appendTransaction
  // 훅(production-editor-assembly.ts 배선)이 BlockIdExtension 등 모든
  // appendTransaction이 끝난 뒤의 최종 문서를 이 메서드로 검증한다. 여기서
  // false면 그 훅이 batch 전체를 되돌린다 — DOM-origin transaction이
  // 저장 원본 검증을 위반한 채 commit되는 경로를 구조적으로 막는다
  // (`onBeforeChange` 등록 여부와 무관하게 항상 실행— G-EDT-001 "DOM에서
  // 직접 들어오는 transaction에도 command와 같은 guard를 적용한다").
  private isDocumentStructurallyValid(doc: ProseMirrorNode): boolean {
    return this.buildBeforeChangeDocument(doc) !== null;
  }

  private readEditorDocument(editor: Editor): BlockDocument {
    const converted = tiptapToModel(
      editor.getJSON() as TiptapJsonNode,
      this.sessionRevision,
      this.createId,
      {
        customBlockTypes: this.customBlockTypes,
        customInlineContentTypes: this.customInlineContentTypes,
        customStyleTypes: this.customStyleTypes,
      },
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
