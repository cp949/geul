/**
 * 표 키보드 확장의 핸들러 단위 계약을 검증한다. Tab/Shift+Tab 셀 탐색,
 * 셀 안 Enter의 아래 행 이동·마지막 행 no-op·무조건 소비, Shift+Enter
 * 소비와 stale DOM selection 재동기화(G-EDT-002)를 다룬다. 실 keymap 체인
 * 폴스루 회귀는 editor-controller-table.test.ts가 마운트 keydown으로
 * 고정한다.
 */
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";
import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import {
  consumeKeyInsideTable,
  goToNextTableCellOrInsertRow,
  goToPreviousTableCell,
  goToTableCellBelow,
} from "../src/table-keyboard-extension.js";
import { sequentialIds } from "./editor-controller-support.js";
import { withNativeCaret } from "./native-selection-test-support.js";
import {
  activeCellId,
  createTableFixtureEditor,
  docWithMergedTable,
  docWithParagraph,
  docWithTwoRowTable,
  findCellBoundaryPosition,
  placeCaretInCell,
  selectCellRange,
} from "./table-test-support.js";

/**
 * 표 뒤에 문단 하나를 둔 문서 — stale selection 재현(실제 DOM 캐럿은 셀 안,
 * editor.state.selection은 표 밖 문단)에 쓴다. Shift+Tab과 Enter의 stale
 * 경로 테스트가 공유한다.
 */
const docWithTableAndParagraph = {
  type: "doc",
  content: [
    docWithTwoRowTable.content?.[0] as Record<string, unknown>,
    {
      type: "paragraph",
      attrs: { blockId: "para-1" },
      content: [{ type: "text", text: "after table" }],
    },
  ],
};

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

