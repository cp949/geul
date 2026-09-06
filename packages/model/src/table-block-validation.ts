import { isCanonicalCellAlign } from "./cell-align.js";
import { isCanonicalCellColor } from "./cell-color.js";
import { invalid } from "./document-validation-helpers.js";
import type { DocumentError } from "./errors.js";
import type { Result } from "./result.js";
import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  tableSizeViolationMessage,
  validateTableGrid,
  validateTableSize,
} from "./table-grid-validation.js";
import { visitTableBlocks } from "./table-tree-walk.js";
import type { DocumentBlock } from "./types.js";

export const validateColumnWidths = (
  blocks: DocumentBlock[],
): Result<undefined, DocumentError> =>
  visitTableBlocks(blocks, ["blocks"], (table, tablePath) => {
    for (const [columnIndex, column] of table.columns.entries()) {
      if (
        !Number.isFinite(column.width) ||
        !Number.isInteger(column.width) ||
        column.width < MIN_COLUMN_WIDTH ||
        column.width > MAX_COLUMN_WIDTH
      ) {
        return invalid(
          [...tablePath, "columns", columnIndex, "width"],
          `Column width must be an integer between ${MIN_COLUMN_WIDTH} and ${MAX_COLUMN_WIDTH}`,
        );
      }
    }
    return { ok: true, value: undefined };
  });

export const validateCells = (
  blocks: DocumentBlock[],
): Result<undefined, DocumentError> =>
  visitTableBlocks(blocks, ["blocks"], (table, tablePath) => {
    for (const [rowIndex, row] of table.rows.entries()) {
      for (const [cellIndex, cell] of row.cells.entries()) {
        const cellPath = [
          ...tablePath,
          "rows",
          rowIndex,
          "cells",
          cellIndex,
        ] as const;
        if (!Number.isInteger(cell.rowSpan) || cell.rowSpan < 1) {
          return invalid(
            [...cellPath, "rowSpan"],
            "rowSpan must be a positive integer",
          );
        }
        if (!Number.isInteger(cell.columnSpan) || cell.columnSpan < 1) {
          return invalid(
            [...cellPath, "columnSpan"],
            "columnSpan must be a positive integer",
          );
        }
        if (
          cell.textColor !== undefined &&
          !isCanonicalCellColor(cell.textColor)
        ) {
          return invalid(
            [...cellPath, "textColor"],
            "textColor must be an uppercase #RRGGBB color",
          );
        }
        if (
          cell.backgroundColor !== undefined &&
          !isCanonicalCellColor(cell.backgroundColor)
        ) {
          return invalid(
            [...cellPath, "backgroundColor"],
            "backgroundColor must be an uppercase #RRGGBB color",
          );
        }
        if (cell.align !== undefined && !isCanonicalCellAlign(cell.align)) {
          return invalid(
            [...cellPath, "align"],
            "align must be one of left, center, right",
          );
        }
      }
    }
    return { ok: true, value: undefined };
  });

export const validateTableLimits = (
  blocks: DocumentBlock[],
): Result<undefined, DocumentError> =>
  visitTableBlocks(blocks, ["blocks"], (table, tablePath) => {
    const violation = validateTableSize({
      columnCount: table.columns.length,
      rowCount: table.rows.length,
    });
    if (violation !== undefined) {
      return {
        ok: false,
        error: {
          code: "DOCUMENT_LIMIT_EXCEEDED",
          path: tablePath,
          message: tableSizeViolationMessage(violation),
        },
      };
    }
    return { ok: true, value: undefined };
  });

export const validateTableGrids = (
  blocks: DocumentBlock[],
): Result<undefined, DocumentError> =>
  visitTableBlocks(blocks, ["blocks"], (table, tablePath) => {
    const result = validateTableGrid(table);
    if (!result.ok) {
      const { reason, row, column } = result.error;
      return {
        ok: false,
        error: {
          code: "TABLE_GRID_INVALID",
          path: tablePath,
          message: `Table grid ${reason} at row ${row}, column ${column ?? "unknown"}`,
        },
      };
    }
    return { ok: true, value: undefined };
  });
