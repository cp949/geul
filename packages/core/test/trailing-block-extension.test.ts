/**
 * 문서 끝 trailing paragraph 불변식(UI-010, spec §6.4)을 검증한다.
 * 마지막 최상위 블록이 자식 없는 paragraph가 아니면(heading·표·자식 딸린
 * paragraph, 그리고 Issue #38 슬라이스 3의 quote·divider — DELTA-05 05-C4
 * characterization) 빈 paragraph가 자동 추가된다 — 로드(초기 문서 설정·
 * replaceDocument) 시점 포함. 로드 시점 추가는 revision 증가·onChange 없이
 * 히스토리 밖에서 끝나고(R-11), 편집이 트리거한 추가는 그 편집과 한 커밋·
 * 한 히스토리 이벤트가 된다(R-8). 자동 추가 paragraph의 blockId는
 * BlockIdExtension 경로로 문서 전체에서 유일하다(계획 완료 조건 5~8·10).
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  dividerD1,
  documentOf,
  nestedParagraphDocument,
  okResult,
  oneCellTableBlock,
  paragraphBlock,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

/**
 * heading 하나로 끝나는 최소 문서 — 로드 시점 trailing 추가의 기본 대상.
 */
const headingDocument = (revision = 0): Document => ({
  formatVersion: 1,
  revision,
  blocks: [
    { id: "head-1", type: "heading", level: 1, content: [{ text: "title" }] },
  ],
});

/**
 * 자동 추가된 trailing paragraph의 기대 모양 — 주어진 id와 빈 content.
 */
const trailingParagraph = (id: string) => ({
  id,
  type: "paragraph" as const,
  content: [],
});

describe("로드 시점 trailing paragraph", () => {
  it("heading으로 끝나는 문서를 로드하면 빈 paragraph를 끝에 추가한다", () => {
    const editor = createEditor({
      initialDocument: headingDocument(),
      createId: sequentialIds("gen"),
    });

    expect(editor.getDocument().blocks).toEqual([
      ...headingDocument().blocks,
      trailingParagraph("gen-1"),
    ]);
  });

  it("표로 끝나는 문서를 로드하면 빈 paragraph를 끝에 추가한다", () => {
    const tableDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [oneCellTableBlock("table-1")],
    };
    const editor = createEditor({
      initialDocument: tableDocument,
      createId: sequentialIds("gen"),
    });

    const blocks = editor.getDocument().blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.id).toBe("table-1");
    expect(blocks[1]).toEqual(trailingParagraph("gen-1"));
  });

  it("자식 딸린 paragraph로 끝나는 문서를 로드하면 빈 paragraph를 끝에 추가한다", () => {
    const editor = createEditor({
      initialDocument: nestedParagraphDocument(),
      createId: sequentialIds("gen"),
    });

    const blocks = editor.getDocument().blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toEqual(trailingParagraph("gen-1"));
  });

  it("마지막 블록이 자식 없는 paragraph면 내용 유무와 무관하게 추가하지 않는다", () => {
    const filled = createEditor({
      initialDocument: paragraphDocument("text"),
    });
    expect(filled.getDocument().blocks).toEqual(
      paragraphDocument("text").blocks,
    );

    const emptyDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [{ id: "p-1", type: "paragraph", content: [] }],
    };
    const empty = createEditor({ initialDocument: emptyDocument });
    expect(empty.getDocument().blocks).toEqual(emptyDocument.blocks);
  });

  it("로드 시점 추가는 revision을 올리지 않고 onChange를 발화하지 않는다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: headingDocument(7),
      createId: sequentialIds("gen"),
      onChange: (event) => changes.push(event),
    });

    expect(changes).toEqual([]);
    expect(editor.getDocument().revision).toBe(7);
    expect(editor.getDocument().blocks).toHaveLength(2);
  });

  it("로드 직후에는 undo할 것이 없다 — trailing 정규화가 히스토리 밖이다", () => {
    const editor = createEditor({
      initialDocument: headingDocument(),
      createId: sequentialIds("gen"),
    });

    expect(editor.commands.undo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
    expect(editor.getDocument().blocks).toHaveLength(2);
  });

  it("replaceDocument 로드의 trailing 추가가 한 번의 replace 커밋에 포함된다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("kept"),
      createId: sequentialIds("gen"),
      onChange: (event) => changes.push(event),
    });

    expect(editor.replaceDocument(headingDocument())).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks).toEqual([
      ...headingDocument().blocks,
      trailingParagraph("gen-1"),
    ]);
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1", "head-1", "gen-1"],
        reason: "replace",
      },
    ]);
  });

  it("자동 추가 paragraph는 기존 id와 겹치지 않는 유일한 blockId를 받는다", () => {
    // sequentialIds("gen")의 첫 산출 "gen-1"이 기존 블록 id와 겹치는 문서 —
    // BlockIdExtension의 중복 재시도 경로가 "gen-2"를 배정해야 한다(완료 조건 8).
    const colliding: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "gen-1", type: "heading", level: 1, content: [{ text: "t" }] },
      ],
    };
    const editor = createEditor({
      initialDocument: colliding,
      createId: sequentialIds("gen"),
    });

    expect(editor.getDocument().blocks[1]).toEqual(trailingParagraph("gen-2"));
  });
});

