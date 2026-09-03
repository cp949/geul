import type { TableBlock } from "@cp949/geul-model";
import { Mark, Node as TiptapNode } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import {
  tableBlockToTiptapNode,
  tiptapNodeToTableBlock,
} from "../src/table-model-codec.js";
import {
  createTableFixtureEditor,
  emptyDocSchema,
} from "./table-test-support.js";

// model의 decodeTextMark가 모르는 mark. 표 확장에 mark를 추가하고도 model의
// mark 목록을 깜박 갱신하지 않은 상황(카드 W의 문제 시나리오)을 재현한다.
const UnknownMark = Mark.create({ name: "highlight" });

// tableCell의 content("inline*")가 text가 아닌 노드를 담는 상황을 재현한다
// — 프로덕션 스키마에는 이런 노드가 없지만, 그 사실 자체가 이 분기를
// 검증할 방법이 없다는 뜻은 아니다.
const FakeInlineAtom = TiptapNode.create({
  name: "fakeInlineAtom",
  group: "inline",
  inline: true,
  atom: true,
});

/**
 * 표 fixture 스키마에 여분 확장을 더해 만든 스키마. 프로덕션에는 없는
 * mark·노드로 "표 셀 디코더가 미인식 콘텐츠를 만나면 어떻게 하는가"를
 * 재현할 때만 쓴다.
 */
const schemaWithExtras = (
  extraExtensions: Parameters<typeof createTableFixtureEditor>[1],
) => {
  const editor = createTableFixtureEditor(
    { type: "doc", content: [{ type: "paragraph" }] },
    extraExtensions,
  );
  const { schema } = editor;
  editor.destroy();
  return schema;
};

const sampleTable: TableBlock = {
  id: "table-1",
  type: "table",
  columns: [
    { id: "col-1", width: 160 },
    { id: "col-2", width: 200 },
  ],
  rows: [
    {
      id: "row-1",
      cells: [
        {
          id: "cell-1",
          columnId: "col-1",
          rowSpan: 1,
          columnSpan: 1,
          content: [{ text: "a" }],
        },
        {
          id: "cell-2",
          columnId: "col-2",
          rowSpan: 1,
          columnSpan: 1,
          content: [{ text: "b" }],
          textColor: "#FF0000",
        },
      ],
    },
  ],
  headerRows: 0,
  headerColumns: 0,
};

describe("TableBlock을 Tiptap 표 노드로 인코드한다", () => {
  it("열/행/셀 구조와 속성을 그대로 옮긴다", () => {
    const schema = emptyDocSchema();
    const node = tableBlockToTiptapNode(schema, sampleTable);

    expect(node.toJSON()).toEqual({
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
    });
  });

  it("행의 셀 배열 순서가 columnId 순서와 어긋나도 columns 순서대로 물리 배치한다", () => {
    const schema = emptyDocSchema();
    const table: TableBlock = {
      id: "table-1",
      type: "table",
      columns: [
        { id: "col-1", width: 160 },
        { id: "col-2", width: 160 },
      ],
      rows: [
        {
          id: "row-1",
          // 저장 배열 순서를 columnId 순서와 반대로 둔다 (G-TBL-001: 배열 순서는 권위가 아니다).
          cells: [
            {
              id: "cell-2",
              columnId: "col-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "b" }],
            },
            {
              id: "cell-1",
              columnId: "col-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "a" }],
            },
          ],
        },
      ],
      headerRows: 0,
      headerColumns: 0,
    };

    const node = tableBlockToTiptapNode(schema, table);
    const cellIds: unknown[] = [];
    node.firstChild?.forEach((cell) => {
      cellIds.push(cell.attrs.cellId);
    });

    // 물리 문서 순서는 table.columns가 정의하는 논리 열 순서(col-1, col-2)를 따라야 한다.
    expect(cellIds).toEqual(["cell-1", "cell-2"]);
  });

  it("빈 셀 콘텐츠는 내용 없는 셀 노드가 된다", () => {
    const schema = emptyDocSchema();
    const table: TableBlock = {
      ...sampleTable,
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "col-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [],
            },
            {
              id: "cell-2",
              columnId: "col-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [],
            },
          ],
        },
      ],
    };

    const node = tableBlockToTiptapNode(schema, table);
    const firstCell = node.firstChild?.firstChild;
    expect(firstCell?.content.size).toBe(0);
  });
});

