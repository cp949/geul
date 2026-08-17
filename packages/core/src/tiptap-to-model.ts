import {
  canonicalizeTextMarks,
  type Document,
  type IdFactory,
  type InlineContent,
  parseDocument,
  type Result,
  type TableBlock,
  type TextMark,
} from "@cp949/geul-model";

import type { EditorError } from "./errors.js";
import type { TiptapJsonMark, TiptapJsonNode } from "./model-to-tiptap.js";

const invalid = (message: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "DOCUMENT_INVALID", message },
});

const markFromTiptap = (
  mark: TiptapJsonMark,
): Result<TextMark, EditorError> => {
  switch (mark.type) {
    case "bold":
      return { ok: true, value: { type: "bold" } };
    case "italic":
      return { ok: true, value: { type: "italic" } };
    case "underline":
      return { ok: true, value: { type: "underline" } };
    case "strike":
      return { ok: true, value: { type: "strike" } };
    case "code":
      return { ok: true, value: { type: "code" } };
    case "link": {
      const href = mark.attrs?.href;
      return typeof href === "string"
        ? { ok: true, value: { type: "link", href } }
        : invalid("Link mark requires an href");
    }
    default:
      return invalid(`Unsupported Tiptap mark: ${String(mark.type)}`);
  }
};

const inlineContentFromTiptap = (
  nodes: TiptapJsonNode[] | undefined,
): Result<InlineContent, EditorError> => {
  const content: InlineContent = [];

  for (const node of nodes ?? []) {
    if (node.type !== "text" || typeof node.text !== "string") {
      return invalid(`Unsupported inline node: ${String(node.type)}`);
    }

    const marks: TextMark[] = [];
    for (const mark of node.marks ?? []) {
      const converted = markFromTiptap(mark);
      if (!converted.ok) return converted;
      marks.push(converted.value);
    }

    const canonicalMarks = canonicalizeTextMarks(marks);
    content.push({
      text: node.text,
      ...(canonicalMarks.length === 0 ? {} : { marks: canonicalMarks }),
    });
  }

  return { ok: true, value: content };
};

// 슬라이스 7부터 라이브 에디터에서 직접 만든 표만 이 경로를 지난다(model-to-tiptap.ts의
// 문서 로드 차단은 그대로 유지). editor.getJSON()은 순수 JSON이라 table-model-codec.ts의
// TableMap 기반 디코더(라이브 PM 노드 전용)를 재사용할 수 없어, 저장된 colspan/rowspan을
// 그대로 신뢰하는 JSON 전용 디코더를 둔다.
const tableBlockFromTiptapJson = (
  node: TiptapJsonNode,
  id: string,
): Result<TableBlock, EditorError> => {
  const attrs = node.attrs ?? {};

  const rows: TableBlock["rows"] = [];
  for (const rowNode of node.content ?? []) {
    const cells: TableBlock["rows"][number]["cells"] = [];
    for (const cellNode of rowNode.content ?? []) {
      const content = inlineContentFromTiptap(cellNode.content);
      if (!content.ok) return content;

      const cellAttrs = cellNode.attrs ?? {};
      cells.push({
        id: typeof cellAttrs.cellId === "string" ? cellAttrs.cellId : "",
        columnId:
          typeof cellAttrs.columnId === "string" ? cellAttrs.columnId : "",
        rowSpan: typeof cellAttrs.rowspan === "number" ? cellAttrs.rowspan : 1,
        columnSpan:
          typeof cellAttrs.colspan === "number" ? cellAttrs.colspan : 1,
        content: content.value,
        ...(typeof cellAttrs.textColor === "string"
          ? { textColor: cellAttrs.textColor }
          : {}),
        ...(typeof cellAttrs.backgroundColor === "string"
          ? { backgroundColor: cellAttrs.backgroundColor }
          : {}),
      });
    }

    const rowAttrs = rowNode.attrs ?? {};
    rows.push({
      id: typeof rowAttrs.rowId === "string" ? rowAttrs.rowId : "",
      cells,
    });
  }

  // 스키마 검증은 여기서 하지 않는다 — tiptapToModel 끝의 전체 parseDocument가
  // 표 블록을 포함한 문서 전체를 한 번에 검증한다(표마다 중복 검증하면
  // 키 입력당 O(셀 수) 검증 비용이 두 배가 된다).
  const table: TableBlock = {
    id,
    type: "table",
    columns: (attrs.columns ?? []) as TableBlock["columns"],
    rows,
    headerRows: (attrs.headerRows ?? 0) as 0 | 1,
    headerColumns: (attrs.headerColumns ?? 0) as 0 | 1,
  };
  return { ok: true, value: table };
};

export const tiptapToModel = (
  json: TiptapJsonNode,
  revision: number,
  createId: IdFactory,
): Result<Document, EditorError> => {
  if (json.type !== "doc") return invalid("Tiptap content must be a document");

  const blocks: Document["blocks"] = [];
  for (const node of json.content ?? []) {
    const savedId = node.attrs?.blockId;
    const id =
      typeof savedId === "string" && savedId.length > 0 ? savedId : createId();

    if (node.type === "table") {
      const table = tableBlockFromTiptapJson(node, id);
      if (!table.ok) return table;
      blocks.push(table.value);
      continue;
    }

    const content = inlineContentFromTiptap(node.content);
    if (!content.ok) return content;

    if (node.type === "paragraph") {
      blocks.push({ id, type: "paragraph", content: content.value });
      continue;
    }

    if (node.type === "heading") {
      const level = node.attrs?.level;
      if (level !== 1 && level !== 2 && level !== 3) {
        return invalid(`Unsupported heading level: ${String(level)}`);
      }
      blocks.push({ id, type: "heading", level, content: content.value });
      continue;
    }

    return invalid(`Unsupported Tiptap block: ${String(node.type)}`);
  }

  const parsed = parseDocument({ formatVersion: 1, revision, blocks });
  return parsed.ok ? parsed : invalid(parsed.error.message);
};