describe("편집 시점 trailing paragraph", () => {
  it("마지막 블록이 heading으로 바뀌면 같은 커밋에서 빈 paragraph를 추가한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("gen"),
      onChange: (event) => changes.push(event),
    });

    expect(
      editor.commands.setBlockType("block-1", { type: "heading", level: 2 }),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[1]).toEqual(trailingParagraph("gen-1"));
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1", "gen-1"],
        reason: "local",
      },
    ]);
  });

  it("불변식이 idempotent하다 — 이어지는 편집에서 paragraph가 더 추가되지 않는다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("gen"),
    });
    editor.commands.setBlockType("block-1", { type: "heading", level: 1 });
    expect(editor.getDocument().blocks).toHaveLength(2);

    expect(editor.commands.setText("block-1", "edited")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks).toHaveLength(2);
  });

  it("끝 블록 삭제로 추가된 paragraph가 undo 1회로 삭제 전 문서와 함께 복원된다", () => {
    const tailDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "head-1",
          type: "heading",
          level: 1,
          content: [{ text: "title" }],
        },
        { id: "tail-1", type: "paragraph", content: [{ text: "tail" }] },
      ],
    };
    const editor = createEditor({
      initialDocument: tailDocument,
      createId: sequentialIds("gen"),
    });

    expect(editor.commands.deleteBlock("tail-1")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks).toEqual([
      ...tailDocument.blocks.slice(0, 1),
      trailingParagraph("gen-1"),
    ]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(tailDocument.blocks);
  });

  it("마지막 블록이 quote로 바뀌면 같은 커밋에서 빈 paragraph를 추가한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("gen"),
      onChange: (event) => changes.push(event),
    });

    // 판정 술어는 "자식 없는 paragraph"라 quote도 heading과 같이 걸린다 —
    // 코드 변경 없이 성립하는 회귀 고정(characterization).
    expect(editor.commands.setBlockType("block-1", { type: "quote" })).toEqual(
      okResult,
    );
    expect(editor.getDocument().blocks).toEqual([
      { id: "block-1", type: "quote", content: [{ text: "content" }] },
      trailingParagraph("gen-1"),
    ]);
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1", "gen-1"],
        reason: "local",
      },
    ]);

    // 타입 변환과 trailing 추가가 한 히스토리 이벤트다(R-8).
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual(
      paragraphDocument("content").blocks,
    );
  });

  it("divider 뒤 trailing paragraph를 삭제하면 재추가되고 undo 1회로 삭제 전 문서가 복원된다", () => {
    // divider는 컨테이너 없이 doc 직하에 놓이는 atom이라 술어의 첫 분기
    // (blockContainer가 아님)에서 걸러진다 — 표와 같은 경로.
    const tailDocument = documentOf(
      dividerD1,
      paragraphBlock("tail-1", "tail"),
    );
    const editor = createEditor({
      initialDocument: tailDocument,
      createId: sequentialIds("gen"),
    });

    expect(editor.commands.deleteBlock("tail-1")).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      dividerD1,
      trailingParagraph("gen-1"),
    ]);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual(tailDocument.blocks);
  });
});
