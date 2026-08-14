import { describe, expect, it } from "vitest";
import type { TableBlock } from "../src/index.js";
import { parseDocument, validateTableGrid } from "../src/index.js";

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

describe("table logical grid validation", () => {
  it("rejects overlapping anchors", () => {
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

  it("rejects uncovered logical coordinates", () => {
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

  it("rejects a cell anchored to an unknown column", () => {
    expect(
      validateTableGrid(
        tableFixture({ cells: [cell("a", "missing"), cell("b", "c2")] }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "TABLE_GRID_INVALID", reason: "UNKNOWN_COLUMN", row: 0 },
    });
  });

  it("rejects spans outside the rectangular table bounds", () => {
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

  it("accepts a complete unmerged rectangular grid", () => {
    expect(validateTableGrid(tableFixture())).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("makes parseDocument reject an invalid table grid after earlier semantic passes", () => {
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

  it("keeps table-grid validation after document-wide color validation", () => {
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
