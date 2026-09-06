import type { TabularData } from "@cp949/geul-io";
import {
  type Block,
  type Document as BlockDocument,
  type DocumentBlock,
  type HeadingBlock,
  type IdFactory,
  isCanonicalCellAlign,
  isCanonicalCellColor,
  isInlineContentBlockType,
  isKnownBlockType,
  isNestableBlockType,
  isSupportedLinkHref,
  isValidMediaPreviewWidth,
  parseDocument,
  type Result,
  type TableBlock,
  type TextMark,
} from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";
import {
  Fragment,
  type Node as ProseMirrorNode,
  type ResolvedPos,
} from "@tiptap/pm/model";
import {
  NodeSelection,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import { CellSelection, isInTable, selectedRect } from "@tiptap/pm/tables";

import { findBlockPosition, findEditableBlockContent } from "./block-position.js";
import {
  findAdjacentInTree,
  findBlockInTree,
  findParentInTree,
  findSiblingContext,
  walkBlockTree,
} from "./block-tree.js";
import {
  insertSiblingsInTree,
  removeBlocksFromTree,
  updateBlockInTree,
} from "./block-tree-edit.js";
import {
  type DividerCommandError,
  insertDivider as insertDividerCommand,
} from "./divider-commands.js";
import { selectionIntersectsCodeBlock } from "./code-block-mark-guard-extension.js";
import type { EditorError } from "./errors.js";
import { createGenericBlockCommands } from "./generic-block-commands.js";
import { getBlockNestingActionState } from "./indent-commands.js";
import { isMediaBlockKind, type MediaBlockKind } from "./media-block-kind.js";
import {
  type InsertMediaBlockError,
  insertMediaBlock as insertMediaBlockCommand,
} from "./media-commands.js";
import type { MediaUploadState, UploadFile } from "./media-upload.js";
import { blockToTiptapJson } from "./model-to-tiptap.js";
import {
  commandNotApplicable,
  ProductionEditorSession,
} from "./production-editor-session.js";
import type { PasteRejectedReason } from "./table-command-error.js";
import {
  deleteTableColumn as deleteTableColumnCommand,
  deleteTableRow as deleteTableRowCommand,
  insertTableColumn as insertTableColumnCommand,
  insertTable as insertTableCommand,
  insertTableRow as insertTableRowCommand,
  mergeTableCells as mergeTableCellsCommand,
  moveTableColumn as moveTableColumnCommand,
  moveTableRow as moveTableRowCommand,
  resizeTableColumn as resizeTableColumnCommand,
  setTableCellAlign as setTableCellAlignCommand,
  setTableCellColor as setTableCellColorCommand,
  splitTableCell as splitTableCellCommand,
  type TableCommandError,
  toggleTableHeaderColumn as toggleTableHeaderColumnCommand,
  toggleTableHeaderRow as toggleTableHeaderRowCommand,
} from "./table-commands.js";
import { pasteTabularData as pasteTabularDataCommand } from "./table-paste-commands.js";
import type { TableCellTarget } from "./table-grid.js";

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

// insertBlocks/updateBlock/replaceBlocks/removeBlocks/moveBlocksUp·Down(spec
// §3.2)은 같은 타입 안에서만 필드를 병합하거나 PartialBlock(위, 알려진
// 14종 전용)을 다루는 기존 계약이다 — top-level CustomBlock(top-level
// 전용, RD-002-DELTA-01)을 이 범용 명령의 대상으로 삼는 계약은 아직 없다
// (등록·렌더·round-trip은 RD-002 후속 DELTA). findBlockInTree 등이 반환한
// 값이 CustomBlock이면 이 두 헬퍼가 "찾지 못함"과 동일하게 취급해, 이
// 파일의 기존 BLOCK_NOT_FOUND/COMMAND_NOT_APPLICABLE 판정 경로를 그대로
// 재사용한다 — getBlock 계열(DOC-004, 아래 인터페이스)만 예외로 CustomBlock을
// 그대로 반환한다.
const asKnownBlock = (block: DocumentBlock | undefined): Block | undefined =>
  block !== undefined && isKnownBlockType(block.type)
    ? (block as Block)
    : undefined;
const asKnownSiblings = (
  context: { siblings: readonly DocumentBlock[]; index: number } | undefined,
): { siblings: readonly Block[]; index: number } | undefined => {
  if (context === undefined) return undefined;
  const target = context.siblings[context.index];
  if (target === undefined || !isKnownBlockType(target.type)) return undefined;
  return { siblings: context.siblings as readonly Block[], index: context.index };
};

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
  ): Result<
    { insertedBlocks: Block[]; removedBlocks: Block[] },
    EditorError
  >;
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
  onBeforeChange?: (context: { changes: DocumentChangeEvent }) => boolean | void;
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

