/**
 * 독립 문서 모델의 표 크기(width/rowSpan)·색상·정렬 값과 셀 수 한도 검증을 확인한다.
 */
import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/index.js";

describe("독립 문서 모델 - 표 크기·색상·정렬 검증", () => {
  it("표의 잘못된 크기 값과 색상 값을 거부한다", () => {
    const table = {
      id: "table-1",
      type: "table" as const,
      columns: [{ id: "column-1", width: 47 }],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "column-1",
              rowSpan: 0,
              columnSpan: 1,
              content: [],
              textColor: "#abcdef",
            },
          ],
        },
      ],
      headerRows: 0 as const,
      headerColumns: 0 as const,
    };

    expect(
      parseDocument({ formatVersion: 1, revision: 0, blocks: [table] }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "columns", 0, "width"],
      },
    });

    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [{ ...table, columns: [{ id: "column-1", width: 48 }] }],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "rows", 0, "cells", 0, "rowSpan"],
      },
    });

    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            ...table,
            columns: [{ id: "column-1", width: 48 }],
            rows: [
              {
                ...table.rows[0],
                cells: [{ ...table.rows[0].cells[0], rowSpan: 1 }],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "rows", 0, "cells", 0, "textColor"],
      },
    });
  });

  it("정렬 값이 허용 목록 밖이면 거부한다", () => {
    const table = {
      id: "table-1",
      type: "table" as const,
      columns: [{ id: "column-1", width: 160 }],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "column-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [],
              align: "justify",
            },
          ],
        },
      ],
      headerRows: 0 as const,
      headerColumns: 0 as const,
    };

    expect(
      parseDocument({ formatVersion: 1, revision: 0, blocks: [table] }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "rows", 0, "cells", 0, "align"],
      },
    });
  });

  it("허용 목록 안 정렬 값은 그대로 통과한다", () => {
    const table = {
      id: "table-1",
      type: "table" as const,
      columns: [{ id: "column-1", width: 160 }],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "column-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [],
              align: "center" as const,
            },
          ],
        },
      ],
      headerRows: 0 as const,
      headerColumns: 0 as const,
    };

    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [table],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsedTable = result.value.blocks[0];
    if (parsedTable?.type !== "table") throw new Error("Expected a table");
    expect(parsedTable.rows[0]?.cells[0]?.align).toBe("center");
  });

  it("같은 셀에서 색상과 정렬이 모두 잘못되면 색상 오류를 먼저 보고한다", () => {
    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "table-1",
          type: "table",
          columns: [{ id: "column-1", width: 160 }],
          rows: [
            {
              id: "row-1",
              cells: [
                {
                  id: "cell-1",
                  columnId: "column-1",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [],
                  textColor: "#abcdef",
                  align: "justify",
                },
              ],
            },
          ],
          headerRows: 0,
          headerColumns: 0,
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "rows", 0, "cells", 0, "textColor"],
      },
    });
  });

  it("여러 표가 있으면 뒤쪽 표의 width 오류를 앞쪽 표의 색상 오류보다 먼저 보고한다", () => {
    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "table-color",
          type: "table",
          columns: [{ id: "column-color", width: 48 }],
          rows: [
            {
              id: "row-color",
              cells: [
                {
                  id: "cell-color",
                  columnId: "column-color",
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
        },
        {
          id: "table-width",
          type: "table",
          columns: [{ id: "column-width", width: 47 }],
          rows: [],
          headerRows: 0,
          headerColumns: 0,
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 1, "columns", 0, "width"],
      },
    });
  });

  it("논리 셀 수가 문서 한도를 넘는 표는 거부한다", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "large-table",
            type: "table",
            columns: Array.from({ length: 101 }, (_, index) => ({
              id: `column-${index}`,
              width: 48,
            })),
            rows: Array.from({ length: 100 }, (_, index) => ({
              id: `row-${index}`,
              cells: [],
            })),
            headerRows: 0,
            headerColumns: 0,
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_LIMIT_EXCEEDED", path: ["blocks", 0] },
    });
  });
});
