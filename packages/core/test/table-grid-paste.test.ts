/**
 * TableGrid.pasteInto의 격자 레벨 계약을 확인한다 — 표 안에 데이터를
 * 붙여넣을 때의 자동 확장(행/열), 확장 경계 밖 셀 미생성, 기존 병합
 * 셀과의 경계 충돌 거절(PASTE_MERGE_CONFLICT), 셀 수 상한(10,000) 초과
 * 거절을 다룬다. 에디터가 표를 문서 어디에 놓는지는
 * table-paste-commands.test.ts가, pasteTabularData의 전체 거절
 * 매트릭스는 table-paste-validation.test.ts가 맡는다 — 이 파일은 그
 * 아래 순수 함수 층만 겨눈다. table-grid.test.ts에서 책임별로
 * 분리했다(구조 편집·서식 계약은 그 파일이 계속 소유).
 */
import type { TabularData } from "@cp949/geul-io";
import type { TableBlock } from "@cp949/geul-model";
import { validateTableGrid } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { pasteInto } from "../src/table-grid.js";
import { sequentialIds } from "./editor-controller-support.js";
import { oneByOneData } from "./table-test-support.js";

describe("pasteInto", () => {
  const twoByTwoTable = (): TableBlock => ({
    id: "table",
    type: "table",
    columns: [
      { id: "c0", width: 160 },
      { id: "c1", width: 160 },
    ],
    rows: [
      {
        id: "r0",
        cells: [
          { id: "a", columnId: "c0", rowSpan: 1, columnSpan: 1, content: [] },
          { id: "b", columnId: "c1", rowSpan: 1, columnSpan: 1, content: [] },
        ],
      },
      {
        id: "r1",
        cells: [
          { id: "c", columnId: "c0", rowSpan: 1, columnSpan: 1, content: [] },
          { id: "d", columnId: "c1", rowSpan: 1, columnSpan: 1, content: [] },
        ],
      },
    ],
    headerRows: 0,
    headerColumns: 0,
  });

  it("표 안 좌상단 셀부터 덮어쓴다", () => {
    const result = pasteInto(
      twoByTwoTable(),
      { row: 0, column: 0 },
      oneByOneData("x"),
      sequentialIds("id"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.content).toEqual([{ text: "x" }]);
    expect(result.value.rows.length).toBe(2);
    expect(result.value.columns.length).toBe(2);
  });

  it("대상 표보다 크면 행·열을 자동 확장한다", () => {
    const bigData: TabularData = {
      columnCount: 3,
      rows: [
        {
          cells: [
            {
              columnIndex: 0,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "1" }],
            },
            {
              columnIndex: 1,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "2" }],
            },
            {
              columnIndex: 2,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "3" }],
            },
          ],
        },
        {
          cells: [
            {
              columnIndex: 0,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "4" }],
            },
            {
              columnIndex: 1,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "5" }],
            },
            {
              columnIndex: 2,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "6" }],
            },
          ],
        },
        {
          cells: [
            {
              columnIndex: 0,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "7" }],
            },
            {
              columnIndex: 1,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "8" }],
            },
            {
              columnIndex: 2,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "9" }],
            },
          ],
        },
      ],
    };

    const result = pasteInto(
      twoByTwoTable(),
      { row: 0, column: 0 },
      bigData,
      sequentialIds("id"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows.length).toBe(3);
    expect(result.value.columns.length).toBe(3);
    expect(validateTableGrid(result.value)).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("확장이 덮어쓰기 사각형 안의 셀을 만들었다 버리지 않는다", () => {
    // 1x1 표의 (0,0)에 3x3을 붙이면 필요한 새 id는 열 2 + 행 2 + 붙여넣는
    // 셀 9 = 13개다. 덮어쓰기 사각형 안에 빈 셀을 만들면 곧바로 전량
    // 폐기된다 — 표 밖 경로의 골격 낭비(buildPasteTableSkeleton)와 같은
    // 클래스라 확장 시점에 사각형을 제외해야 한다.
    let idCalls = 0;
    const countingId = () => {
      idCalls += 1;
      return `id-${idCalls}`;
    };
    const oneByOneTable: TableBlock = {
      id: "table",
      type: "table",
      columns: [{ id: "c0", width: 160 }],
      rows: [
        {
          id: "r0",
          cells: [
            { id: "a", columnId: "c0", rowSpan: 1, columnSpan: 1, content: [] },
          ],
        },
      ],
      headerRows: 0,
      headerColumns: 0,
    };
    const threeByThree: TabularData = {
      columnCount: 3,
      rows: Array.from({ length: 3 }, (_, rowIndex) => ({
        cells: Array.from({ length: 3 }, (_, columnIndex) => ({
          columnIndex,
          rowSpan: 1,
          columnSpan: 1,
          content: [{ text: `${rowIndex},${columnIndex}` }],
        })),
      })),
    };

    const result = pasteInto(
      oneByOneTable,
      { row: 0, column: 0 },
      threeByThree,
      countingId,
    );

    expect(result.ok).toBe(true);
    expect(idCalls).toBe(13);
    if (result.ok) {
      expect(validateTableGrid(result.value)).toEqual({
        ok: true,
        value: undefined,
      });
    }
  });

  it("확장 셀 중 덮어쓰기 사각형 밖의 것만 만들어 커버리지를 유지한다", () => {
    // 2x2 표의 (1,1)에 2x2를 붙이면 3x3이 된다. 새로 만들 셀은 덮어쓰기
    // 사각형([1,3)x[1,3)) 밖인 (0,2)와 (2,0)뿐이다: 열 1 + 행 1 + 생존
    // 확장 셀 2 + 붙여넣는 셀 4 = id 8개.
    let idCalls = 0;
    const countingId = () => {
      idCalls += 1;
      return `id-${idCalls}`;
    };
    const twoByTwo: TabularData = {
      columnCount: 2,
      rows: Array.from({ length: 2 }, (_, rowIndex) => ({
        cells: Array.from({ length: 2 }, (_, columnIndex) => ({
          columnIndex,
          rowSpan: 1,
          columnSpan: 1,
          content: [{ text: `${rowIndex},${columnIndex}` }],
        })),
      })),
    };

    const result = pasteInto(
      twoByTwoTable(),
      { row: 1, column: 1 },
      twoByTwo,
      countingId,
    );

    expect(result.ok).toBe(true);
    expect(idCalls).toBe(8);
    if (result.ok) {
      expect(result.value.rows.length).toBe(3);
      expect(result.value.columns.length).toBe(3);
      expect(validateTableGrid(result.value)).toEqual({
        ok: true,
        value: undefined,
      });
    }
  });

  it("기존 병합 셀이 덮어쓰기 경계를 걸치면 문서를 바꾸지 않고 거절한다", () => {
    const merged = twoByTwoTable();
    const withMergedCell: TableBlock = {
      ...merged,
      rows: [
        {
          id: "r0",
          cells: [
            { id: "a", columnId: "c0", rowSpan: 2, columnSpan: 1, content: [] },
            { id: "b", columnId: "c1", rowSpan: 1, columnSpan: 1, content: [] },
          ],
        },
        {
          id: "r1",
          cells: [
            { id: "d", columnId: "c1", rowSpan: 1, columnSpan: 1, content: [] },
          ],
        },
      ],
    };

    // (0,0) 한 칸만 덮어쓰면 rowSpan=2인 기존 셀의 절반만 지워져 충돌한다.
    const result = pasteInto(
      withMergedCell,
      { row: 0, column: 0 },
      oneByOneData("x"),
      sequentialIds("id"),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "PASTE_MERGE_CONFLICT" },
    });
  });

  it("확장 후 논리 셀이 10,000을 넘으면 거절한다", () => {
    const bigData: TabularData = {
      columnCount: 1,
      rows: Array.from({ length: 10_000 }, (_, index) => ({
        cells: [
          {
            columnIndex: 0,
            rowSpan: 1,
            columnSpan: 1,
            content: [{ text: String(index) }],
          },
        ],
      })),
    };
    const result = pasteInto(
      twoByTwoTable(),
      { row: 0, column: 0 },
      bigData,
      sequentialIds("id"),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "CELL_LIMIT_EXCEEDED" },
    });
  });

  it("행 수는 1인데 열 수만으로 상한(10,000)을 넘으면 거절한다", () => {
    // requiredRows=1(대상 표도 1행, 붙여넣기 데이터도 1행)로 고정한 채
    // columnCount만 10,000을 넘긴다 — 두 상한 상수가 갈라져도
    // (MAX_TABLE_COLUMNS만 별도로 내려가도) core가 곱셈 검사만으로 여전히
    // 이 케이스를 걸러냄을 락한다.
    const oneRowTable: TableBlock = {
      id: "table",
      type: "table",
      columns: [{ id: "c0", width: 160 }],
      rows: [
        {
          id: "r0",
          cells: [
            { id: "a", columnId: "c0", rowSpan: 1, columnSpan: 1, content: [] },
          ],
        },
      ],
      headerRows: 0,
      headerColumns: 0,
    };
    const wideData: TabularData = {
      columnCount: 10_001,
      rows: [
        {
          cells: Array.from({ length: 10_001 }, (_, columnIndex) => ({
            columnIndex,
            rowSpan: 1,
            columnSpan: 1,
            content: [],
          })),
        },
      ],
    };

    const result = pasteInto(
      oneRowTable,
      { row: 0, column: 0 },
      wideData,
      sequentialIds("id"),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "CELL_LIMIT_EXCEEDED" },
    });
  });
});
