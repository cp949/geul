import type { TabularData } from "@cp949/geul-io";
import type {
  Block,
  Document as BlockDocument,
  DocumentBlock,
  Result,
  TextMark,
} from "@cp949/geul-model";

import type {
  BlockTypeDescriptor,
  SetBlockTypeDescriptor,
} from "./block-type-descriptor.js";
import type { Dictionary } from "./dictionary.js";
import type {
  BlockNestingActionState,
  BlockSelection,
  PartialBlock,
  TableCellSelection,
} from "./editor-controller-types.js";
import type { EditorError } from "./errors.js";
import type { MediaBlockKind } from "./media-block-kind.js";
import type { MediaUploadState } from "./media-upload.js";
import type { TableCellTarget } from "./table-grid.js";

// EditorController(editor-controller-types.ts)를 관심사별로 쪼갠 facet
// 10개 — 아키텍처 리뷰 02차 C5(RD 없음, 순수 내부 리팩터). 런타임·구현
// (production-editor-session.ts)·EditorController 공개 표면은 바뀌지
// 않는다 — editor-controller-types.ts가 이 10개를 교집합(`&`)해
// EditorController를 재구성한다.

export interface EditorLifecycle {
  mount(element: HTMLElement): void;
  unmount(): void;
  destroy(): void;
  // spec §8(EXT-009), RD-002-DELTA-01 — construction-time `dictionary`
  // readback(`isUploadEnabled()`와 동일 자리). react가 `EditorProvider`의
  // "external"(이미 만들어진 editor를 그대로 전달)/"internal" 모드 어느
  // 쪽이든 동일하게 활성 dictionary를 읽는 유일한 경로다(RD-002.md
  // "## 결정" — 별도 React Context를 두지 않는 이유). 미지정으로
  // 생성했으면 `DEFAULT_DICTIONARY`(en)를 반환한다.
  getDictionary(): Dictionary;
  // spec §4.4(EXT-004), RD-001-DELTA-01(Issue #189) — construction-time
  // `enabledBlockTypes` readback(`isUploadEnabled()`/`getDictionary()`와
  // 동일 자리). 옵션 미지정이면 모든 타입에 대해 true(회귀 없음). react
  // 소비처(SlashMenu 등)가 비활성 타입 UI를 숨기는 유일한 판정 지점이다.
  isBlockTypeEnabled(type: Block["type"]): boolean;
  // spec §3.4(DOC-013), RD-005-DELTA-01 — `false`는 ProseMirror
  // `editable` prop을 통해 사용자 DOM 입력(타이핑·클릭 편집)만
  // 차단한다. 프로그램적 `commands.*`/§3.2 API 호출은 읽기 전용
  // 상태에서도 계속 허용한다(BlockNote의 `isEditable`과 동일 의미,
  // RD-005.md "## 결정"). `replaceDocument()`로 문서를 교체해도 값이
  // 유지된다. 파괴된 세션의 getter는 항상 `false`, setter는 아무
  // 효과가 없다(다른 isDestroyed 가드와 동일 원칙).
  get isEditable(): boolean;
  set isEditable(value: boolean);
}

export interface DocumentQuery {
  getDocument(): BlockDocument;
  // 단일 블록 조회·순회(spec §3.2, DOC-004). getDocument()가 반환하는 저장
  // Block 트리를 대상으로 한다 — PM 노드가 아니다. getPrevBlock/getNextBlock은
  // 형제 범위로 좁히지 않고 forEachBlock과 동일한 문서 순서(pre-order DFS)를
  // 공유한다(RD-001-DELTA-01 "## 계획"의 설계 결정, block-tree.ts). 이
  // 4개(+forEachBlock)는 top-level CustomBlock도 그대로 반환한다
  // (RD-002-DELTA-02 "## 결정" — 읽기 전용 조회는 커스텀 여부를 가리지
  // 않는다. 등록·렌더는 아직 지원하지 않지만 존재 자체는 조회 가능해야
  // 한다). insertBlocks 등 범용 조작 API는 여전히 Block만 다룬다(BlockMutation facet).
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
}

export interface SelectionQuery {
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
  // formatting-toolbar·link-toolbar(react)가 표 CellSelection(여러 셀에
  // 걸친 선택)일 때 자신을 닫는 판정 전용 — getTableCellSelection()을
  // 재사용하지 않는다. 그 함수는 "캐럿이 이미 병합된 셀 안"(선택 없이도)
  // 케이스도 non-null을 돌려주는데, 이걸로 서식 툴바를 닫으면 병합된 셀
  // 안에서 정상적으로 드래그한 텍스트 선택까지 같이 닫혀버린다(회귀).
  // 여기는 오직 `state.selection instanceof CellSelection`만 본다 —
  // getSelectionMediaBlock()이 NodeSelection 하나만 보는 것과 같은 결의
  // 좁은 판정이다. media 쪽 가드는 91fcefa가 formatting-toolbar·
  // link-toolbar에 이미 추가했고, CellSelection 쪽은 그 대응판이다.
  isCellRangeSelected(): boolean;
  getBlockSelection(): BlockSelection | null;
}

export interface SelectionMutation {
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
}

export interface BlockMutation {
  // 범용 조작 API(spec §3.2, DOC-005)의 입력 타입 — 임의 Block 형태를 받되
  // type은 필수, id는 선택(생략하면 createId()로 배정)이다. 기존 타입 전용
  // 명령(commands.*)과 별개 계층, 표·미디어처럼 이미 전용 명령(insertMediaBlock,
  // table 명령 15종)이 있는 타입은 그 명령이 더 정확한 에러를 준다 — 이
  // API는 대체가 아니라 병행이다. 새 완화 검증을 만들지 않고 기존 model
  // 검증(parseDocument)에 위임한다(RD-002-DELTA-01 "## 계획"의 설계 결정).
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
  replaceDocument(next: unknown): Result<void, EditorError>;
}

