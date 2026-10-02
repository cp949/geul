/**
 * setBlockType이 일반 텍스트 블록과 CodeBlock 사이의 변환 및 CodeBlock
 * language 갱신을 한 transaction과 한 undo 단위로 처리하는지 검증한다.
 * 변환은 id와 텍스트를 보존하고 mark는 잃는다. hardBreak는 `\n`으로
 * 옮기고 되돌릴 때 `\n`을 hardBreak로 복원한다(Issue #226).
 * CodeBlock에서 지원하지 않는 setText 거절 계약과, 종류 변경 뒤
 * 캐럿·범위 선택이 같은 텍스트 offset에 남는 계약(Issue #223)도 함께 고정한다.
 */
import type { Block, Document } from "@cp949/geul-model";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorController } from "../src/index.js";
import { describe, expect, it, vi } from "vitest";

import { contentTextStart } from "./block-test-support.js";
import {
  caretAt,
  documentOf,
  editorState,
  mounted,
  notApplicable,
  paragraphBlock,
  restored,
  setBoldStoredMark,
} from "./editor-controller-support.js";

/**
 * blockId 블록의 텍스트 시작에서 anchor·head offset만큼 떨어진 TextSelection
 * JSON을 만든다. head를 생략하면 빈 캐럿(anchor와 같은 위치)이다.
 */
const textSelectionAt = (
  tiptap: Parameters<typeof contentTextStart>[0],
  blockId: string,
  anchor: number,
  head: number = anchor,
) => {
  const start = contentTextStart(tiptap, blockId);
  return { type: "text", anchor: start + anchor, head: start + head };
};

describe("CodeBlock 종류 변경", () => {
  it("mark가 있는 문단을 기본 language text인 CodeBlock으로 바꾸며 id와 plain source를 보존한다", () => {
    const source: Block = {
      id: "source",
      type: "paragraph",
      content: [
        { text: "marked", marks: [{ type: "bold" }] },
        { text: " plain" },
      ],
    };
    const { editor, tiptap, changes } = mounted(
      documentOf(source, paragraphBlock("tail", "tail")),
    );
    const before = editorState(editor, tiptap);

    expect(
      editor.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toEqual({
      formatVersion: 1,
      revision: 1,
      blocks: [
        {
          id: "source",
          type: "codeBlock",
          content: [{ text: "marked plain" }],
          language: "text",
        },
        paragraphBlock("tail", "tail"),
      ],
    });
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "source"));
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["source"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("clearContent로 문단을 빈 CodeBlock으로 바꾸고 빈 language를 text로 저장한다", () => {
    const { editor, changes } = mounted(
      documentOf(
        paragraphBlock("source", "/code"),
        paragraphBlock("tail", "tail"),
      ),
    );

    expect(
      editor.commands.setBlockType(
        "source",
        { type: "codeBlock", language: "" },
        { clearContent: true },
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "source",
      type: "codeBlock",
      content: [],
      language: "text",
    });
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["source"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraphBlock("source", "/code"),
    );
  });

  it.each([
    {
      source: {
        id: "source",
        type: "heading",
        level: 2,
        content: [{ text: "heading" }],
      } as Block,
      expectedContent: [{ text: "heading" }],
      language: " JS ",
      expectedLanguage: "javascript",
    },
    {
      source: {
        id: "source",
        type: "quote",
        content: [{ text: "quote" }],
      } as Block,
      expectedContent: [{ text: "quote" }],
      language: "Custom Lang",
      expectedLanguage: "Custom Lang",
    },
  ])(
    "$source.type 블록의 language $language 입력을 $expectedLanguage 저장형으로 바꾼다",
    ({ source, expectedContent, language, expectedLanguage }) => {
      const { editor } = mounted(
        documentOf(source, paragraphBlock("tail", "tail")),
      );

      expect(
        editor.commands.setBlockType("source", {
          type: "codeBlock",
          language,
        }),
      ).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks[0]).toEqual({
        id: "source",
        type: "codeBlock",
        content: expectedContent,
        language: expectedLanguage,
      });
    },
  );

  it("자식이 있는 일반 블록은 CodeBlock으로 바꾸지 않고 상태와 history를 보존한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("parent", "parent", [paragraphBlock("child", "child")]),
        paragraphBlock("tail", "tail"),
      ),
    );
    setBoldStoredMark(tiptap);
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    expect(
      editor.commands.setBlockType("parent", { type: "codeBlock" }),
    ).toEqual(notApplicable("setBlockType"));
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
    dispatchSpy.mockRestore();
  });

  it.each([
    {
      descriptor: { type: "paragraph" } as const,
      expected: { type: "paragraph" },
    },
    {
      descriptor: { type: "heading", level: 3 } as const,
      expected: { type: "heading", level: 3 },
    },
    { descriptor: { type: "quote" } as const, expected: { type: "quote" } },
  ])(
    "CodeBlock을 $descriptor.type 블록으로 바꾸며 id와 source를 보존하고 language를 제거한다",
    ({ descriptor, expected }) => {
      const initial: Document = documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "line 1\nline 2" }],
          language: "typescript",
        },
        paragraphBlock("tail", "tail"),
      );
      const { editor, tiptap, changes } = mounted(initial);
      const before = editorState(editor, tiptap);

      expect(editor.commands.setBlockType("code", descriptor)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument().blocks[0]).toEqual({
        id: "code",
        ...expected,
        content: [{ text: "line 1\nline 2" }],
      });
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["code"], reason: "local" },
      ]);
      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    },
  );

  it("literal Tab이 있는 CodeBlock은 일반 블록 변환을 원자적으로 거절한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "before\tafter" }],
          language: "text",
        },
        paragraphBlock("tail", "tail"),
      ),
    );
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    expect(editor.commands.setBlockType("code", { type: "paragraph" })).toEqual(
      notApplicable("setBlockType"),
    );
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
    dispatchSpy.mockRestore();
  });

  it("clearContent이면 literal Tab이 있는 CodeBlock도 빈 일반 블록으로 바꾼다", () => {
    const { editor } = mounted(
      documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "before\tafter" }],
          language: "text",
        },
        paragraphBlock("tail", "tail"),
      ),
    );

    expect(
      editor.commands.setBlockType(
        "code",
        { type: "paragraph" },
        { clearContent: true },
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "code",
      type: "paragraph",
      content: [],
    });
  });
});

