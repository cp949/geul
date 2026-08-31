/**
 * 공용 모듈 `table-test-support.ts`가 단독 소유하는 셀 선택 계약과
 * `createTableFixtureEditor`가 만든 에디터의 해제 시점 계약을 고정한다.
 * `selectCellRange`의 주석은 `CellSelection.create`가 기대하는 depth 규칙을
 * 단독으로 소유하는데, 그 규칙이 실제와 어긋나도 지는 것이 없었다(G-TST-002).
 *
 * 덮는 것: `selectCellRange`가 dispatch한 뒤 선택이 `CellSelection`이고 그
 * 양 끝이 넘긴 두 셀이라는 것, `selectSingleCell`이 만드는 선택의 anchor와
 * head가 같은 셀이라는 것, 두 헬퍼의 fixture 가드(`셀 fixture 준비 실패`),
 * 그 주석이 근거로 적은 depth 규칙 자체, 그리고
 * `createTableFixtureEditor`가 만든 에디터가 `it` 실행 도중 던지고 그 예외를
 * 그 `it` 자신이 잡아 통과 처리되더라도(즉 `editor.destroy()`를 부르지 않고
 * 끝나더라도) `table-test-support.ts`가 export하는 정리 함수
 * (`destroyFixtureEditorsForTest`)를 직접 호출하면 해제된다는 것.
 *
 * depth 규칙은 헬퍼의 동작이 아니라 `CellSelection.create`의 동작이므로
 * `create`를 직접 호출해 고정한다. 다만 위치는 `findCellBoundaryPosition`으로
 * 얻으므로 그 두 테스트는 "그 헬퍼가 셀 **시작** 경계를 준다"도 함께 진다 —
 * 경계가 한 칸 밀리면 `depth 2` 단언이 먼저 깨진다. 실측: `found = pos`를
 * `found = pos + 1`로 바꾸면 depth 두 건이 `expected 3 to be 2`·
 * `expected 2 to be 3`으로 지고 선택 두 건이 함께 진다. 파일의 통과·실패
 * 개수는 적지 않는다 — 테스트를 더할 때마다 썩는다. 같은 헬퍼의 "못 찾으면
 * null"은 두 헬퍼의 `셀 fixture 준비 실패` 가드가 진다.
 *
 * 격리 fixture 에디터의 해제 책임은 `table-test-support.ts`가 등록하는
 * module-scope `Set`과 `afterEach`가 단독으로 진다 — 왜 그런 구조인지는
 * 그 `Set` 선언부 옆 주석이 소유한다. 이 파일의 셀 선택 테스트도 이제 다른
 * 호출부와 마찬가지로 `afterEach` 단독 정리에 의존한다. 아래
 * `createTableFixtureEditor 해제 계약` 블록은 정반대 경우 — 호출부가 전혀
 * 해제하지 않고 끝나는 경우 — 를 재현하되, `afterEach`가 실제로 실행되는지는
 * vitest의 훅 스케줄링(`it` 등록 순서, `--sequence.shuffle`, 훅 간 실행
 * 순서)에 기대지 않는다. `afterEach`가 참조하는 바로 그 정리 함수
 * (`destroyFixtureEditorsForTest`)를 `it` 하나 안에서 직접 호출해, 정리 없이
 * 남은 에디터가 실제로 해제되는지를 확인한다.
 *
 * `destroyFixtureEditorsForTest 실패 집계` 블록은 등록된 editor 중 하나(또는
 * 여럿)의 `destroy()`가 던질 때의 계약을 고정한다(G-TST-003, Issue #140):
 * 앞선 실패가 나머지 editor의 `destroy()` 시도를 막지 않는다는 것, 내부
 * `Set`은 성공·실패와 무관하게 비운다는 것(재호출이 같은 예외를 다시 던지지
 * 않는 것으로 간접 확인한다 — module-scope `Set`은 export되지 않는다), 여러
 * 실패가 하나의 `AggregateError`로 함께 보고된다는 것.
 *
 * 덮지 않는 것: 같은 모듈의 `placeCaretInCell`(경계 + 1에 캐럿을 둔다)·
 * `activeCellId`(`$from.depth` 자신부터 본다)의 주장, `createTableFixtureEditor`의
 * 생성 인자 처리·`emptyDocSchema`가 돌려주는 스키마 내용과 문서·데이터
 * fixture. 표 명령이 이 선택을 어떻게 읽어 무엇을 하는지도 여기 범위가
 * 아니다.
 */
