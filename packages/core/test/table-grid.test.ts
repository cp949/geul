import type { TableBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  isRectangular,
  mergeCells,
  moveColumn,
  moveRow,
  projectTableGrid,
  resizeColumn,
  setCellAlign,
  setCellColor,
  splitCell,
  type TableGrid,
  toggleHeaderColumn,
  toggleHeaderRow,
  validateColumnWidth,
} from "../src/table-grid.js";

type Cell = TableBlock["rows"][number]["cells"][number];

const cell = (
  id: string,
  columnId: string,
  overrides: Partial<
    Pick<
      Cell,
      | "rowSpan"
      | "columnSpan"
      | "content"
      | "textColor"
      | "backgroundColor"
      | "align"
    >
  > = {},
): Cell => ({
  id,
  columnId,
  rowSpan: 1,
  columnSpan: 1,
  content: [],
  ...overrides,
});

const table = (columnIds: string[], rows: Cell[][]): TableBlock => ({
  id: "table",
  type: "table",
  columns: columnIds.map((id) => ({ id, width: 160 })),
  rows: rows.map((cells, index) => ({ id: `row-${index}`, cells })),
  headerRows: 0,
  headerColumns: 0,
});

const buildGrid = (t: TableBlock): TableGrid => {
  const result = projectTableGrid(t);
  if (!result.ok) throw new Error("fixture table must be valid");
  return result.value;
};

const sequentialIds = (prefix: string) => {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
};

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

describe("행을 삽입한다", () => {
  it("맨 앞에 삽입하면 기존 행이 내용을 유지한 채 뒤로 밀린다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = insertRow(t, 0, sequentialIds("row"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.rows).toHaveLength(3);
    expect(result.value.rows[0]?.cells.map((c) => c.id).sort()).toEqual([
      "row-2",
      "row-3",
    ]);
    expect(result.value.rows[1]?.cells.map((c) => c.id)).toEqual(["a", "b"]);
    expect(result.value.rows[2]?.cells.map((c) => c.id)).toEqual(["c", "d"]);
  });

  it("끝에 삽입(append)할 수 있다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    const result = insertRow(t, 1, sequentialIds("row"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.rows).toHaveLength(2);
    expect(result.value.rows[1]?.cells.map((c) => c.id)).toEqual(["row-2"]);
  });

  it("범위 밖 인덱스는 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    expect(insertRow(t, -1, sequentialIds("row"))).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(insertRow(t, 2, sequentialIds("row"))).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(t.rows).toHaveLength(1);
  });

  it("삽입 지점이 세로 병합 내부면 병합이 확장되고 새 행은 그 열에 자기 셀을 갖지 않는다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1", { rowSpan: 3 }), cell("b", "c2")],
        [cell("d", "c2")],
        [cell("e", "c2")],
      ],
    );

    const result = insertRow(t, 1, sequentialIds("row"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.rows).toHaveLength(4);
    const anchor = result.value.rows[0]?.cells.find((c) => c.id === "a");
    expect(anchor?.rowSpan).toBe(4);
    expect(result.value.rows[1]?.cells.map((c) => c.id)).toEqual(["row-2"]);

    const grid = buildGrid(result.value);
    expect(grid.cellAt(1, 0)).toMatchObject({ cellId: "a" });
  });

  it("삽입 지점이 병합의 anchor 행과 같으면 병합에 영향을 주지 않고 그대로 밀어낸다", () => {
    const t = table(
      ["c1", "c2"],
      [[cell("a", "c1", { rowSpan: 2 }), cell("b", "c2")], [cell("d", "c2")]],
    );

    const result = insertRow(t, 0, sequentialIds("row"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const anchor = result.value.rows[1]?.cells.find((c) => c.id === "a");
    expect(anchor?.rowSpan).toBe(2);
  });
});

