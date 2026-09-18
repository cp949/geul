/**
 * callout이 setBlockType(Turn into) 대상이고 caret·선택 컨텍스트가
 * {type:"callout"}를 보고하는지 고정한다(Issue #209 RD-002 DELTA-01,
 * editor-controller-quote.test.ts와 동형 — paragraph와 같은 content+children
 * 계약). setBlockType은 성공(순환 변환·clearContent)·no-op 거절(callout→
 * callout, 히스토리 무흔적)·대상 거절(표)의 원자성을 각각 단언한다
 * (G-EDT-001). callout 스키마·codec 왕복은 각자 파일 소유다.
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
  calloutBlock,
  caretAt,
  childParagraphBlock,
  documentOf,
  editorState,
  editorWithTable,
  mountTiptapEditor,
  notApplicable,
  okResult,
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

describe("setBlockType callout 편입(Turn into 대상)", () => {
  it("paragraph→callout→heading→callout→paragraph 순환 변환이 content·children·id를 보존하고 각 단계가 undo 1회로 복원된다", () => {
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
      { type: "callout" },
      { type: "heading", level: 2 },
      { type: "callout" },
      { type: "paragraph" },
    ];

    // 단계마다 적용→undo→재적용이라 revision은 3씩 오른다.
    steps.forEach((step, index) => {
      const rev = index * 3;
      const before = editorState(editor, tiptap);
      changes.length = 0;
      expect(editor.commands.setBlockType("block-1", step)).toEqual(okResult);
      const { tiptapDocument, ...applied } = editorState(editor, tiptap);
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

  it("clearContent 옵션이 callout 변환에서도 내용 비우기와 타입 변환을 한 undo 단위로 묶는다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: documentOf(
        { id: "block-1", type: "paragraph", content: [{ text: "/callout" }] },
        tailParagraphBlock,
      ),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const before = editorState(editor, tiptap);

    expect(
      editor.commands.setBlockType(
        "block-1",
        { type: "callout" },
        { clearContent: true },
      ),
    ).toEqual(okResult);
    const clearedCallout: Block = {
      id: "block-1",
      type: "callout",
      content: [],
    };
    const applied = editorState(editor, tiptap);
    expect(applied.document).toEqual({
      ...before.document,
      revision: 1,
      blocks: [clearedCallout, tailParagraphBlock],
    });
    expect(applied.selection).toEqual(caretAt(tiptap, "block-1"));
    expect(applied.storedMarks).toBeNull();
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-1"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("callout→callout 재적용은 COMMAND_NOT_APPLICABLE이고 문서·revision 무변경이며 히스토리 항목을 남기지 않는다", () => {
    const changes: DocumentChangeEvent[] = [];
    const src: Block = { id: "b", type: "paragraph", content: [{ text: "c" }] };
    const editor = createEditor({
      initialDocument: documentOf(src, tailParagraphBlock),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    expect(editor.commands.setBlockType("b", { type: "callout" })).toEqual(
      okResult,
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.setBlockType("b", { type: "callout" })).toEqual(
      notApplicable("setBlockType"),
    );
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toHaveLength(1);
    // 거절이 no-op 트랜잭션을 히스토리에 남겼다면 이 undo가 그것을 삼킨다.
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks[0]).toEqual(src);
  });

  it("표 블록 대상 setBlockType(callout)은 COMMAND_NOT_APPLICABLE로 거절된다", () => {
    const { editor, tableBlockId } = editorWithTable();
    const { tiptap } = mountTiptapEditor(editor);
    const before = editorState(editor, tiptap);

    expect(
      editor.commands.setBlockType(tableBlockId, { type: "callout" }),
    ).toEqual(notApplicable("setBlockType"));
    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("자식 딸린 callout의 setBlockType(paragraph)이 자식 귀속을 바꾸지 않는다", () => {
    const calloutWithChild = calloutBlock("callout-1", "c", undefined, [
      childParagraphBlock,
    ]);
    const editor = createEditor({
      initialDocument: documentOf(calloutWithChild, tailParagraphBlock),
    });
    mountTiptapEditor(editor);

    expect(
      editor.commands.setBlockType("callout-1", { type: "paragraph" }),
    ).toEqual(okResult);
    // 타입만 바뀌고 id·content·children은 callout fixture 그대로다.
    expect(editor.getDocument().blocks).toEqual([
      { ...calloutWithChild, type: "paragraph" },
      tailParagraphBlock,
    ]);
  });
});

describe("caret·선택 컨텍스트의 callout 보고", () => {
  const calloutDocument = () =>
    documentOf(calloutBlock("callout-1", "callout text"), tailParagraphBlock);

  it("callout 안 캐럿에서 getCaretBlockContext가 {type:'callout'}와 blockId·text를 보고한다", () => {
    const editor = createEditor({ initialDocument: calloutDocument() });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "callout-1"));

    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "callout-1",
      blockType: { type: "callout" },
      text: "callout text",
    });
  });

  it("callout 안 범위 선택에서 getSelectionBlockType이 {type:'callout'}를 보고한다", () => {
    const editor = createEditor({ initialDocument: calloutDocument() });
    const { tiptap } = mountTiptapEditor(editor);
    const start = contentTextStart(tiptap, "callout-1");
    tiptap.commands.setTextSelection({ from: start, to: start + 3 });

    expect(editor.getSelectionBlockType()).toEqual({
      blockId: "callout-1",
      blockType: { type: "callout" },
    });
  });
});
