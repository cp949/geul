/**
 * 공용 모듈 `table-test-support.ts`가 단독 소유하는 셀 선택 계약을 고정한다.
 * `selectCellRange`의 주석은 `CellSelection.create`가 기대하는 depth 규칙을
 * 단독으로 소유하는데, 그 규칙이 실제와 어긋나도 지는 것이 없었다(PIT-0022).
 *
 * 덮는 것: `selectCellRange`가 dispatch한 뒤 선택이 `CellSelection`이고 그
 * 양 끝이 넘긴 두 셀이라는 것, `selectSingleCell`이 만드는 선택의 anchor와
 * head가 같은 셀이라는 것, 두 헬퍼의 fixture 가드(`셀 fixture 준비 실패`),
 * 그리고 그 주석이 근거로 적은 depth 규칙 자체.
 *
 * depth 규칙은 헬퍼의 동작이 아니라 `CellSelection.create`의 동작이므로
 * `create`를 직접 호출해 고정한다. 다만 위치는 `findCellBoundaryPosition`으로
 * 얻으므로 그 두 테스트는 "그 헬퍼가 셀 **시작** 경계를 준다"도 함께 진다 —
 * 경계가 한 칸 밀리면 `depth 2` 단언이 먼저 깨진다. 실측: `found = pos`를
 * `found = pos + 1`로 바꾸면 이 파일이 `4 failed | 3 passed (7)`이 되고 depth
 * 두 건이 `expected 3 to be 2`·`expected 2 to be 3`으로 진다. 같은 헬퍼의
 * "못 찾으면 null"은 두 헬퍼의 `셀 fixture 준비 실패` 가드가 진다.
 *
 * 격리 fixture 에디터는 해제 책임이 호출부에 있다 — 왜 그런지는
 * `createTableFixtureEditor`의 주석이 소유한다. 여기서는 `it`마다
 * `editor.destroy()`로 끝낸다. 던지는 것을 단언하는 테스트도 예외가 아니다.
 *
 * 덮지 않는 것: 같은 모듈의 `placeCaretInCell`(경계 + 1에 캐럿을 둔다)·
 * `activeCellId`(`$from.depth` 자신부터 본다)의 주장,
 * `createTableFixtureEditor`·`emptyDocSchema`와 문서·데이터 fixture. 표 명령이
 * 이 선택을 어떻게 읽어 무엇을 하는지도 여기 범위가 아니다.
 */
