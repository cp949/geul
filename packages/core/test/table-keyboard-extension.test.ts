import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";
import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import {
  goToNextTableCellOrInsertRow,
  goToPreviousTableCell,
} from "../src/table-keyboard-extension.js";
import { sequentialIds } from "./editor-controller-support.js";
import { withNativeCaret } from "./native-selection-test-support.js";
import {
  activeCellId,
  createTableFixtureEditor,
  docWithParagraph,
  docWithTwoRowTable,
  findCellBoundaryPosition,
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

  it("Shift+Tab은 stale editor.state를 무시하고 실제 DOM selection을 따른다", () => {
    // 표와 문단이 모두 있는 문서를 준비한다.
    const tableContent = docWithTwoRowTable.content?.[0] as Record<
      string,
      unknown
    >;
    const docWithTableAndParagraph = {
      type: "doc",
      content: [
        tableContent,
        {
          type: "paragraph",
          attrs: { blockId: "para-1" },
          content: [{ type: "text", text: "after table" }],
        },
      ],
    };

    const editor = createTableFixtureEditor(docWithTableAndParagraph);

    // cell-1 안에 실제 PM 캐럿을 둔다 (실제 DOM selection의 source).
    const cellBoundary = findCellBoundaryPosition(editor, "cell-1");
    if (cellBoundary === null) throw new Error("셀 fixture 준비 실패");
    editor.commands.setTextSelection(cellBoundary + 1);

    // ProseMirror의 내부 DOM 구조에서 실제 텍스트 노드를 찾는다.
    // domAtPos(pos)는 실제 PM DOM 노드와 offset을 반환한다.
    const { node: nodeAtCell } = editor.view.domAtPos(cellBoundary + 1);
    const textNode = nodeAtCell.childNodes[0] || nodeAtCell;

    // createTableFixtureEditor의 element는 붙어 있지 않은 detached div라
    // withNativeCaret이 body에 부착·해제를 진다(G-TST-003).
    const editable = editor.view.dom as HTMLElement;
    withNativeCaret(
      editable,
      () => {
        // 이제 editor.state.selection만 의도적으로 stale하게 만든다(표 뒤
        // 문단으로). 실제 DOM selection은 cell-1 안이지만 editor.state.selection은
        // 표 밖이다.
        const paraPos = editor.state.doc.content.size - 3; // 대략 문단 안
        editor.view.dispatch(
          editor.state.tr.setSelection(
            TextSelection.near(editor.state.doc.resolve(paraPos)),
          ),
        );

        // editor.state.selection은 표 밖이므로 isInTable이 false라고 판정할 것이다.
        // 하지만 실제 DOM selection은 cell-1 안이다.
        const staleFrom = editor.state.selection.from;
        expect(staleFrom).toBeGreaterThan(cellBoundary + 2); // 표 밖

        const dispatchSpy = vi.spyOn(editor.view, "dispatch");

        const moved = goToPreviousTableCell(editor);

        // 이 단언이 RED다. 수정 전 코드는 editor.state.selection(표 밖)을 읽어
        // isInTable이 false라고 판정하고 false를 반환한다.
        // 수정 후는 실제 DOM selection을 대조해서 table 안이라고 올바르게
        // 판정한다.
        expect(moved).toBe(true);

        // dispatch는 0~1회 호출되어야 한다(첫 셀이라 이동할 곳이 없으면 0회).
        expect([0, 1]).toContain(dispatchSpy.mock.calls.length);

        dispatchSpy.mockRestore();
      },
      textNode,
    );
  });

  it("resolveSelectionAwareState는 posAtDOM 예외를 조용히 처리한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);

    // 실제 pm state를 표 안으로 설정한다.
    const cellBoundary = findCellBoundaryPosition(editor, "cell-1");
    if (cellBoundary === null) throw new Error("셀 fixture 준비 실패");
    editor.commands.setTextSelection(cellBoundary + 1);

    // DOM selection을 뷰 밖의 노드로 설정한다(posAtDOM이 예외를 던진다).
    // outOfViewNode는 editable과 별개로 document.body에 직접 붙인다 — PM
    // 뷰 트리 밖이면서도 Selection API가 추적할 수 있는 연결된 노드여야
    // 한다(위 테스트와 같은 이유, G-TST-003). withNativeCaret이 부착·해제를
    // 진다.
    const editable = editor.view.dom as HTMLElement;
    const outOfViewNode = editable.ownerDocument.createElement("div");
    withNativeCaret(outOfViewNode, () => {
      const dispatchSpy = vi.spyOn(editor.view, "dispatch");

      // posAtDOM이 뷰 밖 노드라 예외를 던지지만 조용히 폴백해야 한다.
      const moved = goToPreviousTableCell(editor);

      expect(moved).toBe(true);
      // posAtDOM 예외로 폴백했으므로 실제 state(cell-1)를 읽어 table 안으로
      // 판정한다. dispatch는 0~1회 호출되어야 한다.
      expect([0, 1]).toContain(dispatchSpy.mock.calls.length);

      dispatchSpy.mockRestore();
    });
  });
});
