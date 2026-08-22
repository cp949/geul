/**
 * 공용 모듈 `editor-controller-support.ts`가 단독 소유하는 표 fixture 주장을
 * 고정한다. 그 주석들은 실측으로만 확인됐고 그 주장을 지는 것이 하나도 없었다
 * (PIT-0022) — 여기서 지게 만든다.
 *
 * 덮는 것은 넷이다. `tableBlockIn`의 "인덱스 1" 전제와 타입 가드,
 * `tableBlockOf`가 그 규칙을 컨트롤러의 저장 문서에 그대로 적용한다는 것,
 * `firstTableBlockIn`이 인덱스를 전제하지 **않는다**는 것(그래서 표가 인덱스
 * 1이 아닌 문서에서 두 질의가 갈린다)과 여러 표 중 **첫 번째**를 준다는 것,
 * `editorWithTable`의 기본 크기·블록 배치와 `cellIds`의 행 우선(row-major)
 * 순서, 그리고 그 fixture 가드(`표 삽입 fixture 준비 실패`).
 *
 * 행 우선 주장만 저장 문서가 아니라 **마운트된 편집기의 렌더 결과**와
 * 대조한다. 저장 문서의 `rows.flatMap(...)`과 대조하면 `cellIds`를 만든 식을
 * 그대로 되뇌는 동어반복이라 순서가 바뀌어도 지지 않는다.
 *
 * `tableBlockOf`는 `tableBlockIn(editor.getDocument())`과 대조하지 않는다 —
 * 그 단언은 구현식을 그대로 되뇌어 인덱스 1 규칙을 버리고 탐색 질의로 바뀌어도
 * 지지 않는다(실측: `firstTableBlockIn` 위임으로 바꿔도 그 단언만은 통과했다).
 * 표가 인덱스 0인 컨트롤러에서 `tableBlockOf`가 던지고 `firstTableBlockIn`은
 * 찾는 것으로 갈림을 고정하고, 정상 경로는 `인자가 없으면 2x2 표를 만든다`가
 * 함께 부른다.
 *
 * 덮지 않는 것: 같은 모듈의 `paragraphDocument`·`sequentialIds`·
 * `documentWithContent`·`mountTiptapEditor`·`editorState`, 그리고 셀 위치·선택·
 * 캐럿 헬퍼(`findCellBoundaryPosition`·`selectCellRange`·`selectSingleCell`·
 * `placeCaretInCell`·`activeCellId`)의 주장. `insertTable` 명령이 무엇을
 * 만드는지도 여기 범위가 아니다 — 여기서 보는 것은 fixture가 그 결과를 어떤
 * 모양으로 내놓는가다.
 */
import type { Document, TableBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  editorWithTable,
  firstTableBlockIn,
  mountTiptapEditor,
  paragraphDocument,
  tableBlockIn,
  tableBlockOf,
} from "./editor-controller-support.js";

/**
 * 표를 인덱스 0에 두고 문단을 뒤에 붙인 문서. 인덱스 고정 질의와 탐색 질의를
 * 갈라 놓으려고 손으로 조립한다 — `editorWithTable`이 만드는 배치로는 두
 * 질의가 언제나 같은 블록을 주므로 차이가 드러나지 않는다.
 */
const tableFirstDocument = (): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "table-1",
      type: "table",
      columns: [{ id: "col-1", width: 160 }],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "col-1",
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
    { id: "block-2", type: "paragraph", content: [{ text: "뒤 문단" }] },
  ],
});

/**
 * 문단 2개짜리 문서. 인덱스 1이 존재하면서 표가 아닌 경우를 만든다 —
 * paragraphDocument는 블록이 하나라 인덱스 1이 undefined인 경우만 준다.
 */
const twoParagraphDocument = (): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    { id: "block-1", type: "paragraph", content: [{ text: "앞" }] },
    { id: "block-2", type: "paragraph", content: [{ text: "뒤" }] },
  ],
});

/** 표 하나를 만든다. 표가 둘인 문서를 조립할 때 행 하나짜리로 쓴다. */
const singleCellTable = (suffix: string): Document["blocks"][number] => ({
  id: `table-${suffix}`,
  type: "table",
  columns: [{ id: `col-${suffix}`, width: 160 }],
  rows: [
    {
      id: `row-${suffix}`,
      cells: [
        {
          id: `cell-${suffix}`,
          columnId: `col-${suffix}`,
          rowSpan: 1,
          columnSpan: 1,
          content: [],
        },
      ],
    },
  ],
  headerRows: 0,
  headerColumns: 0,
});

/**
 * 표가 둘인 문서. 표를 하나만 두면 `.find`와 `.findLast`가 같은 블록을 주므로
 * "첫 번째를 준다"가 지지 않는다.
 */
const twoTableDocument = (): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    singleCellTable("1"),
    { id: "block-2", type: "paragraph", content: [{ text: "사이 문단" }] },
    singleCellTable("2"),
  ],
});

