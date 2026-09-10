import type { TabularData } from "@cp949/geul-io";
import type {
  Block,
  Document as BlockDocument,
  DocumentBlock,
  IdFactory,
  Result,
  TextMark,
} from "@cp949/geul-model";

import type {
  BlockTypeDescriptor,
  SetBlockTypeDescriptor,
} from "./block-type-descriptor.js";
import type {
  CustomBlockDefinition,
  CustomInlineContentDefinition,
  CustomStyleDefinition,
} from "./custom-extension-definitions.js";
import type { Dictionary } from "./dictionary.js";
import type { EditorError } from "./errors.js";
import type { MediaBlockKind } from "./media-block-kind.js";
import type { LocalPreviewAttrs } from "./media-local-preview.js";
import type { MediaUploadState, UploadFile } from "./media-upload.js";
import type { EnabledBlockTypes } from "./model-to-tiptap.js";
import type { SyntaxHighlighter } from "./syntax-highlight.js";
import type { PasteRejectedReason } from "./table-command-error.js";
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
  // Issue #168 roadmap RD-001 DELTA-06 — 처리 안 된 로컬 프리뷰(ADR 0015)를
  // pull 방식으로 조회한다(RD-001.md "결정" — push/이벤트 없음. uploadFile
  // 콜백을 쓰는 호스트는 이미 삽입 시점에 반응하므로 이벤트까지 추가하면
  // 중복이다). 현재 문서 트리를 그때그때 훑어 반환한다 — 별도 캐시나
  // 세션 상태를 두지 않아 undo/redo·블록 삭제·DELTA-05의 정리 신호로
  // 대상이 사라지면 다음 호출에서 자동으로 빠진다. 반환 순서는 PM
  // descendants 순회 순서(문서 순서)를 따르되 계약으로 고정하지 않는다.
  getPendingLocalPreviews(): { blockId: string; file: File }[];
  // spec §4.1 — uploadFile 콜백이 등록됐는지 여부. react Upload UI(RD-003)가
  // File Panel Upload 탭 노출 여부를 결정하는 유일한 판정 지점이다(콜백
  // 등록 시에만 true, "탭 자체 미노출" 계약). 파괴된 세션은 어떤 명령도
  // 적용할 수 없으므로 false를 반환한다(다른 isDestroyed 가드와 동일 원칙).
  isUploadEnabled(): boolean;
  // spec §8(EXT-009), RD-002-DELTA-01 — construction-time `dictionary`
  // readback(`isUploadEnabled()`와 동일 자리). react가 `EditorProvider`의
  // "external"(이미 만들어진 editor를 그대로 전달)/"internal" 모드 어느
  // 쪽이든 동일하게 활성 dictionary를 읽는 유일한 경로다(RD-002.md
  // "## 결정" — 별도 React Context를 두지 않는 이유). 미지정으로
  // 생성했으면 `DEFAULT_DICTIONARY`(en)를 반환한다.
  getDictionary(): Dictionary;
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
  // spec §5(EXT-005), RD-001-DELTA-01 — CreateEditorOptions.commands로
  // 등록한 함수를 호출한다. `commands`(위, 고정 shape)와 물리적으로 다른
  // 조회 테이블이라 등록 이름이 겹쳐도 충돌하지 않는다(spec §5 "단순
  // 객체 키 분리 — 별도 충돌 감지 로직 불필요"). 등록되지 않은 name은
  // COMMAND_NOT_APPLICABLE로 거절한다(기존 commands.*의 미해당 상황과
  // 같은 에러 코드 재사용). `Record<string, Fn>`을 직접 노출하는 대신
  // 메서드로 둔 이유: `noUncheckedIndexedAccess`(tsconfig.base.json) 아래
  // Record 속성 접근은 항상 `Fn | undefined`가 돼 모든 소비자 호출부에
  // 널 체크를 강제한다 — 미등록 이름을 정상 오류 값으로 돌려주는 이
  // 메서드가 그 부담을 대신 진다.
  runCustomCommand(name: string, ...args: unknown[]): Result<void, EditorError>;
}

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
  // spec §10(IO-008), RD-001-DELTA-01 — ClipboardPasteExtension이 표·미디어가
  // 아닌 붙여넣기(own HTML/외부 HTML/Markdown/plain text)를 처리하기 직전에
  // 호출한다. `true`는 처리됨(기본 동작 중단), `false`는 취소(아무 것도
  // 삽입하지 않음, PM 기본 plain-text 붙여넣기도 포함해 억제), `undefined`는
  // `defaultPasteHandler()`로 위임 가능한 기본 동작 위임이다. 표
  // (TablePasteExtension)·미디어(MediaDropPasteExtension) 붙여넣기는
  // 이 hook의 대상이 아니다(roadmap.md "제외 범위"). raw PM Plugin/Tiptap
  // Extension은 노출하지 않는다(ADR-0002) — `event`만 원본 DOM
  // ClipboardEvent이고 `editor`는 EditorController다.
  pasteHandler?: (context: {
    event: ClipboardEvent;
    editor: EditorController;
    defaultPasteHandler: () => boolean;
  }) => boolean | undefined;
  // spec §4.1(갱신 예정 — RD-001 완료 동기화, `RD-001.md` "결정" 참고) —
  // 미등록 시 drag/drop·paste·파일선택 패널·uploadMediaFile 모두 대상에
  // 아직 url이 없으면(신규 삽입) 로컬 프리뷰(ADR 0015) attrs로 대체한다
  // (Issue #168 roadmap RD-001 DELTA-02~04). uploadMediaFile/
  // replaceMediaBlockFile이 이미 url이 있는 대상(교체)을 향하면 여전히
  // COMMAND_NOT_APPLICABLE로 거절한다 — 로컬 프리뷰는 "새 미디어를 일단
  // 보여준다"는 목적이지 이미 성공한 미디어를 대체하지 않는다.
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
  // Issue #168 roadmap RD-001 DELTA-05, RD-002 DELTA-02·03 — 로컬 프리뷰
  // (ADR 0015)가 정리돼도 안전하다고 core가 판단하는 세 시점 모두 이
  // 채널 하나로 알린다(RD-002.md "결정" — 신호 채널 재사용, react 쪽 조치가
  // 세 시점 전부 동일해 나눌 이유가 없다).
  //   1. 실제 url이 확정되는 두 지점(uploadMediaFile/replaceMediaBlockFile
  //      성공, setMediaBlockUrl) — core가 attrs를 null로 정리한 뒤 알린다.
  //   2. 로컬 프리뷰가 있던 블록이 삭제된 뒤 undo로도 복구 불가능해지는
  //      시점(RD-002 DELTA-02, `media-local-preview-reachability.ts`) —
  //      attrs는 이미 doc에서 사라진 상태로 알린다.
  //   3. 세션이 `destroy()`로 영구히 끝날 때, 그때까지 위 두 시점 중
  //      어디에도 걸리지 않고 남아 있던 로컬 프리뷰 전부(RD-002 DELTA-03) —
  //      `unmount()`(재마운트 가능한 DOM 분리)에는 걸지 않는다, `destroy()`
  //      뒤에는 그 세션이 다시 살아나지 않기 때문이다.
  //   4. `replaceDocument()`로 문서를 교체해 구 Editor가 폐기되기 직전,
  //      그때까지 위 시점들에 걸리지 않고 구 Editor에 남아 있던 로컬
  //      프리뷰 전부(Issue #169 roadmap RD-001 DELTA-01) — 로컬 프리뷰는
  //      model에 왕복하지 않아(ADR 0015) 새 문서가 같은 blockId를 쓰더라도
  //      이어받지 않는다.
  // 실제 URL.revokeObjectURL DOM 호출은 이 옵션의 소비자(RD-002, react)
  // 몫이다 — core는 "언제 정리해도 안전한지"만 판단해 신호로 넘긴다.
  // onUploadStateChange와 동일하게 문서 변경이 아니라 push 알림이다(로컬
  // 프리뷰는 model에 왕복하지 않아 revision을 올리지 않는다).
  onLocalPreviewCleanup?: (blockId: string, cleared: LocalPreviewAttrs) => void;
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
  // spec §5(EXT-005), RD-001-DELTA-01 — 등록된 함수는
  // EditorController.runCustomCommand(name, ...args)로 호출한다(위 참고).
  // raw PM Plugin/Tiptap Extension은 노출하지 않는다(ADR-0002).
  commands?: Record<
    string,
    (editor: EditorController, ...args: unknown[]) => Result<void, EditorError>
  >;
  // spec §5(EXT-005), RD-002-DELTA-01 — 등록된 함수는 내장 keyboard
  // shortcut 9개(block-join/move/split/type-keyboard, code-block-exit/
  // mark-guard, indent-keyboard, list-input-rule, table-keyboard)와 겹쳐도
  // 항상 우선한다(roadmap.md "결정" — CustomKeyboardShortcutsExtension을
  // extensions 배열 끝에 두어 Tiptap 3.30.1의 선언 역순 keymap 우선순위를
  // 이용한다). 겹치는 키는 등록 시 console.warn으로 알리되 등록을 막지
  // 않는다. `false`를 반환하면 ProseMirror keymap 표준 폴스루로 내장
  // shortcut이 이어서 실행된다. raw PM Plugin/Tiptap Extension은 노출하지
  // 않는다(ADR-0002).
  keyboardShortcuts?: Record<string, (editor: EditorController) => boolean>;
  // spec §7(EXT-008), R4 슬라이스5 RD-002-DELTA-01 — DOM 역할별 전역 정적
  // attribute 주입(roadmap.md "결정" — BlockNote의 domAttributes/block 이름을
  // 그대로 쓰지 않고 geul 자체 이름을 쓴다, ADR-0004 대조 재검토). `editor`는
  // Tiptap의 editorProps.attributes로 배선되고, `.geul-editor`(React 마운트
  // 호스트)가 아니라 ProseMirror가 실제로 만드는 편집 가능 DOM이 대상이다
  // (production-editor-assembly.ts 참고). class 병합(공백 join)은
  // ProseMirror의 computeDocDeco()가 네이티브로 처리한다 — 별도 병합 로직
  // 없음. `blockContainer`/`blockGroup` 역할은 DELTA-02/03이 추가한다.
  attributeOverrides?: {
    editor?: Record<string, string>;
    // R4 슬라이스5 RD-002-DELTA-02 — block-container-extension.ts의
    // renderHTML에 배선된다. `data-geul-block-id` 등 예약/필수 attribute
    // 충돌 시 무시+`console.warn`(attribute-override-merge.ts 참고).
    blockContainer?: Record<string, string>;
    // R4 슬라이스5 RD-002-DELTA-03 — 자식 블록 목록 wrapper
    // (`data-geul-block-group`)에 배선된다. blockContainer와 같은
    // attribute-override-merge.ts 규칙을 쓴다.
    blockGroup?: Record<string, string>;
  };
  // spec §8(EXT-009), RD-001-DELTA-01 — 미지정 시 `DEFAULT_DICTIONARY`(en)를
  // 쓴다. 자동 딥 병합은 하지 않는다 — 소비자가 `DEFAULT_DICTIONARY`를
  // 스프레드해 필요한 key만 override한다(dictionary.ts, spec §8.1
  // "단순함 우선").
  dictionary?: Dictionary;
  // spec §3(BLK-017), RD-001-DELTA-01 — 코드 블록 구문 강조 seam(공개 계약은
  // docs/specs/2026-09-08-blk-017-code-highlighting-seam-design.md 소유).
  // 미지정이면 CodeBlockHighlightExtension 자체를 스키마에 추가하지 않아
  // 모든 코드 블록이 조용히 plain text로 렌더된다(spec §5, 경고 없음).
  // 이 DELTA는 동기 반환 경로만 처리한다 — 비동기 결과 반영(DELTA-02)과
  // edge case 5종(DELTA-03)은 아직 없다.
  syntaxHighlighter?: SyntaxHighlighter;
};
