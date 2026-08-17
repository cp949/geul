import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { TableBlock } from "../src/index.js";
import { validateTableGrid } from "../src/index.js";

const rectangularTableArbitrary = fc
  .integer({ min: 1, max: 100 })
  .chain((rowCount) =>
    fc
      .integer({ min: 1, max: Math.min(100, Math.floor(10_000 / rowCount)) })
      .map(
        (columnCount): TableBlock => ({
          id: "table",
          type: "table",
          columns: Array.from({ length: columnCount }, (_, column) => ({
            id: `column-${column}`,
            width: 48,
          })),
          rows: Array.from({ length: rowCount }, (_, row) => ({
            id: `row-${row}`,
            cells: Array.from({ length: columnCount }, (_, column) => ({
              id: `cell-${row}-${column}`,
              columnId: `column-${column}`,
              rowSpan: 1,
              columnSpan: 1,
              content: [],
            })),
          })),
          headerRows: 0,
          headerColumns: 0,
        }),
      ),
  );

describe("표 논리 그리드 속성", () => {
  it("병합 없는 완전한 직사각형 그리드는 모두 허용한다", () => {
    fc.assert(
      fc.property(rectangularTableArbitrary, (table) => {
        expect(validateTableGrid(table)).toEqual({
          ok: true,
          value: undefined,
        });
      }),
      { numRuns: 300 },
    );
  });

  it("병합 없는 앵커를 하나라도 제거하면 비어 있는 좌표로 거부한다", () => {
    fc.assert(
      fc.property(rectangularTableArbitrary, fc.nat(), (table, seed) => {
        const rowIndex = seed % table.rows.length;
        const cellIndex =
          Math.floor(seed / table.rows.length) % table.columns.length;
        const tableWithoutCell: TableBlock = {
          ...table,
          rows: table.rows.map((row, index) =>
            index === rowIndex
              ? {
                  ...row,
                  cells: row.cells.filter((_, index) => index !== cellIndex),
                }
              : row,
          ),
        };

        expect(validateTableGrid(tableWithoutCell)).toMatchObject({
          ok: false,
          error: {
            code: "TABLE_GRID_INVALID",
            reason: "UNCOVERED_COORDINATE",
            row: rowIndex,
            column: cellIndex,
          },
        });
      }),
      { numRuns: 300 },
    );
  });
});
