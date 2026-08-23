import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import {
  goToNextTableCellOrInsertRow,
  goToPreviousTableCell,
} from "../src/table-keyboard-extension.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  activeCellId,
  createTableFixtureEditor,
  docWithParagraph,
  docWithTwoRowTable,
  placeCaretInCell,
} from "./table-test-support.js";

describe("Tab/Shift+Tab 셀 탐색", () => {
  it("Tab은 같은 행의 다음 셀로 캐럿을 옮긴다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");

    const moved = goToNextTableCellOrInsertRow(editor, sequentialIds("new"));

    expect(moved).toBe(true);
    expect(activeCellId(editor)).toBe("cell-2");
  });

  it("행의 마지막 셀에서 Tab은 다음 행의 첫 셀로 넘어간다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-2");

    const moved = goToNextTableCellOrInsertRow(editor, sequentialIds("new"));

    expect(moved).toBe(true);
    expect(activeCellId(editor)).toBe("cell-3");
  });

  it("표의 마지막 셀에서 Tab은 새 행을 추가하고 그 첫 셀로 캐럿을 옮긴다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-4");

    const moved = goToNextTableCellOrInsertRow(editor, sequentialIds("new"));

    expect(moved).toBe(true);
    const table = (editor.getJSON() as TiptapJsonNode).content?.[0];
    expect(table?.content).toHaveLength(3);
    const newCellId = table?.content?.[2]?.content?.[0]?.attrs?.cellId;
    expect(typeof newCellId).toBe("string");
    expect(activeCellId(editor)).toBe(newCellId);
  });

  it("새 행 생성은 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-4");
    const before = editor.getJSON() as TiptapJsonNode;

    goToNextTableCellOrInsertRow(editor, sequentialIds("new"));
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("Shift+Tab은 이전 셀로 캐럿을 옮긴다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-2");

    const moved = goToPreviousTableCell(editor);

    expect(moved).toBe(true);
    expect(activeCellId(editor)).toBe("cell-1");
  });

  it("표의 첫 셀에서 Shift+Tab은 캐럿을 그대로 두고 표 밖으로 포커스를 넘기지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const before = editor.state.selection.from;

    const moved = goToPreviousTableCell(editor);

    expect(moved).toBe(true);
    expect(editor.state.selection.from).toBe(before);
  });

  it("표 밖에서는 아무 것도 하지 않고 false를 반환한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);

    expect(goToNextTableCellOrInsertRow(editor, sequentialIds("new"))).toBe(
      false,
    );
    expect(goToPreviousTableCell(editor)).toBe(false);
  });
});
