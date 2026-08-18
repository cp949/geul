import { describe, expect, it } from "vitest";
import {
  type TabularData,
  validateTabularData,
} from "../src/clipboard/tabular-data.js";

const gridData = (): TabularData => ({
  columnCount: 2,
  rows: [
    {
      cells: [
        { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [] },
        { columnIndex: 1, rowSpan: 1, columnSpan: 1, content: [] },
      ],
    },
  ],
});

describe("validateTabularData", () => {
  it("직사각형 커버리지는 허용한다", () => {
    expect(validateTabularData(gridData())).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("빈 데이터는 CLIPBOARD_TABLE_INVALID로 거부한다", () => {
    expect(validateTabularData({ columnCount: 0, rows: [] })).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("model 인라인 텍스트 계약을 어기는 셀은 CLIPBOARD_TABLE_INVALID로 거부한다", () => {
    const data: TabularData = {
      columnCount: 1,
      rows: [
        {
          cells: [
            {
              columnIndex: 0,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "a\tb" }],
            },
          ],
        },
      ],
    };
    expect(validateTabularData(data)).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("겹치는 셀은 CLIPBOARD_TABLE_INVALID로 거부한다", () => {
    const data: TabularData = {
      columnCount: 2,
      rows: [
        {
          cells: [
            { columnIndex: 0, rowSpan: 1, columnSpan: 2, content: [] },
            { columnIndex: 1, rowSpan: 1, columnSpan: 1, content: [] },
          ],
        },
      ],
    };
    expect(validateTabularData(data)).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });
});