import type { Editor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";

import {
  createTableFixtureEditor,
  docWithTwoRowTable,
  findCellBoundaryPosition,
  selectCellRange,
  selectSingleCell,
} from "./table-test-support.js";

/**
 * 현재 선택을 CellSelection으로 좁힌다. 좁히지 못하면 던져서 뒤따르는 단언이
 * 조용히 건너뛰어지지 않게 한다.
 */
const cellSelectionOf = (editor: Editor): CellSelection => {
  const { selection } = editor.state;
  if (!(selection instanceof CellSelection)) {
    throw new Error("CellSelection이 아니다");
  }
  return selection;
};

/** 셀 경계 위치를 꺼낸다. 못 찾으면 던져 fixture 결함을 즉시 드러낸다. */
const cellBoundaryOf = (editor: Editor, cellId: string): number => {
  const boundary = findCellBoundaryPosition(editor, cellId);
  if (boundary === null) throw new Error("셀 fixture 준비 실패");
  return boundary;
};

describe("표 셀 선택 fixture 계약", () => {
  describe("selectCellRange", () => {
    it("두 셀을 양 끝으로 하는 CellSelection을 dispatch한다", () => {
      const editor = createTableFixtureEditor(docWithTwoRowTable);

      selectCellRange(editor, "cell-1", "cell-4");

      expect(editor.state.selection).toBeInstanceOf(CellSelection);
      const selection = cellSelectionOf(editor);
      expect(selection.$anchorCell.nodeAfter?.attrs.cellId).toBe("cell-1");
      expect(selection.$headCell.nodeAfter?.attrs.cellId).toBe("cell-4");

      editor.destroy();
    });

    it("cellId가 undefined면 셀 fixture 준비 실패로 던진다", () => {
      const editor = createTableFixtureEditor(docWithTwoRowTable);

      expect(() => selectCellRange(editor, undefined, "cell-4")).toThrow(
        "셀 fixture 준비 실패",
      );
      expect(() => selectCellRange(editor, "cell-1", undefined)).toThrow(
        "셀 fixture 준비 실패",
      );

      editor.destroy();
    });

    it("문서에 없는 cellId면 셀 fixture 준비 실패로 던진다", () => {
      const editor = createTableFixtureEditor(docWithTwoRowTable);

      expect(() => selectCellRange(editor, "cell-1", "cell-없음")).toThrow(
        "셀 fixture 준비 실패",
      );

      editor.destroy();
    });

    it("anchor가 문서에 없는 cellId여도 셀 fixture 준비 실패로 던진다", () => {
      // head 누락만 덮으면 anchorPos === null 분기가 지지 않는다.
      const editor = createTableFixtureEditor(docWithTwoRowTable);

      expect(() => selectCellRange(editor, "cell-없음", "cell-4")).toThrow(
        "셀 fixture 준비 실패",
      );

      editor.destroy();
    });
  });

  describe("selectSingleCell", () => {
    it("anchor와 head가 같은 셀인 CellSelection을 dispatch한다", () => {
      const editor = createTableFixtureEditor(docWithTwoRowTable);

      selectSingleCell(editor, "cell-3");

      expect(editor.state.selection).toBeInstanceOf(CellSelection);
      const selection = cellSelectionOf(editor);
      expect(selection.$anchorCell.pos).toBe(selection.$headCell.pos);
      expect(selection.$anchorCell.nodeAfter?.attrs.cellId).toBe("cell-3");
      expect(selection.$headCell.nodeAfter?.attrs.cellId).toBe("cell-3");

      editor.destroy();
    });

    it("cellId가 undefined면 셀 fixture 준비 실패로 던진다", () => {
      const editor = createTableFixtureEditor(docWithTwoRowTable);

      expect(() => selectSingleCell(editor, undefined)).toThrow(
        "셀 fixture 준비 실패",
      );

      editor.destroy();
    });

    it("문서에 없는 cellId면 셀 fixture 준비 실패로 던진다", () => {
      // undefined 가드와 cellPos === null 가드는 별개 분기다.
      const editor = createTableFixtureEditor(docWithTwoRowTable);

      expect(() => selectSingleCell(editor, "cell-없음")).toThrow(
        "셀 fixture 준비 실패",
      );

      editor.destroy();
    });
  });

  describe("CellSelection.create의 depth 규칙", () => {
    it("셀 경계는 depth 2·node(-1)이 table이고 create가 성공한다", () => {
      const editor = createTableFixtureEditor(docWithTwoRowTable);
      const boundary = cellBoundaryOf(editor, "cell-1");

      const $boundary = editor.state.doc.resolve(boundary);
      expect($boundary.depth).toBe(2);
      expect($boundary.node(-1).type.name).toBe("table");

      const selection = CellSelection.create(editor.state.doc, boundary);
      expect(selection.$anchorCell.nodeAfter?.attrs.cellId).toBe("cell-1");

      editor.destroy();
    });

    it("셀 경계 + 1은 depth 3·node(-1)이 tableRow이고 create가 RangeError Not a table node: tableRow를 던진다", () => {
      const editor = createTableFixtureEditor(docWithTwoRowTable);
      const inside = cellBoundaryOf(editor, "cell-1") + 1;

      const $inside = editor.state.doc.resolve(inside);
      expect($inside.depth).toBe(3);
      expect($inside.node(-1).type.name).toBe("tableRow");

      expect(() => CellSelection.create(editor.state.doc, inside)).toThrow(
        RangeError,
      );
      expect(() => CellSelection.create(editor.state.doc, inside)).toThrow(
        "Not a table node: tableRow",
      );

      editor.destroy();
    });
  });
});
