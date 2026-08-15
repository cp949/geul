import { mergeAttributes, Node } from "@tiptap/core";
import { tableEditing } from "@tiptap/pm/tables";

type TableColumnAttrs = { id: string; width: number };

export const TableExtension = Node.create({
  name: "table",
  group: "block",
  content: "tableRow+",
  isolating: true,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-be-block-id"),
        renderHTML: (attributes) =>
          typeof attributes.blockId === "string" &&
          attributes.blockId.length > 0
            ? { "data-be-block-id": attributes.blockId }
            : {},
      },
      columns: {
        default: [] as TableColumnAttrs[],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-be-columns");
          return raw === null ? [] : (JSON.parse(raw) as TableColumnAttrs[]);
        },
        renderHTML: (attributes) => ({
          "data-be-columns": JSON.stringify(attributes.columns ?? []),
        }),
      },
      headerRows: {
        default: 0,
        parseHTML: (element) =>
          Number(element.getAttribute("data-be-header-rows") ?? "0"),
        renderHTML: (attributes) => ({
          "data-be-header-rows": String(attributes.headerRows ?? 0),
        }),
      },
      headerColumns: {
        default: 0,
        parseHTML: (element) =>
          Number(element.getAttribute("data-be-header-columns") ?? "0"),
        renderHTML: (attributes) => ({
          "data-be-header-columns": String(attributes.headerColumns ?? 0),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "table" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["table", mergeAttributes(HTMLAttributes), 0];
  },

  // Tiptap의 extendNodeSchema 훅은 등록된 모든 노드 확장에 대해 전역으로 호출된다.
  // extension.name으로 스코프를 좁히지 않으면 이 콜백이 tableRow/tableCell에도
  // 호출되어 마지막에 등록된 확장의 tableRole로 서로 덮어써진다.
  extendNodeSchema(extension) {
    return extension.name === "table" ? { tableRole: "table" } : {};
  },

  addProseMirrorPlugins() {
    return [tableEditing({ allowTableNodeSelection: false })];
  },
});

export const TableRowExtension = Node.create({
  name: "tableRow",
  content: "tableCell*",

  addAttributes() {
    return {
      rowId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-be-row-id"),
        renderHTML: (attributes) =>
          typeof attributes.rowId === "string" && attributes.rowId.length > 0
            ? { "data-be-row-id": attributes.rowId }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "tr" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["tr", mergeAttributes(HTMLAttributes), 0];
  },

  extendNodeSchema(extension) {
    return extension.name === "tableRow" ? { tableRole: "row" } : {};
  },
});

export const TableCellExtension = Node.create({
  name: "tableCell",
  content: "inline*",

  addAttributes() {
    return {
      cellId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-be-cell-id"),
        renderHTML: (attributes) =>
          typeof attributes.cellId === "string" && attributes.cellId.length > 0
            ? { "data-be-cell-id": attributes.cellId }
            : {},
      },
      columnId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-be-column-id"),
        renderHTML: (attributes) =>
          typeof attributes.columnId === "string" &&
          attributes.columnId.length > 0
            ? { "data-be-column-id": attributes.columnId }
            : {},
      },
      colspan: {
        default: 1,
        parseHTML: (element) => Number(element.getAttribute("colspan") ?? "1"),
        renderHTML: (attributes) =>
          attributes.colspan === 1 ? {} : { colspan: attributes.colspan },
      },
      rowspan: {
        default: 1,
        parseHTML: (element) => Number(element.getAttribute("rowspan") ?? "1"),
        renderHTML: (attributes) =>
          attributes.rowspan === 1 ? {} : { rowspan: attributes.rowspan },
      },
      colwidth: {
        default: null as number[] | null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-be-colwidth");
          return raw === null ? null : (JSON.parse(raw) as number[]);
        },
        renderHTML: (attributes) =>
          attributes.colwidth === null || attributes.colwidth === undefined
            ? {}
            : { "data-be-colwidth": JSON.stringify(attributes.colwidth) },
      },
      textColor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-be-text-color"),
        renderHTML: (attributes) =>
          typeof attributes.textColor === "string"
            ? { "data-be-text-color": attributes.textColor }
            : {},
      },
      backgroundColor: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-be-background-color"),
        renderHTML: (attributes) =>
          typeof attributes.backgroundColor === "string"
            ? { "data-be-background-color": attributes.backgroundColor }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "td" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["td", mergeAttributes(HTMLAttributes), 0];
  },

  extendNodeSchema(extension) {
    return extension.name === "tableCell" ? { tableRole: "cell" } : {};
  },
});
