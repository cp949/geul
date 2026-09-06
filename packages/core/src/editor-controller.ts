import type { TabularData } from "@cp949/geul-io";
import {
  type Block,
  type CustomBlock,
  type CustomTextMark,
  type Document as BlockDocument,
  type DocumentBlock,
  type HeadingBlock,
  type IdFactory,
  type InlineContentItem,
  type Result,
  type TextMark,
} from "@cp949/geul-model";
import {
  type Node as ProseMirrorNode,
  type ResolvedPos,
} from "@tiptap/pm/model";
import { NodeSelection, type EditorState } from "@tiptap/pm/state";
import { CellSelection, isInTable, selectedRect } from "@tiptap/pm/tables";

import {
  createBlockAttributeCommands,
  isTextAlignableMediaBlockKind,
} from "./block-attribute-commands.js";
import { createBlockCrudCommands } from "./block-crud-commands.js";
import {
  findAdjacentInTree,
  findBlockInTree,
  findParentInTree,
  walkBlockTree,
} from "./block-tree.js";
import type { EditorError } from "./errors.js";
import { createGenericBlockCommands } from "./generic-block-commands.js";
import { getBlockNestingActionState } from "./indent-commands.js";
import { createInlineMarkCommands } from "./inline-mark-commands.js";
import { createInsertBlockCommands } from "./insert-block-commands.js";
import { isMediaBlockKind, type MediaBlockKind } from "./media-block-kind.js";
import type { MediaUploadState, UploadFile } from "./media-upload.js";
import type { EnabledBlockTypes } from "./model-to-tiptap.js";
import { ProductionEditorSession } from "./production-editor-session.js";
import { createSelectionCursorCommands } from "./selection-cursor-commands.js";
import type { PasteRejectedReason } from "./table-command-error.js";
import { createTableCommands } from "./table-command-glue.js";
import type { TableCellTarget } from "./table-grid.js";

// index.ts가 CreateEditorOptions와 함께 재수출할 수 있도록 이 타입을
// 여기서도 내보낸다(CustomBlockDefinition과 같은 위치, RD-002-DELTA-12).
export type { EnabledBlockTypes };

export type DocumentChangeEvent = {
  revision: number;
  changedBlockIds: readonly string[];
  reason: "local" | "replace" | "undo" | "redo";
};

export type BlockNestingActionState = {
  canIndent: boolean;
  canOutdent: boolean;
};

// 범용 조작 API(spec §3.2, DOC-005)의 입력 타입 — 임의 Block 형태를 받되
// type은 필수, id는 선택(생략하면 createId()로 배정)이다. spec 문서가 적은
// `Partial<Omit<Block,"type"|"id">>`는 그대로 쓰지 않는다 — Omit/Pick은
// 유니온에 분배되지 않고 keyof Block이 14개 변형 전체의 교집합(사실상
// id·type만)으로 무너져, 그 표기대로면 content·rows 등 타입별 필드를 아예
// 못 받는 빈 타입이 된다(RD-002-DELTA-01 "## 계획"의 설계 결정, tsc 실측
// 확인). 분배 조건부 타입으로 각 변형의 나머지 필드를 개별적으로
// partial화한다. children(nestable 7종)이 있으면 그 원소는 재귀적으로
// partial하지 않다 — 완전한 Block(id 포함)이어야 한다(같은 결정).
export type PartialBlock = {
  [T in Block["type"]]: { type: T; id?: string } & Partial<
    Omit<Extract<Block, { type: T }>, "type" | "id">
  >;
}[Block["type"]];

