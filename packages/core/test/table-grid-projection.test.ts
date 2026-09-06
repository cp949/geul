/**
 * TableGrid의 논리 격자 투영과 직사각형 범위 판정 계약을 확인한다.
 */
import type { TableBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { isRectangular, projectTableGrid } from "../src/table-grid.js";
import { buildGrid, cell, table } from "./table-grid-test-support.js";

describe("논리 격자를 투영한다", () => {
  it("2x2 표에서 모든 좌표가 자기 자신을 기준 셀로 조회된다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = projectTableGrid(t);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.rowCount).toBe(2);
    expect(result.value.columnCount).toBe(2);
    expect(result.value.cellAt(0, 0)).toEqual({
      cellId: "a",
      anchorRow: 0,
      anchorColumn: 0,
    });
    expect(result.value.cellAt(1, 1)).toEqual({
      cellId: "d",
      anchorRow: 1,
      anchorColumn: 1,
    });
  });

  it("병합된 셀이 덮는 모든 좌표가 같은 기준 셀을 가리킨다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1", { columnSpan: 2 })],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const grid = buildGrid(t);

    expect(grid.cellAt(0, 0)).toEqual({
      cellId: "a",
      anchorRow: 0,
      anchorColumn: 0,
    });
    expect(grid.cellAt(0, 1)).toEqual({
      cellId: "a",
      anchorRow: 0,
      anchorColumn: 0,
    });
  });

  it("범위 밖 좌표는 undefined를 반환한다", () => {
    const grid = buildGrid(table(["c1"], [[cell("a", "c1")]]));

    expect(grid.cellAt(1, 0)).toBeUndefined();
    expect(grid.cellAt(0, 1)).toBeUndefined();
    expect(grid.cellAt(-1, 0)).toBeUndefined();
  });

  it("불변식이 깨진 표는 model의 TABLE_GRID_INVALID로 거절한다", () => {
    const t = table(
      ["c1", "c2"],
      [[cell("a", "c1")], [cell("c", "c1"), cell("d", "c2")]],
    );

    expect(projectTableGrid(t)).toMatchObject({
      ok: false,
      error: { code: "TABLE_GRID_INVALID", reason: "UNCOVERED_COORDINATE" },
    });
  });

  it("역순 셀 배열과 header 경계를 가로지르는 병합에서도 columnId 순서를 따른다", () => {
    const t: TableBlock = {
      ...table(
        ["c1", "c2", "c3"],
        [
          [cell("b", "c3"), cell("a", "c1", { rowSpan: 2, columnSpan: 2 })],
          [cell("d", "c3")],
        ],
      ),
      headerRows: 1,
      headerColumns: 1,
    };

    const grid = buildGrid(t);

    expect(grid.cellAt(0, 0)).toMatchObject({ cellId: "a" });
    expect(grid.cellAt(1, 1)).toMatchObject({ cellId: "a" });
    expect(grid.cellAt(0, 2)).toMatchObject({ cellId: "b" });
    expect(grid.cellAt(1, 2)).toMatchObject({ cellId: "d" });
  });
});

describe("직사각형 셀 범위를 판정한다", () => {
  it("단일 셀로 이루어진 영역은 직사각형이다", () => {
    const grid = buildGrid(
      table(
        ["c1", "c2"],
        [
          [cell("a", "c1"), cell("b", "c2")],
          [cell("c", "c1"), cell("d", "c2")],
        ],
      ),
    );

    expect(
      isRectangular(grid, { row: 0, column: 0 }, { row: 0, column: 0 }),
    ).toBe(true);
  });

  it("병합되지 않은 여러 셀을 감싸는 사각 영역은 직사각형이다", () => {
    const grid = buildGrid(
      table(
        ["c1", "c2"],
        [
          [cell("a", "c1"), cell("b", "c2")],
          [cell("c", "c1"), cell("d", "c2")],
        ],
      ),
    );

    expect(
      isRectangular(grid, { row: 0, column: 0 }, { row: 1, column: 1 }),
    ).toBe(true);
  });

  it("정확히 감싼 병합 셀 하나만 선택하면 직사각형이다", () => {
    const grid = buildGrid(
      table(
        ["c1", "c2"],
        [[cell("a", "c1", { rowSpan: 2, columnSpan: 2 })], []],
      ),
    );

    expect(
      isRectangular(grid, { row: 0, column: 0 }, { row: 1, column: 1 }),
    ).toBe(true);
  });

  it("선택 영역 밖으로 뻗은 병합 셀이 선택 안에 걸치면 직사각형이 아니다", () => {
    const grid = buildGrid(
      table(
        ["c1", "c2", "c3"],
        [
          [cell("a", "c1", { columnSpan: 2 }), cell("b", "c3")],
          [cell("c", "c1"), cell("d", "c2"), cell("e", "c3")],
        ],
      ),
    );

    expect(
      isRectangular(grid, { row: 0, column: 0 }, { row: 0, column: 0 }),
    ).toBe(false);
  });

  it("선택 영역 밖에서 안으로 뻗어 들어오는 병합 셀이 있으면 직사각형이 아니다", () => {
    const grid = buildGrid(
      table(
        ["c1", "c2"],
        [[cell("a", "c1", { rowSpan: 2 }), cell("b", "c2")], [cell("d", "c2")]],
      ),
    );

    expect(
      isRectangular(grid, { row: 1, column: 0 }, { row: 1, column: 0 }),
    ).toBe(false);
  });

  it("from/to 순서가 뒤바뀌어도 동일하게 판정한다", () => {
    const grid = buildGrid(
      table(
        ["c1", "c2"],
        [
          [cell("a", "c1"), cell("b", "c2")],
          [cell("c", "c1"), cell("d", "c2")],
        ],
      ),
    );

    expect(
      isRectangular(grid, { row: 1, column: 1 }, { row: 0, column: 0 }),
    ).toBe(true);
  });
});
