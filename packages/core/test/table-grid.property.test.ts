import type { IdFactory, TableBlock } from "@cp949/geul-model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  mergeCells,
  moveColumn,
  moveRow,
  projectTableGrid,
  splitCell,
} from "../src/table-grid.js";

const initialTableArbitrary = fc.integer({ min: 2, max: 5 }).chain((rowCount) =>
  fc.integer({ min: 2, max: 5 }).map(
    (columnCount): TableBlock => ({
      id: "table",
      type: "table",
      columns: Array.from({ length: columnCount }, (_, column) => ({
        id: `c${column}`,
        width: 160,
      })),
      rows: Array.from({ length: rowCount }, (_, row) => ({
        id: `r${row}`,
        cells: Array.from({ length: columnCount }, (_, column) => ({
          id: `cell-${row}-${column}`,
          columnId: `c${column}`,
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

type Step = { kind: number; a: number; b: number };

const stepArbitrary: fc.Arbitrary<Step> = fc.record({
  kind: fc.integer({ min: 0, max: 7 }),
  a: fc.nat(),
  b: fc.nat(),
});

const applyStep = (
  table: TableBlock,
  step: Step,
  createId: IdFactory,
): TableBlock => {
  const rowCount = table.rows.length;
  const columnCount = table.columns.length;

  switch (step.kind % 8) {
    case 0: {
      const result = insertRow(table, step.a % (rowCount + 1), createId);
      return result.ok ? result.value : table;
    }
    case 1: {
      const result = insertColumn(table, step.a % (columnCount + 1), createId);
      return result.ok ? result.value : table;
    }
    case 2: {
      if (rowCount <= 1) return table;
      const result = deleteRow(table, step.a % rowCount);
      return result.ok ? result.value : table;
    }
    case 3: {
      if (columnCount <= 1) return table;
      const result = deleteColumn(table, step.a % columnCount);
      return result.ok ? result.value : table;
    }
    case 4: {
      const result = moveRow(table, step.a % rowCount, step.b % rowCount);
      return result.ok ? result.value : table;
    }
    case 5: {
      const result = moveColumn(
        table,
        step.a % columnCount,
        step.b % columnCount,
      );
      return result.ok ? result.value : table;
    }
    case 6: {
      const result = mergeCells(
        table,
        { row: step.a % rowCount, column: step.b % columnCount },
        {
          row: (step.a + 1) % rowCount,
          column: (step.b + 1) % columnCount,
        },
      );
      return result.ok ? result.value : table;
    }
    default: {
      const allCellIds = table.rows.flatMap((row) =>
        row.cells.map((cellEntry) => cellEntry.id),
      );
      if (allCellIds.length === 0) return table;
      const cellId = allCellIds[step.a % allCellIds.length];
      if (cellId === undefined) return table;
      const result = splitCell(table, cellId, createId);
      return result.ok ? result.value : table;
    }
  }
};

describe("테이블 격자 불변식", () => {
  it("삽입/삭제/이동/병합/분할을 연속 적용해도 논리 격자 불변식이 유지된다", () => {
    fc.assert(
      fc.property(
        initialTableArbitrary,
        fc.array(stepArbitrary, { minLength: 1, maxLength: 25 }),
        (initialTable, steps) => {
          let counter = 0;
          const createId: IdFactory = () => {
            counter += 1;
            return `generated-${counter}`;
          };

          let table = initialTable;
          expect(projectTableGrid(table).ok).toBe(true);

          for (const step of steps) {
            table = applyStep(table, step, createId);

            const projected = projectTableGrid(table);
            expect(projected).toMatchObject({ ok: true });
            if (!projected.ok) continue;

            // 모든 행의 논리 열 수가 같다: 표는 단일 columns 배열을 공유하므로
            // grid의 columnCount가 항상 table.columns.length와 일치하는지 확인한다.
            expect(projected.value.rowCount).toBe(table.rows.length);
            expect(projected.value.columnCount).toBe(table.columns.length);

            // 모든 논리 좌표가 정확히 한 기준 셀에 포함되고, 겹치거나 범위를
            // 벗어나지 않는다(model의 validateTableGrid가 사후조건으로 재검증함).
            for (let row = 0; row < projected.value.rowCount; row += 1) {
              for (
                let column = 0;
                column < projected.value.columnCount;
                column += 1
              ) {
                expect(projected.value.cellAt(row, column)).not.toBeUndefined();
              }
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