export interface EditorController {
  mount(element: HTMLElement): void;
  unmount(): void;
  destroy(): void;
  getDocument(): BlockDocument;
  // 단일 블록 조회·순회(spec §3.2, DOC-004). getDocument()가 반환하는 저장
  // Block 트리를 대상으로 한다 — PM 노드가 아니다. getPrevBlock/getNextBlock은
  // 형제 범위로 좁히지 않고 forEachBlock과 동일한 문서 순서(pre-order DFS)를
  // 공유한다(RD-001-DELTA-01 "## 계획"의 설계 결정, block-tree.ts). 이
  // 4개(+forEachBlock)는 top-level CustomBlock도 그대로 반환한다
  // (RD-002-DELTA-02 "## 결정" — 읽기 전용 조회는 커스텀 여부를 가리지
  // 않는다. 등록·렌더는 아직 지원하지 않지만 존재 자체는 조회 가능해야
  // 한다). insertBlocks 등 범용 조작 API는 여전히 Block만 다룬다(아래).
  getBlock(blockId: string): DocumentBlock | undefined;
  getPrevBlock(blockId: string): DocumentBlock | undefined;
  getNextBlock(blockId: string): DocumentBlock | undefined;
  // 최상위 블록의 부모는 Block이 아니므로 undefined다 — "찾지 못함"과
  // 구분하지 않는다(spec 시그니처가 Block | undefined 하나뿐).
  getParentBlock(blockId: string): DocumentBlock | undefined;
  forEachBlock(
    callback: (
      block: DocumentBlock,
      parent: DocumentBlock | null,
    ) => boolean | void,
    options?: { reverse?: boolean },
  ): void;
  // 범용 조작 API(spec §3.2, DOC-005) — 기존 타입 전용 명령(commands.*)과
  // 별개 계층, 임의 Block 형태를 받는다. 표·미디어처럼 이미 전용 명령
  // (insertMediaBlock, table 명령 15종)이 있는 타입은 그 명령이 더 정확한
  // 에러를 준다 — 이 API는 대체가 아니라 병행이다. 새 완화 검증을 만들지
  // 않고 기존 model 검증(parseDocument)에 위임한다(RD-002-DELTA-01
  // "## 계획"의 설계 결정).
  insertBlocks(
    blocksToInsert: PartialBlock[],
    referenceBlockId: string,
    placement?: "before" | "after",
  ): Result<Block[], EditorError>;
  // spec §3.2, RD-002-DELTA-02 — 같은 타입 안에서만 필드를 병합한다.
  // update.type이 대상 블록의 type과 다르면 COMMAND_NOT_APPLICABLE로
  // 거절한다(RD-002.md "## 결정", 타입 변경은 commands.setBlockType으로
  // 안내). update.id는 무시한다 — 블록은 항상 blockId 인자의 id를
  // 유지한다(같은 문서의 "## 결정").
  updateBlock(
    blockId: string,
    update: PartialBlock,
  ): Result<Block, EditorError>;
  // spec §3.2, RD-002-DELTA-02 — blockIdsToRemove 전부를 제거하고
  // blocksToInsert를 blockIdsToRemove[0]이 있던 자리에 삽입한다. 제거
  // 대상은 자신의 children 서브트리와 함께 사라진다(자식 승격 없음,
  // RD-002-DELTA-02 "## 계획"의 설계 결정 — 기존 commands.deleteBlock과
  // 동일 의미).
  replaceBlocks(
    blockIdsToRemove: string[],
    blocksToInsert: PartialBlock[],
  ): Result<{ insertedBlocks: Block[]; removedBlocks: Block[] }, EditorError>;
  // spec §3.2, RD-002-DELTA-03 — blockIds 전부를 자신의 children
  // 서브트리와 함께 제거한다(replaceBlocks와 동일 의미, RD-002-DELTA-02
  // "## 계획"의 설계 결정 상속). 빈 배열은 COMMAND_NOT_APPLICABLE, 문서의
  // 모든 블록을 제거하면(R0 위반) DOCUMENT_INVALID다.
  removeBlocks(blockIds: string[]): Result<Block[], EditorError>;
  // spec §3.2, RD-002-DELTA-04(DOC-006) — 기존 moveBlockBefore 조합.
  // blockIds는 같은 부모의 연속한 형제 범위여야 한다(RD-002-DELTA-04
  // "## 계획"의 설계 결정, moveSelectedBlocksBefore와 동일 제약). 범위
  // 바로 앞/뒤 형제 하나와 자리를 통째로 바꾼다 — 범위 자신은 재조립하지
  // 않는다.
  moveBlocksUp(blockIds: string[]): Result<void, EditorError>;
  moveBlocksDown(blockIds: string[]): Result<void, EditorError>;
  // spec §3.2, RD-003-DELTA-01(DOC-007). 텍스트 블록(7 nestable +
  // codeBlock)은 콘텐츠 시작/끝, 텍스트 없는 leaf(divider·미디어 4종)는
  // NodeSelection, table은 첫 번째 셀(물리 좌상단)의 시작/끝으로
  // 매핑한다(spec §3.2 명시). placement 기본값은 "start"다(RD-003-DELTA-01
  // "## 계획"의 설계 결정). 문서를 바꾸지 않으므로 runDocumentCommand를
  // 거치지 않는다(selectBlockRange와 동일 이유).
  setTextCursorPosition(
    blockId: string,
    placement?: "start" | "end",
  ): Result<void, EditorError>;
  // spec §3.2, RD-003-DELTA-01(DOC-008). 이 DELTA는 startBlockId/endBlockId
  // 둘 다 텍스트 블록일 때만 지원한다 — leaf·table이 섞이면
  // COMMAND_NOT_APPLICABLE(RD-003-DELTA-01 "## 계획"의 설계 결정). anchor는
  // 항상 startBlockId 콘텐츠 시작, head는 항상 endBlockId 콘텐츠 끝이다 —
  // 순서를 정규화하지 않는다(같은 문서의 설계 결정).
  setSelection(
    startBlockId: string,
    endBlockId: string,
  ): Result<void, EditorError>;
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
  // media 4종(file/image/video/audio)은 blockContainer로 감싸이지 않는
  // atom이라(RD-002 "## 결정") getSelectionBlockType의 blockContainer
  // 전용 tree-walk(findSelectionBlock)이 구조적으로 못 본다 — 선택은
  // 항상 NodeSelection이므로 별도로 조회한다(RD-003 DELTA-01, File
  // Panel·RD-004 toolbar가 함께 쓸 공용 seam). BlockTypeDescriptor
  // 유니온에 4종을 추가하지 않는 이유는 그 타입이 setBlockType로 전환
  // 가능한 "Turn into" 대상 판별용이고 media는 그 명령으로 전환할 수
  // 없어서다(RD-001 — insertMediaBlock 전용 삽입).
  getSelectionMediaBlock(): {
    blockId: string;
    kind: MediaBlockKind;
    url: string | null;
    name: string | null;
    caption: string | null;
    // file은 showPreview attrs 자체가 없어 null이다(MEDIA_PREVIEW_TOGGLE_
    // NOT_SUPPORTED 대상과 동일 kind 경계). image/video/audio는 attrs
    // 미설정(null)이 기본 true를 뜻하는 실제 유효값을 보고한다(슬라이스5
    // RD-002 DELTA-02, react MediaToolbar의 preview 토글 버튼이 소비한다).
    showPreview: boolean | null;
    // image/video만 실제 유효값을 보고한다(Issue #154, MED-009) — audio/file은
    // attrs 자체가 없어 null이다(showPreview와 반대 kind 집합, setMediaPreviewWidth
    // 의 MEDIA_RESIZE_NOT_SUPPORTED 대상과 동일 경계). react MediaToolbar의
    // 정렬 버튼 3개가 aria-pressed 판정에 소비한다.
    textAlignment: "left" | "center" | "right" | null;
  } | null;
  getBlockNestingActionState(blockId: string): BlockNestingActionState;
  getTableCellSelection(): TableCellSelection | null;
  getBlockSelection(): BlockSelection | null;
  // spec §4.2 — 업로드 중(pending) 상태 읽기 전용 조회. 문서 round-trip
  // 대상이 아니다(session 전용, blockSelection과 같은 자리). 변경은
  // CreateEditorOptions.onUploadStateChange로 push 알림한다(commands.
  // uploadMediaFile/cancelMediaUpload 주석 참고).
  getMediaUploadState(blockId: string): MediaUploadState | null;
  // spec §4.1 — uploadFile 콜백이 등록됐는지 여부. react Upload UI(RD-003)가
  // File Panel Upload 탭 노출 여부를 결정하는 유일한 판정 지점이다(콜백
  // 등록 시에만 true, "탭 자체 미노출" 계약). 파괴된 세션은 어떤 명령도
  // 적용할 수 없으므로 false를 반환한다(다른 isDestroyed 가드와 동일 원칙).
  isUploadEnabled(): boolean;
  replaceDocument(next: unknown): Result<void, EditorError>;
  // spec §3.4(DOC-013), RD-005-DELTA-01 — `false`는 ProseMirror
  // `editable` prop을 통해 사용자 DOM 입력(타이핑·클릭 편집)만
  // 차단한다. 프로그램적 `commands.*`/§3.2 API 호출은 읽기 전용
  // 상태에서도 계속 허용한다(BlockNote의 `isEditable`과 동일 의미,
  // RD-005.md "## 결정"). `replaceDocument()`로 문서를 교체해도 값이
  // 유지된다. 파괴된 세션의 getter는 항상 `false`, setter는 아무
  // 효과가 없다(다른 isDestroyed 가드와 동일 원칙).
  get isEditable(): boolean;
  set isEditable(value: boolean);
  readonly commands: {
    setText(blockId: string, text: string): Result<void, EditorError>;
    insertParagraphAfter(
      blockId: string,
    ): Result<{ blockId: string }, EditorError>;
    setBlockType(
      blockId: string,
      blockType: SetBlockTypeDescriptor,
      options?: { clearContent?: boolean },
    ): Result<void, EditorError>;
    moveBlockBefore(
      blockId: string,
      beforeBlockId: string | null,
    ): Result<void, EditorError>;
    moveSelectedBlocksBefore(
      beforeBlockId: string | null,
    ): Result<void, EditorError>;
    selectBlockRange(
      fromBlockId: string,
      toBlockId: string,
    ): Result<void, EditorError>;
    clearBlockSelection(): Result<void, EditorError>;
    duplicateBlock(blockId: string): Result<{ blockId: string }, EditorError>;
    deleteBlock(blockId: string): Result<void, EditorError>;
    deleteSelectedBlocks(): Result<void, EditorError>;
    indentBlock(blockId: string): Result<void, EditorError>;
    outdentBlock(blockId: string): Result<void, EditorError>;
    toggleCheckListItemChecked(blockId: string): Result<void, EditorError>;
    toggleHeadingCollapse(blockId: string): Result<void, EditorError>;
    toggleListItemCollapse(blockId: string): Result<void, EditorError>;
    toggleBold(): Result<void, EditorError>;
    toggleItalic(): Result<void, EditorError>;
    toggleUnderline(): Result<void, EditorError>;
    toggleStrike(): Result<void, EditorError>;
    toggleCode(): Result<void, EditorError>;
    setLink(href: string): Result<void, EditorError>;
    unsetLink(): Result<void, EditorError>;
    toggleInlineTextColor(color: string | null): Result<void, EditorError>;
    toggleInlineBackgroundColor(
      color: string | null,
    ): Result<void, EditorError>;
    // spec §4.4, RD-002-DELTA-19 — 등록되지 않은 type은
    // CUSTOM_STYLE_TYPE_NOT_REGISTERED로 거절한다(insertCustomBlock/
    // insertCustomInlineContent와 동일 근거). 같은 값으로 다시 호출하면
    // 해제된다(toggleInlineTextColor와 동일한 toggle 의미).
    toggleCustomStyle(
      type: string,
      props?: Record<string, string | number | boolean | null>,
    ): Result<void, EditorError>;
    setBlockTextColor(
      blockId: string,
      color: string | null,
    ): Result<void, EditorError>;
    setBlockBackgroundColor(
      blockId: string,
      color: string | null,
    ): Result<void, EditorError>;
    setBlockTextAlignment(
      blockId: string,
      align: "left" | "center" | "right" | null,
    ): Result<void, EditorError>;
    setMediaBlockUrl(blockId: string, url: string): Result<void, EditorError>;
    setMediaBlockName(blockId: string, name: string): Result<void, EditorError>;
    setMediaBlockCaption(
      blockId: string,
      caption: string,
    ): Result<void, EditorError>;
    setMediaBlockBackgroundColor(
      blockId: string,
      color: string | null,
    ): Result<void, EditorError>;
    // image/video 전용(spec §5.1 MED-007). audio/file 대상은
    // MEDIA_RESIZE_NOT_SUPPORTED로 거절한다(§8) — 실제 clamp(64px~content
    // 폭)는 react 리사이즈 핸들 UI 몫이고 이 명령은 model
    // isValidMediaPreviewWidth(양의 유한수, 상한 없음)만 검증한다(spec §5.3).
    setMediaPreviewWidth(
      blockId: string,
      width: number,
    ): Result<void, EditorError>;
    // image/video/audio 전용(spec §5.1 MED-008). file 대상은
    // MEDIA_PREVIEW_TOGGLE_NOT_SUPPORTED로 거절한다(§8). false면 편집 DOM이
    // 미디어 태그 대신 <a href={url}>{name ?? url}</a>를 렌더한다(FileBlock과
    // 동일 패턴, media-block-extension.ts 참고).
    setMediaShowPreview(
      blockId: string,
      show: boolean,
    ): Result<void, EditorError>;
    // image/video 전용(spec §5.1 신규, Issue #154 MED-009). audio/file 대상은
    // MEDIA_TEXT_ALIGNMENT_NOT_SUPPORTED로 거절한다(§8). setBlockTextAlignment
    // (텍스트 블록, blockContainer attrs)와 동형 시그니처 — null로 리셋
    // 가능하다(media attrs 스키마 기본값 null과 동일 의미로 속성을 지운다).
    setMediaTextAlignment(
      blockId: string,
      alignment: "left" | "center" | "right" | null,
    ): Result<void, EditorError>;
    // spec §4 — 콜백 호출·pending 상태 관리·성공 시 url(+name) 세팅을 한
    // 명령으로 묶는다(소비자에게 2단계로 노출하지 않음). 반환 Promise는
    // 사전 조건 실패(BLOCK_NOT_FOUND·미등록·이미 진행 중 등)만 ok:false로
    // 알린다 — 콜백이 실제로 완료된 뒤의 성공/실패/취소는 항상 ok:true로
    // 해결되고, 결과는 getMediaUploadState()/onUploadStateChange로만
    // 관찰한다(RD-001.md "결정" — pending 상태가 유일한 진실 소스, Promise
    // 값과 이중 소스로 나누지 않는다).
    uploadMediaFile(
      blockId: string,
      file: File,
    ): Promise<Result<void, EditorError>>;
    // 등록된 AbortSignal을 abort한다. 진행 중인 업로드가 없으면
    // COMMAND_NOT_APPLICABLE(다른 selection-only 명령과 동일 재사용).
    cancelMediaUpload(blockId: string): Result<void, EditorError>;
    // spec §4.2 — uploadMediaFile과 같은 파이프라인을 재사용하되(RD-002),
    // 새 업로드가 status: success가 될 때까지 대상 블록의 기존
    // url/name/caption/backgroundColor를 전혀 바꾸지 않는다(실패해도
    // 원상 유지, 별도 롤백 로직 없음). 반환 Promise의 ok/error 계약은
    // uploadMediaFile과 동일하다.
    replaceMediaBlockFile(
      blockId: string,
      file: File,
    ): Promise<Result<void, EditorError>>;
    pasteTabularData(
      data: TabularData,
    ): Result<{ blockId: string }, EditorError>;
    insertTable(
      afterBlockId: string,
      size: { rows: number; columns: number },
      options?: { clearAfterBlockText?: boolean },
    ): Result<{ blockId: string }, EditorError>;
    insertDivider(
      afterBlockId: string,
      options?: { clearAfterBlockText?: boolean },
    ): Result<{ blockId: string }, EditorError>;
    insertMediaBlock(
      afterBlockId: string,
      kind: MediaBlockKind,
      options?: { clearAfterBlockText?: boolean },
    ): Result<{ blockId: string }, EditorError>;
    // spec §4.4, RD-002-DELTA-11 — 등록되지 않은 type은
    // CUSTOM_BLOCK_TYPE_NOT_REGISTERED로 거절한다(insertMediaBlock의 스키마
    // 부재 throw와 달리 이건 소비자가 실제로 만날 수 있는 오류).
    insertCustomBlock(
      afterBlockId: string,
      type: string,
      content: "none" | "inline",
      props?: Record<string, string | number | boolean | null>,
      options?: { clearAfterBlockText?: boolean },
    ): Result<{ blockId: string }, EditorError>;
    // spec §4.4, RD-002-DELTA-18 — 현재 selection(caret)에 삽입한다(inline
    // 원소는 model에 id가 없어 afterBlockId 같은 위치 식별자를 받지
    // 않는다). 등록되지 않은 type은 CUSTOM_INLINE_CONTENT_TYPE_NOT_REGISTERED로
    // 거절한다(insertCustomBlock과 동일 근거).
    insertCustomInlineContent(
      type: string,
      props?: Record<string, string | number | boolean | null>,
    ): Result<void, EditorError>;
    insertTableRow(
      tableBlockId: string,
      atIndex: number,
    ): Result<void, EditorError>;
    insertTableColumn(
      tableBlockId: string,
      atIndex: number,
    ): Result<void, EditorError>;
    moveTableRow(
      tableBlockId: string,
      fromIndex: number,
      toIndex: number,
    ): Result<void, EditorError>;
    moveTableColumn(
      tableBlockId: string,
      fromIndex: number,
      toIndex: number,
    ): Result<void, EditorError>;
    resizeTableColumn(
      tableBlockId: string,
      index: number,
      width: number,
    ): Result<void, EditorError>;
    mergeTableCells(tableBlockId: string): Result<void, EditorError>;
    splitTableCell(
      tableBlockId: string,
      cellId: string,
    ): Result<void, EditorError>;
    deleteTableRow(
      tableBlockId: string,
      index: number,
    ): Result<void, EditorError>;
    deleteTableColumn(
      tableBlockId: string,
      index: number,
    ): Result<void, EditorError>;
    toggleTableHeaderRow(tableBlockId: string): Result<void, EditorError>;
    toggleTableHeaderColumn(tableBlockId: string): Result<void, EditorError>;
    setTableCellTextColor(
      tableBlockId: string,
      target: TableCellTarget,
      color: string | null,
    ): Result<void, EditorError>;
    setTableCellBackgroundColor(
      tableBlockId: string,
      target: TableCellTarget,
      color: string | null,
    ): Result<void, EditorError>;
    setTableCellAlign(
      tableBlockId: string,
      target: TableCellTarget,
      align: "left" | "center" | "right" | null,
    ): Result<void, EditorError>;
    undo(): Result<void, EditorError>;
    redo(): Result<void, EditorError>;
  };
}

