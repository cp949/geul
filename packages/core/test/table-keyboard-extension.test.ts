import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import {
  goToNextTableCellOrInsertRow,
  goToPreviousTableCell,
} from "../src/table-keyboard-extension.js";
import { createTableFixtureEditor } from "./table-test-support.js";

const sequentialIds = (prefix: string) => {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
};

const cellJson = (cellId: string, columnId: string) => ({
  type: "tableCell",
  attrs: {
    cellId,
    columnId,
    colspan: 1,
    rowspan: 1,
    colwidth: null,
    textColor: null,
    backgroundColor: null,
  },
  content: [],
});

const docWithTwoRowTable = {
  type: "doc",
  content: [
    {
      type: "table",
      attrs: {
        blockId: "table-1",
        columns: [
          { id: "col-1", width: 160 },
          { id: "col-2", width: 160 },
        ],
        headerRows: 0,
        headerColumns: 0,
      },
      content: [
        {
          type: "tableRow",
          attrs: { rowId: "row-1" },
          content: [cellJson("cell-1", "col-1"), cellJson("cell-2", "col-2")],
        },
        {
          type: "tableRow",
          attrs: { rowId: "row-2" },
          content: [cellJson("cell-3", "col-1"), cellJson("cell-4", "col-2")],
        },
      ],
    },
  ],
};

const docWithParagraph = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { blockId: "para-1" },
      content: [{ type: "text", text: "hello" }],
    },
  ],
};

const findCellBoundaryPosition = (
  editor: ReturnType<typeof createTableFixtureEditor>,
  cellId: string,
): number | null => {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "tableCell" && node.attrs.cellId === cellId) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
};

const placeCaretInCell = (
  editor: ReturnType<typeof createTableFixtureEditor>,
  cellId: string,
) => {
  const boundary = findCellBoundaryPosition(editor, cellId);
  if (boundary === null) throw new Error("셀 fixture 준비 실패");
  editor.commands.setTextSelection(boundary + 1);
};

const activeCellId = (
  editor: ReturnType<typeof createTableFixtureEditor>,
): string | null => {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "tableCell") {
      const cellId = node.attrs.cellId;
      return typeof cellId === "string" ? cellId : null;
    }
  }
  return null;
};

describe("Tab/Shift+Tab 셀 탐색", () => {
  it("Tab은 같은 행의 다음 셀로 캐럿을 옮긴다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");

    const moved = goToNextTableCellOrInsertRow(editor, sequentialIds("new"));

    expect(moved).toBe(true);
    expect(activeCellId(editor)).toBe("cell-2");
    editor.destroy();
  });

  it("행의 마지막 셀에서 Tab은 다음 행의 첫 셀로 넘어간다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-2");

    const moved = goToNextTableCellOrInsertRow(editor, sequentialIds("new"));

    expect(moved).toBe(true);
    expect(activeCellId(editor)).toBe("cell-3");
    editor.destroy();
  });

  it("표의 마지막 셀에서 Tab은 새 행을 추가하고 그 첫 셀로 캐럿을 옮긴다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-4");

    const moved = goToNextTableCellOrInsertRow(editor, sequentialIds("new"));

    expect(moved).toBe(true);
    const table = (editor.getJSON() as JSONContent).content?.[0];
    expect(table?.content).toHaveLength(3);
    const newCellId = table?.content?.[2]?.content?.[0]?.attrs?.cellId;
    expect(typeof newCellId).toBe("string");
    expect(activeCellId(editor)).toBe(newCellId);
    editor.destroy();
  });

  it("새 행 생성은 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-4");
    const before = (editor.getJSON() as JSONContent);

    goToNextTableCellOrInsertRow(editor, sequentialIds("new"));
    editor.commands.undo();

    expect((editor.getJSON() as JSONContent)).toEqual(before);
    editor.destroy();
  });

  it("Shift+Tab은 이전 셀로 캐럿을 옮긴다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-2");

    const moved = goToPreviousTableCell(editor);

    expect(moved).toBe(true);
    expect(activeCellId(editor)).toBe("cell-1");
    editor.destroy();
  });

  it("표의 첫 셀에서 Shift+Tab은 캐럿을 그대로 두고 표 밖으로 포커스를 넘기지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const before = editor.state.selection.from;

    const moved = goToPreviousTableCell(editor);

    expect(moved).toBe(true);
    expect(editor.state.selection.from).toBe(before);
    editor.destroy();
  });

  it("표 밖에서는 아무 것도 하지 않고 false를 반환한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);

    expect(goToNextTableCellOrInsertRow(editor, sequentialIds("new"))).toBe(
      false,
    );
    expect(goToPreviousTableCell(editor)).toBe(false);
    editor.destroy();
  });
});
