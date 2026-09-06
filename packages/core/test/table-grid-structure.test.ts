/**
 * TableGrid의 행·열 삽입·삭제·이동 구조 연산 계약을 확인한다.
 */
import { describe, expect, it } from "vitest";

import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
} from "../src/table-grid-structure.js";
import { sequentialIds } from "./editor-controller-support.js";
import { buildGrid, cell, table } from "./table-grid-test-support.js";

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
