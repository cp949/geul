import { describe, expect, it } from "vitest";

import { createTableFixtureEditor } from "./table-test-support.js";

describe("Table/Row/Cell 노드 스키마", () => {
  it("표 JSON을 로드하면 셀 속성과 표 속성을 그대로 보존한다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: {
            blockId: "table-1",
            columns: [
              { id: "col-1", width: 160 },
              { id: "col-2", width: 200 },
            ],
            headerRows: 0,
            headerColumns: 0,
          },
          content: [
            {
              type: "tableRow",
              attrs: { rowId: "row-1" },
              content: [
                {
                  type: "tableCell",
                  attrs: {
                    cellId: "cell-1",
                    columnId: "col-1",
                    colspan: 1,
                    rowspan: 1,
                    colwidth: null,
                    textColor: null,
                    backgroundColor: null,
                  },
                  content: [{ type: "text", text: "a" }],
                },
                {
                  type: "tableCell",
                  attrs: {
                    cellId: "cell-2",
                    columnId: "col-2",
                    colspan: 1,
                    rowspan: 1,
                    colwidth: null,
                    textColor: "#FF0000",
                    backgroundColor: null,
                  },
                  content: [{ type: "text", text: "b" }],
                },
              ],
            },
          ],
        },
      ],
    });

    const json = editor.getJSON();
    editor.destroy();

    expect(json).toEqual({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: {
            blockId: "table-1",
            columns: [
              { id: "col-1", width: 160 },
              { id: "col-2", width: 200 },
            ],
            headerRows: 0,
            headerColumns: 0,
          },
          content: [
            {
              type: "tableRow",
              attrs: { rowId: "row-1" },
              content: [
                {
                  type: "tableCell",
                  attrs: {
                    cellId: "cell-1",
                    columnId: "col-1",
                    colspan: 1,
                    rowspan: 1,
                    colwidth: null,
                    textColor: null,
                    backgroundColor: null,
                  },
                  content: [{ type: "text", text: "a" }],
                },
                {
                  type: "tableCell",
                  attrs: {
                    cellId: "cell-2",
                    columnId: "col-2",
                    colspan: 1,
                    rowspan: 1,
                    colwidth: null,
                    textColor: "#FF0000",
                    backgroundColor: null,
                  },
                  content: [{ type: "text", text: "b" }],
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
