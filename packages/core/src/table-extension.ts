import { mergeAttributes, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { tableEditing } from "@tiptap/pm/tables";

type TableColumnAttrs = { id: string; width: number };

const syncColgroup = (
  colgroup: HTMLElement,
  columns: TableColumnAttrs[],
): void => {
  while (colgroup.children.length > columns.length) {
    colgroup.lastElementChild?.remove();
  }
  columns.forEach((column, index) => {
    let col = colgroup.children[index] as HTMLElement | undefined;
    if (col === undefined) {
      col = colgroup.ownerDocument.createElement("col");
      colgroup.append(col);
    }
    const width = `${column.width}px`;
    if (col.style.width !== width) col.style.width = width;
  });
};

const applyTableDomAttributes = (
  dom: HTMLElement,
  node: ProseMirrorNode,
): void => {
  const blockId = node.attrs.blockId;
  if (typeof blockId === "string" && blockId.length > 0) {
    dom.setAttribute("data-be-block-id", blockId);
  } else {
    dom.removeAttribute("data-be-block-id");
  }
  dom.setAttribute("data-be-columns", JSON.stringify(node.attrs.columns ?? []));
  dom.setAttribute("data-be-header-rows", String(node.attrs.headerRows ?? 0));
  dom.setAttribute(
    "data-be-header-columns",
    String(node.attrs.headerColumns ?? 0),
  );
};

// data-be-* 속성은 클립보드 등 외부에서 온 HTML일 수 있어 JSON.parse를
// 그대로 신뢰하면 붙여넣기 파서 안에서 예외가 던져진다.
const parseJsonAttribute = (raw: string | null): unknown => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

// 표 노드들은 parseHTML(DOM 파싱 규칙)을 정의하지 않는다. 규칙이 있으면
// 외부 HTML 표 붙여넣기가 id 없는(또는 자기 복사로 id가 중복된) 표 노드를
// 만들고, tiptapToModel 검증 실패로 에디터가 영구 desync된다.
// 내부 코덱(table-model-codec.ts)과 modelToTiptap은 JSON으로 노드를 만들어
// 이 규칙을 쓰지 않는다. 외부 표 붙여넣기 정규화는 R1 paste 슬라이스
// (TBL-006~008)에서 id 재발급과 함께 다시 연다.

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
          const parsed = parseJsonAttribute(
            element.getAttribute("data-be-columns"),
          );
          return Array.isArray(parsed) ? (parsed as TableColumnAttrs[]) : [];
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

  renderHTML({ HTMLAttributes, node }) {
    const columns = (node.attrs.columns ?? []) as TableColumnAttrs[];
    const colgroup = [
      "colgroup",
      {},
      ...columns.map((column) => [
        "col",
        { style: `width: ${column.width}px` },
      ]),
    ];
    // ProseMirror의 content hole(0)은 자신이 속한 부모 노드의 유일한 자식이어야
    // 해서, colgroup과 형제로 table에 바로 둘 수 없다 — tbody로 감싼다.
    return [
      "table",
      mergeAttributes(HTMLAttributes),
      colgroup,
      ["tbody", {}, 0],
    ];
  },

  // Tiptap의 extendNodeSchema 훅은 등록된 모든 노드 확장에 대해 전역으로 호출된다.
  // extension.name으로 스코프를 좁히지 않으면 이 콜백이 tableRow/tableCell에도
  // 호출되어 마지막에 등록된 확장의 tableRole로 서로 덮어써진다.
  extendNodeSchema(extension) {
    return extension.name === "table" ? { tableRole: "table" } : {};
  },

  // NodeView가 필요한 이유: 리사이즈 드래그 중 table-handles.tsx가 col의
  // style.width를 직접 쓰는데(스펙 13절 — 문서 커밋 없이 시각만 갱신),
  // NodeView 없이 renderHTML로만 그리면 PM DOMObserver가 이 변이를 감지해
  // 노드를 다시 그려 즉시 되돌린다. prosemirror-tables의 columnresizing과
  // 같은 구조로, table/colgroup의 attribute 변이를 재파싱에서 제외한다.
  addNodeView() {
    return ({ node }) => {
      const ownerDocument = globalThis.document;
      const dom = ownerDocument.createElement("table");
      const colgroup = ownerDocument.createElement("colgroup");
      // content hole과 동일한 이유로 행들은 tbody 아래에 둔다.
      const tbody = ownerDocument.createElement("tbody");
      dom.append(colgroup, tbody);
      applyTableDomAttributes(dom, node);
      syncColgroup(colgroup, (node.attrs.columns ?? []) as TableColumnAttrs[]);

      let currentNode = node;
      return {
        dom,
        contentDOM: tbody,
        update(next: ProseMirrorNode) {
          if (next.type !== currentNode.type) return false;
          currentNode = next;
          applyTableDomAttributes(dom, next);
          syncColgroup(
            colgroup,
            (next.attrs.columns ?? []) as TableColumnAttrs[],
          );
          return true;
        },
        ignoreMutation(mutation: { type: string; target: globalThis.Node }) {
          return (
            mutation.type === "attributes" &&
            (mutation.target === dom || colgroup.contains(mutation.target))
          );
        },
      };
    };
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
          const parsed = parseJsonAttribute(
            element.getAttribute("data-be-colwidth"),
          );
          return Array.isArray(parsed) ? (parsed as number[]) : null;
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

  renderHTML({ HTMLAttributes, node }) {
    // 색상은 data-be-* 속성이 저장 계약이고, 화면에는 인라인 스타일로 그린다
    // — 임의 hex라 CSS 클래스로는 표현할 수 없다.
    const declarations = [
      typeof node.attrs.textColor === "string"
        ? `color: ${node.attrs.textColor}`
        : null,
      typeof node.attrs.backgroundColor === "string"
        ? `background-color: ${node.attrs.backgroundColor}`
        : null,
    ].filter((declaration) => declaration !== null);

    return [
      "td",
      mergeAttributes(
        HTMLAttributes,
        declarations.length === 0 ? {} : { style: declarations.join("; ") },
      ),
      0,
    ];
  },

  extendNodeSchema(extension) {
    return extension.name === "tableCell" ? { tableRole: "cell" } : {};
  },
});
