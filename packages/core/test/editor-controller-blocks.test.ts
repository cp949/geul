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
        createId: sequentialIds("gen"),
        onChange: (event) => changes.push(event),
      });

      // 마지막 블록이 heading이 되면 같은 커밋에 trailing paragraph(UI-010,
      // "gen-1")가 추가된다 — 변환 자체의 id·내용 보존은 blocks[0]이 고정한다.
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
          { id: "gen-1", type: "paragraph", content: [] },
        ],
      });
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["block-1", "gen-1"], reason: "local" },
      ]);
    });

    it("제목을 문단으로 되돌리면서 내용을 보존한다", () => {
      // heading으로 끝나는 문서라 로드 시점에 trailing paragraph(UI-010,
      // "gen-1")가 붙는다 — 변환 대상과 결과는 blocks[0]이 고정한다.
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
        createId: sequentialIds("gen"),
      });

      expect(
        editor.commands.setBlockType("block-1", { type: "paragraph" }),
      ).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument()).toMatchObject({
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "title" }] },
          { id: "gen-1", type: "paragraph", content: [] },
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
        createId: sequentialIds("gen"),
      });

      // heading 변환과 같은 커밋에 trailing paragraph(UI-010, "gen-1")가
      // 추가된다 — clearContent의 결과는 blocks[0]이 고정한다.
      expect(
        editor.commands.setBlockType(
          "block-1",
          { type: "heading", level: 1 },
          { clearContent: true },
        ),
      ).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument()).toMatchObject({
        blocks: [
          { id: "block-1", type: "heading", level: 1, content: [] },
          { id: "gen-1", type: "paragraph", content: [] },
        ],
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
      // R-12: 상수 팩토리는 heading으로 끝나는 이 문서의 로드 시점 trailing
      // paragraph(UI-010)가 첫 id를 소비한 뒤 복제본과 id가 중복된다 — 순차
      // 팩토리를 쓴다. "copy-1"은 trailing paragraph가 가져간다.
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
        createId: sequentialIds("copy"),
      });

      editor.commands.duplicateBlock("block-1");

      expect(editor.getDocument().blocks[1]).toMatchObject({
        id: "copy-2",
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

      // 구현 공식(nodeSize 산술)을 미러링하지 않고 결과 selection의 의미를
      // 직접 단언한다 — 캐럿이 복제본 문단 "텍스트"의 끝(인라인 위치)에
      // 있어야 하고, 컨테이너 경계(비-textblock 위치)에 놓이면 안 된다
      // (트랙-6 발견: D19 컨테이너 도입 후 -1 오프셋이 경계를 가리켰다).
      const { selection } = tiptap.state;
      expect(selection.empty).toBe(true);
      expect(selection.$from.parent.type.name).toBe("paragraph");
      expect(selection.$from.parentOffset).toBe("content".length);
      expect(editor.getCaretBlockContext()).toMatchObject({
        blockId: "block-2",
      });
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
      // R-12: 상수 팩토리는 로드 시점 trailing paragraph가 첫 id를 소비한 뒤
      // BlockIdExtension 재시도 루프를 영원히 돌게 한다 — 순차 팩토리를 쓴다.
      // "new-1"은 로드 정규화의 trailing paragraph가 가져간다(UI-010).
      const editor = createEditor({
        initialDocument: nestedParagraphDocument(),
        createId: sequentialIds("new"),
      });

      expect(editor.commands.insertParagraphAfter("child-1")).toEqual({
        ok: true,
        value: { blockId: "new-2" },
      });
      expect(editor.getDocument().blocks[0]).toMatchObject({
        id: "parent-1",
        children: [
          { id: "child-1", content: [{ text: "child" }] },
          { id: "new-2", type: "paragraph", content: [] },
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

      // "new-1"은 로드 시점 trailing paragraph(UI-010)가 가져가고 삽입
      // 블록은 "new-2"다 — 하위 트리 바로 뒤(= trailing 앞)에 들어간다.
      expect(editor.commands.insertParagraphAfter("parent-1")).toEqual({
        ok: true,
        value: { blockId: "new-2" },
      });
      const document = editor.getDocument();
      expect(document.blocks).toMatchObject([
        {
          id: "parent-1",
          content: [{ text: "parent" }],
          children: [{ id: "child-1", content: [{ text: "child" }] }],
        },
        { id: "new-2", type: "paragraph", content: [] },
        { id: "new-1", type: "paragraph", content: [] },
      ]);
    });

    it("유일한 자식의 deleteBlock이 빈 blockGroup을 남기지 않고 부모를 자식 없는 블록으로 되돌린다", () => {
      // 변이: 컨테이너만 삭제하면 빈 blockGroup의 "block+"를 PM이 기본
      // 노드로 다시 채워, 지운 자리에 유령 빈 문단이 새 id로 나타난다
      // (트랙-6 발견 — outdentBlockCommand의 빈 그룹 제거 가드와 같은
      // 자리를 deleteBlock만 놓치고 있었다).
      const editor = createEditor({
        initialDocument: nestedParagraphDocument(),
      });
      const { tiptap } = mountTiptapEditor(editor);

      expect(editor.commands.deleteBlock("child-1")).toEqual({
        ok: true,
        value: undefined,
      });

      const document = editor.getDocument();
      // blocks 2개 = parent-1 + 로드 시점 trailing paragraph(UI-010, 자식
      // 딸린 paragraph로 끝나는 문서라 로드에 추가됨).
      expect(document.blocks).toHaveLength(2);
      expect(document.blocks[0]).toMatchObject({
        id: "parent-1",
        content: [{ text: "parent" }],
      });
      expect(document.blocks[0]).not.toHaveProperty("children");

      let groupCount = 0;
      tiptap.state.doc.descendants((node) => {
        if (node.type.name === "blockGroup") groupCount += 1;
        return true;
      });
      expect(groupCount).toBe(0);
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

    // Issue #125(D1)부터 moveBlockBefore는 자식이 있는 블록도 하위 트리째
    // 이동을 허용한다(하위 트리 이동 자체의 회귀는
    // editor-controller-subtree-commands.test.ts 소관) — 이 테스트는 그
    // 허용과 무관하게, parent-1이 이미 block-2 바로 앞자리라 이동이 자리를
    // 바꾸지 않는 no-op이라서 거절됨을 확인한다("자식이 있어서"가 아니다).
    // duplicateBlock의 하위 트리 재귀 복제 성공은 새 GREEN 계약이라 이
    // 파일이 아니라 그 신규 테스트 파일이 검증한다(완료 조건 6·12).
    it("자식 딸린 블록의 moveBlockBefore가 이미 그 자리인 이동은 no-op으로 거절한다", () => {
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
      // R-12와 같은 부류: 자식 딸린 paragraph로 끝나는 이 문서는 로드 시점
      // trailing paragraph(UI-010)가 첫 id를 소비하므로 상수 팩토리는 복제본
      // id를 중복시킨다 — 순차 팩토리를 쓴다. "new-1"은 trailing이 가져간다.
      const editor = createEditor({
        initialDocument,
        createId: sequentialIds("new"),
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
        value: { blockId: "new-2" },
      });
      expect(editor.getDocument().blocks[0]).toMatchObject({
        children: [
          { id: "child-2" },
          { id: "child-1", content: [{ text: "one" }] },
          { id: "new-2", content: [{ text: "one" }] },
        ],
      });
    });

    it("다른 부모의 형제 목록으로 이동하면 moveBlockBefore가 성공하고 유일한 자식을 잃은 부모에 빈 blockGroup을 남기지 않는다(Issue #125 D1, R2)", () => {
      // 변이(회귀): 소스가 유일한 자식일 때 그 노드만 지우면 부모의
      // blockGroup이 0개 자식으로 남아 "block+" 스키마를 어긴다 —
      // moveBlockBefore가 deleteBlock과 같은 removesWholeGroup 판정을
      // 공유해야 한다.
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
      const { tiptap } = mountTiptapEditor(editor);
      const before = editor.getDocument();

      expect(editor.commands.moveBlockBefore("child-1", "block-2")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument().blocks).toMatchObject([
        { id: "parent-1", content: [{ text: "parent" }] },
        { id: "child-1", content: [{ text: "child" }] },
        { id: "block-2", content: [{ text: "two" }] },
      ]);
      expect(editor.getDocument().blocks[0]).not.toHaveProperty("children");

      let groupCount = 0;
      tiptap.state.doc.descendants((node) => {
        if (node.type.name === "blockGroup") groupCount += 1;
        return true;
      });
      expect(groupCount).toBe(0);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      // undo도 revision을 새로 증가시킨다(commitDocument가 reason과 무관하게
      // sessionRevision을 1 올린다) — 복원 비교는 blocks만 본다(table.test.ts의
      // undo 계약 테스트와 같은 관례).
      expect(editor.getDocument().blocks).toEqual(before.blocks);
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
