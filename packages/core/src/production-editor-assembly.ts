import type {
  Block,
  Document as BlockDocument,
  IdFactory,
} from "@cp949/geul-model";
import { isSupportedLinkHref } from "@cp949/geul-model";
import { Editor, mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";

import {
  BlockContainerExtension,
  BlockGroupExtension,
} from "./block-container-extension.js";
import { BlockIdExtension } from "./block-id-extension.js";
import { BlockJoinExtension } from "./block-join-extension.js";
import { BlockMoveKeyboardExtension } from "./block-move-keyboard-extension.js";
import { BlockSplitExtension } from "./block-split-extension.js";
import { BlockTypeInputRuleExtension } from "./block-type-input-rule-extension.js";
import { BlockTypeKeyboardExtension } from "./block-type-keyboard-extension.js";
import { CheckListItemMarkerExtension } from "./check-list-item-marker-extension.js";
import { CodeBlockExitExtension } from "./code-block-exit-extension.js";
import { CodeBlockExtension } from "./code-block-extension.js";
import { CodeBlockMarkGuardExtension } from "./code-block-mark-guard-extension.js";
import { createCustomBlockExtension } from "./custom-block-extension.js";
import { createCustomInlineContentExtension } from "./custom-inline-content-extension.js";
import { createCustomStyleMark } from "./custom-style-mark-extension.js";
import { DividerExtension } from "./divider-extension.js";
// EditorController/CustomBlockDefinition/CustomInlineContentDefinition/
// CustomStyleDefinition을 import type으로만 참조한다(RD-002-DELTA-11
// "결정" 4 — 100개 이상 메서드를 가진 공개 인터페이스라
// production-editor-session.ts 관례(구조적 복제)를 따르지 않는다. 값
// import가 아니라 컴파일 시 완전히 지워져 런타임 순환 의존이 생기지
// 않는다).
import type {
  CustomBlockDefinition,
  CustomInlineContentDefinition,
  CustomStyleDefinition,
  EditorController,
} from "./editor-controller.js";
import { IndentKeyboardExtension } from "./indent-keyboard-extension.js";
import { LinkPolicyExtension } from "./link-policy-extension.js";
import { ListPresentationExtension } from "./list-presentation-extension.js";
import {
  AudioBlockExtension,
  FileBlockExtension,
  ImageBlockExtension,
  VideoBlockExtension,
} from "./media-block-extension.js";
import {
  BulletListItemExtension,
  CheckListItemExtension,
  NumberedListItemExtension,
  ToggleListItemExtension,
} from "./list-item-extension.js";
import { ListInputRuleExtension } from "./list-input-rule-extension.js";
import {
  type EnabledBlockTypes,
  isBlockTypeEnabled,
  modelToTiptap,
} from "./model-to-tiptap.js";
import { PlaceholderExtension } from "./placeholder-extension.js";
import { QuoteExtension } from "./quote-extension.js";
import { RevisionGuardExtension } from "./revision-guard-extension.js";
import {
  BackgroundColorMark,
  TextColorMark,
} from "./text-color-mark-extension.js";
import type { PasteRejectedReason } from "./table-command-error.js";
import {
  TableCellExtension,
  TableExtension,
  TableRowExtension,
} from "./table-extension.js";
import { TableKeyboardNavigationExtension } from "./table-keyboard-extension.js";
import { TablePasteExtension } from "./table-paste-extension.js";
import { ClipboardPasteExtension } from "./clipboard-paste-extension.js";
import { MediaDropPasteExtension } from "./media-drop-paste-extension.js";
import { ToggleCollapseMarkerExtension } from "./toggle-collapse-marker-extension.js";
import { ToggleCollapseVisibilityExtension } from "./toggle-collapse-visibility-extension.js";
import {
  ensureTrailingParagraphOnLoad,
  TrailingBlockExtension,
} from "./trailing-block-extension.js";

// enabledBlockTypes(RD-002-DELTA-12)로 group "nestableBlockContent"(7종)나
// "leafBlockContent"(codeBlock 단독)의 멤버가 전부 사라지면
// BlockContainerExtension.content(block-container-extension.ts, 고정
// "(nestableBlockContent blockGroup?) | leafBlockContent")가 존재하지 않는
// 그룹 이름을 참조하게 돼 `new Schema(...)`가 즉시
// `SyntaxError: No node type or group 'X' found`를 던진다(착수 중 실측
// 발견 — allow:["paragraph"]로 codeBlock을 포함한 나머지 6+1종을 모두
// 끄면 leafBlockContent 그룹이 비어 재현됨). 두 그룹 각각의 생존 여부에
// 따라 content 표현식을 동적으로 좁혀 존재하지 않는 그룹을 참조하지
// 않게 한다. 두 그룹이 전부 비면(예: enabledBlockTypes가 8종 전부를
// 끄는 극단적 구성) blockContainer 자체를 스키마에서 뺀다 — 이 경우는
// spec이 명시적으로 다루지 않는 극단값이라 "남은 위험"에 남긴다.
const NESTABLE_BLOCK_CONTENT_TYPES: readonly Block["type"][] = [
  "paragraph",
  "heading",
  "quote",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "toggleListItem",
];

// D19: paragraph/heading identity는 blockContainer가 소유한다. StarterKit의
// 기본 노드는 group을 configure할 수 없어 nestableBlockContent용 최소 노드를 둔다.
const ParagraphExtension = Node.create({
  name: "paragraph",
  group: "nestableBlockContent",
  content: "inline*",
  parseHTML() {
    return [{ tag: "p" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes), 0];
  },
});

const HeadingExtension = Node.create({
  name: "heading",
  group: "nestableBlockContent",
  content: "inline*",
  defining: true,
  addAttributes() {
    return {
      level: { default: 1, rendered: false },
      // null은 model의 isToggleable/collapsed 필드 부재와 직대응한다
      // (numberedListItem.startNumber와 같은 패턴). 값 자체의 유효성(collapsed엔
      // isToggleable: true 필요)은 model parseDocument가 단독 판정한다.
      isToggleable: { default: null, rendered: false },
      collapsed: { default: null, rendered: false },
    };
  },
  parseHTML() {
    return [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      attrs: { level },
    }));
  },
  renderHTML({ node, HTMLAttributes }) {
    return [`h${String(node.attrs.level)}`, mergeAttributes(HTMLAttributes), 0];
  },
});