// spec §4.1 — heading level 1-6. 모델 HeadingBlock.level 범위를 그대로 파생해
// 두 곳에 리터럴을 복제하지 않는다. 공개 export가 아닌 module-local 별칭이다.
type HeadingLevel = HeadingBlock["level"];

export type SetBlockTypeDescriptor =
  | { type: "paragraph" }
  // isToggleable은 numberedListItem.startNumber와 같은 캐리포워드 패턴이다
  // (RD-004 DELTA-02) — 생략하면 heading→heading 재호출일 때만 현재 값을
  // 캐리포워드하고, 명시하면 그 값을 쓴다. boolean이 on/off를 다
  // 표현하므로 startNumber류의 명시적 해제용 `| null`이 필요 없다.
  | { type: "heading"; level: HeadingLevel; isToggleable?: boolean }
  | { type: "quote" }
  | { type: "codeBlock"; language?: string }
  | { type: "bulletListItem" }
  | { type: "numberedListItem"; startNumber?: number | null }
  | { type: "checkListItem" }
  | { type: "toggleListItem" };

export type BlockTypeDescriptor =
  | { type: "paragraph" }
  // isToggleable은 SetBlockTypeDescriptor.heading(DELTA-02, 명령 입력)과
  // 대칭인 조회 방향 필드다(RD-004 DELTA-04) — 있으면 현재 heading이 토글
  // 제목이라는 뜻이고, 없으면(undefined) 일반 heading이다. numberedListItem
  // startNumber와 같은 옵셔널 pass-through 패턴(생략 가능한 캐리포워드
  // 대상이 아니라 "있는 그대로 보고").
  | { type: "heading"; level: HeadingLevel; isToggleable?: boolean }
  | { type: "quote" }
  | { type: "codeBlock"; language?: string }
  | { type: "bulletListItem" }
  | { type: "numberedListItem"; startNumber?: number }
  | { type: "checkListItem" }
  | { type: "toggleListItem" };

