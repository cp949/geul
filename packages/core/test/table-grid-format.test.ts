/**
 * TableGrid의 헤더, 셀 색상·정렬, 열 너비 형식 연산 계약을 확인한다.
 */
import { describe, expect, it } from "vitest";

import type { TableBlock } from "@cp949/geul-model";

import {
  fitColumnsToContainerWidth,
  resizeColumn,
  setCellAlign,
  setCellColor,
  toggleHeaderColumn,
  toggleHeaderRow,
  validateColumnWidth,
} from "../src/table-grid-format.js";
import { splitCell } from "../src/table-grid-merge.js";
import { projectTableGrid } from "../src/table-grid.js";
import { sequentialIds } from "./editor-controller-support.js";
import { cell, table } from "./table-grid-test-support.js";

// 컬럼 폭을 임의로 지정해야 하는 재분배 테스트 전용 fixture 보정.
// table()의 기본 폭(160)을 각 테스트가 필요한 값으로 덮어쓴다.
const withColumnWidths = (t: TableBlock, widths: number[]): TableBlock => ({
  ...t,
  columns: t.columns.map((column, index) => ({
    ...column,
    width: widths[index]!,
  })),
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

  it("불변식이 깨진 표는 resolveTargetCellIds에서도 TABLE_GRID_INVALID를 전파한다", () => {
    // setCellAlign도 같은 resolveTargetCellIds를 거치므로 여기 한 곳으로 대표한다
    // (카드 M 그릴링에서 확인).
    const t = table(
      ["c1", "c2"],
      [[cell("a", "c1")], [cell("c", "c1"), cell("d", "c2")]],
    );

    const result = setCellColor(
      t,
      { kind: "row", index: 0 },
      "textColor",
      "#112233",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "TABLE_GRID_INVALID", reason: "UNCOVERED_COORDINATE" },
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

describe("표 너비를 컨테이너 폭에 맞춘다", () => {
  it("기존 비율을 유지한 채 합계를 컨테이너 폭에 정확히 맞춘다", () => {
    const t = withColumnWidths(
      table(["a", "b"], [[cell("c1", "a"), cell("c2", "b")]]),
      [100, 200],
    );

    const result = fitColumnsToContainerWidth(t, 450);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.columns.map((c) => c.width)).toEqual([150, 300]);
  });

  it("비율이 정수로 안 나뉘면 최대 잔여법으로 합계를 정확히 맞춘다", () => {
    const t = withColumnWidths(
      table(
        ["a", "b", "c"],
        [[cell("c1", "a"), cell("c2", "b"), cell("c3", "c")]],
      ),
      [100, 100, 100],
    );

    const result = fitColumnsToContainerWidth(t, 1000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 1000/3 = 333.33...— 나머지가 가장 큰(동률이면 앞선) 컬럼이 334를 가져간다.
    expect(result.value.columns.map((c) => c.width)).toEqual([334, 333, 333]);
    expect(result.value.columns.reduce((sum, c) => sum + c.width, 0)).toBe(
      1000,
    );
  });

  it("목표 폭이 MIN_COLUMN_WIDTH 미만인 컬럼은 48로 클램프하고 남은 폭을 나머지에 재배분한다", () => {
    const t = withColumnWidths(
      table(
        ["a", "b", "c"],
        [[cell("c1", "a"), cell("c2", "b"), cell("c3", "c")]],
      ),
      // a는 비율상 목표가 48 미만이 되도록 아주 작게 잡는다.
      [10, 500, 500],
    );

    const result = fitColumnsToContainerWidth(t, 1000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const widths = result.value.columns.map((c) => c.width);
    expect(widths[0]).toBe(48);
    expect(widths[1]).toBe(widths[2]);
    expect(widths.reduce((sum, w) => sum + w, 0)).toBe(1000);
  });

  it("목표 폭이 MAX_COLUMN_WIDTH를 넘는 컬럼은 1200으로 클램프하고 남은 폭을 나머지에 재배분한다", () => {
    const t = withColumnWidths(
      table(
        ["a", "b", "c"],
        [[cell("c1", "a"), cell("c2", "b"), cell("c3", "c")]],
      ),
      // a는 비율상 목표가 1200을 넘도록 아주 크게 잡는다.
      [5000, 100, 100],
    );

    const result = fitColumnsToContainerWidth(t, 2000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const widths = result.value.columns.map((c) => c.width);
    expect(widths[0]).toBe(1200);
    expect(widths[1]).toBe(widths[2]);
    expect(widths.reduce((sum, w) => sum + w, 0)).toBe(2000);
  });

  it("컬럼 수 대비 컨테이너 폭이 너무 좁아도 각 컬럼은 48 미만으로 내려가지 않는다(합계 초과 허용)", () => {
    const t = withColumnWidths(
      table(
        ["a", "b", "c"],
        [[cell("c1", "a"), cell("c2", "b"), cell("c3", "c")]],
      ),
      [200, 200, 200],
    );

    // 3 * MIN_COLUMN_WIDTH(48) = 144 > 100 — 물리적으로 불가능한 목표.
    const result = fitColumnsToContainerWidth(t, 100);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.columns.map((c) => c.width)).toEqual([48, 48, 48]);
  });

  it("컬럼 수 대비 컨테이너 폭이 너무 넓어도 각 컬럼은 1200을 넘지 않는다(합계 미달 허용)", () => {
    const t = table(["a"], [[cell("c1", "a")]]);

    const result = fitColumnsToContainerWidth(t, 2000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.columns.map((c) => c.width)).toEqual([1200]);
  });

  it("컨테이너 폭이 정수가 아니거나 0 이하면 CONTAINER_WIDTH_INVALID로 거절하고 표를 바꾸지 않는다", () => {
    const t = table(["a"], [[cell("c1", "a")]]);

    expect(fitColumnsToContainerWidth(t, 0)).toEqual({
      ok: false,
      error: { code: "CONTAINER_WIDTH_INVALID", containerWidth: 0 },
    });
    expect(fitColumnsToContainerWidth(t, -10)).toEqual({
      ok: false,
      error: { code: "CONTAINER_WIDTH_INVALID", containerWidth: -10 },
    });
    expect(fitColumnsToContainerWidth(t, 100.5)).toEqual({
      ok: false,
      error: { code: "CONTAINER_WIDTH_INVALID", containerWidth: 100.5 },
    });
    expect(t.columns[0]?.width).toBe(160);
  });

  it("재분배 결과가 기존 폭과 같으면 입력 표를 참조 그대로 반환한다", () => {
    const t = table(["a"], [[cell("c1", "a")]]);

    const result = fitColumnsToContainerWidth(t, 160);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(t);
  });
});