// 목록 content node의 내부 DOM은 공개 HTML 변환 계약이 아니다. production
// EditorView가 inline content를 그릴 최소 div만 제공하고 parseHTML은 열지
// 않는다. 상태(checked/startNumber/collapsed)는 rendered: false라 PM
// attr에는 항상 남지만(list-item-extension.ts), production DOM에도
// io.importHtml이 own-content로 재인식할 수 있도록 data-be-* attribute로
// 노출한다(RD-003 — 이전에는 DOM에 전혀 투영되지 않았다).
//
// 외부 ul/ol 붙여넣기(Issue #143 (c))도 이 parseHTML 부재를 바꾸지 않는다 —
// ClipboardPasteExtension이 clipboard HTML을 io.importHtml로 파싱해
// modelToTiptap JSON을 editor.commands.insertContent로 꽂는다
// (TablePasteExtension과 같은 handlePaste 가로채기 패턴). 예전엔
// 목록만 별도 확장(list-paste-fallback-extension.ts, 삭제됨)이 독립
// DOM 파서로 처리했지만, io.importHtml이 own-format·외부 ul/ol을 이미
// 동등하게 처리해(중첩·ol[start]·깊이 상한 포함) RD-005가 그 확장을
// 제거하고 ClipboardPasteExtension 하나로 흡수했다. 실측 결과 표준
// parseHTML(findWrapping 기반 자동 래핑)로는 중첩 목록에서 blockGroup
// 2단 래핑을 만들 수 없다는 사실은 여전히 유효하다 —
// ContentMatch.findWrapping이 항상 최단 경로(최상위 1단 래핑, 즉 평탄화)
// 를 우선해 중첩이 사라진다.
const ProductionBulletListItemExtension = BulletListItemExtension.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-be-bullet-list-item": "" }),
      0,
    ];
  },
});