export const createEditor = (
  options: CreateEditorOptions,
): EditorController => {
  const session = new ProductionEditorSession(options);
  const genericBlockCommands = createGenericBlockCommands(session);

  const rejectCodeBlockMark = (): Result<void, EditorError> | null => {
    if (session.isDestroyed) return null;
    const state = session.editor.state;
    return selectionIntersectsCodeBlock(state.doc, state.selection)
      ? { ok: false, error: { code: "CODE_BLOCK_MARK_NOT_ALLOWED" } }
      : null;
  };

  const runSelectionCommand = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> => {
    const rejected = rejectCodeBlockMark();
    if (rejected !== null) return rejected;
    if (session.editor.state.selection.empty) {
      return commandNotApplicable(command);
    }
    return session.runDocumentCommand(command, "local", run);
  };

  const runApplicableLinkCommand = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> => {
    if (
      session.editor.state.selection.empty &&
      !session.editor.isActive("link")
    ) {
      return commandNotApplicable(command);
    }
    return session.runDocumentCommand(command, "local", run);
  };

  const runLinkCommand = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> => {
    const rejected = rejectCodeBlockMark();
    if (rejected !== null) return rejected;
    return runApplicableLinkCommand(command, run);
  };

  // toggleInlineTextColor/toggleInlineBackgroundColor(RD-002 DELTA-01)가
  // 공유하는 본체. setLink와 같은 순서(CodeBlock 가드 → 값 검증)를 따른다.
  // `color`가 `null`이면 검증을 생략하고 해제로 취급한다(setCellColor와
  // 동형, table-grid.ts:720-730). mutation은 Tiptap 코어 제네릭 chain
  // 명령(`toggleMark`/`unsetMark`)만 쓴다 — attrs가 있는 mark도 별도
  // `addCommands()` 없이 이름만으로 동작하고, `toggleMark`의 attrs-aware
  // 활성 판정이 spec의 "같은 값 재적용 시 해제" 토글 의미를 그대로
  // 구현한다.
  const runInlineColorCommand = (
    command: string,
    markName: "textColor" | "backgroundColor",
    color: string | null,
  ): Result<void, EditorError> => {
    const rejected = rejectCodeBlockMark();
    if (rejected !== null) return rejected;
    if (color !== null && !isCanonicalCellColor(color)) {
      return { ok: false, error: { code: "INVALID_COLOR", color } };
    }
    if (session.editor.state.selection.empty) {
      return commandNotApplicable(command);
    }
    return session.runDocumentCommand(command, "local", () =>
      color === null
        ? session.editor.commands.unsetMark(markName)
        : session.editor.commands.toggleMark(markName, { color }),
    );
  };

  // setBlockTextColor/setBlockBackgroundColor/setBlockTextAlignment(RD-002
  // DELTA-02)가 공유하는 본체. TextBlockProps 3필드 모두 blockContainer
  // attrs에 있다(RD-001 DELTA-02, block-container-extension.ts) — blockId로
  // 그 컨테이너를 찾고(BLOCK_NOT_FOUND), 콘텐츠 타입이 isNestableBlockType
  // 7종(paragraph/heading/quote/목록 4종)이 아니면 COMMAND_NOT_APPLICABLE로
  // 거절한다. table·divider는 blockContainer로 감싸이지 않아 첫 조건에서,
  // codeBlock은 leafBlockContent라 isNestableBlockType에서 걸린다(spec
  // §3.3). 값 검증(validate)과 attrs 병합(nextAttrs)만 property별로 주입받고,
  // nextAttrs는 항상 기존 attrs를 스프레드한 뒤 대상 필드만 바꾼다 —
  // setNodeMarkup에 부분 attrs를 넘기면 나머지가 schema default(null)로
  // 리셋되는 함정을 피한다(check-list-item-commands.ts와 동일 경계).
  const runSetBlockTextPropCommand = (
    command: string,
    blockId: string,
    value: string | null,
    validate: (value: string) => EditorError | null,
    nextAttrs: (
      attrs: Record<string, unknown>,
      value: string | null,
    ) => Record<string, unknown>,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable(command);
    const { doc } = session.editor.state;
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (
      node.type.name !== "blockContainer" ||
      !isNestableBlockType(node.child(0).type.name)
    ) {
      return commandNotApplicable(command);
    }
    if (value !== null) {
      const error = validate(value);
      if (error !== null) return { ok: false, error };
    }
    return session.runDocumentCommand(command, "local", () => {
      const transaction = session.editor.state.tr.setNodeMarkup(
        position,
        undefined,
        nextAttrs(node.attrs, value),
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const isMediaBlockNodeName = (name: string): name is MediaBlockKind =>
    name === "file" || name === "image" || name === "video" || name === "audio";

  // setMediaBlockUrl/Name/Caption/BackgroundColor가 공유하는 본체.
  // runSetBlockTextPropCommand와 같은 모양(찾기→가드→검증→setNodeMarkup 1회)
  // 이지만 가드가 다르다 — media 4종은 divider·table처럼 blockContainer로
  // 감싸이지 않는 atom이라(media-block-extension.ts) 그 helper의
  // `blockContainer && isNestableBlockType` 가드를 그대로 못 쓴다(RD-001.md
  // "결정"). setNodeMarkup으로 attrs 일부만 바꿔도 나머지는 항상
  // node.attrs를 스프레드해 유지한다 — 부분 attrs를 넘기면 schema
  // default(null)로 리셋되는 함정을 그대로 피한다.
  const runSetMediaBlockAttrCommand = (
    command: string,
    blockId: string,
    value: string | null,
    validate: (value: string) => EditorError | null,
    nextAttrs: (
      attrs: Record<string, unknown>,
      value: string | null,
    ) => Record<string, unknown>,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable(command);
    const { doc } = session.editor.state;
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (!isMediaBlockNodeName(node.type.name)) {
      return commandNotApplicable(command);
    }
    if (value !== null) {
      const error = validate(value);
      if (error !== null) return { ok: false, error };
    }
    return session.runDocumentCommand(command, "local", () => {
      const transaction = session.editor.state.tr.setNodeMarkup(
        position,
        undefined,
        nextAttrs(node.attrs, value),
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const isResizableMediaBlockKind = (name: string): name is "image" | "video" =>
    name === "image" || name === "video";

  // setMediaPreviewWidth 전용 본체. runSetMediaBlockAttrCommand를 재사용하지
  // 않는다 — 값 타입이 string이 아니라 number이고, kind 가드도 4종 전체가
  // 아니라 image/video만이라(위 isResizableMediaBlockKind) 그 헬퍼의
  // `value: string | null` 시그니처에 끼워 넣을 수 없다(readiness probe
  // 결론, RD-001-DELTA-01.md "배경" 참고). "찾기→가드→검증→setNodeMarkup
  // 1회" 골격은 위 두 헬퍼와 동일하게 따른다.
  const runSetMediaPreviewWidthCommand = (
    blockId: string,
    width: number,
  ): Result<void, EditorError> => {
    const command = "setMediaPreviewWidth";
    if (session.isDestroyed) return commandNotApplicable(command);
    const { doc } = session.editor.state;
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (!isResizableMediaBlockKind(node.type.name)) {
      return { ok: false, error: { code: "MEDIA_RESIZE_NOT_SUPPORTED" } };
    }
    if (!isValidMediaPreviewWidth(width)) {
      return {
        ok: false,
        error: {
          code: "DOCUMENT_INVALID",
          message: "previewWidth must be a positive finite number",
        },
      };
    }
    return session.runDocumentCommand(command, "local", () => {
      const transaction = session.editor.state.tr.setNodeMarkup(
        position,
        undefined,
        { ...node.attrs, previewWidth: width },
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const isPreviewToggleableMediaBlockKind = (
    name: string,
  ): name is "image" | "video" | "audio" =>
    name === "image" || name === "video" || name === "audio";

  // setMediaShowPreview 전용 본체(RD-002 DELTA-01). 위
  // runSetMediaPreviewWidthCommand와 같은 "찾기→가드→setNodeMarkup 1회"
  // 골격이지만 값 타입이 boolean이고 kind 가드가 반대 방향이다(resize는
  // image/video만 허용해 audio/file을 거절하지만, 이 명령은 image/video/
  // audio를 허용하고 file만 거절한다 — 위 isPreviewToggleableMediaBlockKind).
  // boolean은 TS 시그니처 자체가 값 공간 전체를 강제하므로(model
  // showPreview?: boolean과 동형) previewWidth처럼 별도 값 검증 단계가 없다.
  const runSetMediaShowPreviewCommand = (
    blockId: string,
    show: boolean,
  ): Result<void, EditorError> => {
    const command = "setMediaShowPreview";
    if (session.isDestroyed) return commandNotApplicable(command);
    const { doc } = session.editor.state;
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (!isPreviewToggleableMediaBlockKind(node.type.name)) {
      return {
        ok: false,
        error: { code: "MEDIA_PREVIEW_TOGGLE_NOT_SUPPORTED" },
      };
    }
    return session.runDocumentCommand(command, "local", () => {
      const transaction = session.editor.state.tr.setNodeMarkup(
        position,
        undefined,
        { ...node.attrs, showPreview: show },
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const isTextAlignableMediaBlockKind = (
    name: string,
  ): name is "image" | "video" => name === "image" || name === "video";

  // setMediaTextAlignment 전용 본체(Issue #154, MED-009). 위
  // runSetMediaPreviewWidthCommand·runSetMediaShowPreviewCommand와 같은
  // "찾기→가드→검증→setNodeMarkup 1회" 골격이지만, kind 가드 집합이
  // isResizableMediaBlockKind(image/video)와 우연히 같아도 관심사가
  // 다르므로(리사이즈가 아니라 정렬) 공유하지 않고 전용 가드를 새로 둔다
  // (runSetMediaShowPreviewCommand 위 주석이 이미 "명령마다 전용 가드
  // 함수" 컨벤션의 이유를 문서화). 값 검증은 setBlockTextAlignment
  // (runSetBlockTextPropCommand)와 동일하게 isCanonicalCellAlign을
  // 재사용한다 — value가 TS 시그니처로 이미 좁혀져 있어도(런타임 caller가
  // 그 타입을 우회할 수 있으므로) 방어적으로 검증한다.
  const runSetMediaTextAlignmentCommand = (
    blockId: string,
    alignment: "left" | "center" | "right" | null,
  ): Result<void, EditorError> => {
    const command = "setMediaTextAlignment";
    if (session.isDestroyed) return commandNotApplicable(command);
    const { doc } = session.editor.state;
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (!isTextAlignableMediaBlockKind(node.type.name)) {
      return {
        ok: false,
        error: { code: "MEDIA_TEXT_ALIGNMENT_NOT_SUPPORTED" },
      };
    }
    if (alignment !== null && !isCanonicalCellAlign(alignment)) {
      return { ok: false, error: { code: "INVALID_ALIGN", align: alignment } };
    }
    return session.runDocumentCommand(command, "local", () => {
      const transaction = session.editor.state.tr.setNodeMarkup(
        position,
        undefined,
        { ...node.attrs, textAlignment: alignment },
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  // G-EDT-001 회피 규칙: TableCommandError 같은 객체 타입을 클로저 밖 let에 담아
  // `!== null`로 좁히면 never로 잘못 좁혀진다 — TS 버전과 무관하다. 콜백
  // 안에서만 재대입되는 let을 바깥 스코프의 control-flow analysis가 못
  // 따라가는 구조적 한계다(그릴링: 카드 C9, TS 6.0.3 classic tsc에서도 재현 확인).
  // 클로저를 넘나드는 값은 원시 타입(code 문자열, blockId, width, message)만 쓴다.
  const tableErrorFromCode = (
    code: TableCommandError["code"],
    detail: {
      blockId: string;
      message: string;
      width: number;
      cellId: string;
      color: string;
      align: string;
    },
  ): EditorError => {
    switch (code) {
      case "BLOCK_NOT_FOUND":
        return { code: "BLOCK_NOT_FOUND", blockId: detail.blockId };
      case "TABLE_NOT_FOUND":
        return { code: "TABLE_NOT_FOUND", blockId: detail.blockId };
      case "TABLE_NODE_INVALID":
        return { code: "TABLE_NODE_INVALID", message: detail.message };
      case "INVALID_TABLE_SIZE":
        return { code: "INVALID_TABLE_SIZE" };
      case "INDEX_OUT_OF_RANGE":
        return { code: "INDEX_OUT_OF_RANGE" };
      case "MERGE_BOUNDARY_CROSSED":
        return { code: "MERGE_BOUNDARY_CROSSED" };
      case "COLUMN_WIDTH_OUT_OF_RANGE":
        return { code: "COLUMN_WIDTH_OUT_OF_RANGE", width: detail.width };
      case "NOT_RECTANGULAR":
        return { code: "NOT_RECTANGULAR" };
      case "TABULAR_DATA_INVALID":
        return { code: "TABULAR_DATA_INVALID", message: detail.message };
      case "CELL_NOT_FOUND":
        return { code: "CELL_NOT_FOUND", cellId: detail.cellId };
      case "LAST_ROW":
        return { code: "LAST_ROW" };
      case "LAST_COLUMN":
        return { code: "LAST_COLUMN" };
      case "INVALID_COLOR":
        return { code: "INVALID_COLOR", color: detail.color };
      case "INVALID_ALIGN":
        return { code: "INVALID_ALIGN", align: detail.align };
      case "CELL_LIMIT_EXCEEDED":
        return { code: "CELL_LIMIT_EXCEEDED" };
      case "PASTE_MERGE_CONFLICT":
        return { code: "PASTE_MERGE_CONFLICT" };
      case "PASTE_TARGET_NOT_FOUND":
        return { code: "PASTE_TARGET_NOT_FOUND" };
      case "MERGE_TARGET_NOT_FOUND":
        return { code: "COMMAND_NOT_APPLICABLE", command: "mergeTableCells" };
      case "TRANSACTION_REJECTED":
        return { code: "TRANSACTION_REJECTED" };
      // 아래 두 case는 spec §11.3의 "core는 자체 TableGridError를 최상위
      // EditorError에 flatten만 한다"는 원칙에 따라 새 EditorError variant를
      // 만들지 않고 COMMAND_NOT_APPLICABLE로 흡수한다(MERGE_TARGET_NOT_FOUND와
      // 동형) — EditorError는 spec이 고정한 21개 코드 표면이라 TableCommandError
      // 쪽에서 새 코드가 늘어도 그대로 넓히지 않는다.
      case "CLIPBOARD_CONTENT_INVALID":
        // 오늘은 도달 불가 — pasteClipboardContent(table-paste-extension.ts)의
        // 거절은 onPasteRejected로 전달되고(Issue #36) 이 switch(runTableCommand
        // 전용)는 거치지 않는다.
        return { code: "COMMAND_NOT_APPLICABLE", command: "table" };
      case "TABLE_GRID_INVALID":
        // 도달 가능 — mergeCells·resolveTargetCellIds(setCellFormat 경유,
        // table-grid.ts)가 projectTableGrid 실패를 그대로 전파해 mergeTableCells·
        // setTableCellTextColor/BackgroundColor/Align 네 명령까지 이어진다.
        // DOCUMENT_INVALID로 매핑하지 않는다 — 그건 parseSupportedDocument의
        // load 경계 전용이고, 실행 중 grid 손상은 §11.3이 정의한
        // COMMAND_NOT_APPLICABLE("현재 상태에서 적용 불가능한 모든 명령이 공유")
        // 범주다.
        return { code: "COMMAND_NOT_APPLICABLE", command: "table" };
      default: {
        // TableCommandError에 새 variant가 추가되면 여기서 컴파일 실패한다 —
        // 위 매핑을 빠뜨린 채 조용히 COMMAND_NOT_APPLICABLE로 뭉개지던 gap을
        // 막는다(그릴링: 카드 M).
        const _exhaustive: never = code;
        throw new Error(
          `Unhandled TableCommandError code: ${String(_exhaustive)}`,
        );
      }
    }
  };

  // 표 명령 실패의 detail 추출은 한때 runVoidTableCommand·pasteTabularData·
  // insertTable 세 클로저가 각자 복제하다 캡처 누락 drift가 생겼던 자리다
  // (pasteTabularData만 TABLE_NODE_INVALID의 message가 ""로 나갔다) — 판별과
  // 추출을 여기 하나로 모으고, 아래 runTableCommand가 그 결과를 소비한다.
  const tableErrorDetail = (
    error: TableCommandError,
  ): Parameters<typeof tableErrorFromCode>[1] => ({
    blockId:
      error.code === "BLOCK_NOT_FOUND" || error.code === "TABLE_NOT_FOUND"
        ? error.blockId
        : "",
    message:
      error.code === "TABLE_NODE_INVALID" ||
      error.code === "TABULAR_DATA_INVALID"
        ? error.message
        : "",
    width: error.code === "COLUMN_WIDTH_OUT_OF_RANGE" ? error.width : 0,
    cellId: error.code === "CELL_NOT_FOUND" ? error.cellId : "",
    color: error.code === "INVALID_COLOR" ? error.color : "",
    align: error.code === "INVALID_ALIGN" ? error.align : "",
  });

  // 표 명령 12개(void 반환)와 pasteTabularData/insertTable(blockId 반환)가
  // 공유하는 실행기. session.runDocumentCommand의 boolean 결과 위에서 표 명령
  // 고유의 실패 detail(tableErrorDetail)과 성공 값을 함께 클로저 밖으로
  // 끌어낸다.
  //
  // G-EDT-001 회피 규칙: 클로저를 넘나드는 좁히기 대상은 원시 값(errorCode)만
  // 쓰고, detail은 null 좁히기 없이 mutate만 하는 const 객체에 담는다.
  // 성공 값(T)은 void거나 {blockId}뿐이라 원시 캡처로 우회할 수 없다 —
  // `result.ok`가 참이면 invoke()가 성공해 value가 반드시 채워졌다는 불변식을
  // 아래 `as T` 캐스트 한 곳에만 문서화한다. TS가 함수 경계를 넘는 이 불변식을
  // 구조적으로 증명하지 못하는 한계는 이 캐스트가 유일하게 아는 곳으로 남는다.
  const runTableCommand = <T = void>(
    command: string,
    invoke: () => Result<T, TableCommandError>,
  ): Result<T, EditorError> => {
    let errorCode: TableCommandError["code"] | null = null;
    const errorDetail = tableErrorDetail({ code: "INDEX_OUT_OF_RANGE" });
    let value: T | undefined;

    const result = session.runDocumentCommand(command, "local", () => {
      const outcome = invoke();
      if (!outcome.ok) {
        errorCode = outcome.error.code;
        Object.assign(errorDetail, tableErrorDetail(outcome.error));
        return false;
      }
      value = outcome.value;
      return true;
    });

    if (errorCode !== null) {
      return {
        ok: false,
        error: tableErrorFromCode(errorCode, errorDetail),
      };
    }
    if (!result.ok) return result;
    return { ok: true, value: value as T };
  };

  // divider 삽입 명령(divider-commands.ts)의 Result를 session.runDocumentCommand의
  // boolean 위에서 꺼내는 래퍼. runTableCommand를 재사용하지 않는다 — 그
  // 실행기는 TableCommandError 전체(격자 오류 detail 추출·tableErrorFromCode
  // 분기)를 전제하는데 divider 명령의 오류는 BLOCK_NOT_FOUND·
  // TRANSACTION_REJECTED 둘뿐이라 표 의미를 빌릴 이유가 없다.
  //
  // G-EDT-001 회피 규칙: 클로저 밖으로 나오는 값은 mutate만 하는 const 홀더
  // 객체(captured)에 담는다 — runTableCommand의 errorDetail과 같은 형태다.
  // `let x: T | null = null` 원시 캡처는 TS가 클로저 안 대입을 보지 못해
  // 초기 리터럴 null로 좁히고, `x !== null` 블록 안에서 x가 never가 된다 —
  // 비교식이 통과하는 건 never가 모든 타입과 comparable이기 때문이지 좁히기가
  // 옳아서가 아니다(속성 접근·switch로 바꾸면 깨진다). 홀더 객체의 속성은
  // 초기 리터럴로 좁혀지지 않아 클로저 대입 뒤에도 정상 narrowing이다.
  // BLOCK_NOT_FOUND의 blockId는 명령이 조회하는 유일한 블록인 afterBlockId
  // 그 자체라 따로 캡처하지 않는다.
  const insertDivider = (
    afterBlockId: string,
    options?: { clearAfterBlockText?: boolean },
  ): Result<{ blockId: string }, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("insertDivider");
    const captured: {
      code: DividerCommandError["code"] | null;
      blockId: string | null;
    } = { code: null, blockId: null };

    const result = session.runDocumentCommand("insertDivider", "local", () => {
      const outcome = insertDividerCommand(
        session.editor,
        afterBlockId,
        session.createId,
        options,
      );
      if (!outcome.ok) {
        captured.code = outcome.error.code;
        return false;
      }
      captured.blockId = outcome.value.blockId;
      return true;
    });

    if (captured.code !== null) {
      return captured.code === "BLOCK_NOT_FOUND"
        ? {
            ok: false,
            error: { code: "BLOCK_NOT_FOUND", blockId: afterBlockId },
          }
        : { ok: false, error: { code: "TRANSACTION_REJECTED" } };
    }
    if (!result.ok) return result;
    if (captured.blockId === null) {
      return commandNotApplicable("insertDivider");
    }
    return { ok: true, value: { blockId: captured.blockId } };
  };

  // insertDivider 래퍼와 동일 구조(media-commands.ts::insertMediaBlock의
  // Result를 session.runDocumentCommand의 boolean 위에서 꺼낸다) — kind만
  // 추가로 그대로 전달한다. 오류가 BLOCK_NOT_FOUND·TRANSACTION_REJECTED
  // 둘뿐인 것도 divider와 같다(InsertMediaBlockError).
  const insertMediaBlock = (
    afterBlockId: string,
    kind: MediaBlockKind,
    options?: { clearAfterBlockText?: boolean },
  ): Result<{ blockId: string }, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("insertMediaBlock");
    const captured: {
      code: InsertMediaBlockError["code"] | null;
      blockId: string | null;
    } = { code: null, blockId: null };

    const result = session.runDocumentCommand(
      "insertMediaBlock",
      "local",
      () => {
        const outcome = insertMediaBlockCommand(
          session.editor,
          afterBlockId,
          kind,
          session.createId,
          options,
        );
        if (!outcome.ok) {
          captured.code = outcome.error.code;
          return false;
        }
        captured.blockId = outcome.value.blockId;
        return true;
      },
    );

    if (captured.code !== null) {
      return captured.code === "BLOCK_NOT_FOUND"
        ? {
            ok: false,
            error: { code: "BLOCK_NOT_FOUND", blockId: afterBlockId },
          }
        : { ok: false, error: { code: "TRANSACTION_REJECTED" } };
    }
    if (!result.ok) return result;
    if (captured.blockId === null) {
      return commandNotApplicable("insertMediaBlock");
    }
    return { ok: true, value: { blockId: captured.blockId } };
  };

  // insertBlocks/updateBlock/replaceBlocks(spec §3.2, DOC-005)가 공유하는
  // 후보 문서 검증. 검증 전략은 "새·수정 블록만 격리 검증"이 아니라
  // "현재 문서 전체에 스플라이스한 후보 문서를 통째로 parseDocument"다 —
  // id 유일성과 중첩 깊이는 대상 블록만 봐서는 판정할 수 없다
  // (RD-002-DELTA-01 "## 계획"의 설계 결정). parseDocument 실패는 기존
  // parseSupportedDocument(production-editor-session.ts)와 동일하게
  // EditorError.DOCUMENT_INVALID로 뭉뚱그린다 — DocumentError의 더
  // 세분화된 code(DOCUMENT_LIMIT_EXCEEDED 등)는 message로만 보존한다.
  // parseDocument(model 계층)는 빈 배열을 허용한다 — R0(문서는 항상 1개
  // 이상 블록, modelToTiptap.ts 참고)는 core의 불변식이라 여기서 별도
  // 재확인한다. insertBlocks/updateBlock은 블록 수를 줄이지 않아 이
  // 분기에 도달할 수 없지만, replaceBlocks는 제거 개수가 삽입 개수보다
  // 많을 수 있어 처음으로 도달 가능해진다(RD-002-DELTA-02 "## 계획"의
  // 설계 결정).
  const validateCandidateDocument = (
    candidateBlocks: DocumentBlock[],
    currentDocument: BlockDocument,
  ): Result<BlockDocument, EditorError> => {
    const parsed = parseDocument({
      ...currentDocument,
      blocks: candidateBlocks,
    });
    if (!parsed.ok) {
      return {
        ok: false,
        error: { code: "DOCUMENT_INVALID", message: parsed.error.message },
      };
    }
    if (parsed.value.blocks.length === 0) {
      return {
        ok: false,
        error: {
          code: "DOCUMENT_INVALID",
          message: "R0 editor documents require at least one block",
        },
      };
    }
    return parsed;
  };

  // 범용 조작 API(spec §3.2, DOC-005, RD-002-DELTA-01).
  const insertBlocksImpl = (
    blocksToInsert: PartialBlock[],
    referenceBlockId: string,
    placement: "before" | "after" = "before",
  ): Result<Block[], EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("insertBlocks");

    const withIds = blocksToInsert.map(
      (block) =>
        ({ ...block, id: block.id ?? session.createId() }) as Block,
    );
    const currentDocument = session.getDocument();
    const nextBlocks = insertSiblingsInTree(
      currentDocument.blocks,
      referenceBlockId,
      withIds,
      placement,
    );
    if (nextBlocks === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId: referenceBlockId } };
    }

    const validated = validateCandidateDocument(nextBlocks, currentDocument);
    if (!validated.ok) return validated;

    const insertedBlocks = withIds
      .map((block) => findBlockInTree(validated.value.blocks, block.id))
      .filter((block): block is Block => block !== undefined);
    // 도달 불가 방어선 — parseDocument가 성공하면 스플라이스한 블록 전부가
    // 그 결과 트리에 그대로 남아 있어야 한다(id를 지우거나 바꾸는 정규화
    // 규칙이 없다).
    if (insertedBlocks.length !== withIds.length) {
      return commandNotApplicable("insertBlocks");
    }

    const referencePosition = findBlockPosition(
      session.editor.state.doc,
      referenceBlockId,
    );
    const referenceNode =
      referencePosition === null
        ? null
        : session.editor.state.doc.nodeAt(referencePosition);
    if (referencePosition === null || referenceNode === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId: referenceBlockId } };
    }
    const insertPosition =
      placement === "before"
        ? referencePosition
        : referencePosition + referenceNode.nodeSize;
    const fragment = Fragment.fromJSON(
      session.editor.schema,
      insertedBlocks.map(blockToTiptapJson),
    );

    const result = session.runDocumentCommand("insertBlocks", "local", () => {
      const transaction = session.editor.state.tr.insert(
        insertPosition,
        fragment,
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;
    return { ok: true, value: insertedBlocks };
  };

  // 범용 조작 API(spec §3.2, DOC-005, RD-002-DELTA-02). update.type이
  // 대상 블록의 type과 다르면 COMMAND_NOT_APPLICABLE로 거절한다(RD-002.md
  // "## 결정" 확정 사항) — 같은 타입 안에서 update가 지정한 최상위
  // 필드만 병합한다(스프레드, PartialBlock의 "최상위만 partial" 계약).
  // update.id는 무시한다(RD-002-DELTA-02 "## 계획"의 설계 결정) — 블록은
  // 항상 blockId 인자의 id를 유지한다.
  const updateBlockImpl = (
    blockId: string,
    update: PartialBlock,
  ): Result<Block, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("updateBlock");

    const currentDocument = session.getDocument();
    const target = asKnownBlock(
      findBlockInTree(currentDocument.blocks, blockId),
    );
    if (target === undefined) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (update.type !== target.type) {
      return commandNotApplicable("updateBlock");
    }

    const merged = {
      ...target,
      ...update,
      id: target.id,
      type: target.type,
    } as Block;
    const nextBlocks = updateBlockInTree(
      currentDocument.blocks,
      blockId,
      () => merged,
    );
    if (nextBlocks === null) {
      // 도달 불가 방어선 — findBlockInTree가 이미 같은 트리에서 찾았다.
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    const validated = validateCandidateDocument(nextBlocks, currentDocument);
    if (!validated.ok) return validated;

    const updatedBlock = asKnownBlock(
      findBlockInTree(validated.value.blocks, blockId),
    );
    if (updatedBlock === undefined) {
      // 도달 불가 방어선 — insertBlocksImpl과 동일 전제(정규화가 id를
      // 지우거나 바꾸지 않는다).
      return commandNotApplicable("updateBlock");
    }

    const position = findBlockPosition(session.editor.state.doc, blockId);
    const node =
      position === null ? null : session.editor.state.doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const fragment = Fragment.fromJSON(session.editor.schema, [
      blockToTiptapJson(updatedBlock),
    ]);

    const result = session.runDocumentCommand("updateBlock", "local", () => {
      const transaction = session.editor.state.tr.replaceWith(
        position,
        position + node.nodeSize,
        fragment,
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;
    return { ok: true, value: updatedBlock };
  };

  // 범용 조작 API(spec §3.2, DOC-005, RD-002-DELTA-02). blockIdsToRemove[0]이
  // 원래 있던 자리에 blocksToInsert를 삽입하고 blockIdsToRemove 전부(자신의
  // children 서브트리 포함)를 제거한다 — 순서는 "앵커가 아직 트리에 있을
  // 때 그 앞에 삽입 → 이후 blockIdsToRemove 전부(앵커 포함) 제거"다
  // (RD-002-DELTA-02 "## 계획"의 설계 결정, 제거 후에는 앵커 위치를 가리킬
  // 안정적 참조가 없다).
  const replaceBlocksImpl = (
    blockIdsToRemove: string[],
    blocksToInsert: PartialBlock[],
  ): Result<{ insertedBlocks: Block[]; removedBlocks: Block[] }, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("replaceBlocks");
    const anchorId = blockIdsToRemove[0];
    if (anchorId === undefined) {
      return commandNotApplicable("replaceBlocks");
    }

    const currentDocument = session.getDocument();
    const removedBlocks: Block[] = [];
    for (const id of blockIdsToRemove) {
      const found = asKnownBlock(findBlockInTree(currentDocument.blocks, id));
      if (found === undefined) {
        return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId: id } };
      }
      removedBlocks.push(found);
    }

    const withIds = blocksToInsert.map(
      (block) => ({ ...block, id: block.id ?? session.createId() }) as Block,
    );
    const withInserted = insertSiblingsInTree(
      currentDocument.blocks,
      anchorId,
      withIds,
      "before",
    );
    if (withInserted === null) {
      // 도달 불가 방어선 — 위 루프가 anchorId(blockIdsToRemove[0])의
      // 존재를 이미 확인했다.
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId: anchorId } };
    }
    const removeIdSet = new Set(blockIdsToRemove);
    const { blocks: nextBlocks } = removeBlocksFromTree(
      withInserted,
      removeIdSet,
    );

    const validated = validateCandidateDocument(nextBlocks, currentDocument);
    if (!validated.ok) return validated;

    const insertedBlocks = withIds
      .map((block) => findBlockInTree(validated.value.blocks, block.id))
      .filter((block): block is Block => block !== undefined);
    if (insertedBlocks.length !== withIds.length) {
      // 도달 불가 방어선 — insertBlocksImpl과 동일 전제.
      return commandNotApplicable("replaceBlocks");
    }

    const result = session.runDocumentCommand("replaceBlocks", "local", () => {
      const anchorPosition = findBlockPosition(session.editor.state.doc, anchorId);
      if (anchorPosition === null) return false;
      const fragment = Fragment.fromJSON(
        session.editor.schema,
        insertedBlocks.map(blockToTiptapJson),
      );
      let transaction = session.editor.state.tr.insert(
        anchorPosition,
        fragment,
      );

      // blockIdsToRemove 전부를 제거한다. 매 삭제 뒤 남은 블록 위치가
      // 바뀌므로 transaction.doc(그 시점까지의 누적 결과)에서 매번 다시
      // 조회한다 — 인자 순서와 무관하게 항상 최신 위치를 얻는다. 조상과
      // 자손이 함께 들어오면 자손이 조상과 함께 이미 사라져 findBlockPosition이
      // null을 반환하고, 이 경우 명령 전체를 거절한다(dispatch 전이라 부분
      // 적용 없음, RD-002-DELTA-02 "## 계획"의 설계 결정).
      for (const id of blockIdsToRemove) {
        const position = findBlockPosition(transaction.doc, id);
        if (position === null) return false;
        const node = transaction.doc.nodeAt(position);
        if (node === null) return false;
        // deleteBlock(generic-block-commands.ts)과 동일한 판정 — 대상이
        // blockGroup의 유일한 자식이면 대상만 지워서는 "block+"를 위반하는
        // 빈 그룹이 남는다, 그룹 자체를 지운다.
        const $position = transaction.doc.resolve(position);
        const removesWholeGroup =
          $position.parent.type.name === "blockGroup" &&
          $position.parent.childCount === 1;
        transaction = transaction.delete(
          removesWholeGroup ? $position.before() : position,
          removesWholeGroup ? $position.after() : position + node.nodeSize,
        );
      }

      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;
    return { ok: true, value: { insertedBlocks, removedBlocks } };
  };

  // 범용 조작 API(spec §3.2, DOC-005, RD-002-DELTA-03). replaceBlocksImpl의
  // "삽입" 절반이 없는 부분집합이다 — blockIds 전부를 자신의 children
  // 서브트리와 함께 제거한다(같은 설계 결정 상속, RD-002-DELTA-02
  // "## 계획"). 신규 트리 유틸리티 없이 removeBlocksFromTree·
  // validateCandidateDocument를 그대로 재사용한다.
  const removeBlocksImpl = (
    blockIds: string[],
  ): Result<Block[], EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("removeBlocks");
    if (blockIds.length === 0) {
      return commandNotApplicable("removeBlocks");
    }

    const currentDocument = session.getDocument();
    const removedBlocks: Block[] = [];
    for (const id of blockIds) {
      const found = asKnownBlock(findBlockInTree(currentDocument.blocks, id));
      if (found === undefined) {
        return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId: id } };
      }
      removedBlocks.push(found);
    }

    const { blocks: nextBlocks } = removeBlocksFromTree(
      currentDocument.blocks,
      new Set(blockIds),
    );
    const validated = validateCandidateDocument(nextBlocks, currentDocument);
    if (!validated.ok) return validated;

    const result = session.runDocumentCommand("removeBlocks", "local", () => {
      let transaction = session.editor.state.tr;
      // replaceBlocksImpl의 제거 루프와 동일 — 인자 순서로 순회하며 매번
      // transaction.doc에서 위치를 다시 조회한다(매 삭제 뒤 남은 블록
      // 위치가 바뀐다). 조상·자손이 함께 들어오면 자손이 이미 사라져
      // findBlockPosition이 null을 반환하고, 명령 전체를 거절한다(dispatch
      // 전이라 부분 적용 없음).
      for (const id of blockIds) {
        const position = findBlockPosition(transaction.doc, id);
        if (position === null) return false;
        const node = transaction.doc.nodeAt(position);
        if (node === null) return false;
        const $position = transaction.doc.resolve(position);
        const removesWholeGroup =
          $position.parent.type.name === "blockGroup" &&
          $position.parent.childCount === 1;
        transaction = transaction.delete(
          removesWholeGroup ? $position.before() : position,
          removesWholeGroup ? $position.after() : position + node.nodeSize,
        );
      }

      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;
    return { ok: true, value: removedBlocks };
  };

  // moveBlocksUp/moveBlocksDown(spec §3.2, DOC-006, RD-002-DELTA-04)이
  // 공유하는 범위 검증. blockIds는 같은 부모의 연속한 형제 범위여야
  // 한다(RD-002-DELTA-04 "## 계획"의 설계 결정, moveSelectedBlocksBefore와
  // 동일 제약) — 인자 순서는 무관하고, 형제 배열 안 인덱스로 정규화해
  // 연속성을 검증한다.
  const resolveMoveRange = (
    blockIds: string[],
    command: string,
  ): Result<
    { siblings: readonly Block[]; startIndex: number; endIndex: number },
    EditorError
  > => {
    if (blockIds.length === 0) return commandNotApplicable(command);

    const currentDocument = session.getDocument();
    let siblings: readonly Block[] | undefined;
    const indices: number[] = [];
    for (const id of blockIds) {
      const context = asKnownSiblings(
        findSiblingContext(currentDocument.blocks, id),
      );
      if (context === undefined) {
        return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId: id } };
      }
      if (siblings === undefined) {
        siblings = context.siblings;
      } else if (context.siblings !== siblings) {
        // 서로 다른 부모의 형제 — "위/아래로 한 칸"의 의미가 성립하지 않는다.
        return commandNotApplicable(command);
      }
      indices.push(context.index);
    }
    if (siblings === undefined) {
      // 도달 불가 방어선 — 위 루프가 최소 1회 실행됐다(blockIds 비어있지 않음).
      return commandNotApplicable(command);
    }

    const sortedIndices = [...new Set(indices)].sort((a, b) => a - b);
    const startIndex = sortedIndices[0];
    const endIndex = sortedIndices[sortedIndices.length - 1];
    if (startIndex === undefined || endIndex === undefined) {
      return commandNotApplicable(command);
    }
    if (sortedIndices.length !== endIndex - startIndex + 1) {
      // 범위 안에 blockIds가 가리키지 않는 형제가 끼어 있다 — 연속하지 않음.
      return commandNotApplicable(command);
    }

    return { ok: true, value: { siblings, startIndex, endIndex } };
  };

  // spec §3.2, DOC-006, RD-002-DELTA-04. 범위 자신은 재조립하지 않고, 그
  // 바로 앞 형제 하나만 delete → 범위 뒤에 insert한다(moveBlockBefore의
  // "delete → transaction.doc에서 위치 재조회 → insert" 기술 재사용,
  // 공개 commands.moveBlockBefore는 호출하지 않는다 — "## 계획"의 설계
  // 결정, beforeBlockId=null의 "항상 최상위 문서 끝" 의미와 충돌한다).
  // 앞 형제를 지워도 범위 자신이 같은 형제 배열에 남아 있어(비어있지
  // 않음) blockGroup이 통째로 비는 경우가 없다 — deleteBlock의
  // removesWholeGroup 판정이 필요 없다.
  const moveBlocksUpImpl = (blockIds: string[]): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("moveBlocksUp");
    const resolved = resolveMoveRange(blockIds, "moveBlocksUp");
    if (!resolved.ok) return resolved;
    const { siblings, startIndex, endIndex } = resolved.value;
    if (startIndex === 0) return commandNotApplicable("moveBlocksUp");

    const precedingBlock = siblings[startIndex - 1];
    const lastRangeBlock = siblings[endIndex];
    if (precedingBlock === undefined || lastRangeBlock === undefined) {
      return commandNotApplicable("moveBlocksUp"); // 도달 불가 방어선
    }

    return session.runDocumentCommand("moveBlocksUp", "local", () => {
      const precedingPosition = findBlockPosition(
        session.editor.state.doc,
        precedingBlock.id,
      );
      if (precedingPosition === null) return false;
      const precedingNode = session.editor.state.doc.nodeAt(precedingPosition);
      if (precedingNode === null) return false;

      const transaction = session.editor.state.tr.delete(
        precedingPosition,
        precedingPosition + precedingNode.nodeSize,
      );
      const lastRangePosition = findBlockPosition(
        transaction.doc,
        lastRangeBlock.id,
      );
      if (lastRangePosition === null) return false;
      const lastRangeNode = transaction.doc.nodeAt(lastRangePosition);
      if (lastRangeNode === null) return false;
      session.editor.view.dispatch(
        closeHistory(
          transaction.insert(
            lastRangePosition + lastRangeNode.nodeSize,
            precedingNode,
          ),
        ),
      );
      return true;
    });
  };

  // moveBlocksUpImpl의 대칭 방향 — 범위 바로 뒤 형제 하나만 delete → 범위
  // 앞에 insert한다.
  const moveBlocksDownImpl = (
    blockIds: string[],
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("moveBlocksDown");
    const resolved = resolveMoveRange(blockIds, "moveBlocksDown");
    if (!resolved.ok) return resolved;
    const { siblings, startIndex, endIndex } = resolved.value;
    if (endIndex === siblings.length - 1) {
      return commandNotApplicable("moveBlocksDown");
    }

    const followingBlock = siblings[endIndex + 1];
    const firstRangeBlock = siblings[startIndex];
    if (followingBlock === undefined || firstRangeBlock === undefined) {
      return commandNotApplicable("moveBlocksDown"); // 도달 불가 방어선
    }

    return session.runDocumentCommand("moveBlocksDown", "local", () => {
      const followingPosition = findBlockPosition(
        session.editor.state.doc,
        followingBlock.id,
      );
      if (followingPosition === null) return false;
      const followingNode = session.editor.state.doc.nodeAt(followingPosition);
      if (followingNode === null) return false;

      const transaction = session.editor.state.tr.delete(
        followingPosition,
        followingPosition + followingNode.nodeSize,
      );
      const firstRangePosition = findBlockPosition(
        transaction.doc,
        firstRangeBlock.id,
      );
      if (firstRangePosition === null) return false;
      session.editor.view.dispatch(
        closeHistory(transaction.insert(firstRangePosition, followingNode)),
      );
      return true;
    });
  };

  // "표의 첫 번째 셀"은 rows[0].cells[0]이다. G-TBL-001(model-to-tiptap.ts)은
  // model→PM 인코딩 시 저장 배열 순서가 논리 열 순서의 권위가 아니라고
  // 경고하지만, 그 반대 방향(PM→model, tiptapToModel)은 항상 PM 문서
  // 물리 순서 그대로 rows[].cells[]를 재구성한다 — 그리고
  // ProductionEditorSession은 매 커밋(초기 로드 포함, `readEditorDocument`)마다
  // session.currentDocument를 PM에서 다시 읽어들인다. 즉 이 함수가 받는
  // tableModel(session.getDocument() 계열에서 파생)은 항상 이미 물리
  // 순서로 정규화돼 있어 columnIndexMap으로 재정렬할 필요가 없다(실측
  // 확인: RD-003-DELTA-01 mutation 검증 — columnIndexMap 기반 탐색을
  // rows[0].cells[0]로 바꿔도 관측 가능한 차이가 없었다). tableNode는
  // tablePosition 위치의 실제 PM table 노드다.
  const firstTableCellRange = (
    tableModel: TableBlock,
    tableNode: ProseMirrorNode,
    tablePosition: number,
  ): { start: number; end: number } | null => {
    const firstRow = tableModel.rows[0];
    if (firstRow === undefined) return null; // 도달 불가 방어선(표는 항상 1행 이상)
    const topLeftCell = firstRow.cells[0];
    if (topLeftCell === undefined) return null; // 도달 불가 방어선(행은 항상 1셀 이상)

    let range: { start: number; end: number } | null = null;
    tableNode.descendants((child, offset) => {
      if (range !== null) return false;
      if (
        child.type.name === "tableCell" &&
        child.attrs.cellId === topLeftCell.id
      ) {
        // descendants의 offset은 tableNode 자기 콘텐츠 시작(진입 토큰
        // 소비 후) 기준 상대 좌표다 — 절대 위치로 바꾸려면 tableNode
        // 진입(+1)까지 더해야 한다(table-commands.ts의 `base = position +
        // 1` 관례와 동일, 그 뒤 셀 콘텐츠 진입에 다시 +1). 즉 콘텐츠 시작 =
        // tablePosition + offset + 2.
        const start = tablePosition + offset + 2;
        range = { start, end: start + child.content.size };
        return false;
      }
      return true;
    });
    return range;
  };

  // setTextCursorPosition(spec §3.2, RD-003-DELTA-01, DOC-007)이 blockId를
  // PM selection 경계로 좁히는 조회. 텍스트 블록(7 nestable + codeBlock)은
  // 콘텐츠 시작/끝 위치 쌍("text"), table은 첫 번째 셀(물리 좌상단)의
  // 시작/끝 위치 쌍("table"), 텍스트 없는 leaf(divider·미디어 4종)는
  // NodeSelection 대상 위치 하나("node")를 돌려준다. setSelectionImpl은
  // 이 중 "text"만 받는다("## 계획"의 설계 결정 — leaf·table은
  // COMMAND_NOT_APPLICABLE).
  type TextCursorTarget =
    | { kind: "text"; start: number; end: number }
    | { kind: "table"; start: number; end: number }
    | { kind: "node"; position: number };

  const resolveTextCursorTarget = (
    blockId: string,
    command: string,
  ): Result<TextCursorTarget, EditorError> => {
    const target = findEditableBlockContent(session.editor.state.doc, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const { position, node } = target;
    if (isInlineContentBlockType(node.type.name)) {
      return {
        ok: true,
        value: {
          kind: "text",
          start: position + 1,
          end: position + 1 + node.content.size,
        },
      };
    }
    if (node.type.name === "table") {
      const found = findBlockInTree(session.getDocument().blocks, blockId);
      if (found === undefined || found.type !== "table") {
        return commandNotApplicable(command); // 도달 불가 방어선
      }
      // "table"은 KNOWN_BLOCK_TYPES 예약 리터럴이라 customBlockSchema로
      // 라우팅될 수 없다(model schema.ts) — 위 판별로 found는 실제로 항상
      // TableBlock이다. isKnownBlockType과 같은 이유로 이 타입 좁히기가
      // TS에는 안 보여 명시적으로 캐스트한다.
      const tableModel = found as TableBlock;
      const cellRange = firstTableCellRange(tableModel, node, position);
      if (cellRange === null) return commandNotApplicable(command); // 도달 불가 방어선
      return {
        ok: true,
        value: { kind: "table", start: cellRange.start, end: cellRange.end },
      };
    }
    return { ok: true, value: { kind: "node", position } };
  };

  // spec §3.2, RD-003-DELTA-01(DOC-007). 문서(모델 트리)를 바꾸지 않으므로
  // runDocumentCommand를 거치지 않는다(selectBlockRange와 동일 이유 —
  // selection만 바뀌면 blockChanges가 빈 배열이라 runDocumentCommand를
  // 쓰면 항상 COMMAND_NOT_APPLICABLE로 오판된다).
  const setTextCursorPositionImpl = (
    blockId: string,
    placement: "start" | "end" = "start",
  ): Result<void, EditorError> => {
    if (session.isDestroyed) {
      return commandNotApplicable("setTextCursorPosition");
    }
    const resolved = resolveTextCursorTarget(blockId, "setTextCursorPosition");
    if (!resolved.ok) return resolved;
    const target = resolved.value;
    const selection =
      target.kind === "node"
        ? NodeSelection.create(session.editor.state.doc, target.position)
        : TextSelection.create(
            session.editor.state.doc,
            placement === "start" ? target.start : target.end,
          );
    session.editor.view.dispatch(
      session.editor.state.tr.setSelection(selection),
    );
    return { ok: true, value: undefined };
  };

  // spec §3.2, RD-003-DELTA-01(DOC-008). startBlockId/endBlockId 둘 다
  // "text"(순수 텍스트 블록)일 때만 지원한다 — 한쪽이라도 leaf·table이면
  // COMMAND_NOT_APPLICABLE("## 계획"의 설계 결정). anchor는 항상
  // startBlockId 콘텐츠 시작, head는 항상 endBlockId 콘텐츠 끝이다 — 순서를
  // 정규화하지 않는다(같은 결정, PM의 TextSelection.create가 anchor>head도
  // 지원한다).
  const setSelectionImpl = (
    startBlockId: string,
    endBlockId: string,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("setSelection");
    const start = resolveTextCursorTarget(startBlockId, "setSelection");
    if (!start.ok) return start;
    if (start.value.kind !== "text") return commandNotApplicable("setSelection");
    const end = resolveTextCursorTarget(endBlockId, "setSelection");
    if (!end.ok) return end;
    if (end.value.kind !== "text") return commandNotApplicable("setSelection");

    const selection = TextSelection.create(
      session.editor.state.doc,
      start.value.start,
      end.value.end,
    );
    session.editor.view.dispatch(
      session.editor.state.tr.setSelection(selection),
    );
    return { ok: true, value: undefined };
  };

  return {
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
      return insertBlocksImpl(blocksToInsert, referenceBlockId, placement);
    },
    updateBlock(blockId, update) {
      return updateBlockImpl(blockId, update);
    },
    replaceBlocks(blockIdsToRemove, blocksToInsert) {
      return replaceBlocksImpl(blockIdsToRemove, blocksToInsert);
    },
    removeBlocks(blockIds) {
      return removeBlocksImpl(blockIds);
    },
    moveBlocksUp(blockIds) {
      return moveBlocksUpImpl(blockIds);
    },
    moveBlocksDown(blockIds) {
      return moveBlocksDownImpl(blockIds);
    },
    setTextCursorPosition(blockId, placement) {
      return setTextCursorPositionImpl(blockId, placement);
    },
    setSelection(startBlockId, endBlockId) {
      return setSelectionImpl(startBlockId, endBlockId);
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
      toggleBold: () =>
        runSelectionCommand("toggleBold", () =>
          session.editor.commands.toggleBold(),
        ),
      toggleItalic: () =>
        runSelectionCommand("toggleItalic", () =>
          session.editor.commands.toggleItalic(),
        ),
      toggleUnderline: () =>
        runSelectionCommand("toggleUnderline", () =>
          session.editor.commands.toggleUnderline(),
        ),
      toggleStrike: () =>
        runSelectionCommand("toggleStrike", () =>
          session.editor.commands.toggleStrike(),
        ),
      toggleCode: () =>
        runSelectionCommand("toggleCode", () =>
          session.editor.commands.toggleCode(),
        ),
      setLink: (href) => {
        const rejected = rejectCodeBlockMark();
        if (rejected !== null) return rejected;
        if (!isSupportedLinkHref(href)) {
          return { ok: false, error: { code: "LINK_HREF_REJECTED", href } };
        }
        if (session.editor.isActive("link", { href })) {
          return commandNotApplicable("setLink");
        }
        return runApplicableLinkCommand("setLink", () => {
          const chain = session.editor.chain();
          if (session.editor.state.selection.empty) {
            chain.extendMarkRange("link");
          }
          return chain.setLink({ href }).run();
        });
      },
      unsetLink: () =>
        runLinkCommand("unsetLink", () => {
          const chain = session.editor.chain();
          if (session.editor.state.selection.empty) {
            chain.extendMarkRange("link");
          }
          return chain.unsetLink().run();
        }),
      toggleInlineTextColor: (color) =>
        runInlineColorCommand("toggleInlineTextColor", "textColor", color),
      toggleInlineBackgroundColor: (color) =>
        runInlineColorCommand(
          "toggleInlineBackgroundColor",
          "backgroundColor",
          color,
        ),
      setBlockTextColor: (blockId, color) =>
        runSetBlockTextPropCommand(
          "setBlockTextColor",
          blockId,
          color,
          (value) =>
            isCanonicalCellColor(value)
              ? null
              : { code: "INVALID_COLOR", color: value },
          (attrs, value) => ({ ...attrs, textColor: value }),
        ),
      setBlockBackgroundColor: (blockId, color) =>
        runSetBlockTextPropCommand(
          "setBlockBackgroundColor",
          blockId,
          color,
          (value) =>
            isCanonicalCellColor(value)
              ? null
              : { code: "INVALID_COLOR", color: value },
          (attrs, value) => ({ ...attrs, backgroundColor: value }),
        ),
      setBlockTextAlignment: (blockId, align) =>
        runSetBlockTextPropCommand(
          "setBlockTextAlignment",
          blockId,
          align,
          (value) =>
            isCanonicalCellAlign(value)
              ? null
              : { code: "INVALID_ALIGN", align: value },
          (attrs, value) => ({ ...attrs, textAlignment: value }),
        ),
      setMediaBlockUrl: (blockId, url) =>
        runSetMediaBlockAttrCommand(
          "setMediaBlockUrl",
          blockId,
          url,
          (value) =>
            isSupportedLinkHref(value)
              ? null
              : { code: "LINK_HREF_REJECTED", href: value },
          (attrs, value) => ({ ...attrs, url: value }),
        ),
      setMediaBlockName: (blockId, name) =>
        runSetMediaBlockAttrCommand(
          "setMediaBlockName",
          blockId,
          name,
          () => null,
          (attrs, value) => ({ ...attrs, name: value }),
        ),
      setMediaBlockCaption: (blockId, caption) =>
        runSetMediaBlockAttrCommand(
          "setMediaBlockCaption",
          blockId,
          caption,
          () => null,
          (attrs, value) => ({ ...attrs, caption: value }),
        ),
      setMediaBlockBackgroundColor: (blockId, color) =>
        runSetMediaBlockAttrCommand(
          "setMediaBlockBackgroundColor",
          blockId,
          color,
          (value) =>
            isCanonicalCellColor(value)
              ? null
              : { code: "INVALID_COLOR", color: value },
          (attrs, value) => ({ ...attrs, backgroundColor: value }),
        ),
      setMediaPreviewWidth: (blockId, width) =>
        runSetMediaPreviewWidthCommand(blockId, width),
      setMediaShowPreview: (blockId, show) =>
        runSetMediaShowPreviewCommand(blockId, show),
      setMediaTextAlignment: (blockId, alignment) =>
        runSetMediaTextAlignmentCommand(blockId, alignment),
      // RD-002 DELTA-02 — 오케스트레이션 본체(session.uploadMediaFile)를
      // 세션으로 이동했다. 여기는 command 이름만 매개변수화해 위임하는
      // 얇은 wrapper다(공개 시그니처·Result/Promise 계약은 그대로).
      uploadMediaFile: (blockId, file) =>
        session.uploadMediaFile("uploadMediaFile", blockId, file),
      replaceMediaBlockFile: (blockId, file) =>
        session.uploadMediaFile("replaceMediaBlockFile", blockId, file),
      cancelMediaUpload: (blockId) => {
        const controller = session.getMediaUploadController(blockId);
        if (controller === null) {
          return commandNotApplicable("cancelMediaUpload");
        }
        controller.abort();
        return { ok: true, value: undefined };
      },
      pasteTabularData: (data) => {
        if (session.isDestroyed)
          return commandNotApplicable("pasteTabularData");
        return runTableCommand("pasteTabularData", () =>
          pasteTabularDataCommand(session.editor, data, session.createId),
        );
      },
      insertTable: (afterBlockId, size, options) => {
        if (session.isDestroyed) return commandNotApplicable("insertTable");
        return runTableCommand("insertTable", () =>
          insertTableCommand(
            session.editor,
            afterBlockId,
            size,
            session.createId,
            options,
          ),
        );
      },
      insertDivider,
      insertMediaBlock,
      insertTableRow: (tableBlockId, atIndex) =>
        runTableCommand("insertTableRow", () =>
          insertTableRowCommand(
            session.editor,
            tableBlockId,
            atIndex,
            session.createId,
          ),
        ),
      insertTableColumn: (tableBlockId, atIndex) =>
        runTableCommand("insertTableColumn", () =>
          insertTableColumnCommand(
            session.editor,
            tableBlockId,
            atIndex,
            session.createId,
          ),
        ),
      moveTableRow: (tableBlockId, fromIndex, toIndex) =>
        runTableCommand("moveTableRow", () =>
          moveTableRowCommand(session.editor, tableBlockId, fromIndex, toIndex),
        ),
      moveTableColumn: (tableBlockId, fromIndex, toIndex) =>
        runTableCommand("moveTableColumn", () =>
          moveTableColumnCommand(
            session.editor,
            tableBlockId,
            fromIndex,
            toIndex,
          ),
        ),
      resizeTableColumn: (tableBlockId, index, width) =>
        runTableCommand("resizeTableColumn", () =>
          resizeTableColumnCommand(session.editor, tableBlockId, index, width),
        ),
      mergeTableCells: (tableBlockId) => {
        if (session.isDestroyed) return commandNotApplicable("mergeTableCells");
        return runTableCommand("mergeTableCells", () =>
          mergeTableCellsCommand(session.editor, tableBlockId),
        );
      },
      splitTableCell: (tableBlockId, cellId) =>
        runTableCommand("splitTableCell", () =>
          splitTableCellCommand(
            session.editor,
            tableBlockId,
            cellId,
            session.createId,
          ),
        ),
      deleteTableRow: (tableBlockId, index) =>
        runTableCommand("deleteTableRow", () =>
          deleteTableRowCommand(session.editor, tableBlockId, index),
        ),
      deleteTableColumn: (tableBlockId, index) =>
        runTableCommand("deleteTableColumn", () =>
          deleteTableColumnCommand(session.editor, tableBlockId, index),
        ),
      toggleTableHeaderRow: (tableBlockId) =>
        runTableCommand("toggleTableHeaderRow", () =>
          toggleTableHeaderRowCommand(session.editor, tableBlockId),
        ),
      toggleTableHeaderColumn: (tableBlockId) =>
        runTableCommand("toggleTableHeaderColumn", () =>
          toggleTableHeaderColumnCommand(session.editor, tableBlockId),
        ),
      setTableCellTextColor: (tableBlockId, target, color) =>
        runTableCommand("setTableCellTextColor", () =>
          setTableCellColorCommand(
            session.editor,
            tableBlockId,
            target,
            "textColor",
            color,
          ),
        ),
      setTableCellBackgroundColor: (tableBlockId, target, color) =>
        runTableCommand("setTableCellBackgroundColor", () =>
          setTableCellColorCommand(
            session.editor,
            tableBlockId,
            target,
            "backgroundColor",
            color,
          ),
        ),
      setTableCellAlign: (tableBlockId, target, align) =>
        runTableCommand("setTableCellAlign", () =>
          setTableCellAlignCommand(session.editor, tableBlockId, target, align),
        ),
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
};
