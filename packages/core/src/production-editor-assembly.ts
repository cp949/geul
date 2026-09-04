import type { Document as BlockDocument, IdFactory } from "@cp949/geul-model";
import { isSupportedLinkHref } from "@cp949/geul-model";
import { Editor, mergeAttributes, Node, type JSONContent } from "@tiptap/core";
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
import { DividerExtension } from "./divider-extension.js";
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
import { modelToTiptap } from "./model-to-tiptap.js";
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
import { ToggleCollapseMarkerExtension } from "./toggle-collapse-marker-extension.js";
import { ToggleCollapseVisibilityExtension } from "./toggle-collapse-visibility-extension.js";
import {
  ensureTrailingParagraphOnLoad,
  TrailingBlockExtension,
} from "./trailing-block-extension.js";

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
  canApplyDocumentChange: () => boolean;
  // BlockMoveKeyboardExtension 전용 — production-editor-session.ts의
  // ProductionEditorSession.getBlockSelection과 구조가 같지만 import하지
  // 않는다(그 파일의 순환 의존 회피 관례, block-move-keyboard-extension.ts
  // 참고). 미지정이면 그 확장 자신의 기본값(항상 null)을 쓴다.
  getBlockSelection?: () => { fromBlockId: string; toBlockId: string } | null;
}): Editor => {
  const converted = modelToTiptap(options.document);
  if (!converted.ok) {
    throw new TypeError(
      converted.error.code === "DOCUMENT_INVALID"
        ? converted.error.message
        : converted.error.code,
    );
  }

  let loadNormalizing = false;
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
      ParagraphExtension,
      HeadingExtension,
      ProductionBulletListItemExtension,
      ProductionNumberedListItemExtension,
      ProductionCheckListItemExtension,
      ProductionToggleListItemExtension,
      ListInputRuleExtension,
      BlockTypeInputRuleExtension,
      QuoteExtension,
      CodeBlockExtension,
      CodeBlockMarkGuardExtension,
      CodeBlockExitExtension,
      BlockContainerExtension,
      BlockGroupExtension,
      BlockIdExtension.configure({ createId: options.createId }),
      BlockSplitExtension,
      BlockJoinExtension,
      TableExtension,
      TableRowExtension,
      TableCellExtension,
      DividerExtension,
      FileBlockExtension,
      ImageBlockExtension,
      VideoBlockExtension,
      AudioBlockExtension,
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
      LinkPolicyExtension,
      RevisionGuardExtension.configure({
        canApplyDocumentChange: options.canApplyDocumentChange,
      }),
    ],
    onUpdate: ({ editor: updatedEditor }) => {
      if (!loadNormalizing) options.onUpdate(updatedEditor);
    },
    onMount: ({ editor: mountedEditor }) =>
      ensureTrailingParagraphOnLoad(mountedEditor),
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
