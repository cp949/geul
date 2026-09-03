/**
 * 목록 native shorthand 입력 규칙을 production EditorController의 Tiptap
 * handleTextInput 경계에서 검증한다. exact 대상·비대상, 중첩 구조, selection,
 * stored marks, revision/event, history와 trailing paragraph 원자성을 다룬다.
 */
import type { Block, Document } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";

import {
  contentTextStart,
  dispatchKeydown,
  dispatchTextInput,
  typeNativeText,
} from "./block-test-support.js";
import { pasteData } from "./clipboard-test-support.js";
import {
  documentOf,
  listItemBlock,
  mounted,
  paragraphBlock,
} from "./list-item-block-type-support.js";

/** 문서에서 주어진 텍스트 조각의 시작 위치를 찾는다. */
const textStart = (tiptap: TiptapEditor, text: string): number => {
  let found: number | null = null;
  tiptap.state.doc.descendants((node, position) => {
    if (node.isText && node.text === text) {
      found = position;
      return false;
    }
    return found === null;
  });
  if (found === null) throw new Error(`텍스트 ${text} 조회 실패`);
  return found;
};

/** paragraph 이외 content node의 marker 비대상 fixture를 만든다. */
const nonParagraphBlock = (type: "heading" | "quote" | "codeBlock"): Block => {
  if (type === "heading") {
    return { id: "target", type, level: 2, content: [{ text: "-" }] };
  }
  return { id: "target", type, content: [{ text: "-" }] };
};

/** table cell paragraph 안 marker의 비대상 fixture를 만든다. */
const tableCellDocument = (): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "table",
      type: "table",
      columns: [{ id: "column", width: 160 }],
      rows: [
        {
          id: "row",
          cells: [
            {
              id: "cell",
              columnId: "column",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "-" }],
            },
          ],
        },
      ],
      headerRows: 0,
      headerColumns: 0,
    },
    paragraphBlock("tail", "꼬리"),
  ],
});

describe("목록 native shorthand exact 변환", () => {
  it.each([
    ["-", "bulletListItem"],
    ["1.", "numberedListItem"],
  ] as const)(
    "exact %s 뒤 native space는 안정 ID를 보존한 빈 %s으로 변환한다",
    (marker, type) => {
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("target", marker),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "target") + marker.length,
      );

      expect(dispatchTextInput(tiptap, " ")).toBe(true);
      expect(editor.getDocument().blocks[0]).toEqual({
        id: "target",
        type,
        content: [],
      });
      expect(tiptap.state.selection.from).toBe(
        contentTextStart(tiptap, "target"),
      );
    },
  );

  it.each([
    ["선행 공백", " -"],
    ["문장 중간", "문장-"],
    ["겹친 하이픈", "--"],
    ["별표", "*"],
    ["더하기", "+"],
    ["2번", "2."],
    ["앞자리 0", "01."],
  ])(
    "%s marker 뒤 space는 변환하지 않고 native 입력을 보존한다",
    (_name, marker) => {
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("target", marker),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "target") + marker.length,
      );

      expect(typeNativeText(tiptap, " ")).toBe(false);
      expect(editor.getDocument().blocks[0]).toEqual(
        paragraphBlock("target", `${marker} `),
      );
    },
  );

  it.each([
    ["heading", "heading"],
    ["quote", "quote"],
    ["CodeBlock", "codeBlock"],
  ] as const)(
    "%s marker 뒤 space는 목록으로 변환하지 않는다",
    (_name, type) => {
      const block = nonParagraphBlock(type);
      const { editor, tiptap } = mounted(
        documentOf(block, paragraphBlock("tail", "꼬리")),
      );
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 1);

      expect(typeNativeText(tiptap, " ")).toBe(false);
      expect(editor.getDocument().blocks[0]).toEqual({
        ...block,
        content: [{ text: "- " }],
      });
    },
  );

  it("기존 목록 marker 뒤 space는 목록 종류를 다시 변환하지 않는다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        listItemBlock("target", "numberedListItem", "-", { startNumber: 7 }),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 1);

    expect(typeNativeText(tiptap, " ")).toBe(false);
    expect(editor.getDocument().blocks[0]).toEqual(
      listItemBlock("target", "numberedListItem", "- ", { startNumber: 7 }),
    );
  });

  it("표 셀 paragraph marker 뒤 space는 목록으로 변환하지 않는다", () => {
    const { editor, tiptap } = mounted(tableCellDocument());
    tiptap.commands.setTextSelection(textStart(tiptap, "-") + 1);

    expect(typeNativeText(tiptap, " ")).toBe(false);
    const table = editor.getDocument().blocks[0];
    if (table?.type !== "table") throw new Error("표 fixture 소실");
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "- " }]);
  });

  it.each([
    ["-x", 1],
    ["1.x", 2],
  ] as const)(
    "caret 뒤 suffix가 있는 %s의 marker 뒤 space는 목록으로 변환하지 않는다",
    (text, markerLength) => {
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("target", text),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "target") + markerLength,
      );

      expect(typeNativeText(tiptap, " ")).toBe(false);
      expect(editor.getDocument().blocks[0]).toEqual(
        paragraphBlock(
          "target",
          `${text.slice(0, markerLength)} ${text.slice(markerLength)}`,
        ),
      );
    },
  );

  it.each([
    ["-x", 1],
    ["1.xy", 2],
  ] as const)(
    "non-empty selection을 space로 대체해도 pre-input %s가 exact marker가 아니면 변환하지 않는다",
    (text, markerLength) => {
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("target", text),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      const start = contentTextStart(tiptap, "target");
      tiptap.commands.setTextSelection({
        from: start + markerLength,
        to: start + text.length,
      });

      expect(typeNativeText(tiptap, " ")).toBe(false);
      expect(editor.getDocument().blocks[0]).toEqual(
        paragraphBlock("target", `${text.slice(0, markerLength)} `),
      );
    },
  );
});