describe("열을 삽입한다", () => {
  it("맨 앞에 삽입하면 기존 열이 내용을 유지한 채 뒤로 밀린다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = insertColumn(t, 0, sequentialIds("col"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.columns).toHaveLength(3);
    expect(result.value.columns[0]?.id).toBe("col-1");
    expect(result.value.rows[0]?.cells.map((c) => c.id).sort()).toEqual(
      ["a", "b", "col-2"].sort(),
    );

    const grid = buildGrid(result.value);
    expect(grid.cellAt(0, 0)).toMatchObject({ cellId: "col-2" });
    expect(grid.cellAt(0, 1)).toMatchObject({ cellId: "a" });
    expect(grid.cellAt(0, 2)).toMatchObject({ cellId: "b" });
  });

  it("범위 밖 인덱스는 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    expect(insertColumn(t, 5, sequentialIds("col"))).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(t.columns).toHaveLength(1);
  });

  it("삽입 지점이 가로 병합 내부면 병합이 확장되고 새 열은 그 행에 자기 셀을 갖지 않는다", () => {
    const t = table(
      ["c1", "c2", "c3"],
      [
        [cell("a", "c1", { columnSpan: 3 })],
        [cell("d", "c1"), cell("e", "c2"), cell("f", "c3")],
      ],
    );

    const result = insertColumn(t, 1, sequentialIds("col"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.columns).toHaveLength(4);
    const anchor = result.value.rows[0]?.cells.find((c) => c.id === "a");
    expect(anchor?.columnSpan).toBe(4);
    expect(result.value.rows[1]?.cells.map((c) => c.id).sort()).toEqual(
      ["d", "e", "f", "col-2"].sort(),
    );

    const grid = buildGrid(result.value);
    expect(grid.cellAt(1, 1)).toMatchObject({ cellId: "col-2" });
  });
});

describe("행을 삭제한다", () => {
  it("병합 없는 행을 삭제하면 나머지 행이 유지된다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1"), cell("d", "c2")],
        [cell("e", "c1"), cell("f", "c2")],
      ],
    );

    const result = deleteRow(t, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.rows).toHaveLength(2);
    expect(result.value.rows[0]?.cells.map((c) => c.id)).toEqual(["a", "b"]);
    expect(result.value.rows[1]?.cells.map((c) => c.id)).toEqual(["e", "f"]);
  });

  it("행이 1개만 남으면 거절한다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    expect(deleteRow(t, 0)).toEqual({ ok: false, error: { code: "LAST_ROW" } });
  });

  it("범위 밖 인덱스는 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(["c1"], [[cell("a", "c1")], [cell("b", "c1")]]);

    expect(deleteRow(t, 2)).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(deleteRow(t, -1)).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(t.rows).toHaveLength(2);
  });

  it("병합 anchor 행이 삭제되면 다음 행이 내용을 유지한 채 anchor를 승계한다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [
          cell("a", "c1", {
            rowSpan: 2,
            content: [{ text: "merged" }],
            textColor: "#111111",
          }),
          cell("b", "c2"),
        ],
        [cell("d", "c2")],
      ],
    );

    const result = deleteRow(t, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.rows).toHaveLength(1);
    const succeeded = result.value.rows[0]?.cells.find((c) => c.id === "a");
    expect(succeeded).toMatchObject({
      columnId: "c1",
      rowSpan: 1,
      content: [{ text: "merged" }],
      textColor: "#111111",
    });
  });

  it("병합이 삭제된 행을 관통하면 anchor는 유지된 채 span만 줄어든다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1", { rowSpan: 3 }), cell("b", "c2")],
        [cell("d", "c2")],
        [cell("e", "c2")],
      ],
    );

    const result = deleteRow(t, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.rows).toHaveLength(2);
    const anchor = result.value.rows[0]?.cells.find((c) => c.id === "a");
    expect(anchor?.rowSpan).toBe(2);

    const grid = buildGrid(result.value);
    expect(grid.cellAt(1, 0)).toMatchObject({ cellId: "a" });
  });
});

