import { describe, expect, it } from "vitest";
import type { TableBlock } from "../src/index.js";
import {
  parseDocument,
  validateGridCoverage,
  validateTableGrid,
} from "../src/index.js";

const cell = (
  id: string,
  columnId: string,
  spans: Pick<
    TableBlock["rows"][number]["cells"][number],
    "rowSpan" | "columnSpan"
  > = {
    rowSpan: 1,
    columnSpan: 1,
  },
): TableBlock["rows"][number]["cells"][number] => ({
  id,
  columnId,
  ...spans,
  content: [],
});

const tableFixture = ({
  cells = [cell("a", "c1"), cell("b", "c2")],
}: {
  cells?: TableBlock["rows"][number]["cells"];
} = {}): TableBlock => ({
  id: "table",
  type: "table",
  columns: [
    { id: "c1", width: 48 },
    { id: "c2", width: 48 },
  ],
  rows: [
    { id: "row-0", cells },
    { id: "row-1", cells: [cell("c", "c1"), cell("d", "c2")] },
  ],
  headerRows: 0,
  headerColumns: 0,
});

describe("표 논리 그리드 검증", () => {
  it("앵커 셀이 겹치면 거부한다", () => {
    const table = tableFixture({
      cells: [cell("a", "c1", { rowSpan: 1, columnSpan: 2 }), cell("b", "c2")],
    });

    expect(validateTableGrid(table)).toMatchObject({
      ok: false,
      error: {
        code: "TABLE_GRID_INVALID",
        reason: "OVERLAPPING_CELL",
        row: 0,
        column: 1,
      },
    });
  });

  it("논리 좌표가 비어 있으면 거부한다", () => {
    expect(
      validateTableGrid(tableFixture({ cells: [cell("a", "c1")] })),
    ).toMatchObject({
      ok: false,
      error: {
        code: "TABLE_GRID_INVALID",
        reason: "UNCOVERED_COORDINATE",
        row: 0,
        column: 1,
      },
    });
  });

  it("존재하지 않는 열에 앵커된 셀은 거부한다", () => {
    expect(
      validateTableGrid(
        tableFixture({ cells: [cell("a", "missing"), cell("b", "c2")] }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "TABLE_GRID_INVALID", reason: "UNKNOWN_COLUMN", row: 0 },
    });
  });

  it("직사각형 표 경계를 벗어나는 span은 거부한다", () => {
    expect(
      validateTableGrid(
        tableFixture({
          cells: [
            cell("a", "c1"),
            cell("b", "c2", { rowSpan: 1, columnSpan: 2 }),
          ],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "TABLE_GRID_INVALID",
        reason: "SPAN_OUT_OF_BOUNDS",
        row: 0,
        column: 2,
      },
    });
  });

  it("병합 없는 완전한 직사각형 그리드는 허용한다", () => {
    expect(validateTableGrid(tableFixture())).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("parseDocument는 선행 의미 검증을 통과한 뒤 잘못된 표 그리드를 거부한다", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [tableFixture({ cells: [cell("a", "c1")] })],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "TABLE_GRID_INVALID" },
    });
  });

  it("표 그리드 검증을 문서 전체 색상 검증보다 나중에 수행한다", () => {
    const invalidGrid = tableFixture({ cells: [cell("grid-a", "c1")] });
    const invalidColor: TableBlock = {
      id: "table-2",
      type: "table",
      columns: [{ id: "c3", width: 48 }],
      rows: [
        {
          id: "row-2",
          cells: [
            {
              id: "color-cell",
              columnId: "c3",
              rowSpan: 1,
              columnSpan: 1,
              content: [],
              textColor: "#abcdef",
            },
          ],
        },
      ],
      headerRows: 0,
      headerColumns: 0,
    };

    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [invalidGrid, invalidColor],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 1, "rows", 0, "cells", 0, "textColor"],
      },
    });
  });
});

describe("validateGridCoverage(제네릭 그리드 커버리지)", () => {
  it("겹치지 않는 직사각형 커버리지는 허용한다", () => {
    expect(
      validateGridCoverage(2, 2, [
        { row: 0, column: 0, rowSpan: 1, columnSpan: 1 },
        { row: 0, column: 1, rowSpan: 1, columnSpan: 1 },
        { row: 1, column: 0, rowSpan: 1, columnSpan: 1 },
        { row: 1, column: 1, rowSpan: 1, columnSpan: 1 },
      ]),
    ).toEqual({ ok: true, value: undefined });
  });

  it("겹치는 셀은 OVERLAPPING_CELL로 거부한다", () => {
    expect(
      validateGridCoverage(1, 2, [
        { row: 0, column: 0, rowSpan: 1, columnSpan: 2 },
        { row: 0, column: 1, rowSpan: 1, columnSpan: 1 },
      ]),
    ).toMatchObject({
      ok: false,
      error: { code: "TABLE_GRID_INVALID", reason: "OVERLAPPING_CELL" },
    });
  });

  it("비어 있는 좌표는 UNCOVERED_COORDINATE로 거부한다", () => {
    expect(
      validateGridCoverage(1, 2, [
        { row: 0, column: 0, rowSpan: 1, columnSpan: 1 },
      ]),
    ).toMatchObject({
      ok: false,
      error: {
        code: "TABLE_GRID_INVALID",
        reason: "UNCOVERED_COORDINATE",
        row: 0,
        column: 1,
      },
    });
  });

  it("범위를 벗어나는 span은 SPAN_OUT_OF_BOUNDS로 거부한다", () => {
    expect(
      validateGridCoverage(1, 2, [
        { row: 0, column: 0, rowSpan: 1, columnSpan: 3 },
      ]),
    ).toMatchObject({
      ok: false,
      error: { code: "TABLE_GRID_INVALID", reason: "SPAN_OUT_OF_BOUNDS" },
    });
  });
});