describe("목록 native shorthand 구조와 입력 상태", () => {
  it("중첩 paragraph 변환은 안정 ID와 형제 위치를 보존한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("parent", "부모", [paragraphBlock("target", "-")]),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 1);

    expect(dispatchTextInput(tiptap, " ")).toBe(true);
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraphBlock("parent", "부모", [
        { id: "target", type: "bulletListItem", content: [] },
      ]),
    );
  });

  it("children이 있는 paragraph 변환은 children 전체와 빈 목록 캐럿을 보존한다", () => {
    const children = [paragraphBlock("child", "자식")];
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("target", "1.", children),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 2);

    expect(dispatchTextInput(tiptap, " ")).toBe(true);
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "target",
      type: "numberedListItem",
      content: [],
      children,
    });
    const caret = contentTextStart(tiptap, "target");
    expect(tiptap.state.selection.toJSON()).toEqual({
      type: "text",
      anchor: caret,
      head: caret,
    });
  });

  it("선택 대체로 exact marker가 된 paragraph도 다음 native space에서 변환한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("target", "대체"),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    const start = contentTextStart(tiptap, "target");
    tiptap.commands.setTextSelection({ from: start, to: start + 2 });

    expect(typeNativeText(tiptap, "-")).toBe(false);
    expect(dispatchTextInput(tiptap, " ")).toBe(true);
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "target",
      type: "bulletListItem",
      content: [],
    });
  });

  it("bold marker 변환은 marker만 제거하고 빈 목록 캐럿의 stored mark를 보존한다", () => {
    const { editor, tiptap } = mounted({
      ...documentOf(
        paragraphBlock("target", "-"),
        paragraphBlock("tail", "꼬리"),
      ),
      blocks: [
        {
          id: "target",
          type: "paragraph",
          content: [{ text: "-", marks: [{ type: "bold" }] }],
        },
        paragraphBlock("tail", "꼬리"),
      ],
    });
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 1);

    expect(dispatchTextInput(tiptap, " ")).toBe(true);
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "target",
      type: "bulletListItem",
      content: [],
    });
    expect(tiptap.state.storedMarks?.map((mark) => mark.toJSON())).toEqual([
      { type: "bold" },
    ]);
  });

  it.each([
    ["-", "bulletListItem"],
    ["1.", "numberedListItem"],
  ] as const)(
    "%s 뒤 두 space는 첫 space만 변환하고 둘째 space를 목록 content로 입력한다",
    (marker, type) => {
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("target", marker),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "target") + marker.length,
      );

      expect(typeNativeText(tiptap, " ")).toBe(true);
      expect(typeNativeText(tiptap, " ")).toBe(false);
      expect(editor.getDocument().blocks[0]).toEqual({
        id: "target",
        type,
        content: [{ text: " " }],
      });
    },
  );
});