describe("열을 삭제한다", () => {
  it("병합 없는 열을 삭제하면 나머지 열이 유지된다", () => {
    const t = table(
      ["c1", "c2", "c3"],
      [[cell("a", "c1"), cell("b", "c2"), cell("c", "c3")]],
    );

    const result = deleteColumn(t, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.columns.map((c) => c.id)).toEqual(["c1", "c3"]);
    expect(result.value.rows[0]?.cells.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("열이 1개만 남으면 거절한다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    expect(deleteColumn(t, 0)).toEqual({
      ok: false,
      error: { code: "LAST_COLUMN" },
    });
  });

  it("범위 밖 인덱스는 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(["c1", "c2"], [[cell("a", "c1"), cell("b", "c2")]]);

    expect(deleteColumn(t, 5)).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(t.columns).toHaveLength(2);
  });

  it("병합 anchor 열이 삭제되면 다음 열이 내용을 유지한 채 anchor를 승계한다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [
          cell("a", "c1", {
            columnSpan: 2,
            content: [{ text: "merged" }],
            backgroundColor: "#eeeeee",
          }),
        ],
      ],
    );

    const result = deleteColumn(t, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.columns).toHaveLength(1);
    const succeeded = result.value.rows[0]?.cells.find((c) => c.id === "a");
    expect(succeeded).toMatchObject({
      columnId: "c2",
      columnSpan: 1,
      content: [{ text: "merged" }],
      backgroundColor: "#eeeeee",
    });
  });

  it("병합이 삭제된 열을 관통하면 anchor는 유지된 채 span만 줄어든다", () => {
    const t = table(
      ["c1", "c2", "c3"],
      [
        [cell("a", "c1", { columnSpan: 3 })],
        [cell("d", "c1"), cell("e", "c2"), cell("f", "c3")],
      ],
    );

    const result = deleteColumn(t, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.columns).toHaveLength(2);
    const anchor = result.value.rows[0]?.cells.find((c) => c.id === "a");
    expect(anchor?.columnSpan).toBe(2);

    const grid = buildGrid(result.value);
    expect(grid.cellAt(1, 1)).toMatchObject({ cellId: "f" });
  });
});

describe("행을 이동한다", () => {
  it("병합 없는 표에서 행 순서를 바꾼다", () => {
    const t = table(
      ["c1"],
      [[cell("a", "c1")], [cell("b", "c1")], [cell("c", "c1")]],
    );

    const result = moveRow(t, 0, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.rows.map((r) => r.cells[0]?.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("fromIndex와 toIndex가 같으면 변경 없이 성공한다", () => {
    const t = table(["c1"], [[cell("a", "c1")], [cell("b", "c1")]]);

    expect(moveRow(t, 1, 1)).toEqual({ ok: true, value: t });
  });

  it("범위 밖 인덱스는 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(["c1"], [[cell("a", "c1")], [cell("b", "c1")]]);

    expect(moveRow(t, 0, 5)).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(moveRow(t, -1, 0)).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(t.rows).toHaveLength(2);
  });

  it("병합 셀의 경계를 가로지르는 이동은 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1", { rowSpan: 2 }), cell("d", "c2")],
        [cell("e", "c2")],
        [cell("f", "c1"), cell("g", "c2")],
      ],
    );

    const result = moveRow(t, 2, 0);
    expect(result).toEqual({
      ok: false,
      error: { code: "MERGE_BOUNDARY_CROSSED" },
    });
    expect(t.rows).toHaveLength(4);
  });

  it("병합 셀 전체가 이동 범위 안에 통째로 포함되면 병합을 유지한 채 이동한다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1", { rowSpan: 2 }), cell("d", "c2")],
        [cell("e", "c2")],
        [cell("f", "c1"), cell("g", "c2")],
      ],
    );

    const result = moveRow(t, 0, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const anchor = result.value.rows[0]?.cells.find((c) => c.id === "c");
    expect(anchor?.rowSpan).toBe(2);

    const grid = buildGrid(result.value);
    expect(grid.cellAt(0, 0)).toMatchObject({ cellId: "c" });
    expect(grid.cellAt(1, 0)).toMatchObject({ cellId: "c" });
  });

  it("이동 구간 밖의 병합 셀은 유지한다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1", { rowSpan: 2 }), cell("b", "c2")],
        [cell("c", "c2")],
        [cell("d", "c1"), cell("e", "c2")],
        [cell("f", "c1"), cell("g", "c2")],
      ],
    );

    const result = moveRow(t, 3, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const grid = buildGrid(result.value);
    expect(grid.cellAt(0, 0)).toMatchObject({ cellId: "a" });
    expect(grid.cellAt(1, 0)).toMatchObject({ cellId: "a" });
    expect(result.value.rows.map((row) => row.id)).toEqual([
      "row-0",
      "row-1",
      "row-3",
      "row-2",
    ]);
  });
});

