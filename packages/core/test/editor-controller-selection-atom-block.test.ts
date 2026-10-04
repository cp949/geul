/**
 * EditorController.isAtomBlockSelected()가 텍스트 없는 atom 블록의
 * NodeSelection만 true로 보고하는지 실제 ProseMirror selection에서 검증한다.
 * UI(react 툴바)가 mark·색상 버튼 비활성과 FormattingToolbar·LinkToolbar
 * 닫힘 판정에 이 메서드를 소비한다(Issue #242).
 * 대상은 구분선·미디어·customBlock이다. 텍스트 선택·표 CellSelection·
 * 인라인 atom NodeSelection은 false다.
 */
import type { Document } from "@cp949/geul-model";
import { NodeSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import {
  createEditor,
  type CustomBlockDefinition,
  type MediaBlockKind,
} from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  dividerBlock,
  documentOf,
  editorWithTable,
  mediaBlock,
  mountTiptapEditor,
  paragraphBlock,
  paragraphDocument,
  selectBlockNode,
  tailParagraphBlock,
} from "./editor-controller-support.js";
import { selectCellRange } from "./table-test-support.js";

const MEDIA_KINDS: readonly MediaBlockKind[] = [
  "file",
  "image",
  "video",
  "audio",
  "iframe",
];

const widgetDefinition: CustomBlockDefinition = {
  render: ({ block }) => {
    const element = document.createElement("div");
    element.textContent = `widget:${block.id}`;
    return { element };
  },
};

const widgetDocument: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    { id: "block-1", type: "paragraph", content: [{ text: "seed" }] },
    { id: "widget-1", type: "myWidget", content: "none" },
  ],
};

describe("에디터 컨트롤러 선택 영역 atom 블록 조회", () => {
  it("구분선을 NodeSelection으로 선택하면 true를 보고한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(dividerBlock("d-1"), tailParagraphBlock),
    });
    const { tiptap } = mountTiptapEditor(editor);
    selectBlockNode(tiptap, "d-1");

    expect(editor.isAtomBlockSelected()).toBe(true);
  });

  it.each(MEDIA_KINDS)(
    "%s 미디어 블록을 NodeSelection으로 선택하면 true를 보고한다",
    (kind) => {
      const editor = createEditor({
        initialDocument: documentOf(
          mediaBlock(kind, "m-1"),
          tailParagraphBlock,
        ),
      });
      const { tiptap } = mountTiptapEditor(editor);
      selectBlockNode(tiptap, "m-1");

      expect(editor.isAtomBlockSelected()).toBe(true);
    },
  );

  it("customBlock을 NodeSelection으로 선택하면 true를 보고한다", () => {
    const editor = createEditor({
      initialDocument: widgetDocument,
      customBlocks: { myWidget: widgetDefinition },
    });
    const { tiptap } = mountTiptapEditor(editor);
    selectBlockNode(tiptap, "widget-1");

    expect(editor.isAtomBlockSelected()).toBe(true);
  });

  it("텍스트 caret이면 false를 보고한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-1") + 1);

    expect(editor.isAtomBlockSelected()).toBe(false);
  });

  it("텍스트 범위 선택이면 false를 보고한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        paragraphBlock("block-1", "first"),
        paragraphBlock("block-2", "second"),
      ),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({
      from: contentTextStart(tiptap, "block-1"),
      to: contentTextStart(tiptap, "block-2") + 2,
    });

    expect(editor.isAtomBlockSelected()).toBe(false);
  });

  it("표 셀 범위(CellSelection)면 false를 보고한다", () => {
    const { editor, cellIds } = editorWithTable(2, 2);
    const { tiptap } = mountTiptapEditor(editor);
    const [topLeft, , , bottomRight] = cellIds;
    selectCellRange(tiptap, topLeft, bottomRight);

    expect(editor.isAtomBlockSelected()).toBe(false);
  });

  it("인라인 atom을 NodeSelection으로 선택해도 false를 보고한다", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "block-1",
            type: "paragraph",
            content: [
              { text: "a" },
              { type: "custom", customType: "myTag" },
              { text: "b" },
            ],
          },
        ],
      },
      customInlineContent: {
        myTag: {
          render: () => document.createElement("span"),
        },
      },
    });
    const { tiptap } = mountTiptapEditor(editor);
    let inlineAtomPos: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (node.isInline && node.isAtom && !node.isText) inlineAtomPos = pos;
    });
    if (inlineAtomPos === null) throw new Error("인라인 atom 조회 실패");
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        NodeSelection.create(tiptap.state.doc, inlineAtomPos),
      ),
    );

    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.isAtomBlockSelected()).toBe(false);
  });

  it("destroy 이후에는 false를 보고한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(dividerBlock("d-1"), tailParagraphBlock),
    });
    const { tiptap } = mountTiptapEditor(editor);
    selectBlockNode(tiptap, "d-1");

    editor.destroy();

    expect(editor.isAtomBlockSelected()).toBe(false);
  });
});