// react/block-side-menu.tsx의 findBlockTypeDescriptor가 저장 Block에서
// 재구현하던 것과 같은 leaf 매핑이다(아키텍처 리뷰 6차 후보 L3). 입력은
// 진짜 model Block이 아니다 — PM node(아래 blockTypeDescriptorFromNode)와
// 저장 Block 양쪽 모두 이 판별 유니온으로 구조적으로 좁혀지므로(각 호출자가
// 자기 표현에서 이 유니온만 조립), Block 전체를 여기로 들여오거나
// PM→Block 변환을 새로 만들 필요가 없다. table·divider는
// BlockTypeDescriptor가 다루지 않는 종류라 null로 떨어진다 — 두 호출자
// 모두 원래 코드에서 이미 이렇게 동작했다(react는 명시 null 분기, core는
// default 분기).
//
// react/block-side-menu.tsx의 findBlockTypeDescriptor가 저장 Block을 좁히지
// 않고 그대로 넘기므로, model의 Block 유니온이 늘 때마다 이 유니온도 같은
// 멤버를 갖춰야 한다 — 아니면 그 호출부가 컴파일 실패한다. checkListItem은
// RD-001 DELTA-06부터, toggleListItem은 RD-004 DELTA-04부터
// BlockTypeDescriptor에 포함돼 이 null 분기에서 빠졌다. file/image/video/
// audio는 RD-002 DELTA-01(R3 슬라이스1)부터 반대로 divider/table과 같은
// null 자리에 추가됐다 — spec §2.2가 이미 "media Turn into 제외"를
// 확정했다(새 제품 결정 아님, 실측 tsc로 이 결합을 확인한 뒤 반영).
export type BlockTypeSource =
  | { type: "paragraph" }
  | { type: "heading"; level: HeadingLevel; isToggleable?: boolean }
  | { type: "quote" }
  | { type: "codeBlock"; language?: string }
  | { type: "bulletListItem" }
  | { type: "numberedListItem"; startNumber?: number }
  | { type: "checkListItem" }
  | { type: "toggleListItem" }
  | { type: "divider" }
  | { type: "table" }
  | { type: "file" }
  | { type: "image" }
  | { type: "video" }
  | { type: "audio" };

