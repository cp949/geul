import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  documentWithContent,
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 블록 명령", () => {
  describe("블록 삽입", () => {
    it("마운트된 에디터로 만든 블록에 주입한 id를 부여한다", () => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        createId: () => "block-2",
        onChange: (event) => changes.push(event),
      });
      const container = document.createElement("div");
      editor.mount(container);
      const editable = container.querySelector<HTMLElement>(
        "[contenteditable='true']",
      );

      expect(editable).not.toBeNull();
      editable?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );

      expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
        "block-1",
        "block-2",
      ]);
      expect(changes).toEqual([
        {
          revision: 1,
          changedBlockIds: ["block-1", "block-2"],
          reason: "local",
        },
      ]);
    });

    it("지정한 블록 뒤에 빈 문단을 삽입하고 그 id를 반환한다", () => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        createId: () => "block-2",
        onChange: (event) => changes.push(event),
      });

      expect(editor.commands.insertParagraphAfter("block-1")).toEqual({
        ok: true,
        value: { blockId: "block-2" },
      });
      expect(editor.getDocument()).toMatchObject({
        revision: 1,
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "content" }] },
          { id: "block-2", type: "paragraph", content: [] },
        ],
      });
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["block-2"], reason: "local" },
      ]);
    });

    it("새로 삽입한 문단으로 선택 영역을 이동한다", () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        createId: () => "block-2",
      });
      const { tiptap } = mountTiptapEditor(editor);

      editor.commands.insertParagraphAfter("block-1");

      let newBlockPosition: number | null = null;
      tiptap.state.doc.forEach((node, offset) => {
        if (node.attrs.blockId === "block-2") newBlockPosition = offset;
      });
      expect(newBlockPosition).not.toBeNull();
      expect(tiptap.state.selection.from).toBe((newBlockPosition ?? 0) + 1);
    });

    it("insertParagraphAfter를 한 번의 undo로 복원한다", () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
      });
      editor.commands.insertParagraphAfter("block-1");

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument()).toMatchObject({
        revision: 2,
        blocks: [{ id: "block-1", content: [{ text: "content" }] }],
      });
    });

    it("알 수 없는 블록 id에 대해 insertParagraphAfter가 BLOCK_NOT_FOUND를 반환한다", () => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        onChange: (event) => changes.push(event),
      });

      expect(editor.commands.insertParagraphAfter("missing")).toEqual({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
      });
      expect(changes).toEqual([]);
    });
  });

  describe("블록 타입 변경", () => {
    it("문단을 제목으로 바꾸면서 내용과 블록 id를 보존한다", () => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        onChange: (event) => changes.push(event),
      });

      expect(
        editor.commands.setBlockType("block-1", { type: "heading", level: 2 }),
      ).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument()).toMatchObject({
        revision: 1,
        blocks: [
          {
            id: "block-1",
            type: "heading",
            level: 2,
            content: [{ text: "content" }],
          },
        ],
      });
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["block-1"], reason: "local" },
      ]);
    });

    it("제목을 문단으로 되돌리면서 내용을 보존한다", () => {
      const editor = createEditor({
        initialDocument: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "block-1",
              type: "heading",
              level: 1,
              content: [{ text: "title" }],
            },
          ],
        },
      });

      expect(
        editor.commands.setBlockType("block-1", { type: "paragraph" }),
      ).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument()).toMatchObject({
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "title" }] },
        ],
      });
    });

    it("setBlockType을 한 번의 undo로 복원한다", () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
      });
      editor.commands.setBlockType("block-1", { type: "heading", level: 1 });

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument()).toMatchObject({
        revision: 2,
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "content" }] },
        ],
      });
    });

    it("clearContent를 지정하면 타입을 바꾸면서 내용을 비운다", () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("/heading"),
      });

      expect(
        editor.commands.setBlockType(
          "block-1",
          { type: "heading", level: 1 },
          { clearContent: true },
        ),
      ).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument()).toMatchObject({
        blocks: [{ id: "block-1", type: "heading", level: 1, content: [] }],
      });
    });

    it("clearContent를 지정하면 내용 비우기와 타입 변환이 한 번의 undo 단위가 된다", () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("/heading"),
      });
      editor.commands.setBlockType(
        "block-1",
        { type: "heading", level: 1 },
        { clearContent: true },
      );

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument()).toMatchObject({
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "/heading" }] },
        ],
      });
    });

    it("같은 타입으로 setBlockType하면 COMMAND_NOT_APPLICABLE을 반환한다", () => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        onChange: (event) => changes.push(event),
      });

      expect(
        editor.commands.setBlockType("block-1", { type: "paragraph" }),
      ).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "setBlockType" },
      });
      expect(changes).toEqual([]);
    });

    it("알 수 없는 블록 id에 대해 setBlockType이 BLOCK_NOT_FOUND를 반환한다", () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
      });

      expect(
        editor.commands.setBlockType("missing", { type: "paragraph" }),
      ).toEqual({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
      });
    });
  });

  describe("블록 이동", () => {
    it("지정한 대상 블록 앞으로 블록을 이동한다", () => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
            { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
            { id: "block-3", type: "paragraph", content: [{ text: "three" }] },
          ],
        },
        onChange: (event) => changes.push(event),
      });

      expect(editor.commands.moveBlockBefore("block-3", "block-1")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
        "block-3",
        "block-1",
        "block-2",
      ]);
      expect(changes).toEqual([
        {
          revision: 1,
          changedBlockIds: ["block-1", "block-2", "block-3"],
          reason: "local",
        },
      ]);
    });

    it("beforeBlockId가 null이면 블록을 문서 끝으로 이동한다", () => {
      const editor = createEditor({
        initialDocument: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
            { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
            { id: "block-3", type: "paragraph", content: [{ text: "three" }] },
          ],
        },
      });

      expect(editor.commands.moveBlockBefore("block-1", null)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
        "block-2",
        "block-3",
        "block-1",
      ]);
    });

    it("moveBlockBefore를 한 번의 undo로 복원한다", () => {
      const editor = createEditor({
        initialDocument: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
            { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
          ],
        },
      });
      editor.commands.moveBlockBefore("block-2", "block-1");

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
        "block-1",
        "block-2",
      ]);
    });

    it("이동해도 순서가 바뀌지 않으면 COMMAND_NOT_APPLICABLE을 반환한다", () => {
      const editor = createEditor({
        initialDocument: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
            { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
          ],
        },
      });

      expect(editor.commands.moveBlockBefore("block-1", "block-2")).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlockBefore" },
      });
      expect(editor.commands.moveBlockBefore("block-2", null)).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlockBefore" },
      });
    });

    it("자기 자신 앞으로 이동하면 COMMAND_NOT_APPLICABLE을 반환한다", () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
      });

      expect(editor.commands.moveBlockBefore("block-1", "block-1")).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlockBefore" },
      });
    });

    it("알 수 없는 blockId에 대해 moveBlockBefore가 BLOCK_NOT_FOUND를 반환한다", () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
      });

      expect(editor.commands.moveBlockBefore("missing", null)).toEqual({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
      });
    });

    it("알 수 없는 beforeBlockId에 대해 moveBlockBefore가 BLOCK_NOT_FOUND를 반환한다", () => {
      const editor = createEditor({
        initialDocument: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
            { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
          ],
        },
      });

      expect(editor.commands.moveBlockBefore("block-1", "missing")).toEqual({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
      });
    });
  });

  describe("블록 복제", () => {
    it("블록을 원본 바로 다음에 복제하고 새 블록 id를 반환한다", () => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        createId: () => "block-2",
        onChange: (event) => changes.push(event),
      });

      expect(editor.commands.duplicateBlock("block-1")).toEqual({
        ok: true,
        value: { blockId: "block-2" },
      });
      expect(editor.getDocument()).toMatchObject({
        revision: 1,
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "content" }] },
          { id: "block-2", type: "paragraph", content: [{ text: "content" }] },
        ],
      });
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["block-2"], reason: "local" },
      ]);
    });

    it("복제된 블록에 텍스트와 mark를 그대로 복사한다", () => {
      const editor = createEditor({
        initialDocument: documentWithContent([
          { text: "bold text", marks: [{ type: "bold" }] },
        ]),
        createId: () => "block-2",
      });

      editor.commands.duplicateBlock("block-1");

      expect(editor.getDocument().blocks[1]).toMatchObject({
        id: "block-2",
        type: "paragraph",
        content: [{ text: "bold text", marks: [{ type: "bold" }] }],
      });
    });

    it("제목 블록을 복제하면 heading level을 보존한다", () => {
      const editor = createEditor({
        initialDocument: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "block-1",
              type: "heading",
              level: 2,
              content: [{ text: "title" }],
            },
          ],
        },
        createId: () => "block-2",
      });

      editor.commands.duplicateBlock("block-1");

      expect(editor.getDocument().blocks[1]).toMatchObject({
        id: "block-2",
        type: "heading",
        level: 2,
        content: [{ text: "title" }],
      });
    });

    it("복제 후 커서를 복제본 내용의 끝으로 이동한다", () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        createId: () => "block-2",
      });
      const { tiptap } = mountTiptapEditor(editor);

      editor.commands.duplicateBlock("block-1");

      let newBlockPosition: number | null = null;
      tiptap.state.doc.forEach((node, offset) => {
        if (node.attrs.blockId === "block-2") newBlockPosition = offset;
      });
      expect(newBlockPosition).not.toBeNull();
      const newBlockNode = tiptap.state.doc.nodeAt(newBlockPosition ?? 0);
      expect(newBlockNode).not.toBeNull();
      expect(tiptap.state.selection.from).toBe(
        (newBlockPosition ?? 0) + (newBlockNode?.nodeSize ?? 0) - 1,
      );
    });

    it("duplicateBlock을 한 번의 undo로 복원한다", () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
      });
      editor.commands.duplicateBlock("block-1");

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument()).toMatchObject({
        revision: 2,
        blocks: [{ id: "block-1", content: [{ text: "content" }] }],
      });
    });

    it("알 수 없는 블록 id에 대해 duplicateBlock이 BLOCK_NOT_FOUND를 반환한다", () => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        onChange: (event) => changes.push(event),
      });

      expect(editor.commands.duplicateBlock("missing")).toEqual({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
      });
      expect(changes).toEqual([]);
    });
  });

  describe("블록 삭제", () => {
    it("블록을 삭제한다", () => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
            { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
          ],
        },
        onChange: (event) => changes.push(event),
      });

      expect(editor.commands.deleteBlock("block-1")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument()).toMatchObject({
        revision: 1,
        blocks: [{ id: "block-2", content: [{ text: "two" }] }],
      });
      expect(changes).toEqual([
        {
          revision: 1,
          changedBlockIds: ["block-1", "block-2"],
          reason: "local",
        },
      ]);
    });

    it("deleteBlock을 한 번의 undo로 복원한다", () => {
      const editor = createEditor({
        initialDocument: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
            { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
          ],
        },
      });
      editor.commands.deleteBlock("block-1");

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
        "block-1",
        "block-2",
      ]);
    });

    it("문서에 블록이 하나만 남아있으면 deleteBlock이 COMMAND_NOT_APPLICABLE을 반환한다", () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
      });

      expect(editor.commands.deleteBlock("block-1")).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "deleteBlock" },
      });
    });

    it("알 수 없는 블록 id에 대해 deleteBlock이 BLOCK_NOT_FOUND를 반환한다", () => {
      const editor = createEditor({
        initialDocument: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
            { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
          ],
        },
      });

      expect(editor.commands.deleteBlock("missing")).toEqual({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
      });
    });
  });
});
