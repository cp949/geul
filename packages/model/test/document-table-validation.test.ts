/**
 * 독립 문서 모델의 표 크기(width/rowSpan)·색상·정렬 값과 셀 수 한도 검증을 확인한다.
 */
import { describe, expect, it } from "vitest";
import { MAX_TABLE_COLUMNS, parseDocument } from "../src/index.js";

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
    const [row] = table.rows;
    if (!row) throw new Error("표 fixture에 row가 없다");
    const [cell] = row.cells;
    if (!cell) throw new Error("표 fixture에 cell이 없다");

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
                ...row,
                cells: [{ ...cell, rowSpan: 1 }],
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

  it("서로 다른 셀에 걸쳐 색상 위반과 span 위반이 있으면 순회 순서(앞쪽 셀부터)로 보고한다", () => {
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
                },
              ],
            },
            {
              id: "row-2",
              cells: [
                {
                  id: "cell-2",
                  columnId: "column-1",
                  rowSpan: 0,
                  columnSpan: 1,
                  content: [],
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

  it("행이 없어 논리 셀 수는 0이어도 열 수가 문서 한도를 넘는 표는 거부한다", () => {
    // 3차 리뷰 카드 U: rowCount*columnCount 곱셈만 보던 예전 판정은 행이 0개면
    // 곱이 항상 0이라 열 수가 아무리 커도 통과시켰다 — 저장 원본을 그대로
    // 불러오는 parseDocument만 이 열 상한을 놓치고 있었다(HTML import·클립보드
    // 붙여넣기 경로는 validateTableSize를 이미 거쳐 TOO_MANY_COLUMNS로 거절함).
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "wide-table",
            type: "table",
            columns: Array.from(
              { length: MAX_TABLE_COLUMNS + 1 },
              (_, index) => ({ id: `column-${index}`, width: 48 }),
            ),
            rows: [],
            headerRows: 0,
            headerColumns: 0,
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_LIMIT_EXCEEDED",
        path: ["blocks", 0],
        message: `Table column count exceeds ${MAX_TABLE_COLUMNS}`,
      },
    });
  });
});