export interface BlockCommands {
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
    toggleListItemCollapse(blockId: string): Result<void, EditorError>;
    setCalloutIcon(blockId: string, icon: string): Result<void, EditorError>;
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
    insertDivider(
      afterBlockId: string,
      options?: { clearAfterBlockText?: boolean },
    ): Result<{ blockId: string }, EditorError>;
    undo(): Result<void, EditorError>;
    redo(): Result<void, EditorError>;
  };
}

export interface InlineFormattingCommands {
  readonly commands: {
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
  };
}

export interface MediaCommands {
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
  readonly commands: {
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
    // iframe 전용(CUS-001~004, roadmap Issue #212 RD-002 DELTA-02, spec §3).
    // iframe이 아닌 블록 대상은 COMMAND_NOT_APPLICABLE(§8, 다른 kind
    // 전용 커맨드는 전용 NOT_SUPPORTED 코드를 쓰지만 이 커맨드는 "대상이
    // iframe 자체가 아니다"는 kind 세부 정책이 아니라 명령 부적합이라
    // runSetCodeBlockWrapCommand와 같은 근거로 commandNotApplicable을
    // 쓴다). URL 검증은 model resolveIframeEmbedDecision(host가 주입한
    // CreateEditorOptions.iframeEmbed)이 전담하고, 거절 시
    // IFRAME_URL_NOT_ALLOWED(reason 포함)를 반환한다.
    setIframeSrc(blockId: string, url: string): Result<void, EditorError>;
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
    insertMediaBlock(
      afterBlockId: string,
      kind: MediaBlockKind,
      options?: { clearAfterBlockText?: boolean },
    ): Result<{ blockId: string }, EditorError>;
  };
}

export interface TableCommands {
  readonly commands: {
    pasteTabularData(
      data: TabularData,
    ): Result<{ blockId: string }, EditorError>;
    insertTable(
      afterBlockId: string,
      size: { rows: number; columns: number },
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
    // Issue #176 — grip 메뉴 "너비에 맞추기". containerWidth는 호출자가
    // 클릭 시점에 실측한 편집 영역 px 폭이다(정수, 0 이하는 거절).
    fitTableColumnsToContainer(
      tableBlockId: string,
      containerWidth: number,
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
  };
}

export interface CodeBlockAndCustomCommands {
  // spec §5(EXT-005), RD-001-DELTA-01 — CreateEditorOptions.commands로
  // 등록한 함수를 호출한다. `EditorController.commands`(전체, 고정 shape)와
  // 물리적으로 다른 조회 테이블이라 등록 이름이 겹쳐도 충돌하지 않는다
  // (spec §5 "단순 객체 키 분리 — 별도 충돌 감지 로직 불필요"). 등록되지
  // 않은 name은 COMMAND_NOT_APPLICABLE로 거절한다(기존 commands.*의
  // 미해당 상황과 같은 에러 코드 재사용). `Record<string, Fn>`을 직접
  // 노출하는 대신 메서드로 둔 이유: `noUncheckedIndexedAccess`
  // (tsconfig.base.json) 아래 Record 속성 접근은 항상 `Fn | undefined`가
  // 돼 모든 소비자 호출부에 널 체크를 강제한다 — 미등록 이름을 정상
  // 오류 값으로 돌려주는 이 메서드가 그 부담을 대신 진다.
  runCustomCommand(name: string, ...args: unknown[]): Result<void, EditorError>;
  readonly commands: {
    // RD-001 DELTA-02, Issue #194 — codeBlock 전용(spec 없음, roadmap
    // 결정). 대상이 codeBlock이 아니면 COMMAND_NOT_APPLICABLE로 거절한다
    // (media 계열처럼 kind별 전용 코드를 따로 두지 않는다 — codeBlock은
    // 하나의 타입뿐이다). false면 렌더 DOM에서 `data-geul-code-wrap`
    // attribute가 사라지고 react가 `white-space: pre`(가로 스크롤형)로
    // 되돌린다(code-block-extension.ts).
    setCodeBlockWrap(blockId: string, wrap: boolean): Result<void, EditorError>;
    // RD-002 DELTA-02, Issue #194 — codeBlock 전용(spec 없음, roadmap
    // 결정). 대상이 codeBlock이 아니면 COMMAND_NOT_APPLICABLE로 거절한다
    // (setCodeBlockWrap과 동일 근거). setMediaBlockCaption과 같은 이유로
    // 별도 형식 검증이 없다 — 빈 문자열도 유효하다(caption 지우기).
    setCodeBlockCaption(
      blockId: string,
      caption: string,
    ): Result<void, EditorError>;
    // spec §4.4, RD-002-DELTA-11 — 등록되지 않은 type은
    // CUSTOM_BLOCK_TYPE_NOT_REGISTERED로 거절한다(insertMediaBlock의
    // EDITOR_FEATURE_UNAVAILABLE과 같은 층위 — 둘 다 소비자가 실제로 만날
    // 수 있는 오류다, media-commands.ts 참고).
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
    // spec §4.4, RD-002-DELTA-19 — 등록되지 않은 type은
    // CUSTOM_STYLE_TYPE_NOT_REGISTERED로 거절한다(insertCustomBlock/
    // insertCustomInlineContent와 동일 근거). 같은 값으로 다시 호출하면
    // 해제된다(toggleInlineTextColor와 동일한 toggle 의미).
    toggleCustomStyle(
      type: string,
      props?: Record<string, string | number | boolean | null>,
    ): Result<void, EditorError>;
  };
}
