/**
 * 공개 EditorController 명령이 잘못된 createId를 유한 시간에 거절하고
 * 저장 문서·revision·change event를 원자적으로 보존하는지 검증한다.
 */
import { parseDocument, type Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { findBlockPosition } from "../src/block-position.js";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

const allocationErrorMessage =
  "createId failed to return a valid unique document id after 100 attempts";

/**
 * 호출마다 지정한 ID를 순서대로 반환한다. 문서의 각 identity 충돌을 모두
 * 건너뛴 뒤 첫 유일 ID를 선택하는 성공 경로를 검증할 때 사용한다.
 */
function idSequence(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? ids.at(-1) ?? "";
}

/**
 * 복제 가능한 문단과 표의 column·row·cell identity를 한 문서에 둔다.
 * 마지막 문단은 로드 시 trailing paragraph 정규화를 막는다.
 */
function documentWithEveryIdentity(): Document {
  return {
    formatVersion: 1,
    revision: 4,
    blocks: [
      {
        id: "block-1",
        type: "paragraph",
        content: [{ text: "source" }],
      },
      {
        id: "table-1",
        type: "table",
        columns: [{ id: "column-1", width: 160 }],
        rows: [
          {
            id: "row-1",
            cells: [
              {
                id: "cell-1",
                columnId: "column-1",
                rowSpan: 1,
                columnSpan: 1,
                content: [],
              },
            ],
          },
        ],
        headerRows: 0,
        headerColumns: 0,
      },
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
      { id: "tail-1", type: "paragraph", content: [] },
    ],
  };
}

describe("문서 ID 발급", () => {
  it("문단 삽입에서 기존 ID만 반환하면 RangeError를 던지고 문서를 보존한다", () => {
    const changes: DocumentChangeEvent[] = [];
    let calls = 0;
    const editor = createEditor({
      initialDocument: paragraphDocument("content", 7),
      createId: () => {
        calls += 1;
        return "block-1";
      },
      onChange: (event) => changes.push(event),
    });
    const before = editor.getDocument();
    const caretBefore = editor.getCaretBlockContext();

    try {
      expect(() => editor.commands.insertParagraphAfter("block-1")).toThrow(
        new RangeError(allocationErrorMessage),
      );
      expect(calls).toBe(100);
      expect(editor.getDocument()).toEqual(before);
      expect(editor.getDocument().revision).toBe(7);
      expect(editor.getCaretBlockContext()).toEqual(caretBefore);
      expect(changes).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("문단 삽입에서 빈 ID만 반환하면 같은 RangeError를 던진다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: () => "",
    });

    try {
      expect(() => editor.commands.insertParagraphAfter("block-1")).toThrow(
        new RangeError(allocationErrorMessage),
      );
    } finally {
      editor.destroy();
    }
  });

  it("문단 삽입에서 제어 문자가 든 ID만 반환하면 같은 RangeError를 던진다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: () => "invalid\u0000id",
    });

    try {
      expect(() => editor.commands.insertParagraphAfter("block-1")).toThrow(
        new RangeError(allocationErrorMessage),
      );
    } finally {
      editor.destroy();
    }
  });

  it("블록 복제는 문서의 모든 identity 충돌을 건너뛰고 첫 유일 ID를 쓴다", () => {
    const editor = createEditor({
      initialDocument: documentWithEveryIdentity(),
      createId: idSequence(
        "block-1",
        "table-1",
        "column-1",
        "row-1",
        "cell-1",
        "parent-1",
        "child-1",
        "tail-1",
        "copy-1",
      ),
    });

    try {
      expect(editor.commands.duplicateBlock("block-1")).toEqual({
        ok: true,
        value: { blockId: "copy-1" },
      });
      expect(editor.getDocument()).toMatchObject({
        revision: 5,
        blocks: [
          { id: "block-1" },
          { id: "copy-1", content: [{ text: "source" }] },
          { id: "table-1" },
          { id: "parent-1", children: [{ id: "child-1" }] },
          { id: "tail-1" },
        ],
      });
    } finally {
      editor.destroy();
    }
  });

  it("블록 복제에서 표 cell ID만 반환하면 RangeError를 던지고 문서를 보존한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: documentWithEveryIdentity(),
      createId: () => "cell-1",
      onChange: (event) => changes.push(event),
    });
    const before = editor.getDocument();
    const caretBefore = editor.getCaretBlockContext();

    try {
      expect(() => editor.commands.duplicateBlock("block-1")).toThrow(
        new RangeError(allocationErrorMessage),
      );
      expect(editor.getDocument()).toEqual(before);
      expect(editor.getDocument().revision).toBe(4);
      expect(editor.getCaretBlockContext()).toEqual(caretBefore);
      expect(changes).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("revision이 포화되면 블록 복제를 거절하고 ID factory를 호출하지 않는다", () => {
    const changes: DocumentChangeEvent[] = [];
    let calls = 0;
    const editor = createEditor({
      initialDocument: paragraphDocument("content", Number.MAX_SAFE_INTEGER),
      createId: () => {
        calls += 1;
        return "copy-1";
      },
      onChange: (event) => changes.push(event),
    });
    const before = editor.getDocument();

    try {
      expect(editor.commands.duplicateBlock("block-1")).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "duplicateBlock" },
      });
      expect(calls).toBe(0);
      expect(editor.getDocument()).toEqual(before);
      expect(changes).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("문서 교체 정규화는 이전 표 cell ID와 같은 새 heading ID를 보존한다", () => {
    const editor = createEditor({
      initialDocument: documentWithEveryIdentity(),
      createId: () => "trailing-1",
    });

    try {
      expect(
        editor.replaceDocument({
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "cell-1",
              type: "heading",
              level: 2,
              content: [{ text: "replacement" }],
            },
          ],
        }),
      ).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks).toMatchObject([
        { id: "cell-1", type: "heading" },
        { id: "trailing-1", type: "paragraph" },
      ]);
      expect(parseDocument(editor.getDocument())).toMatchObject({ ok: true });
    } finally {
      editor.destroy();
    }
  });

  it("DOM transaction의 block ID가 표 cell ID와 충돌하면 유일한 ID로 재발급한다", () => {
    const editor = createEditor({
      initialDocument: documentWithEveryIdentity(),
      createId: () => "copy-1",
    });
    const { tiptap } = mountTiptapEditor(editor);

    try {
      const sourcePosition = findBlockPosition(tiptap.state.doc, "block-1");
      expect(sourcePosition).not.toBeNull();
      const sourceNode = tiptap.state.doc.nodeAt(sourcePosition ?? -1);
      expect(sourceNode).not.toBeNull();
      if (sourceNode === null || sourcePosition === null) return;

      const collidingNode = sourceNode.type.create(
        { ...sourceNode.attrs, blockId: "cell-1" },
        sourceNode.content,
        sourceNode.marks,
      );
      tiptap.view.dispatch(
        tiptap.state.tr.insert(
          sourcePosition + sourceNode.nodeSize,
          collidingNode,
        ),
      );

      expect(editor.getDocument().blocks[1]).toMatchObject({ id: "copy-1" });
      expect(parseDocument(editor.getDocument())).toMatchObject({ ok: true });
    } finally {
      editor.destroy();
    }
  });
});