describe("열을 이동한다", () => {
  it("병합 없는 표에서 열 순서를 바꾼다", () => {
    const t = table(
      ["c1", "c2", "c3"],
      [[cell("a", "c1"), cell("b", "c2"), cell("c", "c3")]],
    );

    const result = moveColumn(t, 2, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.columns.map((c) => c.id)).toEqual(["c3", "c1", "c2"]);
  });

  it("범위 밖 인덱스는 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(["c1", "c2"], [[cell("a", "c1"), cell("b", "c2")]]);

    expect(moveColumn(t, 0, 9)).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(t.columns).toHaveLength(2);
  });

  it("병합 셀의 경계를 가로지르는 이동은 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(
      ["c1", "c2", "c3", "c4"],
      [[cell("a", "c1"), cell("b", "c2", { columnSpan: 2 }), cell("c", "c4")]],
    );

    const result = moveColumn(t, 2, 0);
    expect(result).toEqual({
      ok: false,
      error: { code: "MERGE_BOUNDARY_CROSSED" },
    });
    expect(t.columns).toHaveLength(4);
  });

  it("이동 구간 밖의 병합 셀은 유지한다", () => {
    const t = table(
      ["c1", "c2", "c3", "c4"],
      [[cell("a", "c1", { columnSpan: 2 }), cell("b", "c3"), cell("c", "c4")]],
    );

    const result = moveColumn(t, 3, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.columns.map((column) => column.id)).toEqual([
      "c1",
      "c2",
      "c4",
      "c3",
    ]);
    const grid = buildGrid(result.value);
    expect(grid.cellAt(0, 0)).toMatchObject({ cellId: "a" });
    expect(grid.cellAt(0, 1)).toMatchObject({ cellId: "a" });
  });
});

describe("셀을 병합한다", () => {
  it("병합되지 않은 사각 영역을 병합하면 좌상단 셀이 기준 셀이 되고 나머지는 제거된다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [
          cell("a", "c1", {
            content: [{ text: "keep" }],
            textColor: "#123456",
          }),
          cell("b", "c2"),
        ],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 1, column: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const allIds = result.value.rows.flatMap((row) =>
      row.cells.map((c) => c.id),
    );
    expect(allIds).toEqual(["a"]);

    const anchor = result.value.rows[0]?.cells.find((c) => c.id === "a");
    expect(anchor).toMatchObject({
      rowSpan: 2,
      columnSpan: 2,
      content: [{ text: "keep" }],
      textColor: "#123456",
    });

    const grid = buildGrid(result.value);
    expect(grid.cellAt(1, 1)).toMatchObject({ cellId: "a" });
  });

  it("from/to 순서가 뒤바뀌어도 동일하게 병합한다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = mergeCells(t, { row: 1, column: 1 }, { row: 0, column: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const anchor = result.value.rows[0]?.cells.find((c) => c.id === "a");
    expect(anchor).toMatchObject({ rowSpan: 2, columnSpan: 2 });
  });

  it("직사각형이 아닌 선택은 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(
      ["c1", "c2", "c3"],
      [
        [cell("a", "c1", { columnSpan: 2 }), cell("b", "c3")],
        [cell("c", "c1"), cell("d", "c2"), cell("e", "c3")],
      ],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 0, column: 0 });
    expect(result).toEqual({
      ok: false,
      error: { code: "NOT_RECTANGULAR" },
    });
    expect(t.rows[0]?.cells).toHaveLength(2);
  });

  it("병합되는 셀들의 콘텐츠를 기준 셀 뒤에 논리 좌표 순서로 이어붙인다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [
          cell("a", "c1", { content: [{ text: "왼쪽" }] }),
          cell("b", "c2", {
            content: [{ text: "오른쪽", marks: [{ type: "bold" }] }],
          }),
        ],
        [cell("c", "c1"), cell("d", "c2", { content: [{ text: "아래" }] })],
      ],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 1, column: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 빈 셀(c)은 구분자 없이 건너뛴다 — 공백이 겹치지 않는다.
    expect(result.value.rows[0]?.cells[0]?.content).toEqual([
      { text: "왼쪽" },
      { text: " " },
      { text: "오른쪽", marks: [{ type: "bold" }] },
      { text: " " },
      { text: "아래" },
    ]);
  });

  it("기준 셀이 비어 있으면 앞 공백 없이 나머지 콘텐츠만 남긴다", () => {
    const t = table(
      ["c1", "c2"],
      [[cell("a", "c1"), cell("b", "c2", { content: [{ text: "오른쪽" }] })]],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 0, column: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.content).toEqual([
      { text: "오른쪽" },
    ]);
  });

  it("이미 그 범위를 정확히 덮는 병합 셀뿐이면 입력 표를 참조 그대로 반환한다", () => {
    // 참조가 같아야 호출자(applyTableGridOperation)가 no-op을 알아보고
    // 트랜잭션을 만들지 않는다 — 문서는 그대로인데 undo 단계만 쌓인다.
    const t = table(
      ["c1", "c2"],
      [[cell("a", "c1", { rowSpan: 2, columnSpan: 2 })], []],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 1, column: 1 });

    expect(result).toEqual({ ok: true, value: t });
    if (!result.ok) return;
    expect(result.value).toBe(t);
  });

  it("셀 하나짜리 범위를 병합하면 입력 표를 참조 그대로 반환한다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 0, column: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(t);
  });

  it("기존 부분 병합을 포함한 직사각형 전체를 다시 병합한다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1", { columnSpan: 2 })],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = mergeCells(t, { row: 0, column: 0 }, { row: 1, column: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      result.value.rows.flatMap((row) => row.cells.map((c) => c.id)),
    ).toEqual(["a"]);
    expect(result.value.rows[0]?.cells[0]).toMatchObject({
      id: "a",
      rowSpan: 2,
      columnSpan: 2,
    });
  });
});

