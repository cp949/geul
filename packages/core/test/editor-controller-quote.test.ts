/**
 * quote가 setBlockType(Turn into) 대상이고 caret·선택 컨텍스트가
 * {type:"quote"}를 보고하는지 고정한다(spec §4.2 — paragraph와 같은
 * content+children 계약). setBlockType은 성공(순환 변환·clearContent)·no-op
 * 거절(quote→quote, 히스토리 무흔적)·대상 거절(표)의 원자성을 각각
 * 단언한다(G-EDT-001). {type:"quote"} 수용은 typecheck 편입이 고정한다.
 * quote 스키마·DOM·변환기 왕복은 각자 파일 소유다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import {
  createEditor,
  type DocumentChangeEvent,
  type EditorController,
} from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  caretAt,
  childParagraphBlock,
  documentOf,
  editorState,
  editorWithTable,
  mountTiptapEditor,
  notApplicable,
  okResult,
  quoteBlock,
  restored,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";

/** 자식 딸린 문단 — 순환 변환의 출발 블록이자 각 단계 결과의 비교 기준. */
const parent: Block = {
  id: "block-1",
  type: "paragraph",
  content: [{ text: "parent" }],
  children: [childParagraphBlock],
};

describe("setBlockType quote 편입(Turn into 대상)", () => {
  it("paragraph→quote→heading→quote→paragraph 순환 변환이 content·children·id를 보존하고 각 단계가 undo 1회로 복원된다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: documentOf(parent, tailParagraphBlock),
      createId: sequentialIds("gen"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const steps: Array<
      Parameters<EditorController["commands"]["setBlockType"]>[1]
    > = [
      { type: "quote" },
      { type: "heading", level: 2 },
      { type: "quote" },
      { type: "paragraph" },
    ];

    // 단계마다 적용→undo→재적용이라 revision은 3씩 오른다.
    steps.forEach((step, index) => {
      const rev = index * 3;
      const before = editorState(editor, tiptap);
      changes.length = 0;
      expect(editor.commands.setBlockType("block-1", step)).toEqual(okResult);
      // 적용 직후 문서·selection·storedMarks·Tiptap doc을 한 번에 고정한다.
      const { tiptapDocument, ...applied } = editorState(editor, tiptap);
      // RD-003이 HeadingExtension에 isToggleable/collapsed(기본값 null)
      // attrs를 추가해 level 외 키가 실려 온다 — 이 단언은 level 보존만 본다.
      const contentMatcher =
        step.type === "heading"
          ? {
              type: "heading",
              attrs: expect.objectContaining({ level: step.level }),
            }
          : { type: step.type };
      expect(applied).toEqual({
        document: {
          ...before.document,
          revision: rev + 1,
          blocks: [{ ...parent, ...step }, tailParagraphBlock],
        },
        selection: caretAt(tiptap, "block-1"),
        storedMarks: null,
      });
      expect(tiptapDocument.content).toContainEqual(
        expect.objectContaining({
          type: "blockContainer",
          attrs: expect.objectContaining({ blockId: "block-1" }),
          content: expect.arrayContaining([
            expect.objectContaining(contentMatcher),
          ]),
        }),
      );
      expect(changes).toEqual([
        { revision: rev + 1, changedBlockIds: ["block-1"], reason: "local" },
      ]);
      expect(editor.commands.undo()).toEqual(okResult);
      expect(editorState(editor, tiptap)).toEqual(restored(before, rev + 2));
      expect(changes).toEqual([
        { revision: rev + 1, changedBlockIds: ["block-1"], reason: "local" },
        { revision: rev + 2, changedBlockIds: ["block-1"], reason: "undo" },
      ]);
      // 다음 단계의 출발 타입을 만들기 위해 같은 변환을 다시 적용한다.
      expect(editor.commands.setBlockType("block-1", step)).toEqual(okResult);
    });
  });

  it("clearContent 옵션이 quote 변환에서도 내용 비우기와 타입 변환을 한 undo 단위로 묶는다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: documentOf(
        { id: "block-1", type: "paragraph", content: [{ text: "/quote" }] },
        tailParagraphBlock,
      ),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const before = editorState(editor, tiptap);

    expect(
      editor.commands.setBlockType(
        "block-1",
        { type: "quote" },
        { clearContent: true },
      ),
    ).toEqual(okResult);
    // 적용 직후 문서·selection·storedMarks를 고정한다(tiptapDocument는 비교
    // 없이 제외).
    const clearedQuote: Block = { id: "block-1", type: "quote", content: [] };
    const applied = editorState(editor, tiptap);
    expect(applied.document).toEqual({
      ...before.document,
      revision: 1,
      blocks: [clearedQuote, tailParagraphBlock],
    });
    expect(applied.selection).toEqual(caretAt(tiptap, "block-1"));
    expect(applied.storedMarks).toBeNull();
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-1"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("quote→quote 재적용은 COMMAND_NOT_APPLICABLE이고 문서·revision 무변경이며 히스토리 항목을 남기지 않는다", () => {
    const changes: DocumentChangeEvent[] = [];
    const src: Block = { id: "b", type: "paragraph", content: [{ text: "q" }] };
    const editor = createEditor({
      initialDocument: documentOf(src, tailParagraphBlock),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    expect(editor.commands.setBlockType("b", { type: "quote" })).toEqual(
      okResult,
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.setBlockType("b", { type: "quote" })).toEqual(
      notApplicable("setBlockType"),
    );
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toHaveLength(1);
    // 거절이 no-op 트랜잭션을 히스토리에 남겼다면 이 undo가 그것을 삼킨다.
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks[0]).toEqual(src);
  });

  it("표 블록 대상 setBlockType(quote)은 COMMAND_NOT_APPLICABLE로 거절된다", () => {
    const { editor, tableBlockId } = editorWithTable();
    const { tiptap } = mountTiptapEditor(editor);
    // editorWithTable은 onChange가 없다 — 무변경은 revision 포함 editorState로
    // 본다.
    const before = editorState(editor, tiptap);

    expect(
      editor.commands.setBlockType(tableBlockId, { type: "quote" }),
    ).toEqual(notApplicable("setBlockType"));
    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("자식 딸린 quote의 setBlockType(paragraph)이 자식 귀속을 바꾸지 않는다", () => {
    const quoteWithChild = quoteBlock("quote-1", "q", [childParagraphBlock]);
    const editor = createEditor({
      initialDocument: documentOf(quoteWithChild, tailParagraphBlock),
    });
    mountTiptapEditor(editor);

    expect(
      editor.commands.setBlockType("quote-1", { type: "paragraph" }),
    ).toEqual(okResult);
    // 타입만 바뀌고 id·content·children은 quote fixture 그대로다.
    expect(editor.getDocument().blocks).toEqual([
      { ...quoteWithChild, type: "paragraph" },
      tailParagraphBlock,
    ]);
  });
});

describe("caret·선택 컨텍스트의 quote 보고", () => {
  const quoteDocument = () =>
    documentOf(quoteBlock("quote-1", "quote text"), tailParagraphBlock);

  it("quote 안 캐럿에서 getCaretBlockContext가 {type:'quote'}와 blockId·text를 보고한다", () => {
    const editor = createEditor({ initialDocument: quoteDocument() });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "quote-1"));

    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "quote-1",
      blockType: { type: "quote" },
      text: "quote text",
    });
  });

  it("quote 안 범위 선택에서 getSelectionBlockType이 {type:'quote'}를 보고한다", () => {
    const editor = createEditor({ initialDocument: quoteDocument() });
    const { tiptap } = mountTiptapEditor(editor);
    const start = contentTextStart(tiptap, "quote-1");
    tiptap.commands.setTextSelection({ from: start, to: start + 3 });

    expect(editor.getSelectionBlockType()).toEqual({
      blockId: "quote-1",
      blockType: { type: "quote" },
    });
  });
});
