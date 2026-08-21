import { DOMSerializer } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import {
  createTableFixtureEditor,
  emptyDocSchema,
} from "./table-test-support.js";

describe("표를 렌더링한다", () => {
  it("table.attrs.columns의 너비를 colgroup/col로 반영한다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: {
            blockId: "table-1",
            columns: [
              { id: "col-1", width: 160 },
              { id: "col-2", width: 240 },
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
                  content: [],
                },
                {
                  type: "tableCell",
                  attrs: {
                    cellId: "cell-2",
                    columnId: "col-2",
                    colspan: 1,
                    rowspan: 1,
                    colwidth: null,
                    textColor: null,
                    backgroundColor: null,
                  },
                  content: [],
                },
              ],
            },
          ],
        },
      ],
    });

    const table = editor.view.dom.querySelector("table");
    expect(table).not.toBeNull();
    const cols = table?.querySelectorAll("colgroup col") ?? [];
    expect(cols).toHaveLength(2);
    expect((cols[0] as HTMLElement).style.width).toBe("160px");
    expect((cols[1] as HTMLElement).style.width).toBe("240px");
    editor.destroy();
  });
});

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
                    align: null,
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
                    align: null,
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

describe("표 셀 정렬 렌더링", () => {
  it("align attr을 data-be-align과 인라인 text-align style로 렌더한다", () => {
    const schema = emptyDocSchema();
    const cellType = schema.nodes.tableCell;
    if (cellType === undefined) throw new Error("tableCell node missing");
    const node = cellType.create({ cellId: "cell-1", align: "right" });

    const dom = DOMSerializer.fromSchema(schema).serializeNode(
      node,
    ) as HTMLElement;

    expect(dom.getAttribute("data-be-align")).toBe("right");
    expect(dom.style.textAlign).toBe("right");
  });
});