describe("목록 native shorthand transaction과 history", () => {
  it("변환은 view.dispatch·revision·change event를 각각 한 번만 만든다", () => {
    const { editor, changes, tiptap } = mounted(
      documentOf(paragraphBlock("target", "-"), paragraphBlock("tail", "꼬리")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 1);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(dispatchTextInput(tiptap, " ")).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(editor.getDocument().revision).toBe(1);
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["target"], reason: "local" },
    ]);
  });

  it("marker native 입력과 변환 history가 분리돼 public undo 한 번은 marker paragraph를 복원한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", ""), paragraphBlock("tail", "꼬리")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target"));

    expect(typeNativeText(tiptap, "-")).toBe(false);
    expect(typeNativeText(tiptap, " ")).toBe(true);
    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraphBlock("target", "-"),
    );
  });

  it.each(["-", "1."])(
    "기존 trailing이 있는 %s 변환 직후 Backspace는 literal 입력을 복원하고 trailing을 보존한다",
    (marker) => {
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("target", marker),
          paragraphBlock("tail", ""),
        ),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "target") + marker.length,
      );
      expect(dispatchTextInput(tiptap, " ")).toBe(true);

      expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("target", `${marker} `),
        paragraphBlock("tail", ""),
      ]);
    },
  );

  it("문서 끝 변환의 trailing paragraph는 같은 dispatch에서 ID를 받고 public undo 한 번에 함께 사라진다", () => {
    const { editor, changes, tiptap } = mounted(
      documentOf(paragraphBlock("target", "1.")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 2);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(dispatchTextInput(tiptap, " ")).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(editor.getDocument().blocks).toEqual([
      { id: "target", type: "numberedListItem", content: [] },
      paragraphBlock("id-1", ""),
    ]);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("target", "1."),
    ]);
    expect(changes).toHaveLength(2);
    expect(changes[1]?.reason).toBe("undo");
  });

  it("programmatic insertion은 exact shorthand를 변환하지 않는다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", "-"), paragraphBlock("tail", "꼬리")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 1);

    expect(tiptap.commands.insertContent(" ")).toBe(true);
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraphBlock("target", "- "),
    );
  });

  it("paste insertion은 exact shorthand를 변환하지 않는다", () => {
    const { editable, editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", ""), paragraphBlock("tail", "꼬리")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target"));
    editable.focus();

    pasteData(editable, { "text/plain": "- " });
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraphBlock("target", "- "),
    );
  });

  it("applyInputRules를 명시한 simulated programmatic insertion도 exact shorthand를 변환하지 않는다", async () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", "-"), paragraphBlock("tail", "꼬리")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 1);

    expect(tiptap.commands.insertContent(" ", { applyInputRules: true })).toBe(
      true,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraphBlock("target", "- "),
    );
  });

  it.each(["-", "1."])(
    "마지막 유일 %s paragraph 변환 뒤 trailing과 ID가 append돼도 즉시 Backspace가 literal 입력을 복원한다",
    (marker) => {
      const { editor, tiptap } = mounted(
        documentOf(paragraphBlock("target", marker)),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "target") + marker.length,
      );
      expect(dispatchTextInput(tiptap, " ")).toBe(true);

      expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("target", `${marker} `),
      ]);
    },
  );

  it("유일 paragraph 변환 직후 Backspace는 trailing 제거까지 단일 dispatch·revision·change event로 처리한다", () => {
    const { changes, editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", "-")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 1);
    expect(dispatchTextInput(tiptap, " ")).toBe(true);
    expect(editor.getDocument().revision).toBe(1);
    expect(changes).toHaveLength(1);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(editor.getDocument()).toEqual({
      ...documentOf(paragraphBlock("target", "- ")),
      revision: 2,
    });
    expect(changes).toHaveLength(2);
    expect(changes[1]?.revision).toBe(2);
    expect(changes[1]?.reason).toBe("local");
  });

  it("appended transaction 뒤 복원한 input-rule metadata는 다음 일반 입력에서 지워져 stale Backspace를 만들지 않는다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", "-")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 1);
    expect(dispatchTextInput(tiptap, " ")).toBe(true);

    expect(typeNativeText(tiptap, "x")).toBe(false);
    expect(tiptap.can().undoInputRule()).toBe(false);
    expect(dispatchKeydown(tiptap, "Backspace")).toBe(false);
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "target",
      type: "bulletListItem",
      content: [{ text: "x" }],
    });
  });
});