describe("컨트롤러 표 fixture 계약", () => {
  describe("tableBlockIn", () => {
    it("인덱스 1의 블록을 표 블록으로 반환한다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const document = editor.getDocument();

      // 반환 타입이 표 블록으로 좁혀지는 것도 이 헬퍼의 계약이다. 좁힘이
      // 사라지면 이 대입이 TS2322로 진다 — 런타임 단언과 별개 게이트다.
      const block: TableBlock = tableBlockIn(document);

      expect(block).toBe(document.blocks[1]);
      expect(block.type).toBe("table");
      expect(block.id).toBe(tableBlockId);
    });

    it("인덱스 1이 표가 아니면 던진다", () => {
      // 블록 1개짜리 문서는 인덱스 1이 undefined다. 제목이 말하는 "표가
      // 아니다"를 문자 그대로 덮으려면 인덱스 1이 존재하면서 표가 아닌
      // 문서도 있어야 한다.
      expect(() => tableBlockIn(paragraphDocument("문단뿐"))).toThrow(
        "Expected a table block",
      );
      expect(() => tableBlockIn(twoParagraphDocument())).toThrow(
        "Expected a table block",
      );
    });
  });

  describe("tableBlockOf", () => {
    it("표가 인덱스 1이 아닌 컨트롤러에서는 던진다 — 같은 문서에서 firstTableBlockIn은 찾는다", () => {
      const { editor } = editorWithTable();
      expect(editor.replaceDocument(tableFirstDocument())).toEqual({
        ok: true,
        value: undefined,
      });

      // replaceDocument가 문서를 거절하면 앞의 fixture가 그대로 남아 아래
      // 갈림이 무의미해진다. 실제로 들어갔는지 배치로 확인한다.
      const document = editor.getDocument();
      expect(document.blocks.map((block) => block.type)).toEqual([
        "table",
        "paragraph",
      ]);

      expect(() => tableBlockOf(editor)).toThrow("Expected a table block");
      expect(firstTableBlockIn(document).id).toBe("table-1");
    });
  });

  describe("firstTableBlockIn", () => {
    it("표가 인덱스 1이 아니어도 찾는다 — 같은 문서에서 tableBlockIn은 던진다", () => {
      const document = tableFirstDocument();

      expect(firstTableBlockIn(document)).toBe(document.blocks[0]);
      expect(() => tableBlockIn(document)).toThrow("Expected a table block");
    });

    it("표가 여럿이면 문서 순서로 첫 번째를 준다", () => {
      const document = twoTableDocument();

      expect(firstTableBlockIn(document).id).toBe("table-1");
      expect(firstTableBlockIn(document)).toBe(document.blocks[0]);
    });

    it("표가 없으면 던진다", () => {
      expect(() => firstTableBlockIn(paragraphDocument("표 없음"))).toThrow(
        "표 블록이 없다",
      );
    });
  });

  describe("editorWithTable", () => {
    it("인자가 없으면 2x2 표를 만든다", () => {
      const { editor, cellIds } = editorWithTable();

      const table = tableBlockOf(editor);
      expect(cellIds).toHaveLength(4);
      expect(table.rows).toHaveLength(2);
      expect(table.columns).toHaveLength(2);
      expect(table.rows.map((row) => row.cells.length)).toEqual([2, 2]);
    });

    it("문단 1개 뒤에 표를 넣는다", () => {
      const { editor, tableBlockId } = editorWithTable();

      const { blocks } = editor.getDocument();
      expect(blocks).toHaveLength(2);
      expect(blocks[0]?.type).toBe("paragraph");
      expect(blocks[1]?.type).toBe("table");
      expect(blocks[1]?.id).toBe(tableBlockId);
    });

    it("insertTable이 거절하는 크기면 표 삽입 fixture 준비 실패로 던진다", () => {
      // 이 가드는 도달 불가 방어선이 아니다 — 0 이하 크기를 그대로 넘기면
      // insertTable이 거절하고 fixture가 여기서 멈춘다.
      expect(() => editorWithTable(0, 2)).toThrow("표 삽입 fixture 준비 실패");
      expect(() => editorWithTable(2, 0)).toThrow("표 삽입 fixture 준비 실패");
    });

    it("cellIds가 마운트된 편집기의 tr별 셀 id를 행 우선으로 평탄화한 것과 같다", () => {
      // 3x2를 쓴다. 행 우선과 열 우선의 구분 자체는 2x2로도 되지만, 정사각은
      // rows와 columns 인자가 뒤바뀌어도 같은 모양이라 그 오류를 못 잡는다
      // (실측: 인자를 맞바꾸면 3x2에서는 지고 2x2에서는 통과한다).
      // 셀 id는 tableCell의 cellId 속성이 data-be-cell-id로 렌더된다.
      const { editor, cellIds } = editorWithTable(3, 2);
      const { editable } = mountTiptapEditor(editor);

      const renderedByRow = Array.from(editable.querySelectorAll("tr")).map(
        (row) =>
          Array.from(row.querySelectorAll("td")).map((cell) =>
            cell.getAttribute("data-be-cell-id"),
          ),
      );

      expect(renderedByRow).toEqual([
        [cellIds[0], cellIds[1]],
        [cellIds[2], cellIds[3]],
        [cellIds[4], cellIds[5]],
      ]);
      expect(renderedByRow.flat()).toEqual(cellIds);
    });
  });
});