describe("Tiptap 표 노드를 TableBlock으로 디코드한다", () => {
  it("인코드한 표를 다시 디코드하면 원본 TableBlock과 같다", () => {
    const schema = emptyDocSchema();
    const node = tableBlockToTiptapNode(schema, sampleTable);

    const result = tiptapNodeToTableBlock(node);
    expect(result).toEqual({ ok: true, value: sampleTable });
  });

  it("셀 align이 PM 노드 attrs를 거쳐 그대로 왕복한다", () => {
    const schema = emptyDocSchema();
    const table: TableBlock = {
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
              align: "center",
            },
          ],
        },
      ],
      headerRows: 0,
      headerColumns: 0,
    };

    const node = tableBlockToTiptapNode(schema, table);
    const decoded = tiptapNodeToTableBlock(node);

    expect(decoded).toEqual({ ok: true, value: table });
  });

  it("병합된 셀은 TableMap 기준 기준 좌표에서만 한 번 나타난다", () => {
    const schema = emptyDocSchema();
    const merged: TableBlock = {
      id: "table-1",
      type: "table",
      columns: [
        { id: "col-1", width: 160 },
        { id: "col-2", width: 160 },
      ],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "col-1",
              rowSpan: 2,
              columnSpan: 2,
              content: [{ text: "merged" }],
            },
          ],
        },
        { id: "row-2", cells: [] },
      ],
      headerRows: 0,
      headerColumns: 0,
    };

    const node = tableBlockToTiptapNode(schema, merged);
    expect(() => node.check()).not.toThrow();
    const result = tiptapNodeToTableBlock(node);

    expect(result).toEqual({ ok: true, value: merged });
  });

  it("셀의 정규형 mark를 양방향 변환해도 순서와 값을 보존한다", () => {
    const schema = emptyDocSchema();
    const table: TableBlock = {
      ...sampleTable,
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "col-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [
                {
                  text: "link",
                  marks: [
                    { type: "link", href: "https://example.com" },
                    { type: "bold" },
                    { type: "code" },
                    { type: "italic" },
                    { type: "strike" },
                    { type: "underline" },
                    { type: "textColor", color: "#AABBCC" },
                    { type: "backgroundColor", color: "#112233" },
                  ],
                },
              ],
            },
            {
              id: "cell-2",
              columnId: "col-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [],
            },
          ],
        },
      ],
    };

    const node = tableBlockToTiptapNode(schema, table);
    const result = tiptapNodeToTableBlock(node);

    expect(result).toEqual({ ok: true, value: table });
  });

  it("존재하지 않는 열을 가리키는 셀이 있으면 디코드를 거절한다", () => {
    const schema = emptyDocSchema();
    const node = schema.nodeFromJSON({
      type: "table",
      attrs: {
        blockId: "table-1",
        columns: [{ id: "col-1", width: 160 }],
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
                columnId: "missing-column",
                colspan: 1,
                rowspan: 1,
                colwidth: null,
                textColor: null,
                backgroundColor: null,
              },
            },
          ],
        },
      ],
    });

    const result = tiptapNodeToTableBlock(node);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "TABLE_NODE_INVALID",
        message: "Table grid UNKNOWN_COLUMN at row 0, column unknown",
      },
    });
  });

  it("PM 셀의 중복 mark는 독자 모델 정규형으로 디코드한다", () => {
    const schema = emptyDocSchema();
    const node = schema.nodeFromJSON({
      type: "table",
      attrs: {
        blockId: "table-1",
        columns: [{ id: "col-1", width: 160 }],
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
              content: [
                {
                  type: "text",
                  text: "bold",
                  marks: [{ type: "bold" }, { type: "bold" }],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = tiptapNodeToTableBlock(node);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rows[0]?.cells[0]?.content).toEqual([
        { text: "bold", marks: [{ type: "bold" }] },
      ]);
    }
  });

  it("스키마엔 있지만 model이 모르는 mark는 조용히 버리지 않고 디코드를 거절한다", () => {
    const schema = schemaWithExtras([UnknownMark]);
    const node = schema.nodeFromJSON({
      type: "table",
      attrs: {
        blockId: "table-1",
        columns: [{ id: "col-1", width: 160 }],
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
              content: [
                { type: "text", text: "hi", marks: [{ type: "highlight" }] },
              ],
            },
          ],
        },
      ],
    });

    const result = tiptapNodeToTableBlock(node);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "TABLE_NODE_INVALID",
        message: "Unsupported mark: highlight",
      },
    });
  });

  it("text가 아닌 인라인 노드가 셀에 있으면 디코드를 거절한다", () => {
    const schema = schemaWithExtras([FakeInlineAtom]);
    const node = schema.nodeFromJSON({
      type: "table",
      attrs: {
        blockId: "table-1",
        columns: [{ id: "col-1", width: 160 }],
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
              content: [{ type: "fakeInlineAtom" }],
            },
          ],
        },
      ],
    });

    const result = tiptapNodeToTableBlock(node);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "TABLE_NODE_INVALID",
        message: "Unsupported inline node: fakeInlineAtom",
      },
    });
  });

  it("cellId 없이 만들어진 PM 셀은 빈 문자열로 접었다가 문서 검증에서 거절한다(크래시 아님)", () => {
    const schema = emptyDocSchema();
    const node = schema.nodeFromJSON({
      type: "table",
      attrs: {
        blockId: "table-1",
        columns: [{ id: "col-1", width: 160 }],
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
              // cellId 없음 — TableCellExtension 스키마 기본값은 null이다.
              attrs: { columnId: "col-1" },
              content: [],
            },
          ],
        },
      ],
    });

    const result = tiptapNodeToTableBlock(node);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("TABLE_NODE_INVALID");
  });
});