describe("헤더 행과 헤더 열을 토글한다", () => {
  it("headerRows 0을 1로 바꾼다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    const result = toggleHeaderRow(t);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.headerRows).toBe(1);
    expect(t.headerRows).toBe(0);
  });

  it("headerRows 1을 0으로 되돌린다", () => {
    const t = { ...table(["c1"], [[cell("a", "c1")]]), headerRows: 1 as const };

    const result = toggleHeaderRow(t);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.headerRows).toBe(0);
  });

  it("headerColumns를 같은 방식으로 토글한다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    const first = toggleHeaderColumn(t);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.headerColumns).toBe(1);

    const second = toggleHeaderColumn(first.value);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.headerColumns).toBe(0);
  });
});

describe("행 또는 열 단위로 셀 색상을 설정한다", () => {
  const colored = () =>
    table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

  it("대상 행을 덮는 모든 셀에 배경색을 넣는다", () => {
    const result = setCellColor(
      colored(),
      { kind: "row", index: 0 },
      "backgroundColor",
      "#AABBCC",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells.map((c) => c.backgroundColor)).toEqual([
      "#AABBCC",
      "#AABBCC",
    ]);
    expect(result.value.rows[1]?.cells.map((c) => c.backgroundColor)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("병합 셀이 대상 행을 덮으면 그 셀도 대상이다", () => {
    const t = table(
      ["c1", "c2"],
      [[cell("a", "c1", { rowSpan: 2 }), cell("b", "c2")], [cell("d", "c2")]],
    );

    const result = setCellColor(
      t,
      { kind: "row", index: 1 },
      "textColor",
      "#112233",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 기준 셀은 0행에 있지만 1행을 덮으므로 같이 칠해진다.
    expect(result.value.rows[0]?.cells[0]?.textColor).toBe("#112233");
    expect(result.value.rows[0]?.cells[1]?.textColor).toBeUndefined();
    expect(result.value.rows[1]?.cells[0]?.textColor).toBe("#112233");
  });

  it("색이 null이면 해당 색 속성을 지운다", () => {
    const t = table(
      ["c1"],
      [[cell("a", "c1", { textColor: "#112233", backgroundColor: "#AABBCC" })]],
    );

    const result = setCellColor(
      t,
      { kind: "column", index: 0 },
      "textColor",
      null,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const target = result.value.rows[0]?.cells[0];
    expect(target).not.toHaveProperty("textColor");
    expect(target?.backgroundColor).toBe("#AABBCC");
  });

  it("정규 형식이 아닌 색은 INVALID_COLOR로 거절하고 원본을 바꾸지 않는다", () => {
    const t = colored();

    const result = setCellColor(
      t,
      { kind: "row", index: 0 },
      "textColor",
      "#aabbcc",
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_COLOR", color: "#aabbcc" },
    });
    expect(t.rows[0]?.cells[0]?.textColor).toBeUndefined();
  });

  it("범위 밖 인덱스는 INDEX_OUT_OF_RANGE로 거절한다", () => {
    const result = setCellColor(
      colored(),
      { kind: "column", index: 5 },
      "textColor",
      "#112233",
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
  });

  it("이미 같은 색이면 입력 표를 참조 그대로 반환한다", () => {
    const t = table(["c1"], [[cell("a", "c1", { textColor: "#112233" })]]);

    const result = setCellColor(
      t,
      { kind: "row", index: 0 },
      "textColor",
      "#112233",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(t);
  });

  it("색상을 적용해도 기존 정렬이 유지된다", () => {
    const t = table(["c1"], [[cell("a", "c1", { align: "center" })]]);

    const result = setCellColor(
      t,
      { kind: "row", index: 0 },
      "backgroundColor",
      "#AABBCC",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const target = result.value.rows[0]?.cells[0];
    expect(target?.align).toBe("center");
    expect(target?.backgroundColor).toBe("#AABBCC");
  });
});

describe("셀 id 목록 단위로 색상을 설정한다", () => {
  it("지정한 셀 id 전부에 배경색을 넣는다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = setCellColor(
      t,
      { kind: "cells", cellIds: ["a", "d"] },
      "backgroundColor",
      "#AABBCC",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.backgroundColor).toBe("#AABBCC");
    expect(result.value.rows[0]?.cells[1]?.backgroundColor).toBeUndefined();
    expect(result.value.rows[1]?.cells[0]?.backgroundColor).toBeUndefined();
    expect(result.value.rows[1]?.cells[1]?.backgroundColor).toBe("#AABBCC");
  });

  it("존재하지 않는 셀 id는 CELL_NOT_FOUND로 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    const result = setCellColor(
      t,
      { kind: "cells", cellIds: ["a", "missing"] },
      "textColor",
      "#112233",
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "CELL_NOT_FOUND", cellId: "missing" },
    });
    expect(t.rows[0]?.cells[0]?.textColor).toBeUndefined();
  });

  it("빈 셀 id 목록은 입력 표를 참조 그대로 반환한다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    const result = setCellColor(
      t,
      { kind: "cells", cellIds: [] },
      "textColor",
      "#112233",
    );

    expect(result).toEqual({ ok: true, value: t });
  });

  it("셀 id로 지정해도 이미 같은 색이면 입력 표를 참조 그대로 반환한다", () => {
    const t = table(["c1"], [[cell("a", "c1", { textColor: "#112233" })]]);

    const result = setCellColor(
      t,
      { kind: "cells", cellIds: ["a"] },
      "textColor",
      "#112233",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(t);
  });
});

