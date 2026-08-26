import {
  canonicalizeTextMarks,
  decodeTextMark,
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
import { tableCellFieldsFromAttrs } from "./table-model-codec.js";

const invalid = (message: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "DOCUMENT_INVALID", message },
});

// mark 이름→TextMark 판정 자체는 model의 decodeTextMark가 유일한 권위다(PM
// 노드 경로의 table-model-codec.ts도 같은 함수를 쓴다) — 여기서는 그 결과를
// 이 모듈의 EditorError 계약으로 옮겨 담기만 한다.
const markFromTiptap = (
  mark: TiptapJsonMark,
): Result<TextMark, EditorError> => {
  if (mark.type === undefined) {
    return invalid("Unsupported Tiptap mark: undefined");
  }
  const decoded = decodeTextMark({ type: mark.type, href: mark.attrs?.href });
  return decoded.ok ? decoded : invalid(decoded.error);
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
        ...tableCellFieldsFromAttrs(cellAttrs),
        content: content.value,
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
