import {
  type Block,
  canonicalizeTextMarks,
  type CodeBlock,
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

// 저장된 blockId를 신뢰하고, 없거나 빈 문자열이면 createId로 새로 발급한다
// (라이브 에디터가 BlockIdExtension의 appendTransaction으로 이미 채워
// 넣지만, 이 디코더는 그 보장 없이 임의 JSON을 받는 경로에서도 안전해야
// 한다).
const resolveBlockId = (node: TiptapJsonNode, createId: IdFactory): string => {
  const savedId = node.attrs?.blockId;
  return typeof savedId === "string" && savedId.length > 0
    ? savedId
    : createId();
};

// CodeBlock PM leaf는 여러 text child를 가질 수 있지만 저장 원본은 source
// 하나만 가진다. 모든 child를 순서대로 합쳐 [] | [{ text }] 정규형을 만들고,
// source 문자·language 값 검증과 known alias canonicalization은 문서 끝의
// parseDocument에 맡긴다(G-CNV-001).
const codeBlockFromTiptap = (
  node: TiptapJsonNode,
  id: string,
): Result<CodeBlock, EditorError> => {
  let source = "";
  for (const child of node.content ?? []) {
    if (child.type !== "text" || typeof child.text !== "string") {
      return invalid(`Unsupported CodeBlock child: ${String(child.type)}`);
    }
    if ((child.marks?.length ?? 0) > 0) {
      return invalid("CodeBlock text child must not have marks");
    }
    source += child.text;
  }

  const language = node.attrs?.language;
  if (
    language !== undefined &&
    language !== null &&
    typeof language !== "string"
  ) {
    return invalid("CodeBlock language attr must be a string or null");
  }

  return {
    ok: true,
    value: {
      id,
      type: "codeBlock",
      content: source === "" ? [] : [{ text: source }],
      ...(typeof language === "string" ? { language } : {}),
    },
  };
};

// blockContainer 1개를 재귀로 model Block으로 디코드한다(D19). 컨테이너의
// 첫 자식은 항상 blockContent(paragraph/heading/quote/codeBlock), 두 번째
// (선택) 자식은 nestable content의 blockGroup이다. CodeBlock은 leaf라 두
// 번째 자식을 거절한다. 나머지는 스키마 content expression이 순서를
// 구조적으로 강제하므로 여기서 순서를 다시 검증하지 않는다(G-CNV-001:
// 검증 권위는 parseDocument, 이 함수는 구조 직대응만 한다).
const blockContainerToModel = (
  node: TiptapJsonNode,
  createId: IdFactory,
): Result<Block, EditorError> => {
  const id = resolveBlockId(node, createId);

  const contentNode = node.content?.[0];
  if (contentNode === undefined) {
    return invalid(`Block ${id} is missing its blockContent child`);
  }

  if (contentNode.type === "codeBlock") {
    if (node.content?.[1] !== undefined) {
      return invalid(`CodeBlock ${id} must not have its own blockGroup`);
    }
    return codeBlockFromTiptap(contentNode, id);
  }

  const inlineContent = inlineContentFromTiptap(contentNode.content);
  if (!inlineContent.ok) return inlineContent;

  const groupNode = node.content?.[1];
  const extraNode = node.content?.[2];
  if (extraNode !== undefined) {
    return invalid(
      `Block ${id} has unexpected content after blockContent/blockGroup: ${String(extraNode.type)}`,
    );
  }

  let children: Block[] | undefined;
  if (groupNode !== undefined) {
    if (groupNode.type !== "blockGroup") {
      return invalid(
        `Block ${id} has unexpected second child: ${String(groupNode.type)}`,
      );
    }
    const decodedChildren: Block[] = [];
    for (const childNode of groupNode.content ?? []) {
      const decoded = decodeBlock(childNode, createId);
      if (!decoded.ok) return decoded;
      decodedChildren.push(decoded.value);
    }
    children = decodedChildren;
  }

  if (contentNode.type === "paragraph") {
    return {
      ok: true,
      value: {
        id,
        type: "paragraph",
        content: inlineContent.value,
        ...(children === undefined ? {} : { children }),
      },
    };
  }

  if (contentNode.type === "heading") {
    const level = contentNode.attrs?.level;
    if (
      level !== 1 &&
      level !== 2 &&
      level !== 3 &&
      level !== 4 &&
      level !== 5 &&
      level !== 6
    ) {
      return invalid(`Unsupported heading level: ${String(level)}`);
    }
    return {
      ok: true,
      value: {
        id,
        type: "heading",
        level,
        content: inlineContent.value,
        ...(children === undefined ? {} : { children }),
      },
    };
  }

  if (contentNode.type === "quote") {
    return {
      ok: true,
      value: {
        id,
        type: "quote",
        content: inlineContent.value,
        ...(children === undefined ? {} : { children }),
      },
    };
  }

  return invalid(
    `Unsupported blockContent inside blockContainer: ${String(contentNode.type)}`,
  );
};

// 문서 최상위와 blockGroup 자식이 공유하는 노드 디스패치. table·divider는
// 컨테이너로 감싸이지 않는다(D19) — blockContainer/table/divider 모두
// 스키마 group "block"의 멤버라 같은 위치(doc 직속 또는 blockGroup 자식)에
// 나란히 나타난다. 그 외 타입은 거절한다(미지 노드 조용히 무시 금지 —
// 기존 계약 유지).
const decodeBlock = (
  node: TiptapJsonNode,
  createId: IdFactory,
): Result<Block, EditorError> => {
  if (node.type === "table") {
    return tableBlockFromTiptapJson(node, resolveBlockId(node, createId));
  }
  if (node.type === "divider") {
    return {
      ok: true,
      value: { id: resolveBlockId(node, createId), type: "divider" },
    };
  }
  if (node.type === "blockContainer") {
    return blockContainerToModel(node, createId);
  }
  return invalid(`Unsupported Tiptap block: ${String(node.type)}`);
};

export const tiptapToModel = (
  json: TiptapJsonNode,
  revision: number,
  createId: IdFactory,
): Result<Document, EditorError> => {
  if (json.type !== "doc") return invalid("Tiptap content must be a document");

  const blocks: Document["blocks"] = [];
  for (const node of json.content ?? []) {
    const decoded = decodeBlock(node, createId);
    if (!decoded.ok) return decoded;
    blocks.push(decoded.value);
  }

  const parsed = parseDocument({ formatVersion: 1, revision, blocks });
  return parsed.ok ? parsed : invalid(parsed.error.message);
};
