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
  NumberedListItemExtension,
} from "./list-item-extension.js";
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
    return { level: { default: 1, rendered: false } };
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
      TrailingBlockExtension,
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