export const blockTypeDescriptorFromBlock = (
  source: BlockTypeSource,
): BlockTypeDescriptor | null =>
  source.type === "divider" ||
  source.type === "table" ||
  source.type === "file" ||
  source.type === "image" ||
  source.type === "video" ||
  source.type === "audio"
    ? null
    : source;

// PM block content node를 BlockTypeSource로 좁힌 뒤 blockTypeDescriptorFromBlock에
// 위임한다. PM attrs는 unknown이라 캐스트가 이 지점에서만 필요하다 — caret과
// selection 조회가 같은 타입·attrs 규칙을 공유하고 PM node 자체는 공개하지
// 않는다.
const blockTypeSourceFromNode = (
  node: ProseMirrorNode,
): BlockTypeSource | null => {
  switch (node.type.name) {
    case "paragraph":
      return { type: "paragraph" };
    case "heading":
      return {
        type: "heading",
        level: node.attrs.level as HeadingLevel,
        // PM은 isToggleable을 true 또는 null로만 저장한다(headingIsToggleable
        // ? true : null, generic-block-commands.ts) — 이 typeof 가드가
        // 정확히 true일 때만 필드를 채운다.
        ...(typeof node.attrs.isToggleable === "boolean"
          ? { isToggleable: node.attrs.isToggleable }
          : {}),
      };
    case "quote":
      return { type: "quote" };
    case "codeBlock":
      return {
        type: "codeBlock",
        ...(typeof node.attrs.language === "string"
          ? { language: node.attrs.language }
          : {}),
      };
    case "bulletListItem":
      return { type: "bulletListItem" };
    case "numberedListItem":
      return {
        type: "numberedListItem",
        ...(typeof node.attrs.startNumber === "number"
          ? { startNumber: node.attrs.startNumber }
          : {}),
      };
    case "checkListItem":
      return { type: "checkListItem" };
    case "toggleListItem":
      return { type: "toggleListItem" };
    case "divider":
      return { type: "divider" };
    case "table":
      return { type: "table" };
    default:
      return null;
  }
};

const blockTypeDescriptorFromNode = (
  node: ProseMirrorNode,
): BlockTypeDescriptor | null => {
  const source = blockTypeSourceFromNode(node);
  return source === null ? null : blockTypeDescriptorFromBlock(source);
};

// CellSelection이 덮는 서로 다른 기준 셀들을 primitive 값(cellId)만으로
// 나열한다. 병합 가능 여부는 cellIds.length > 1로 호출부가 직접 파생한다.
// splitCellId는 선택이 이미 병합된 셀 하나만 덮을 때 그 cellId다. 삼중클릭이
// 만드는 병합되지 않은 단일 셀 CellSelection은 cellIds.length가 1이라
// 병합 대상이 아니고 splitCellId=null이지만 cellIds는 채워진다 —
// 서식(색상·정렬)은 여전히 대상이다(spec 7.2).
export type TableCellSelection = {
  tableBlockId: string;
  cellIds: string[];
  splitCellId: string | null;
};

// spec §5.3 — 같은 부모 형제 범위의 다중 블록 선택. ProseMirror Selection과
// 독립적인 core 자체 상태라 production-editor-session.ts가 문서 비저장 세션
// 필드로 소유하고(BlockSelectionRange, 구조는 이 타입과 같되 순환 의존을
// 피하려 별도 선언) 여기서는 조회 결과 shape만 공개한다. 항상 문서 순서로
// 정규화된 값이다(fromBlockId가 toBlockId보다 앞).
export type BlockSelection = {
  fromBlockId: string;
  toBlockId: string;
};

// selectedRect가 덮는 좌표들을 훑어 서로 다른 기준 셀의 id만 순서대로
// 모은다. TableMap.map은 좌표마다 그 좌표를 채우는 셀의 시작 위치를 담으므로,
// 병합 셀은 자신이 덮는 모든 좌표에서 같은 값이 반복된다 — 처음 등장하는
// 오프셋에서만 push한다. PM 노드 참조가 아닌 원시값만 클로저 밖으로 낸다
// (G-EDT-001).
const collectCellSelection = (
  state: EditorState,
  rect: ReturnType<typeof selectedRect>,
): { cellIds: string[]; singleMergedCellId: string | null } => {
  const seenOffsets = new Set<number>();
  const cellIds: string[] = [];
  let firstCellMerged = false;
  for (let row = rect.top; row < rect.bottom; row += 1) {
    for (let column = rect.left; column < rect.right; column += 1) {
      const offset = rect.map.map[row * rect.map.width + column];
      if (offset === undefined || seenOffsets.has(offset)) continue;
      seenOffsets.add(offset);
      const cellNode = state.doc.nodeAt(rect.tableStart + offset);
      const cellId = cellNode?.attrs.cellId;
      if (typeof cellId !== "string" || cellId.length === 0) continue;
      cellIds.push(cellId);
      if (cellIds.length === 1) {
        const rowSpan = (cellNode?.attrs.rowspan as number | undefined) ?? 1;
        const colSpan = (cellNode?.attrs.colspan as number | undefined) ?? 1;
        firstCellMerged = rowSpan > 1 || colSpan > 1;
      }
    }
  }
  const singleMergedCellId =
    cellIds.length === 1 && firstCellMerged ? (cellIds[0] ?? null) : null;
  return { cellIds, singleMergedCellId };
};

// spec §4.4(EXT-001), RD-002-DELTA-11 — registry 등록 계약 그대로(비제네릭,
// §4.1 "결정"). render()는 raw HTMLElement만 다뤄 ADR-0002(공개 표면에
// Tiptap/PM 타입 비노출)를 그대로 만족한다. contentRef는 이번 DELTA에서
// core가 쓰지 않는 예약 필드다(custom-block-extension.ts 주석,
// DELTA-11.md "결정" 1 — content: "inline" 인스턴스의 실제 PM 콘텐츠
// 표현은 model에 저장 필드가 없어 범위 밖).
export type CustomBlockDefinition = {
  render: (context: { block: CustomBlock; editor: EditorController }) => {
    element: HTMLElement;
    contentRef?: HTMLElement;
  };
  // 미등록 시 io HTML/GFM 손실 정책(spec §4.5, RD-003)이 적용된다 —
  // 이번 DELTA는 이 두 필드를 저장만 하고 io로 연결하지 않는다(범위 밖).
  toHtml?: (block: CustomBlock) => string;
  toMarkdown?: (block: CustomBlock) => string;
};