import type { Editor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";

import {
  createTableFixtureEditor,
  destroyFixtureEditorsForTest,
  docWithParagraph,
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
    });

    it("cellId가 undefined면 셀 fixture 준비 실패로 던진다", () => {
      const editor = createTableFixtureEditor(docWithTwoRowTable);

      expect(() => selectCellRange(editor, undefined, "cell-4")).toThrow(
        "셀 fixture 준비 실패",
      );
      expect(() => selectCellRange(editor, "cell-1", undefined)).toThrow(
        "셀 fixture 준비 실패",
      );
    });

    it("문서에 없는 cellId면 셀 fixture 준비 실패로 던진다", () => {
      const editor = createTableFixtureEditor(docWithTwoRowTable);

      expect(() => selectCellRange(editor, "cell-1", "cell-없음")).toThrow(
        "셀 fixture 준비 실패",
      );
    });

    it("anchor가 문서에 없는 cellId여도 셀 fixture 준비 실패로 던진다", () => {
      // head 누락만 덮으면 anchorPos === null 분기가 지지 않는다.
      const editor = createTableFixtureEditor(docWithTwoRowTable);

      expect(() => selectCellRange(editor, "cell-없음", "cell-4")).toThrow(
        "셀 fixture 준비 실패",
      );
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
    });

    it("cellId가 undefined면 셀 fixture 준비 실패로 던진다", () => {
      const editor = createTableFixtureEditor(docWithTwoRowTable);

      expect(() => selectSingleCell(editor, undefined)).toThrow(
        "셀 fixture 준비 실패",
      );
    });

    it("문서에 없는 cellId면 셀 fixture 준비 실패로 던진다", () => {
      // undefined 가드와 cellPos === null 가드는 별개 분기다.
      const editor = createTableFixtureEditor(docWithTwoRowTable);

      expect(() => selectSingleCell(editor, "cell-없음")).toThrow(
        "셀 fixture 준비 실패",
      );
    });
  });

  describe("CellSelection.create의 depth 규칙", () => {
    it("셀 경계는 depth 2·node(-1)이 table이고 create가 성공한다", () => {
      // depth 2는 docWithTwoRowTable이 표를 doc 직속에 두기 때문이다. 표가
      // 다른 블록 안에 들어가는 문서에서는 이 값이 아니다.
      const editor = createTableFixtureEditor(docWithTwoRowTable);
      const boundary = cellBoundaryOf(editor, "cell-1");

      const $boundary = editor.state.doc.resolve(boundary);
      expect($boundary.depth).toBe(2);
      expect($boundary.node(-1).type.name).toBe("table");

      const selection = CellSelection.create(editor.state.doc, boundary);
      expect(selection.$anchorCell.nodeAfter?.attrs.cellId).toBe("cell-1");
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
    });
  });
});

describe("createTableFixtureEditor 해제 계약", () => {
  it("editor.destroy()를 부르지 않고 끝나도 정리 함수를 직접 부르면 해제된다", () => {
    const leaked = createTableFixtureEditor(docWithParagraph);

    // 의도적으로 정리 없이 끝낸다 — leaked.destroy()는 이 문장 이전 어디서도
    // 부르지 않는다. 던지는 코드를 실행하고 그 예외를 그 자리에서 잡아
    // 통과시킨다 — "정리 없이 끝나는 it 자신은 통과한다"는 것도 여기서 진다.
    expect(() => {
      throw new Error("의도된 실패");
    }).toThrow("의도된 실패");
    expect(leaked.isDestroyed).toBe(false);

    // afterEach가 참조하는 바로 그 정리 함수를 여기서 직접 호출한다 —
    // vitest의 훅 스케줄링(it 등록 순서, --sequence.shuffle, 훅 간 실행
    // 순서)에 기대지 않는다.
    destroyFixtureEditorsForTest();

    expect(leaked.isDestroyed).toBe(true);
  });
});

describe("destroyFixtureEditorsForTest 실패 집계", () => {
  it("등록된 editor 중 하나의 destroy()가 던져도 나머지가 정리되고 실패가 집계된다", () => {
    // failing을 가장 먼저 등록해 Set 순회가 그 실패를 첫 항목으로 만나게
    // 한다 — "첫 실패가 나머지 정리를 막지 않는다"를 재현하려면 실패가
    // 앞서야 한다.
    const failing = createTableFixtureEditor(docWithParagraph);
    const survivorA = createTableFixtureEditor(docWithParagraph);
    const survivorB = createTableFixtureEditor(docWithParagraph);
    failing.destroy = () => {
      throw new Error("의도된 destroy 실패");
    };

    let thrown: unknown;
    try {
      destroyFixtureEditorsForTest();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect(survivorA.isDestroyed).toBe(true);
    expect(survivorB.isDestroyed).toBe(true);

    // Set이 성공·실패와 무관하게 비었는지 확인한다 — 비지 않았다면 failing이
    // 여전히 등록돼 있어 재호출이 같은 예외를 다시 던진다.
    expect(() => destroyFixtureEditorsForTest()).not.toThrow();
  });

  it("여러 editor의 destroy() 실패가 하나의 AggregateError로 함께 보고된다", () => {
    const failingA = createTableFixtureEditor(docWithParagraph);
    const failingB = createTableFixtureEditor(docWithParagraph);
    failingA.destroy = () => {
      throw new Error("첫 번째 실패");
    };
    failingB.destroy = () => {
      throw new Error("두 번째 실패");
    };

    let thrown: unknown;
    try {
      destroyFixtureEditorsForTest();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.errors).toHaveLength(2);
    expect(
      aggregate.errors.map((error: unknown) =>
        error instanceof Error ? error.message : String(error),
      ),
    ).toEqual(["첫 번째 실패", "두 번째 실패"]);
  });
});