// startNumber는 model optional 필드(부재=null)다 — own-export의
// dataBeCollapsed(<details>, "정의된 경우만 출력")와 같은 패턴으로 값이
// 있을 때만 data-be-start-number를 낸다. io.importHtml의
// buildProductionListItemBlock이 부재 시 필드를 생략해 model 계약과
// 대응한다(RD-003 DELTA-01).
const ProductionNumberedListItemExtension = NumberedListItemExtension.extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-be-numbered-list-item": "",
        ...(node.attrs.startNumber === null
          ? {}
          : { "data-be-start-number": String(node.attrs.startNumber) }),
      }),
      0,
    ];
  },
});

// checked 시각 표시(체크박스 아이콘·클릭 UI)는 이 DELTA 범위가 아니다 —
// 저장 계층만 완성한다(RD-001 DELTA-02, 그릴링 결정). checked는 model
// 필수 필드(부재 상태가 없다)라 own-export(<li data-be-checked>,
// export-html.ts)와 같이 항상 문자열로 낸다 — startNumber/collapsed처럼
// "정의된 경우만" 조건부가 아니다(RD-003).
const ProductionCheckListItemExtension = CheckListItemExtension.extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-be-check-list-item": "",
        "data-be-checked": String(Boolean(node.attrs.checked)),
      }),
      0,
    ];
  },
});

// collapsed는 heading의 isToggleable/collapsed와 같은 optional 패턴(부재
// =null) — numberedListItem.startNumber와 동일하게 정의된 경우만 낸다.
const ProductionToggleListItemExtension = ToggleListItemExtension.extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-be-toggle-list-item": "",
        ...(node.attrs.collapsed === null
          ? {}
          : { "data-be-collapsed": String(node.attrs.collapsed) }),
      }),
      0,
    ];
  },
});