// spec §4.4(EXT-002), RD-002-DELTA-18 — CustomBlockDefinition과 같은
// registry 계약이지만 render()는 {element}로 감싸지 않고 HTMLElement를
// 직접 반환한다(spec §4.4 원문 그대로) — inline 원소는 contentRef 예약
// 필드에 대응하는 개념이 없다(atom, 항상 leaf). toMarkdown이 없다 —
// InlineContentItem의 커스텀 변형은 spec §4.5가 markdown 손실 정책을
// block 단위(CUSTOM_BLOCK_LOST)로만 정의해 두어 별도 markdown 렌더러가
// 아직 없다(io 연결 자체가 이번 DELTA 범위 밖, RD-002-DELTA-18.md "범위 밖").
export type CustomInlineContentDefinition = {
  render: (context: {
    item: Extract<InlineContentItem, { type: "custom" }>;
    editor: EditorController;
  }) => HTMLElement;
  // 미등록 시 io HTML 손실 정책(spec §4.5, 범위 밖)이 적용된다 — 이번
  // DELTA는 이 필드를 저장만 하고 io로 연결하지 않는다.
  toHtml?: (item: Extract<InlineContentItem, { type: "custom" }>) => string;
};

// spec §4.4(EXT-003), RD-002-DELTA-19 — CustomBlockDefinition/
// CustomInlineContentDefinition과 달리 render()가 `editor`를 받지 않는다
// (spec §4.4 원문 — 스타일은 값만으로 렌더가 결정된다, 지연 바인딩 Proxy
// 불필요). PM Mark의 배열 기반 DOMOutputSpec으로의 변환은
// custom-style-mark-extension.ts가 전담한다(HTMLElement를 반환하면 태그·
// 속성만 추출하고 자식은 버린다 — Mark는 PM이 감싼 콘텐츠를 관리해야 해
// NodeView처럼 완성된 서브트리를 그대로 못 쓴다).
export type CustomStyleDefinition = {
  render: (
    value: CustomTextMark,
  ) =>
    HTMLElement | { className?: string; style?: Partial<CSSStyleDeclaration> };
  // 미등록 시 io HTML 손실 정책(spec §4.5, 범위 밖)이 적용된다 — 이번
  // DELTA는 이 필드를 저장만 하고 io로 연결하지 않는다.
  toHtml?: (value: CustomTextMark) => string;
};

export type CreateEditorOptions = {
  initialDocument: BlockDocument;
  /**
   * 매 호출마다 model ID 문자열 계약을 만족하고 현재 문서의 모든
   * block·table column·row·cell ID와 유일한 ID를 반환해야 한다.
   * BlockIdExtension의 누락·중복 block ID 보정과 duplicateBlock은 100회
   * 안에 유효하고 유일한 ID를 얻지 못하면 RangeError를 던진다.
   */
  createId?: IdFactory;
  onChange?: (event: DocumentChangeEvent) => void;
  onPasteRejected?: (reason: PasteRejectedReason) => void;
  // spec §4.1 — 미등록 시 uploadMediaFile은 COMMAND_NOT_APPLICABLE로
  // 거절되고, drag/drop·paste 파일 페이로드는 무시된다(R2 결정 유지,
  // 슬라이스4 몫).
  uploadFile?: UploadFile;
  // spec §4.2 — pending 업로드 상태(session 전용) 변경 push 알림. 문서
  // 변경이 아니므로 onChange와 분리한다(DocumentChangeEvent는
  // revision·changedBlockIds를 갖는 문서 커밋 전용 shape이고, pending
  // 변경은 revision을 올리지 않아 그 shape에 맞지 않는다 — RD-001.md
  // "결정").
  onUploadStateChange?: (
    blockId: string,
    state: MediaUploadState | null,
  ) => void;
  // spec §3.3(DOC-009), RD-004-DELTA-01 — mount(element) 성공 직후 /
  // unmount() 직전 각각 무인자로 1회 발화한다. 세션 생성 시 내부
  // load-normalizing dummy mount/unmount(production-editor-assembly.ts)와
  // replaceDocument()의 내부 remount에는 발화하지 않는다 — 소비자가
  // 직접 호출하는 EditorController.mount()/unmount()에만 대응한다
  // (RD-004-DELTA-01 "## 계획"의 설계 결정).
  onMount?: () => void;
  onUnmount?: () => void;
  // spec §3.3(DOC-009), RD-004-DELTA-01 — PM selection이 실제로 바뀔 때만
  // 무인자로 발화한다(조회는 기존 getCaretBlockContext 등으로). Tiptap
  // 자신의 selection.eq 비교에 위임해 같은 위치로의 재호출·거절된
  // transaction에는 발화하지 않는다.
  onSelectionChange?: () => void;
  // spec §3.3(DOC-010), RD-004-DELTA-02 — 다중 등록을 허용하는 내부
  // AND-결합·fail-fast 목록의 두 번째 항목이다(첫 항목은 기존 revision
  // overflow 가드, 소비자에 노출되지 않는다). `false`를 반환하면 그
  // transaction 전체를 거절한다(문서 미변경, onChange 미발화). `void`는
  // 허용을 뜻한다 — `false`만 거절 신호다. 문서를 바꾸지 않는
  // transaction(selection-only)에는 호출되지 않는다. 한 논리적 편집당
  // 정확히 1회만 호출된다 — BlockIdExtension 등이 같은 dispatch에
  // 이어 붙이는 정규화 transaction에는 중복 호출되지 않는다
  // (RD-004-DELTA-02 "## 계획"의 설계 결정).
  onBeforeChange?: (context: {
    changes: DocumentChangeEvent;
  }) => boolean | void;
  // spec §4.4(EXT-001), RD-002-DELTA-11 — 등록된 타입마다 createEditor()
  // 호출 시점에 PM atom 노드를 조건부로 추가한다(포함 범위 "결과" 참고).
  // PM 스키마는 여전히 에디터 생성 시점에 정적으로 결정된다 — 마운트
  // 이후 동적 스키마 변경은 시도하지 않는다(spec §4.4 명시).
  customBlocks?: Record<string, CustomBlockDefinition>;
  // spec §4.4(EXT-002), RD-002-DELTA-18 — 등록된 타입마다 PM inline atom
  // 노드를 조건부로 추가한다(customBlocks와 동일 시점·동일 정적 스키마
  // 제약). 등록되지 않은 커스텀 inline 타입은 여전히
  // EDITOR_FEATURE_UNAVAILABLE로 거절된다(model-to-tiptap.ts).
  customInlineContent?: Record<string, CustomInlineContentDefinition>;
  // spec §4.4(EXT-003), RD-002-DELTA-19 — 등록된 타입마다 PM Mark를
  // 조건부로 추가한다. 등록되지 않은 커스텀 마크는 여전히
  // EDITOR_FEATURE_UNAVAILABLE로 거절된다(model-to-tiptap.ts).
  customStyles?: Record<string, CustomStyleDefinition>;
  // spec §4.4(EXT-004), RD-002-DELTA-12 — 기존 14종 대상 allow/deny
  // 목록. 비활성화한 타입은 PM 스키마에 노드로 등록되지 않고,
  // initialDocument/replaceDocument/붙여넣기 어느 경로로 만나도
  // EDITOR_FEATURE_UNAVAILABLE로 거절된다(production-editor-assembly.ts).
  enabledBlockTypes?: EnabledBlockTypes;
};

