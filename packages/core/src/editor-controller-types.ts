import type {
  Block,
  Document as BlockDocument,
  IdFactory,
  Result,
  SyntaxHighlighter,
} from "@cp949/geul-model";

import type {
  CustomBlockDefinition,
  CustomInlineContentDefinition,
  CustomStyleDefinition,
} from "./custom-extension-definitions.js";
import type { Dictionary } from "./dictionary.js";
import type {
  BlockCommands,
  BlockMutation,
  CodeBlockAndCustomCommands,
  DocumentQuery,
  EditorLifecycle,
  InlineFormattingCommands,
  MediaCommands,
  SelectionMutation,
  SelectionQuery,
  TableCommands,
} from "./editor-controller-facets.js";
import type { EditorError } from "./errors.js";
import type { LocalPreviewAttrs } from "./media-local-preview.js";
import type { MediaUploadState, UploadFile } from "./media-upload.js";
import type { EnabledBlockTypes } from "./model-to-tiptap.js";
import type { PasteRejectedReason } from "./table-command-error.js";

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

// EditorController(spec 전체)를 10개 facet(editor-controller-facets.ts)의
// 교집합으로 재구성한다 — 아키텍처 리뷰 02차 C5(순수 구조 리팩터). 구현
// (production-editor-session.ts)과 공개 표면(멤버 이름·시그니처)은
// 바뀌지 않는다. 각 facet의 관심사와 개별 멤버 doc comment는
// editor-controller-facets.ts가 소유한다 — 여기서 복제하지 않는다.
export type EditorController = EditorLifecycle &
  DocumentQuery &
  SelectionQuery &
  SelectionMutation &
  BlockMutation &
  BlockCommands &
  InlineFormattingCommands &
  MediaCommands &
  TableCommands &
  CodeBlockAndCustomCommands;

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
  // EditorController.runCustomCommand(name, ...args)로 호출한다
  // (CodeBlockAndCustomCommands facet 참고).
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