describe("CodeBlock 종류 변경 뒤 캐럿 offset 유지(Issue #223)", () => {
  it("문단의 4번째 글자 뒤 캐럿은 CodeBlock 변환 뒤에도 offset 4이고 undo 1회로 복원된다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("source", "abcdefgh"),
        paragraphBlock("tail", "tail"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "source") + 4);
    const before = editorState(editor, tiptap);

    expect(
      editor.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "source",
      type: "codeBlock",
      content: [{ text: "abcdefgh" }],
      language: "text",
    });
    expect(tiptap.state.selection.toJSON()).toEqual(
      textSelectionAt(tiptap, "source", 4),
    );
    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("CodeBlock을 문단으로 되돌려도 캐럿은 offset 4로 유지된다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "abcdefgh" }],
          language: "typescript",
        },
        paragraphBlock("tail", "tail"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 4);

    expect(editor.commands.setBlockType("code", { type: "paragraph" })).toEqual(
      { ok: true, value: undefined },
    );
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraphBlock("code", "abcdefgh"),
    );
    expect(tiptap.state.selection.toJSON()).toEqual(
      textSelectionAt(tiptap, "code", 4),
    );
  });

  it("블록 안 범위 선택 offset 2–5는 변환 뒤에도 offset 2–5로 남는다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("source", "abcdefgh"),
        paragraphBlock("tail", "tail"),
      ),
    );
    const start = contentTextStart(tiptap, "source");
    tiptap.commands.setTextSelection({ from: start + 2, to: start + 5 });

    expect(
      editor.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });
    expect(tiptap.state.selection.toJSON()).toEqual(
      textSelectionAt(tiptap, "source", 2, 5),
    );
  });

  it("mark가 섞인 문단의 offset 4는 CodeBlock 변환 뒤 텍스트 offset 4다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        {
          id: "source",
          type: "paragraph",
          content: [
            { text: "ab", marks: [{ type: "bold" }] },
            { text: "cdef" },
          ],
        },
        paragraphBlock("tail", "tail"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "source") + 4);

    expect(
      editor.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "source",
      type: "codeBlock",
      content: [{ text: "abcdef" }],
      language: "text",
    });
    expect(tiptap.state.selection.toJSON()).toEqual(
      textSelectionAt(tiptap, "source", 4),
    );
  });

  it("hardBreak가 낀 문단의 선택은 개행을 센 텍스트 offset으로 옮긴다", () => {
    // PM 내용: "ab" hardBreak "cdef"(크기 7). 변환 뒤 텍스트는 "ab\ncdef"(길이 7)다.
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("source", "ab\ncdef"),
        paragraphBlock("tail", "tail"),
      ),
    );
    const start = contentTextStart(tiptap, "source");
    // hardBreak 뒤 "c" 다음(PM 상대 위치 4)은 개행을 센 텍스트 offset 4다.
    tiptap.commands.setTextSelection(start + 4);
    expect(
      editor.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });
    expect(tiptap.state.selection.toJSON()).toEqual(
      textSelectionAt(tiptap, "source", 4),
    );

    // 코드 블록에서 문단으로 되돌린 뒤 코드 블록 끝(상대 위치 7)에 둔다.
    // 개행이 hardBreak 하나로 돌아와 PM 위치와 텍스트 offset이 같다.
    tiptap.commands.setTextSelection(start + 7);
    expect(
      editor.commands.setBlockType("source", { type: "paragraph" }),
    ).toEqual({ ok: true, value: undefined });
    expect(tiptap.state.selection.toJSON()).toEqual(
      textSelectionAt(tiptap, "source", 7),
    );

    // 원래 hardBreak 문단의 PM 끝(상대 위치 7)은 새 내용 끝(7)으로 간다.
    const { editor: second, tiptap: secondTiptap } = mounted(
      documentOf(
        paragraphBlock("source", "ab\ncdef"),
        paragraphBlock("tail", "tail"),
      ),
    );
    secondTiptap.commands.setTextSelection(
      contentTextStart(secondTiptap, "source") + 7,
    );
    expect(
      second.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });
    expect(secondTiptap.state.selection.toJSON()).toEqual(
      textSelectionAt(secondTiptap, "source", 7),
    );
  });

  it("hardBreak를 가로지르는 범위 선택은 anchor와 head를 각각 개행을 센 offset으로 옮긴다", () => {
    // PM 내용: "ab" hardBreak "cdef". anchor 1("a" 뒤)과 head 5("cd" 뒤)를 잡는다.
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("source", "ab\ncdef"),
        paragraphBlock("tail", "tail"),
      ),
    );
    const start = contentTextStart(tiptap, "source");
    tiptap.commands.setTextSelection({ from: start + 1, to: start + 5 });

    expect(
      editor.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });

    expect(tiptap.state.selection.toJSON()).toEqual(
      textSelectionAt(tiptap, "source", 1, 5),
    );
  });

  it("clearContent 변환은 캐럿이 어디 있었든 변환 뒤 offset 0이다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("source", "/code"),
        paragraphBlock("tail", "tail"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "source") + 3);

    expect(
      editor.commands.setBlockType(
        "source",
        { type: "codeBlock" },
        { clearContent: true },
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(tiptap.state.selection.toJSON()).toEqual(
      textSelectionAt(tiptap, "source", 0),
    );
  });

  it("selection이 대상 블록 밖이면 변환 뒤 대상 블록 처음에 놓인다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("source", "abcdefgh"),
        paragraphBlock("tail", "tail"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "tail") + 2);

    expect(
      editor.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });
    expect(tiptap.state.selection.toJSON()).toEqual(
      textSelectionAt(tiptap, "source", 0),
    );
  });

  it("역방향 범위 선택(anchor 5, head 2)은 변환 뒤에도 방향을 유지한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("source", "abcdefgh"),
        paragraphBlock("tail", "tail"),
      ),
    );
    const start = contentTextStart(tiptap, "source");
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        TextSelection.create(tiptap.state.doc, start + 5, start + 2),
      ),
    );

    expect(
      editor.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });
    expect(tiptap.state.selection.toJSON()).toEqual(
      textSelectionAt(tiptap, "source", 5, 2),
    );
  });

  it("anchor만 대상 블록 안이고 head가 밖인 범위 선택은 대상 블록 처음에 놓인다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("source", "abcdefgh"),
        paragraphBlock("tail", "tail"),
      ),
    );
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        TextSelection.create(
          tiptap.state.doc,
          contentTextStart(tiptap, "source") + 3,
          contentTextStart(tiptap, "tail") + 2,
        ),
      ),
    );

    expect(
      editor.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });
    expect(tiptap.state.selection.toJSON()).toEqual(
      textSelectionAt(tiptap, "source", 0),
    );
  });
});

