import type { Document, InlineContent } from "@cp949/geul-model";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 revision과 변경 이벤트", () => {
  it("revision을 증가시키고 변경된 블록 id를 보고한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.setText("block-1", "after")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().revision).toBe(1);
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1"],
        reason: "local",
      },
    ]);
  });

  it("공개 명령 하나를 한 번의 변경으로 되돌린다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
    });
    editor.commands.setText("block-1", "after");

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toMatchObject({
      revision: 2,
      blocks: [{ content: [{ text: "before" }] }],
    });
  });

  it("가져온 초기 revision에서 로컬 revision을 시작한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before", 7),
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.setText("block-1", "after")).toMatchObject({
      ok: true,
    });
    expect(editor.getDocument().revision).toBe(8);
    expect(changes).toEqual([
      {
        revision: 8,
        changedBlockIds: ["block-1"],
        reason: "local",
      },
    ]);
  });

  it("연속된 공개 명령을 별도의 undo 단위로 유지한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
    });

    editor.commands.setText("block-1", "middle");
    editor.commands.setText("block-1", "after");
    expect(editor.commands.undo()).toMatchObject({ ok: true });

    expect(editor.getDocument()).toMatchObject({
      revision: 3,
      blocks: [{ content: [{ text: "middle" }] }],
    });
  });

  it("undo와 redo마다 revision을 하나씩 발행한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
      onChange: (event) => changes.push(event),
    });

    editor.commands.setText("block-1", "after");
    expect(editor.commands.undo()).toMatchObject({ ok: true });
    expect(editor.commands.redo()).toMatchObject({ ok: true });

    expect(editor.getDocument()).toMatchObject({
      revision: 3,
      blocks: [{ content: [{ text: "after" }] }],
    });
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1"],
        reason: "local",
      },
      {
        revision: 2,
        changedBlockIds: ["block-1"],
        reason: "undo",
      },
      {
        revision: 3,
        changedBlockIds: ["block-1"],
        reason: "redo",
      },
    ]);
  });

  it("문서 교체 시 가져온 revision을 무시하고 히스토리를 비운다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before", 4),
      onChange: (event) => changes.push(event),
    });
    editor.commands.setText("block-1", "edited");

    expect(
      editor.replaceDocument(paragraphDocument("replacement", 99)),
    ).toEqual({ ok: true, value: undefined });

    expect(editor.getDocument()).toMatchObject({
      revision: 6,
      blocks: [{ content: [{ text: "replacement" }] }],
    });
    expect(editor.commands.undo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
    expect(changes.at(-1)).toEqual({
      revision: 6,
      changedBlockIds: ["block-1"],
      reason: "replace",
    });
  });

  it("문서 교체 시 순서가 바뀐 블록을 변경으로 보고한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const initial: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
        { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
      ],
    };
    const editor = createEditor({
      initialDocument: initial,
      onChange: (event) => changes.push(event),
    });

    expect(
      editor.replaceDocument({
        ...initial,
        blocks: [initial.blocks[1], initial.blocks[0]],
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-2",
      "block-1",
    ]);
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1", "block-2"],
        reason: "replace",
      },
    ]);
  });

  it("실패한 명령과 no-op 명령에는 이벤트를 발행하지 않고 revision도 올리지 않는다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("same"),
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.setText("block-1", "same")).toMatchObject({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setText" },
    });
    expect(editor.commands.undo()).toMatchObject({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
    expect(editor.commands.setText("missing", "changed")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(
      editor.replaceDocument(paragraphDocument("same", 100)),
    ).toMatchObject({
      ok: false,
      error: {
        code: "COMMAND_NOT_APPLICABLE",
        command: "replaceDocument",
      },
    });
    expect(editor.getDocument().revision).toBe(0);
    expect(changes).toEqual([]);
  });

  it("다른 블록을 편집해도 정규 mark 블록이 변경되었다고 보고하지 않는다", () => {
    const changes: DocumentChangeEvent[] = [];
    const canonicalMarks: InlineContent = [
      {
        text: "marked",
        marks: [
          { type: "link", href: "https://example.com" },
          { type: "bold" },
          { type: "code" },
          { type: "italic" },
          { type: "strike" },
          { type: "underline" },
        ],
      },
    ];
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "marked", type: "paragraph", content: canonicalMarks },
          {
            id: "target",
            type: "paragraph",
            content: [{ text: "before" }],
          },
        ],
      },
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.setText("target", "after")).toMatchObject({
      ok: true,
    });
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["target"],
        reason: "local",
      },
    ]);
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "marked",
      type: "paragraph",
      content: canonicalMarks,
    });
  });

  it("최대 revision에서 setText를 변경 전에 거부한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const initial = paragraphDocument("before", Number.MAX_SAFE_INTEGER);
    const editor = createEditor({
      initialDocument: initial,
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);
    const selectionBefore = tiptap.state.selection.toJSON();

    expect(editor.commands.setText("block-1", "after")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setText" },
    });
    expect(editor.getDocument()).toEqual(initial);
    expect(tiptap.state.doc.textContent).toBe("before");
    expect(tiptap.state.selection.toJSON()).toEqual(selectionBefore);
    expect(changes).toEqual([]);
  });

  it("최대 revision에서 DOM 트랜잭션을 문서와 선택 영역 변경 전에 걸러낸다", () => {
    const changes: DocumentChangeEvent[] = [];
    const initial = paragraphDocument("before", Number.MAX_SAFE_INTEGER);
    const editor = createEditor({
      initialDocument: initial,
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(2);
    const selectionBefore = tiptap.state.selection.toJSON();
    const transaction = tiptap.state.tr.insertText("X", 2);
    transaction.setSelection(TextSelection.create(transaction.doc, 3));

    expect(() => tiptap.view.dispatch(transaction)).not.toThrow();
    expect(editor.getDocument()).toEqual(initial);
    expect(tiptap.state.doc.textContent).toBe("before");
    expect(tiptap.state.selection.toJSON()).toEqual(selectionBefore);
    expect(changes).toEqual([]);
  });

  it("최대 revision에서 문서 교체를 변경 전에 거부한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const initial = paragraphDocument("before", Number.MAX_SAFE_INTEGER);
    const editor = createEditor({
      initialDocument: initial,
      onChange: (event) => changes.push(event),
    });

    expect(editor.replaceDocument(paragraphDocument("replacement"))).toEqual({
      ok: false,
      error: {
        code: "COMMAND_NOT_APPLICABLE",
        command: "replaceDocument",
      },
    });
    expect(editor.getDocument()).toEqual(initial);
    expect(changes).toEqual([]);
  });

  it("직전 명령이 최대 revision에 도달하면 undo를 거부한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before", Number.MAX_SAFE_INTEGER - 1),
      onChange: (event) => changes.push(event),
    });
    expect(editor.commands.setText("block-1", "after")).toMatchObject({
      ok: true,
    });

    expect(editor.commands.undo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
    expect(editor.getDocument()).toEqual(
      paragraphDocument("after", Number.MAX_SAFE_INTEGER),
    );
    expect(changes).toHaveLength(1);
  });

  it("undo가 최대 revision에 도달하면 redo를 거부한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before", Number.MAX_SAFE_INTEGER - 2),
      onChange: (event) => changes.push(event),
    });
    editor.commands.setText("block-1", "after");
    expect(editor.commands.undo()).toMatchObject({ ok: true });

    expect(editor.commands.redo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "redo" },
    });
    expect(editor.getDocument()).toEqual(
      paragraphDocument("before", Number.MAX_SAFE_INTEGER),
    );
    expect(changes).toHaveLength(2);
  });

  it("방어적으로 복사한 문서를 반환한다", () => {
    const initial = paragraphDocument("original");
    const editor = createEditor({ initialDocument: initial });

    const inputBlock = initial.blocks[0];
    const inputItem =
      inputBlock?.type === "paragraph" ? inputBlock.content[0] : undefined;
    if (inputItem !== undefined) inputItem.text = "input";
    const returned = editor.getDocument();
    const returnedBlock = returned.blocks[0];
    const returnedItem =
      returnedBlock?.type === "paragraph"
        ? returnedBlock.content[0]
        : undefined;
    if (returnedItem !== undefined) returnedItem.text = "returned";

    expect(editor.getDocument()).toEqual(paragraphDocument("original"));
  });

  it("커밋 이후에도 방어적으로 복사한 문서를 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
    });

    expect(editor.commands.setText("block-1", "after")).toEqual({
      ok: true,
      value: undefined,
    });

    const returned = editor.getDocument();
    const returnedBlock = returned.blocks[0];
    const returnedItem =
      returnedBlock?.type === "paragraph"
        ? returnedBlock.content[0]
        : undefined;
    if (returnedItem !== undefined) returnedItem.text = "mutated";

    expect(editor.getDocument()).toEqual(paragraphDocument("after", 1));
  });

  it("destroy 이후 변경 명령이 구조적으로 실패한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("kept"),
      onChange: (event) => changes.push(event),
    });
    editor.destroy();

    expect(editor.commands.setText("block-1", "changed")).toMatchObject({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setText" },
    });
    expect(editor.commands.undo()).toMatchObject({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
    expect(editor.commands.redo()).toMatchObject({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "redo" },
    });
    expect(
      editor.replaceDocument(paragraphDocument("replacement")),
    ).toMatchObject({
      ok: false,
      error: {
        code: "COMMAND_NOT_APPLICABLE",
        command: "replaceDocument",
      },
    });
    expect(editor.getDocument()).toEqual(paragraphDocument("kept"));
    expect(changes).toEqual([]);
  });

  it("블록 id를 렌더하고 마운트 사이클 사이에서 유지한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const firstContainer = document.createElement("div");
    const secondContainer = document.createElement("div");

    editor.mount(firstContainer);
    expect(
      firstContainer.querySelector("p")?.getAttribute("data-be-block-id"),
    ).toBe("block-1");
    editor.unmount();
    editor.mount(secondContainer);

    expect(
      secondContainer.querySelector("p")?.getAttribute("data-be-block-id"),
    ).toBe("block-1");
    expect(editor.getDocument().blocks[0]?.id).toBe("block-1");
  });
});