describe("행·열·셀 id 목록 단위로 정렬을 설정한다", () => {
  it("대상 행을 덮는 모든 셀에 정렬을 넣는다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = setCellAlign(t, { kind: "row", index: 0 }, "center");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells.map((c) => c.align)).toEqual([
      "center",
      "center",
    ]);
    expect(result.value.rows[1]?.cells.map((c) => c.align)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("셀 id 목록을 대상으로 정렬을 넣는다", () => {
    const t = table(["c1", "c2"], [[cell("a", "c1"), cell("b", "c2")]]);

    const result = setCellAlign(t, { kind: "cells", cellIds: ["b"] }, "right");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.align).toBeUndefined();
    expect(result.value.rows[0]?.cells[1]?.align).toBe("right");
  });

  it("정렬이 null이면 속성을 지운다", () => {
    const t = table(["c1"], [[cell("a", "c1", { align: "left" })]]);

    const result = setCellAlign(t, { kind: "column", index: 0 }, null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]).not.toHaveProperty("align");
  });

  it("허용 목록 밖 정렬 값은 INVALID_ALIGN으로 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    const result = setCellAlign(
      t,
      { kind: "row", index: 0 },
      "justify" as never,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_ALIGN", align: "justify" },
    });
    expect(t.rows[0]?.cells[0]?.align).toBeUndefined();
  });

  it("이미 같은 정렬이면 입력 표를 참조 그대로 반환한다", () => {
    const t = table(["c1"], [[cell("a", "c1", { align: "center" })]]);

    const result = setCellAlign(t, { kind: "row", index: 0 }, "center");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(t);
  });

  it("병합 셀이 대상 행을 덮으면 그 셀도 대상이다", () => {
    const t = table(
      ["c1", "c2"],
      [[cell("a", "c1", { rowSpan: 2 }), cell("b", "c2")], [cell("d", "c2")]],
    );

    const result = setCellAlign(t, { kind: "row", index: 1 }, "right");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.align).toBe("right");
    expect(result.value.rows[0]?.cells[1]?.align).toBeUndefined();
  });
});

