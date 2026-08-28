import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import { findBlockPosition } from "../src/block-position.js";
import {
  documentWithContent,
  mountTiptapEditor,
  nestedParagraphDocument,
  paragraphDocument,
  sequentialIds,
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
      // blockId는 새 blockContainer 자신이 소유한다(D19) — +1로 컨테이너에
      // 들어가면 문단(blockContent) 자신이고, +2라야 그 문단의 빈 텍스트
      // 안이다.
      expect(tiptap.state.selection.from).toBe((newBlockPosition ?? 0) + 2);
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

  // DELTA-02a 완료 조건 2·3·4·5·7 — D19(재귀 위치 조회)·D20(자식 딸린
  // 블록의 명령 의미론)이 depth≥1 블록에서도 성립하는지 검증한다.
  describe("중첩 블록(D19/D20)", () => {
    it("depth 1 블록에 대한 setText가 최상위와 동일하게 동작한다(완료 조건 2)", () => {
      const editor = createEditor({
        initialDocument: nestedParagraphDocument(),
      });

      expect(editor.commands.setText("child-1", "updated")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument().blocks[0]).toMatchObject({
        id: "parent-1",
        content: [{ text: "parent" }],
        children: [{ id: "child-1", content: [{ text: "updated" }] }],
      });
    });

    it("depth 1 블록에 대한 setBlockType이 최상위와 동일하게 동작한다(완료 조건 2)", () => {
      const editor = createEditor({
        initialDocument: nestedParagraphDocument(),
      });

      expect(
        editor.commands.setBlockType("child-1", { type: "heading", level: 2 }),
      ).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks[0]).toMatchObject({
        id: "parent-1",
        children: [
          {
            id: "child-1",
            type: "heading",
            level: 2,
            content: [{ text: "child" }],
          },
        ],
      });
    });

    it("depth 1 블록 뒤에 insertParagraphAfter로 같은 부모의 다음 형제를 만든다(완료 조건 2·5)", () => {
      const editor = createEditor({
        initialDocument: nestedParagraphDocument(),
        createId: () => "child-2",
      });

      expect(editor.commands.insertParagraphAfter("child-1")).toEqual({
        ok: true,
        value: { blockId: "child-2" },
      });
      expect(editor.getDocument().blocks[0]).toMatchObject({
        id: "parent-1",
        children: [
          { id: "child-1", content: [{ text: "child" }] },
          { id: "child-2", type: "paragraph", content: [] },
        ],
      });
    });

    it("자식 딸린 블록 뒤 insertParagraphAfter가 하위 트리 뒤에 삽입하고 자식 귀속을 보존한다(완료 조건 5)", () => {
      // 변이: 삽입 위치를 컨테이너 시작+콘텐츠 크기(자식 앞)로 잘못 잡으면
      // 새 블록이 child-1 앞·parent-1 안에 들어가 이 assertion이 깨진다.
      const editor = createEditor({
        initialDocument: nestedParagraphDocument(),
        createId: sequentialIds("new"),
      });

      expect(editor.commands.insertParagraphAfter("parent-1")).toEqual({
        ok: true,
        value: { blockId: "new-1" },
      });
      const document = editor.getDocument();
      expect(document.blocks).toMatchObject([
        {
          id: "parent-1",
          content: [{ text: "parent" }],
          children: [{ id: "child-1", content: [{ text: "child" }] }],
        },
        { id: "new-1", type: "paragraph", content: [] },
      ]);
    });

    it("자식 딸린 블록의 deleteBlock이 하위 트리를 동반 삭제하고 undo 1회로 전체 복원된다(완료 조건 3, G-EDT-001)", () => {
      // 변이: 컨테이너가 아닌 내부 blockContent 노드만 삭제하면 child-1이
      // 고아로 남거나 디코딩이 깨져 아래 assertion들이 실패한다.
      const initialDocument: Document = {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "parent-1",
            type: "paragraph",
            content: [{ text: "parent" }],
            children: [
              {
                id: "child-1",
                type: "paragraph",
                content: [{ text: "child" }],
              },
            ],
          },
          { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
        ],
      };
      const editor = createEditor({ initialDocument });

      expect(editor.commands.deleteBlock("parent-1")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument().blocks).toMatchObject([
        { id: "block-2", content: [{ text: "two" }] },
      ]);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks).toMatchObject([
        {
          id: "parent-1",
          children: [{ id: "child-1", content: [{ text: "child" }] }],
        },
        { id: "block-2" },
      ]);
    });

    it("자식 딸린 블록의 moveBlockBefore/duplicateBlock이 COMMAND_NOT_APPLICABLE을 반환하고 문서를 바꾸지 않는다(완료 조건 4)", () => {
      // 변이: duplicateBlock 가드를 제거하면 복제본 하위 트리(child-1)의
      // blockId가 원본과 전면 중복돼 id 유일성이 깨진다.
      const initialDocument: Document = {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "parent-1",
            type: "paragraph",
            content: [{ text: "parent" }],
            children: [
              {
                id: "child-1",
                type: "paragraph",
                content: [{ text: "child" }],
              },
            ],
          },
          { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
        ],
      };
      const editor = createEditor({ initialDocument });
      const before = editor.getDocument();

      expect(editor.commands.moveBlockBefore("parent-1", "block-2")).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlockBefore" },
      });
      expect(editor.commands.duplicateBlock("parent-1")).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "duplicateBlock" },
      });
      expect(editor.getDocument()).toEqual(before);
    });

    it("자식 없는 중첩 블록의 moveBlockBefore/duplicateBlock은 같은 부모 형제 범위에서 기존과 동일하게 동작한다(완료 조건 4)", () => {
      const initialDocument: Document = {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "parent-1",
            type: "paragraph",
            content: [{ text: "parent" }],
            children: [
              { id: "child-1", type: "paragraph", content: [{ text: "one" }] },
              { id: "child-2", type: "paragraph", content: [{ text: "two" }] },
            ],
          },
        ],
      };
      const editor = createEditor({
        initialDocument,
        createId: () => "child-3",
      });

      expect(editor.commands.moveBlockBefore("child-2", "child-1")).toEqual({
        ok: true,
        value: undefined,
      });
      // blocks[0]은 Block 유니온이라 TableBlock에는 children이 없다 —
      // .children을 직접 좁히지 않고 toMatchObject의 부분 매칭으로 확인한다.
      expect(editor.getDocument().blocks[0]).toMatchObject({
        children: [{ id: "child-2" }, { id: "child-1" }],
      });

      expect(editor.commands.duplicateBlock("child-1")).toEqual({
        ok: true,
        value: { blockId: "child-3" },
      });
      expect(editor.getDocument().blocks[0]).toMatchObject({
        children: [
          { id: "child-2" },
          { id: "child-1", content: [{ text: "one" }] },
          { id: "child-3", content: [{ text: "one" }] },
        ],
      });
    });

    it("같은 부모의 형제가 아닌 타깃의 moveBlockBefore는 거절된다(완료 조건 4)", () => {
      const initialDocument: Document = {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "parent-1",
            type: "paragraph",
            content: [{ text: "parent" }],
            children: [
              {
                id: "child-1",
                type: "paragraph",
                content: [{ text: "child" }],
              },
            ],
          },
          { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
        ],
      };
      const editor = createEditor({ initialDocument });
      const before = editor.getDocument();

      expect(editor.commands.moveBlockBefore("child-1", "block-2")).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlockBefore" },
      });
      expect(editor.getDocument()).toEqual(before);
    });

    it("중첩 블록 안 caret·선택에서 그 블록의 blockId·타입을 보고한다(완료 조건 7)", () => {
      // 변이: $from.parent 직접 읽기로 되돌리면 컨테이너 구조에서 blockId가
      // undefined가 된다(참고: 재귀화 전 코드가 정확히 이 상태였다).
      const editor = createEditor({
        initialDocument: nestedParagraphDocument(),
      });
      const { tiptap } = mountTiptapEditor(editor);
      const childContainerPosition = findBlockPosition(
        tiptap.state.doc,
        "child-1",
      );
      if (childContainerPosition === null) {
        throw new Error("중첩 블록 fixture 준비 실패");
      }
      // +1로 컨테이너에 들어가면 문단 자신, +2가 그 문단 텍스트 시작이다.
      const textStart = childContainerPosition + 2;

      tiptap.commands.setTextSelection(textStart + 2);
      expect(editor.getCaretBlockContext()).toEqual({
        blockId: "child-1",
        blockType: { type: "paragraph" },
        text: "child",
      });

      tiptap.commands.setTextSelection({ from: textStart, to: textStart + 5 });
      expect(editor.getSelectionBlockType()).toEqual({
        blockId: "child-1",
        blockType: { type: "paragraph" },
      });
    });
  });
});
