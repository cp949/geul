/**
 * 글머리·번호 목록 node의 production 등록과 EditorController load/save 경계를
 * 검증한다. 기본 채움, top-level·nested 왕복, trailing 정규화와 무효 교체의
 * 전체 상태 원자성을 다룬다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it, vi } from "vitest";

import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  editorState,
  liveSchema,
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
  setBoldStoredMark,
} from "./editor-controller-support.js";

/**
 * production 왕복에서 두 목록 타입, 경계 startNumber와 임의 자식 타입을
 * 한 번에 관찰하는 문서를 만든다. 마지막 문단은 trailing 정규화를 막는다.
 */
function listDocument(revision = 0): Document {
  return {
    formatVersion: 1,
    revision,
    blocks: [
      {
        id: "bullet-parent",
        type: "bulletListItem",
        content: [{ text: "글머리" }],
        children: [
          {
            id: "numbered-auto",
            type: "numberedListItem",
            content: [{ text: "자동 번호" }],
            children: [
              {
                id: "arbitrary-heading",
                type: "heading",
                level: 4,
                content: [{ text: "임의 자식" }],
              },
            ],
          },
          {
            id: "numbered-zero",
            type: "numberedListItem",
            startNumber: 0,
            content: [{ text: "영" }],
          },
        ],
      },
      {
        id: "numbered-max",
        type: "numberedListItem",
        startNumber: 999_999_999,
        content: [{ text: "상한" }],
      },
      {
        id: "tail",
        type: "paragraph",
        content: [{ text: "꼬리" }],
      },
    ],
  };
}

describe("production 목록 load/save", () => {
  it("production schema는 자체 목록 node만 한 번 등록하고 기본 채움과 외부 parse 차단을 유지한다", () => {
    const schema = liveSchema();
    const bullet = schema.nodes.bulletListItem;
    const numbered = schema.nodes.numberedListItem;

    expect(bullet).toBeDefined();
    expect(numbered).toBeDefined();
    expect(schema.nodes.bulletList).toBeUndefined();
    expect(schema.nodes.orderedList).toBeUndefined();
    expect(schema.nodes.listItem).toBeUndefined();
    expect(bullet?.spec.parseDOM ?? []).toEqual([]);
    expect(numbered?.spec.parseDOM ?? []).toEqual([]);
    expect(schema.nodes.doc?.contentMatch.defaultType?.name).toBe(
      "blockContainer",
    );
    expect(schema.nodes.blockGroup?.contentMatch.defaultType?.name).toBe(
      "blockContainer",
    );
    expect(schema.nodes.blockContainer?.contentMatch.defaultType?.name).toBe(
      "paragraph",
    );
  });

  it("createEditor와 replaceDocument가 top-level과 nested 목록 값을 그대로 저장한다", () => {
    const created = createEditor({ initialDocument: listDocument(4) });
    const replaced = createEditor({ initialDocument: paragraphDocument("이전") });
    try {
      expect(created.getDocument()).toEqual(listDocument(4));
      expect(replaced.replaceDocument(listDocument(9))).toEqual({
        ok: true,
        value: undefined,
      });
      expect(replaced.getDocument()).toEqual(listDocument(1));
    } finally {
      created.destroy();
      replaced.destroy();
    }
  });

  it("마지막 top-level 목록 load는 목록을 보존하고 history 밖 trailing 문단을 추가한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const list = listDocument(7).blocks[1];
    if (list === undefined) throw new Error("마지막 목록 fixture가 없다");
    const editor = createEditor({
      initialDocument: { formatVersion: 1, revision: 7, blocks: [list] },
      createId: sequentialIds("trailing"),
      onChange: (event) => changes.push(event),
    });
    try {
      const loaded = editor.getDocument();
      expect(loaded.blocks[0]).toEqual(list);
      expect(loaded.blocks.slice(1)).toEqual([
        { id: "trailing-1", type: "paragraph", content: [] },
      ]);
      expect(loaded.revision).toBe(7);
      expect(changes).toEqual([]);
      expect(editor.commands.undo()).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
      });
      expect(editor.getDocument()).toEqual(loaded);
    } finally {
      editor.destroy();
    }
  });

  it("무효 목록 create와 replace는 공개 오류를 유지하고 교체 상태를 변경하지 않는다", () => {
    const invalid = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "invalid-list",
          type: "numberedListItem",
          startNumber: -1,
          content: [{ text: "무효" }],
        },
      ],
    };
    expect(() =>
      createEditor({ initialDocument: invalid as Document }),
    ).toThrow(TypeError);

    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("이전"),
      onChange: (event) => changes.push(event),
    });
    try {
      expect(editor.commands.setText("block-1", "현재")).toEqual({
        ok: true,
        value: undefined,
      });
      const { tiptap } = mountTiptapEditor(editor);
      tiptap.commands.setTextSelection(3);
      setBoldStoredMark(tiptap);
      const before = editorState(editor, tiptap);
      const eventsBefore = [...changes];
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      expect(editor.replaceDocument(invalid)).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID" },
      });
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual(eventsBefore);
      expect(dispatch).not.toHaveBeenCalled();

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument()).toEqual(paragraphDocument("이전", 2));
    } finally {
      editor.destroy();
    }
  });
});