describe("셀을 분할한다", () => {
  it("세로+가로로 병합된 셀을 분할하면 새 셀은 빈 콘텐츠이고 anchor만 원 콘텐츠를 유지한다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [
          cell("a", "c1", {
            rowSpan: 2,
            columnSpan: 2,
            content: [{ text: "keep" }],
            backgroundColor: "#abcabc",
          }),
        ],
        [],
      ],
    );

    const result = splitCell(t, "a", sequentialIds("split"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const anchor = result.value.rows[0]?.cells.find((c) => c.id === "a");
    expect(anchor).toMatchObject({
      rowSpan: 1,
      columnSpan: 1,
      content: [{ text: "keep" }],
      backgroundColor: "#abcabc",
    });

    const allCells = result.value.rows.flatMap((row) => row.cells);
    const newCells = allCells.filter((c) => c.id !== "a");
    expect(newCells).toHaveLength(3);
    for (const newCell of newCells) {
      expect(newCell.content).toEqual([]);
      expect(newCell.rowSpan).toBe(1);
      expect(newCell.columnSpan).toBe(1);
      expect(newCell.backgroundColor).toBeUndefined();
    }

    expect(projectTableGrid(result.value).ok).toBe(true);
  });

  it("존재하지 않는 cellId는 거절한다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    expect(splitCell(t, "missing", sequentialIds("split"))).toEqual({
      ok: false,
      error: { code: "CELL_NOT_FOUND", cellId: "missing" },
    });
  });

  it("이미 병합되지 않은 셀은 변경 없이 성공한다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    expect(splitCell(t, "a", sequentialIds("split"))).toEqual({
      ok: true,
      value: t,
    });
  });
});

describe("열 너비를 검증한다", () => {
  it("최소·최대 경계값을 허용한다", () => {
    expect(validateColumnWidth(48)).toEqual({ ok: true, value: undefined });
    expect(validateColumnWidth(1200)).toEqual({ ok: true, value: undefined });
  });

  it("경계값 밖의 너비를 거절한다", () => {
    expect(validateColumnWidth(47)).toEqual({
      ok: false,
      error: { code: "COLUMN_WIDTH_OUT_OF_RANGE", width: 47 },
    });
    expect(validateColumnWidth(1201)).toEqual({
      ok: false,
      error: { code: "COLUMN_WIDTH_OUT_OF_RANGE", width: 1201 },
    });
  });

  it("정수가 아닌 너비를 거절한다", () => {
    expect(validateColumnWidth(100.5)).toEqual({
      ok: false,
      error: { code: "COLUMN_WIDTH_OUT_OF_RANGE", width: 100.5 },
    });
    expect(validateColumnWidth(Number.NaN)).toEqual({
      ok: false,
      error: { code: "COLUMN_WIDTH_OUT_OF_RANGE", width: Number.NaN },
    });
  });
});

describe("열 너비를 조절한다", () => {
  it("지정 인덱스 열의 너비만 바꾼다", () => {
    const t = table(["a", "b"], [[cell("c1", "a"), cell("c2", "b")]]);

    const result = resizeColumn(t, 1, 240);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.columns).toEqual([
      { id: "a", width: 160 },
      { id: "b", width: 240 },
    ]);
  });

  it("범위를 벗어난 인덱스는 거절한다", () => {
    const t = table(["a"], [[cell("c1", "a")]]);

    expect(resizeColumn(t, 1, 240)).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
  });

  it("허용 범위 밖 너비는 거절하고 표를 바꾸지 않는다", () => {
    const t = table(["a"], [[cell("c1", "a")]]);

    expect(resizeColumn(t, 0, 47)).toEqual({
      ok: false,
      error: { code: "COLUMN_WIDTH_OUT_OF_RANGE", width: 47 },
    });
  });

  it("현재 값과 같은 너비면 입력 표를 그대로 반환한다", () => {
    const t = table(["a"], [[cell("c1", "a")]]);

    const result = resizeColumn(t, 0, 160);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // no-op 판별은 참조 동일성 계약이다 — table-commands가 이 참조로
    // 트랜잭션 생략 여부를 결정한다.
    expect(result.value).toBe(t);
  });
});
