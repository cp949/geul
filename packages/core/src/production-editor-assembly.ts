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
import { BlockSplitExtension } from "./block-split-extension.js";
import { CodeBlockExtension } from "./code-block-extension.js";
import { CodeBlockMarkGuardExtension } from "./code-block-mark-guard-extension.js";
import { DividerExtension } from "./divider-extension.js";
import { IndentKeyboardExtension } from "./indent-keyboard-extension.js";
import { LinkPolicyExtension } from "./link-policy-extension.js";
import { ListPresentationExtension } from "./list-presentation-extension.js";
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
import type { PasteRejectedReason } from "./table-command-error.js";
import {
  TableCellExtension,
  TableExtension,
  TableRowExtension,
} from "./table-extension.js";
import { TableKeyboardNavigationExtension } from "./table-keyboard-extension.js";
import { TablePasteExtension } from "./table-paste-extension.js";
import { ListPasteFallbackExtension } from "./list-paste-fallback-extension.js";
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
// 않는다. 모델의 startNumber는 PM attr에만 보존한다.
//
// 외부 ul/ol 붙여넣기(DELTA-03, Issue #143 (c))도 이 parseHTML 부재를
// 바꾸지 않는다 — list-paste-fallback-extension.ts가 clipboard HTML을
// 직접 파싱해 blockContainer/blockGroup JSON을 조립하고
// editor.commands.insertContent로 꽂는다(TablePasteExtension과 같은
// handlePaste 가로채기 패턴). 실측 결과 표준 parseHTML(findWrapping 기반
// 자동 래핑)로는 중첩 목록에서 blockGroup 2단 래핑을 만들 수 없다 —
// ContentMatch.findWrapping이 항상 최단 경로(최상위 1단 래핑, 즉 평탄화)
// 를 우선해 중첩이 사라진다. 자세한 근거는 그 파일의 상단 주석 참고.
const ProductionBulletListItemExtension = BulletListItemExtension.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-be-bullet-list-item": "" }),
      0,
    ];
  },
});

const ProductionNumberedListItemExtension = NumberedListItemExtension.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-be-numbered-list-item": "" }),
      0,
    ];
  },
});

// checked 시각 표시(체크박스 아이콘·클릭 UI)는 이 DELTA 범위가 아니다 —
// 저장 계층만 완성한다(RD-001 DELTA-02, 그릴링 결정). rendered: false라
// checked는 이 wrapper div의 DOM 속성으로 투영되지 않는다.
const ProductionCheckListItemExtension = CheckListItemExtension.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-be-check-list-item": "" }),
      0,
    ];
  },
});

const ProductionToggleListItemExtension = ToggleListItemExtension.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-be-toggle-list-item": "" }),
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
      ParagraphExtension,
      HeadingExtension,
      ProductionBulletListItemExtension,
      ProductionNumberedListItemExtension,
      ProductionCheckListItemExtension,
      ProductionToggleListItemExtension,
      ListInputRuleExtension,
      QuoteExtension,
      CodeBlockExtension,
      CodeBlockMarkGuardExtension,
      BlockContainerExtension,
      BlockGroupExtension,
      BlockIdExtension.configure({ createId: options.createId }),
      BlockSplitExtension,
      BlockJoinExtension,
      TableExtension,
      TableRowExtension,
      TableCellExtension,
      DividerExtension,
      TableKeyboardNavigationExtension.configure({
        createId: options.createId,
      }),
      IndentKeyboardExtension,
      ListPresentationExtension,
      PlaceholderExtension,
      ToggleCollapseVisibilityExtension,
      TrailingBlockExtension,
      TablePasteExtension.configure({
        createId: options.createId,
        ...(options.onPasteRejected === undefined
          ? {}
          : { onPasteRejected: options.onPasteRejected }),
      }),
      ListPasteFallbackExtension.configure({ createId: options.createId }),
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