const toggleableMarkTypes: ReadonlyArray<TextMark["type"]> = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
];

// $pos 조상 중 가장 가까운 blockContainer의 blockId를 찾는다.
// paragraph/heading은 더 이상 blockId를 직접 갖지 않는다(D19) — 조상인
// blockContainer가 identity를 소유한다.
const nearestBlockContainerId = (position: ResolvedPos): string | null => {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    const node = position.node(depth);
    if (node.type.name === "blockContainer") {
      const blockId = node.attrs.blockId;
      return typeof blockId === "string" && blockId.length > 0 ? blockId : null;
    }
  }
  return null;
};

// getSelectionBlockType 전용: [from, to] 범위를 완전히 포함하는 가장 깊은
// blockContainer(그 첫 자식이 paragraph/heading/quote/codeBlock인 경우)를 재귀로 찾는다.
// blockGroup?이 없는 컨테이너는 자신의 nodeSize 전체(닫는 태그 포함)까지
// 상한으로 받아들인다 — collapsed 캐럿뿐 아니라 AllSelection(전체 선택)의
// to가 컨테이너 자신의 닫는 경계까지 닿는 경우도 "그 블록 전체 선택"으로
// 인정해야 하기 때문이다. blockGroup이 있으면 상한을 blockContent 끝으로
// 좁혀 자식 쪽으로 범위가 새어 들어가는 선택은 컨테이너 자신이 아니라
// blockGroup 재귀로 넘긴다 — 부모·자식에 걸친 선택은 어느 쪽과도 매치되지
// 않아 null로 남는다(기존 "여러 최상위 블록에 걸치면 null" 계약의 재귀판).
const findSelectionBlock = (
  node: ProseMirrorNode,
  nodeStart: number,
  from: number,
  to: number,
): { blockId: string; blockType: BlockTypeDescriptor } | null => {
  let result: { blockId: string; blockType: BlockTypeDescriptor } | null = null;
  node.forEach((child, childOffset) => {
    if (result !== null) return;
    const childStart = nodeStart + childOffset;
    const childEnd = childStart + child.nodeSize;
    if (from < childStart || to > childEnd) return;

    if (child.type.name === "blockGroup") {
      result = findSelectionBlock(child, childStart + 1, from, to);
      return;
    }
    if (child.type.name !== "blockContainer") return;

    const blockId = child.attrs.blockId;
    if (typeof blockId !== "string" || blockId.length === 0) return;
    const blockContent = child.firstChild;
    if (blockContent === null) return;
    const contentStart = childStart + 1;
    const contentEnd = contentStart + blockContent.nodeSize;
    const hasGroupChild = child.childCount > 1;

    if (to <= (hasGroupChild ? contentEnd : childEnd)) {
      const blockType = blockTypeDescriptorFromNode(blockContent);
      if (blockType !== null) {
        result = {
          blockId,
          blockType,
        };
      }
      return;
    }

    if (hasGroupChild) {
      result = findSelectionBlock(child.child(1), contentEnd + 1, from, to);
    }
  });
  return result;
};

// customBlocks(RD-002-DELTA-11) NodeView가 CustomBlockDefinition.render에
// 넘길 EditorController 참조를 만든다. session 생성(아래 new
// ProductionEditorSession) 안에서 dummy mount/unmount(production-editor-
// assembly.ts)가 즉시 일어나므로, initialDocument에 등록된 커스텀 block이
// 있으면 이 함수가 끝나기 전에 render()가 호출될 수 있다 — 이 시점엔
// controller 변수 자체가 아직 없다(DELTA-11.md "결정" 2). controllerBox가
// 채워지기 전까지는 이 Proxy의 속성 접근이 undefined를 반환한다(참조
// 자체는 항상 유효 — 던지지 않는다). 실사용 mount()는 session 생성이
// 끝난 뒤 일어나 NodeView가 다시 만들어지므로(unmount가 이전 것을
// 파기) 그때는 이미 채워진 controllerBox를 통해 완전히 동작한다.
// **제약**: render()는 이 참조의 메서드를 동기적으로 호출하면 안 된다 —
// 참조만 캡처해 이벤트 핸들러 등 나중 호출에만 쓴다.
const createDeferredControllerFacade = (): {
  facade: EditorController;
  box: { current: EditorController | null };
} => {
  const box: { current: EditorController | null } = { current: null };
  const facade = new Proxy(
    {},
    {
      get(_target, prop) {
        const current = box.current;
        if (current === null) return undefined;
        const value = Reflect.get(current, prop, current);
        return typeof value === "function" ? value.bind(current) : value;
      },
    },
  ) as EditorController;
  return { facade, box };
};