export const createProductionEditor = (options: {
  document: BlockDocument;
  createId: IdFactory;
  onUpdate: (editor: Editor) => void;
  onPasteRejected?: (reason: PasteRejectedReason) => void;
  // spec §4.4(EXT-001), RD-002-DELTA-11 — 등록된 타입마다 PM atom 노드를
  // 조건부로 추가한다(customBlockEditor는 그 NodeView가 CustomBlockDefinition.render에
  // 넘길 EditorController 참조 — 세션 생성 시점엔 아직 완성 전이라 지연
  // 바인딩 Proxy를 받는다, editor-controller.ts::createEditor 배선 참고).
  // customBlocks가 있으면 customBlockEditor도 항상 함께 온다(둘 다
  // ProductionEditorSession이 같은 options에서 파생한다).
  customBlocks?: Record<string, CustomBlockDefinition>;
  customBlockEditor?: EditorController;
  // spec §4.4(EXT-002), RD-002-DELTA-18 — customBlocks와 동일 시점·동일
  // 지연 바인딩 Proxy 구조로 PM inline atom 노드를 조건부로 추가한다.
  // customInlineContent가 있으면 customInlineContentEditor도 항상 함께
  // 온다(customBlocks/customBlockEditor와 동일 근거).
  customInlineContent?: Record<string, CustomInlineContentDefinition>;
  customInlineContentEditor?: EditorController;
  // spec §4.4(EXT-003), RD-002-DELTA-19 — customBlocks와 동일 시점에 PM
  // Mark를 조건부로 추가한다. editor 참조가 필요 없어(CustomStyleDefinition.
  // render는 값만 받는다) customStyleEditor 같은 짝이 없다.
  customStyles?: Record<string, CustomStyleDefinition>;
  // spec §4.4(EXT-004), RD-002-DELTA-12 — 기존 14종 대상 allow/deny 목록.
  // 미지정이면 isBlockTypeEnabled가 항상 true라 아래 조건부 스프레드가
  // 전부 무조건 포함으로 접혀 기존 동작과 100% 같다.
  enabledBlockTypes?: EnabledBlockTypes;
  // spec §3.4(DOC-013), RD-005-DELTA-01 — PM `editable` prop 초기값.
  // ProductionEditorSession이 세션 레벨로 소유한 editableState를 매
  // 재구성(replaceDocument 포함)마다 그대로 넘긴다 — 이 함수 자신은
  // Tiptap 기본값(true)만 안다. 미지정이면 Tiptap 기본값을 쓴다.
  editable?: boolean;
  // spec §3.3(DOC-009), RD-004-DELTA-01 — Tiptap 네이티브 onSelectionUpdate에
  // 무인자로 위임한다. 3.30.1 dispatchTransaction이 이미
  // `!prevState.selection.eq(nextState.selection)`로 실제 변경 여부를
  // 판정하고 filterTransaction이 거절한 transaction에는 발화하지 않는다
  // (RD-004-DELTA-01 "## 계획"의 설계 결정, 실측:
  // @tiptap/core/dist/index.js:7033-7058). 미지정이면 등록하지 않는다.
  onSelectionChange?: () => void;
  // RD-004-DELTA-02 — canApplyDocumentChange가 두 번째 인자로
  // loadNormalizing을 받는다. 이 함수 자신의 아래 내부
  // load-normalizing dummy mount/unmount 구간에서만 `true`다 —
  // RD-004-DELTA-01이 onMount/onUnmount에 적용한 원칙(생성
  // 시점·replaceDocument 내부 재구성 시 소비자 훅 배제)을
  // onBeforeChange에도 그대로 적용한다. 평가 순서(revision guard가
  // 항상 먼저)는 production-editor-session.ts::evaluateBeforeChange가
  // 소유한다 — 이 인자는 그 함수가 loadNormalizing 여부를 알기 위한
  // 것뿐이다.
  canApplyDocumentChange: (
    transaction: Transaction,
    loadNormalizing: boolean,
  ) => boolean;
  // BlockMoveKeyboardExtension 전용 — production-editor-session.ts의
  // ProductionEditorSession.getBlockSelection과 구조가 같지만 import하지
  // 않는다(그 파일의 순환 의존 회피 관례, block-move-keyboard-extension.ts
  // 참고). 미지정이면 그 확장 자신의 기본값(항상 null)을 쓴다.
  getBlockSelection?: () => { fromBlockId: string; toBlockId: string } | null;
  // MediaDropPasteExtension 전용 — uploadFile 콜백 등록 여부는 세션
  // 생애주기 동안 불변이라(RD-002 readiness probe) getBlockSelection류
  // live-closure가 아니라 세션 생성 시점에 계산한 정적 boolean으로 넘긴다.
  // 미지정이면 그 확장 자신의 기본값(false, no-op)을 쓴다.
  isUploadEnabled?: boolean;
  // MediaDropPasteExtension 전용(RD-002 DELTA-02) — getBlockSelection과
  // 같은 모양의 클로저다. drop/paste가 media 블록을 삽입한 직후 그 실제
  // 업로드를 트리거한다. 미지정이면 그 확장 자신의 기본값(no-op)을 쓴다.
  triggerMediaUpload?: (blockId: string, file: File) => void;
}): Editor => {
  const converted = modelToTiptap(options.document, {
    customBlockTypes: new Set(Object.keys(options.customBlocks ?? {})),
    customInlineContentTypes: new Set(
      Object.keys(options.customInlineContent ?? {}),
    ),
    customStyleTypes: new Set(Object.keys(options.customStyles ?? {})),
    ...(options.enabledBlockTypes === undefined
      ? {}
      : { enabledBlockTypes: options.enabledBlockTypes }),
  });
  if (!converted.ok) {
    throw new TypeError(
      converted.error.code === "DOCUMENT_INVALID"
        ? converted.error.message
        : converted.error.code,
    );
  }

  // 위 NESTABLE_BLOCK_CONTENT_TYPES 주석 참고 — BlockContainerExtension의
  // content 표현식이 참조할 수 있는 그룹만 남긴다.
  const hasNestableBlockContent = NESTABLE_BLOCK_CONTENT_TYPES.some((type) =>
    isBlockTypeEnabled(type, options.enabledBlockTypes),
  );
  const hasLeafBlockContent = isBlockTypeEnabled(
    "codeBlock",
    options.enabledBlockTypes,
  );
  const blockContainerContent =
    hasNestableBlockContent && hasLeafBlockContent
      ? "(nestableBlockContent blockGroup?) | leafBlockContent"
      : hasNestableBlockContent
        ? "nestableBlockContent blockGroup?"
        : hasLeafBlockContent
          ? "leafBlockContent"
          : undefined;

  let loadNormalizing = false;
  const editor = new Editor({
    element: null,
    content: converted.value as JSONContent,
    injectCSS: false,
    editable: options.editable ?? true,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        hardBreak: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
        paragraph: false,
        heading: false,
        link: {
          openOnClick: false,
          isAllowedUri: (url) => isSupportedLinkHref(url),
          shouldAutoLink: (url) => isSupportedLinkHref(url),
        },
        trailingNode: false,
      }),
      TextColorMark,
      BackgroundColorMark,
      // enabledBlockTypes(spec §4.4 EXT-004, RD-002-DELTA-12) — 각 block
      // type을 정의하는 "주 확장"만 조건부로 넣는다. input rule·keyboard·
      // marker 등 "보조 확장"(ListInputRuleExtension 등, 아래 그대로 무조건
      // 포함)은 이미 대상 노드가 스키마에 없으면(this.editor.schema.nodes.X
      // === undefined) 조용히 스킵하는 방어 코드를 갖고 있어(착수 전 실측,
      // block-type-input-rule-extension.ts 등) 추가 가드가 필요 없다.
      ...(isBlockTypeEnabled("paragraph", options.enabledBlockTypes)
        ? [ParagraphExtension]
        : []),
      ...(isBlockTypeEnabled("heading", options.enabledBlockTypes)
        ? [HeadingExtension]
        : []),
      ...(isBlockTypeEnabled("bulletListItem", options.enabledBlockTypes)
        ? [ProductionBulletListItemExtension]
        : []),
      ...(isBlockTypeEnabled("numberedListItem", options.enabledBlockTypes)
        ? [ProductionNumberedListItemExtension]
        : []),
      ...(isBlockTypeEnabled("checkListItem", options.enabledBlockTypes)
        ? [ProductionCheckListItemExtension]
        : []),
      ...(isBlockTypeEnabled("toggleListItem", options.enabledBlockTypes)
        ? [ProductionToggleListItemExtension]
        : []),
      ListInputRuleExtension,
      BlockTypeInputRuleExtension,
      ...(isBlockTypeEnabled("quote", options.enabledBlockTypes)
        ? [QuoteExtension]
        : []),
      ...(isBlockTypeEnabled("codeBlock", options.enabledBlockTypes)
        ? [CodeBlockExtension]
        : []),
      CodeBlockMarkGuardExtension,
      CodeBlockExitExtension,
      ...(blockContainerContent === undefined
        ? []
        : [BlockContainerExtension.extend({ content: blockContainerContent })]),
      BlockGroupExtension,
      BlockIdExtension.configure({ createId: options.createId }),
      BlockSplitExtension,
      BlockJoinExtension,
      // table 3종 노드(table/tableRow/tableCell)는 표 기능 하나를
      // 이루는 묶음이라 한 조건으로 함께 켜고 끈다.
      ...(isBlockTypeEnabled("table", options.enabledBlockTypes)
        ? [TableExtension, TableRowExtension, TableCellExtension]
        : []),
      ...(isBlockTypeEnabled("divider", options.enabledBlockTypes)
        ? [DividerExtension]
        : []),
      ...(isBlockTypeEnabled("file", options.enabledBlockTypes)
        ? [FileBlockExtension]
        : []),
      ...(isBlockTypeEnabled("image", options.enabledBlockTypes)
        ? [ImageBlockExtension]
        : []),
      ...(isBlockTypeEnabled("video", options.enabledBlockTypes)
        ? [VideoBlockExtension]
        : []),
      ...(isBlockTypeEnabled("audio", options.enabledBlockTypes)
        ? [AudioBlockExtension]
        : []),
      // registry(RD-002-DELTA-11, CreateEditorOptions.customBlocks)에
      // 등록된 타입마다 PM atom 노드 하나씩(customBlockEditor는 customBlocks가
      // 있을 때 항상 함께 온다 — session이 같은 options에서 파생).
      ...Object.entries(options.customBlocks ?? {}).map(([type, definition]) =>
        createCustomBlockExtension(
          type,
          definition,
          options.customBlockEditor as EditorController,
        ),
      ),
      // registry(RD-002-DELTA-18, CreateEditorOptions.customInlineContent)에
      // 등록된 타입마다 PM inline atom 노드 하나씩(customInlineContentEditor는
      // customInlineContent가 있을 때 항상 함께 온다 — customBlocks와 동일
      // 근거).
      ...Object.entries(options.customInlineContent ?? {}).map(
        ([type, definition]) =>
          createCustomInlineContentExtension(
            type,
            definition,
            options.customInlineContentEditor as EditorController,
          ),
      ),
      // registry(RD-002-DELTA-19, CreateEditorOptions.customStyles)에
      // 등록된 타입마다 PM Mark 하나씩 — editor 참조가 필요 없어
      // customBlocks/customInlineContent와 달리 지연 바인딩 Proxy가 없다.
      ...Object.entries(options.customStyles ?? {}).map(([type, definition]) =>
        createCustomStyleMark(type, definition),
      ),
      TableKeyboardNavigationExtension.configure({
        createId: options.createId,
      }),
      IndentKeyboardExtension,
      BlockTypeKeyboardExtension,
      BlockMoveKeyboardExtension.configure(
        options.getBlockSelection === undefined
          ? {}
          : { getBlockSelection: options.getBlockSelection },
      ),
      ListPresentationExtension,
      CheckListItemMarkerExtension,
      PlaceholderExtension,
      ToggleCollapseVisibilityExtension,
      ToggleCollapseMarkerExtension,
      TrailingBlockExtension,
      // ExtensionManager.plugins가 addProseMirrorPlugins 결과를
      // extensions 선언 순서의 "역순"으로 모아 우선순위를 매긴다(Tiptap
      // 3.30.1 sortExtensions([...extensions].reverse()) — 실측 확인,
      // RD-004 readiness probe). handlePaste는 그 순서대로 처음 true를
      // 반환하는 쪽에서 멈추므로, 실제 가로채기 우선순위는 선언 역순이다
      // — 아래에서 먼저 선언한 ClipboardPasteExtension이 실제로는 나중에
      // 시도된다(표가 먼저 자기 콘텐츠를 판정하고, 자기 것이 아니면
      // 넘겨서 이 확장이 표 아닌 나머지 전부를 받는다 — 목록도 이제 이
      // 확장이 io.importHtml로 직접 처리한다, RD-005).
      ClipboardPasteExtension.configure({ createId: options.createId }),
      TablePasteExtension.configure({
        createId: options.createId,
        ...(options.onPasteRejected === undefined
          ? {}
          : { onPasteRejected: options.onPasteRejected }),
      }),
      // TablePasteExtension보다 뒤(배열상 더 아래)에 선언해 선언 역순
      // 우선순위(위 주석)로 이 확장이 파일 존재 여부를 표보다 먼저
      // 판정하게 한다(D4 — 파일 > 표 > HTML > Markdown 감지 > plain text,
      // RD-002 readiness probe).
      MediaDropPasteExtension.configure({
        createId: options.createId,
        isUploadEnabled: options.isUploadEnabled ?? false,
        ...(options.triggerMediaUpload === undefined
          ? {}
          : { triggerMediaUpload: options.triggerMediaUpload }),
      }),
      LinkPolicyExtension,
      RevisionGuardExtension.configure({
        canApplyDocumentChange: (transaction) =>
          options.canApplyDocumentChange(transaction, loadNormalizing),
      }),
    ],
    onUpdate: ({ editor: updatedEditor }) => {
      if (!loadNormalizing) options.onUpdate(updatedEditor);
    },
    onMount: ({ editor: mountedEditor }) =>
      ensureTrailingParagraphOnLoad(mountedEditor),
    ...(options.onSelectionChange === undefined
      ? {}
      : { onSelectionUpdate: () => options.onSelectionChange?.() }),
  });

  loadNormalizing = true;
  try {
    editor.mount(globalThis.document.createElement("div"));
    editor.unmount();
  } finally {
    loadNormalizing = false;
  }
  return editor;
};