describe("CodeBlock language 변경", () => {
  it.each([
    { input: "", expected: "text" },
    { input: " JS ", expected: "javascript" },
    { input: "Custom Lang", expected: "Custom Lang" },
  ])(
    "language $input 입력을 $expected 저장형으로 바꾸고 selection을 보존하며 undo 1회로 복원한다",
    ({ input, expected }) => {
      const { editor, tiptap, changes } = mounted(
        documentOf(
          {
            id: "code",
            type: "codeBlock",
            content: [{ text: "source" }],
            language: "typescript",
          },
          paragraphBlock("tail", "tail"),
        ),
      );
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 3);
      const before = editorState(editor, tiptap);
      const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

      expect(
        editor.commands.setBlockType("code", {
          type: "codeBlock",
          language: input,
        }),
      ).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks[0]).toEqual({
        id: "code",
        type: "codeBlock",
        content: [{ text: "source" }],
        language: expected,
      });
      expect(tiptap.state.selection.toJSON()).toEqual(before.selection);
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["code"], reason: "local" },
      ]);
      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
      dispatchSpy.mockRestore();
    },
  );

  it.each(["bad\nlanguage", "bad\u0000language", "bad\u007flanguage"])(
    "제어 문자가 있는 language %s는 mutation 전에 원자적으로 거절한다",
    (language) => {
      const { editor, tiptap, changes } = mounted(
        documentOf(
          {
            id: "code",
            type: "codeBlock",
            content: [{ text: "source" }],
            language: "javascript",
          },
          paragraphBlock("tail", "tail"),
        ),
      );
      setBoldStoredMark(tiptap);
      const before = editorState(editor, tiptap);
      const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

      expect(
        editor.commands.setBlockType("code", { type: "codeBlock", language }),
      ).toEqual(notApplicable("setBlockType"));
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual([]);
      expect(editor.commands.undo()).toEqual(notApplicable("undo"));
      dispatchSpy.mockRestore();
    },
  );

  it("language 변경은 기존 wrap 값을 보존한다(RD-001 DELTA-02, Issue #194)", () => {
    const { editor } = mounted(
      documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "source" }],
          language: "typescript",
          wrap: true,
        },
        paragraphBlock("tail", "tail"),
      ),
    );

    expect(
      editor.commands.setBlockType("code", {
        type: "codeBlock",
        language: "javascript",
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "code",
      type: "codeBlock",
      content: [{ text: "source" }],
      language: "javascript",
      wrap: true,
    });
  });

  it("현재 저장형과 같은 canonical language는 dispatch와 history가 없는 성공 no-op이다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "source" }],
          language: "javascript",
        },
        paragraphBlock("tail", "tail"),
      ),
    );
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    expect(
      editor.commands.setBlockType("code", {
        type: "codeBlock",
        language: "JS",
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
    dispatchSpy.mockRestore();
  });
});