describe("셀 Enter와 Shift+Enter", () => {
  it("Enter는 아래 행 같은 열 셀로 캐럿을 옮기고 selection 형태는 Tab 이동과 같다", () => {
    const enterEditor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(enterEditor, "cell-1");

    expect(goToTableCellBelow(enterEditor)).toBe(true);
    expect(activeCellId(enterEditor)).toBe("cell-3");

    // Tab으로 같은 목적지(cell-3)에 도착한 selection과 형태가 같아야
    // 한다(goToNextCell과 동일 정책 — 대상 셀 내용 선택).
    const tabEditor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(tabEditor, "cell-2");
    expect(goToNextTableCellOrInsertRow(tabEditor, sequentialIds("new"))).toBe(
      true,
    );
    expect(activeCellId(tabEditor)).toBe("cell-3");
    expect(enterEditor.state.selection.toJSON()).toEqual(
      tabEditor.state.selection.toJSON(),
    );
  });

  it("Enter 이동은 selection-only transaction 1개이고 undo 단위를 만들지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const dispatchSpy = vi.spyOn(editor.view, "dispatch");

    expect(goToTableCellBelow(editor)).toBe(true);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0]?.[0]?.docChanged).toBe(false);
    // selection-only transaction은 undo 대상이 아니다(G-EDT-001).
    expect(editor.commands.undo()).toBe(false);
    dispatchSpy.mockRestore();
  });

  it("마지막 행 셀의 Enter는 dispatch 없이 소비하고 selection을 그대로 둔다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-4");
    const selectionBefore = editor.state.selection.toJSON();
    const dispatchSpy = vi.spyOn(editor.view, "dispatch");

    expect(goToTableCellBelow(editor)).toBe(true);

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(editor.state.selection.toJSON()).toEqual(selectionBefore);
    dispatchSpy.mockRestore();
  });

  it("rowspan 셀의 Enter는 병합 높이를 건너뛴 아래 행 같은 열 셀로 이동한다", () => {
    const editor = createTableFixtureEditor(docWithMergedTable);
    placeCaretInCell(editor, "m-1");

    // m-1이 row-1·row-2를 덮으므로(rowspan 2) 아래 셀은 row-3의 m-5다.
    expect(goToTableCellBelow(editor)).toBe(true);
    expect(activeCellId(editor)).toBe("m-5");
  });

  it("아래 행이 병합 셀이면 그 셀로 들어가고, colspan 셀의 Enter는 아래 행 왼쪽 열 셀로 이동한다", () => {
    const editor = createTableFixtureEditor(docWithMergedTable);
    placeCaretInCell(editor, "m-2");

    expect(goToTableCellBelow(editor)).toBe(true);
    expect(activeCellId(editor)).toBe("m-4");

    // m-4는 col-2·col-3을 덮는다(colspan 2) — 기준 열은 왼쪽(col-2)이라
    // 아래 행에서 m-6으로 이동한다.
    expect(goToTableCellBelow(editor)).toBe(true);
    expect(activeCellId(editor)).toBe("m-6");
  });

  it("표 밖에서 Enter는 아무 것도 하지 않고 false를 반환한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const dispatchSpy = vi.spyOn(editor.view, "dispatch");

    expect(goToTableCellBelow(editor)).toBe(false);

    expect(dispatchSpy).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it("CellSelection 중 Enter는 소비하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    selectCellRange(editor, "cell-1", "cell-2");
    const docBefore = editor.getJSON();
    const dispatchSpy = vi.spyOn(editor.view, "dispatch");

    expect(goToTableCellBelow(editor)).toBe(true);

    // selectionCell은 CellSelection에서 뒤쪽 셀(cell-2)을 기준으로 주므로
    // 그 아래 행 같은 열 셀(cell-4)로 이동한다.
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(activeCellId(editor)).toBe("cell-4");
    expect(editor.getJSON()).toEqual(docBefore);
    dispatchSpy.mockRestore();
  });

  it("Shift+Enter는 표 안이면 dispatch 없이 소비하고 표 밖이면 false를 반환한다", () => {
    const tableEditor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(tableEditor, "cell-1");
    const dispatchSpy = vi.spyOn(tableEditor.view, "dispatch");
    expect(consumeKeyInsideTable(tableEditor)).toBe(true);
    expect(dispatchSpy).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();

    const paragraphEditor = createTableFixtureEditor(docWithParagraph);
    paragraphEditor.commands.setTextSelection(1);
    expect(consumeKeyInsideTable(paragraphEditor)).toBe(false);
  });

  it("Enter는 stale editor.state를 무시하고 실제 DOM selection을 따른다", () => {
    const editor = createTableFixtureEditor(docWithTableAndParagraph);

    // cell-1 안에 실제 PM 캐럿을 둔다 (실제 DOM selection의 source).
    const cellBoundary = findCellBoundaryPosition(editor, "cell-1");
    if (cellBoundary === null) throw new Error("셀 fixture 준비 실패");
    editor.commands.setTextSelection(cellBoundary + 1);
    const { node: nodeAtCell } = editor.view.domAtPos(cellBoundary + 1);
    const textNode = nodeAtCell.childNodes[0] || nodeAtCell;

    // createTableFixtureEditor의 element는 붙어 있지 않은 detached div라
    // withNativeCaret이 body에 부착·해제를 진다(G-TST-003).
    const editable = editor.view.dom as HTMLElement;
    withNativeCaret(
      editable,
      () => {
        // editor.state.selection만 의도적으로 표 뒤 문단으로 stale하게
        // 만든다. 실제 DOM selection은 cell-1 안이다 — stale 판정이
        // isInTable 가드를 우회하면 코어 Enter 체인 폴스루가 재발한다.
        const paraPos = editor.state.doc.content.size - 3;
        editor.view.dispatch(
          editor.state.tr.setSelection(
            TextSelection.near(editor.state.doc.resolve(paraPos)),
          ),
        );
        expect(editor.state.selection.from).toBeGreaterThan(cellBoundary + 2);

        const dispatchSpy = vi.spyOn(editor.view, "dispatch");

        const consumed = goToTableCellBelow(editor);

        // DOM selection(cell-1) 기준으로 표 안이라 소비하고 아래 행 같은 열
        // 셀(cell-3)로 이동한다. dispatch는 0~1회다(G-EDT-002 완료 기준).
        expect(consumed).toBe(true);
        expect([0, 1]).toContain(dispatchSpy.mock.calls.length);
        expect(activeCellId(editor)).toBe("cell-3");

        dispatchSpy.mockRestore();
      },
      textNode,
    );
  });

  it("Enter는 DOM 캐럿이 표 밖이어도 live selection이 셀 안이면 소비하고 아무 것도 하지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTableAndParagraph);
    placeCaretInCell(editor, "cell-1");

    // 역방향 stale — 셀 안 캐럿 상태에서 표 밖 문단 클릭 직후(비동기
    // selectionchange 전) Enter. 실제 DOM 캐럿은 표 뒤 문단 텍스트다.
    const paraPos = editor.state.doc.content.size - 3;
    const { node: nodeAtPara } = editor.view.domAtPos(paraPos);
    const textNode = nodeAtPara.childNodes[0] || nodeAtPara;

    const editable = editor.view.dom as HTMLElement;
    withNativeCaret(
      editable,
      () => {
        const selectionBefore = editor.state.selection.toJSON();
        const dispatchSpy = vi.spyOn(editor.view, "dispatch");

        // resync 결과(표 밖)만 보고 false를 반환하면 코어 Enter 체인이 live
        // stale(셀 안) selection에 분할 tr을 적용해 행·셀을 손상시킨다 —
        // live state가 표 안이면 dispatch 없이 소비해야 한다.
        expect(goToTableCellBelow(editor)).toBe(true);

        expect(dispatchSpy).not.toHaveBeenCalled();
        expect(editor.state.selection.toJSON()).toEqual(selectionBefore);
        dispatchSpy.mockRestore();
      },
      textNode,
    );
  });

  it("Shift+Enter도 DOM 캐럿이 표 밖이어도 live selection이 셀 안이면 소비한다", () => {
    const editor = createTableFixtureEditor(docWithTableAndParagraph);
    placeCaretInCell(editor, "cell-1");

    const paraPos = editor.state.doc.content.size - 3;
    const { node: nodeAtPara } = editor.view.domAtPos(paraPos);
    const textNode = nodeAtPara.childNodes[0] || nodeAtPara;

    const editable = editor.view.dom as HTMLElement;
    withNativeCaret(
      editable,
      () => {
        const dispatchSpy = vi.spyOn(editor.view, "dispatch");

        expect(consumeKeyInsideTable(editor)).toBe(true);

        expect(dispatchSpy).not.toHaveBeenCalled();
        dispatchSpy.mockRestore();
      },
      textNode,
    );
  });
});