export const createEditor = (
  options: CreateEditorOptions,
): EditorController => {
  const { facade: controllerFacade, box: controllerBox } =
    createDeferredControllerFacade();
  const session = new ProductionEditorSession(options, controllerFacade);
  const genericBlockCommands = createGenericBlockCommands(session);
  const inlineMarkCommands = createInlineMarkCommands(session);
  const blockAttributeCommands = createBlockAttributeCommands(session);
  const tableCommands = createTableCommands(session);
  const insertBlockCommands = createInsertBlockCommands(session);
  const blockCrudCommands = createBlockCrudCommands(session);
  const selectionCursorCommands = createSelectionCursorCommands(session);

  const controller: EditorController = {
    mount(element) {
      session.mount(element);
    },
    unmount() {
      session.unmount();
    },
    destroy() {
      session.destroy();
    },
    getDocument() {
      return session.getDocument();
    },
    getBlock(blockId) {
      return findBlockInTree(session.getDocument().blocks, blockId);
    },
    getPrevBlock(blockId) {
      return findAdjacentInTree(session.getDocument().blocks, blockId, "prev");
    },
    getNextBlock(blockId) {
      return findAdjacentInTree(session.getDocument().blocks, blockId, "next");
    },
    getParentBlock(blockId) {
      return findParentInTree(session.getDocument().blocks, blockId);
    },
    forEachBlock(callback, options) {
      walkBlockTree(
        session.getDocument().blocks,
        null,
        callback,
        options?.reverse ?? false,
      );
    },
    insertBlocks(blocksToInsert, referenceBlockId, placement) {
      return blockCrudCommands.insertBlocks(
        blocksToInsert,
        referenceBlockId,
        placement,
      );
    },
    updateBlock(blockId, update) {
      return blockCrudCommands.updateBlock(blockId, update);
    },
    replaceBlocks(blockIdsToRemove, blocksToInsert) {
      return blockCrudCommands.replaceBlocks(blockIdsToRemove, blocksToInsert);
    },
    removeBlocks(blockIds) {
      return blockCrudCommands.removeBlocks(blockIds);
    },
    moveBlocksUp(blockIds) {
      return blockCrudCommands.moveBlocksUp(blockIds);
    },
    moveBlocksDown(blockIds) {
      return blockCrudCommands.moveBlocksDown(blockIds);
    },
    setTextCursorPosition(blockId, placement) {
      return selectionCursorCommands.setTextCursorPosition(blockId, placement);
    },
    setSelection(startBlockId, endBlockId) {
      return selectionCursorCommands.setSelection(startBlockId, endBlockId);
    },
    getSelectionMarks() {
      if (session.isDestroyed) return [];
      return toggleableMarkTypes.filter((type) =>
        session.editor.isActive(type),
      );
    },
    getSelectionLink() {
      if (session.isDestroyed) return null;
      const href = session.editor.getAttributes("link").href;
      return typeof href === "string" ? { href } : null;
    },
    getCaretBlockContext() {
      if (session.isDestroyed) return null;
      const { selection } = session.editor.state;
      if (!selection.empty) return null;

      const node = selection.$from.parent;
      const blockType = blockTypeDescriptorFromNode(node);
      if (blockType === null) return null;
      // blockId는 더 이상 이 노드(paragraph/heading/quote) 자신의 attrs가
      // 아니다(D19) — 가장 가까운 blockContainer 조상이 소유한다.
      const blockId = nearestBlockContainerId(selection.$from);
      if (blockId === null) return null;

      return { blockId, blockType, text: node.textContent };
    },
    getSelectionBlockType() {
      if (session.isDestroyed) return null;
      const { selection, doc } = session.editor.state;
      return findSelectionBlock(doc, 0, selection.from, selection.to);
    },
    getSelectionMediaBlock() {
      if (session.isDestroyed) return null;
      const { selection } = session.editor.state;
      if (!(selection instanceof NodeSelection)) return null;
      const { node } = selection;
      if (!isMediaBlockKind(node.type.name)) return null;
      const blockId = node.attrs.blockId;
      if (typeof blockId !== "string" || blockId.length === 0) return null;
      return {
        blockId,
        kind: node.type.name,
        url: typeof node.attrs.url === "string" ? node.attrs.url : null,
        name: typeof node.attrs.name === "string" ? node.attrs.name : null,
        caption:
          typeof node.attrs.caption === "string" ? node.attrs.caption : null,
        showPreview:
          node.type.name === "file" ? null : node.attrs.showPreview !== false,
        textAlignment:
          isTextAlignableMediaBlockKind(node.type.name) &&
          typeof node.attrs.textAlignment === "string"
            ? (node.attrs.textAlignment as "left" | "center" | "right")
            : null,
      };
    },
    getBlockNestingActionState(blockId) {
      if (session.isDestroyed || session.revision >= Number.MAX_SAFE_INTEGER) {
        return { canIndent: false, canOutdent: false };
      }
      return getBlockNestingActionState(session.editor.state.doc, blockId);
    },
    getTableCellSelection() {
      if (session.isDestroyed) return null;
      const state = session.editor.state;
      if (!isInTable(state)) return null;

      const rect = selectedRect(state);
      const tableBlockId = rect.table.attrs.blockId;
      if (typeof tableBlockId !== "string" || tableBlockId.length === 0) {
        return null;
      }

      if (state.selection instanceof CellSelection) {
        const { cellIds, singleMergedCellId } = collectCellSelection(
          state,
          rect,
        );
        if (cellIds.length === 0) return null;
        return {
          tableBlockId,
          cellIds,
          splitCellId: singleMergedCellId,
        };
      }

      // 캐럿이 이미 병합된 셀 안에 있으면(선택 없이도) 분할과 서식(색상·
      // 정렬) 컨트롤을 노출한다. 병합되지 않은 셀 안의 캐럿(일반 입력 중)은
      // null — 표에 타이핑하는 내내 툴바가 떠 있지 않게 한다(spec 7.2).
      const cellPosition =
        rect.tableStart +
        (rect.map.map[rect.top * rect.map.width + rect.left] ?? -1);
      const cellNode =
        cellPosition < rect.tableStart ? null : state.doc.nodeAt(cellPosition);
      if (cellNode === null || cellNode === undefined) return null;
      const rowSpan = cellNode.attrs.rowspan as number;
      const colSpan = cellNode.attrs.colspan as number;
      if (rowSpan <= 1 && colSpan <= 1) return null;
      const cellId = cellNode.attrs.cellId;
      if (typeof cellId !== "string" || cellId.length === 0) return null;
      return {
        tableBlockId,
        cellIds: [cellId],
        splitCellId: cellId,
      };
    },
    getBlockSelection() {
      if (session.isDestroyed) return null;
      return session.getBlockSelection();
    },
    getMediaUploadState(blockId) {
      if (session.isDestroyed) return null;
      return session.getMediaUploadState(blockId);
    },
    isUploadEnabled() {
      if (session.isDestroyed) return false;
      return session.uploadFile !== undefined;
    },
    replaceDocument(next) {
      return session.replaceDocument(next);
    },
    get isEditable() {
      return session.isEditable;
    },
    set isEditable(value) {
      session.isEditable = value;
    },
    commands: {
      ...genericBlockCommands,
      ...inlineMarkCommands,
      ...blockAttributeCommands,
      ...tableCommands,
      ...insertBlockCommands,
      undo: () =>
        session.runDocumentCommand("undo", "undo", () =>
          session.editor.commands.undo(),
        ),
      redo: () =>
        session.runDocumentCommand("redo", "redo", () =>
          session.editor.commands.redo(),
        ),
    },
  };
  // customBlocks NodeView가 dummy mount 구간에서 캡처한 지연 참조를 이제
  // 완성한다 — 실사용 mount()가 만드는 NodeView부터는 완전히 동작한다
  // (DELTA-11.md "결정" 2).
  controllerBox.current = controller;
  return controller;
};