describe("CodeBlock setText 거절", () => {
  it("CodeBlock의 setText는 COMMAND_NOT_APPLICABLE이며 모든 상태와 history를 보존한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "source" }],
          language: "javascript",
        },
        paragraphBlock("tail", "tail"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 2);
    setBoldStoredMark(tiptap);
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    expect(editor.commands.setText("code", "changed")).toEqual(
      notApplicable("setText"),
    );
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
    dispatchSpy.mockRestore();
  });

  it("setBlockType 공개 입력이 CodeBlock descriptor를 수용한다", () => {
    const descriptor: Parameters<
      EditorController["commands"]["setBlockType"]
    >[1] = { type: "codeBlock", language: "javascript" };

    expect(descriptor).toEqual({
      type: "codeBlock",
      language: "javascript",
    });
  });
});

/**
 * blockId 블록의 본문 노드(paragraph·heading·codeBlock 등)가 가진 PM JSON
 * content를 꺼낸다. getDocument()는 hardBreak와 리터럴 "\n" text를 구분하지
 * 못하므로 hardBreak 구조 단언은 이 JSON으로 한다.
 */
const bodyContentJson = (
  tiptap: Parameters<typeof contentTextStart>[0] & {
    getJSON: () => unknown;
  },
  blockId: string,
): unknown => {
  type PmJson = {
    type: string;
    attrs?: { blockId?: string };
    content?: PmJson[];
  };
  const find = (node: PmJson): PmJson | undefined => {
    if (node.type === "blockContainer" && node.attrs?.blockId === blockId) {
      return node;
    }
    for (const child of node.content ?? []) {
      const found = find(child);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const container = find(tiptap.getJSON() as PmJson);
  if (container === undefined)
    throw new Error(`blockContainer ${blockId} 조회 실패`);
  return container.content?.[0]?.content ?? [];
};

describe("hardBreak와 CodeBlock 경계 변환(Issue #226)", () => {
  const textBlocks: ReadonlyArray<{
    kind: string;
    block: (content: string) => Block;
  }> = [
    {
      kind: "paragraph",
      block: (content) => ({
        id: "source",
        type: "paragraph",
        content: [{ text: content }],
      }),
    },
    {
      kind: "heading",
      block: (content) => ({
        id: "source",
        type: "heading",
        level: 2,
        content: [{ text: content }],
      }),
    },
    {
      kind: "quote",
      block: (content) => ({
        id: "source",
        type: "quote",
        content: [{ text: content }],
      }),
    },
    {
      kind: "callout",
      block: (content) => ({
        id: "source",
        type: "callout",
        content: [{ text: content }],
      }),
    },
  ];

  it.each(textBlocks)(
    "$kind 블록의 hardBreak는 CodeBlock으로 바꿀 때 개행으로 남는다",
    ({ block }) => {
      const { editor, tiptap } = mounted(
        documentOf(block("ab\ncdef"), paragraphBlock("tail", "tail")),
      );

      expect(
        editor.commands.setBlockType("source", { type: "codeBlock" }),
      ).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks[0]).toEqual({
        id: "source",
        type: "codeBlock",
        content: [{ text: "ab\ncdef" }],
        language: "text",
      });
      expect(bodyContentJson(tiptap, "source")).toEqual([
        { type: "text", text: "ab\ncdef" },
      ]);
    },
  );

  it.each([
    {
      descriptor: { type: "paragraph" } as const,
      typeName: "paragraph",
    },
    {
      descriptor: { type: "heading", level: 3 } as const,
      typeName: "heading",
    },
    { descriptor: { type: "quote" } as const, typeName: "quote" },
    { descriptor: { type: "callout" } as const, typeName: "callout" },
  ])(
    "CodeBlock의 개행은 $typeName 블록으로 바꿀 때 hardBreak가 되고 리터럴 개행 text는 남지 않는다",
    ({ descriptor }) => {
      const { editor, tiptap } = mounted(
        documentOf(
          {
            id: "code",
            type: "codeBlock",
            content: [{ text: "x\ny" }],
            language: "text",
          },
          paragraphBlock("tail", "tail"),
        ),
      );

      expect(editor.commands.setBlockType("code", descriptor)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(bodyContentJson(tiptap, "code")).toEqual([
        { type: "text", text: "x" },
        { type: "hardBreak" },
        { type: "text", text: "y" },
      ]);
    },
  );

  it("CodeBlock의 연속 개행과 앞뒤 개행은 개행 개수만큼 hardBreak가 된다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "\na\n\nb\n" }],
          language: "text",
        },
        paragraphBlock("tail", "tail"),
      ),
    );

    expect(editor.commands.setBlockType("code", { type: "paragraph" })).toEqual(
      { ok: true, value: undefined },
    );
    expect(bodyContentJson(tiptap, "code")).toEqual([
      { type: "hardBreak" },
      { type: "text", text: "a" },
      { type: "hardBreak" },
      { type: "hardBreak" },
      { type: "text", text: "b" },
      { type: "hardBreak" },
    ]);
  });

  it("문단 → CodeBlock → 문단 왕복 뒤 PM 구조와 문서가 처음과 같다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("source", "ab\ncdef"),
        paragraphBlock("tail", "tail"),
      ),
    );
    const beforeJson = bodyContentJson(tiptap, "source");
    const beforeDocument = editor.getDocument().blocks[0];

    expect(
      editor.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });
    expect(
      editor.commands.setBlockType("source", { type: "paragraph" }),
    ).toEqual({ ok: true, value: undefined });

    expect(beforeJson).toEqual([
      { type: "text", text: "ab" },
      { type: "hardBreak" },
      { type: "text", text: "cdef" },
    ]);
    expect(bodyContentJson(tiptap, "source")).toEqual(beforeJson);
    expect(editor.getDocument().blocks[0]).toEqual(beforeDocument);
  });

  it("mark와 hardBreak가 섞인 문단은 mark를 잃고 개행은 보존한 CodeBlock이 된다", () => {
    const { editor } = mounted(
      documentOf(
        {
          id: "source",
          type: "paragraph",
          content: [
            { text: "ab", marks: [{ type: "bold" }] },
            { text: "\n" },
            { text: "cd", marks: [{ type: "italic" }] },
          ],
        },
        paragraphBlock("tail", "tail"),
      ),
    );

    expect(
      editor.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "source",
      type: "codeBlock",
      content: [{ text: "ab\ncd" }],
      language: "text",
    });
  });

  it("hardBreak가 낀 문단 → CodeBlock 변환은 한 transaction이고 undo 1회로 hardBreak까지 복원한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("source", "ab\ncdef"),
        paragraphBlock("tail", "tail"),
      ),
    );
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    expect(
      editor.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(editor.getDocument().revision).toBe(1);
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["source"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    expect(bodyContentJson(tiptap, "source")).toEqual([
      { type: "text", text: "ab" },
      { type: "hardBreak" },
      { type: "text", text: "cdef" },
    ]);
    dispatchSpy.mockRestore();
  });

  it("개행이 낀 CodeBlock → 문단 변환도 한 transaction이고 undo 1회로 복원한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "x\ny" }],
          language: "text",
        },
        paragraphBlock("tail", "tail"),
      ),
    );
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    expect(editor.commands.setBlockType("code", { type: "paragraph" })).toEqual(
      { ok: true, value: undefined },
    );
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["code"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    dispatchSpy.mockRestore();
  });

  it("hardBreak가 낀 목록 항목은 CodeBlock으로 바꾸지 않고 상태를 보존한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        {
          id: "item",
          type: "bulletListItem",
          content: [{ text: "ab\ncd" }],
        },
        paragraphBlock("tail", "tail"),
      ),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.setBlockType("item", { type: "codeBlock" })).toEqual(
      notApplicable("setBlockType"),
    );
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
  });

  it("CodeBlock → CodeBlock(language 변경)은 개행 content를 그대로 두고 hardBreak를 만들지 않는다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "x\ny" }],
          language: "typescript",
          wrap: true,
        },
        paragraphBlock("tail", "tail"),
      ),
    );

    expect(
      editor.commands.setBlockType("code", {
        type: "codeBlock",
        language: "javascript",
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "code",
      type: "codeBlock",
      content: [{ text: "x\ny" }],
      language: "javascript",
      wrap: true,
    });
    expect(bodyContentJson(tiptap, "code")).toEqual([
      { type: "text", text: "x\ny" },
    ]);
  });
});
