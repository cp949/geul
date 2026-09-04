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
  type TextBlockProps,
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
  const decoded = decodeTextMark({
    type: mark.type,
    href: mark.attrs?.href,
    color: mark.attrs?.color,
  });
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

// 4종 미디어 블록(file/image/video/audio) 디코드(RD-002 DELTA-01, spec
// §3.1) — divider와 같은 자리에서 저장 attrs를 model prop으로 직대응한다.
// 실패 경로가 없다(모든 값이 optional이고 형식 검증은 마지막
// parseDocument가 담당, G-CNV-001). null/undefined는 필드 부재로
// 접는다(다른 optional prop들과 같은 패턴).
const mediaBlockFromTiptapJson = (node: TiptapJsonNode, id: string): Block => {
  const attrs = node.attrs ?? {};
  const url = attrs.url;
  const name = attrs.name;
  const caption = attrs.caption;
  const backgroundColor = attrs.backgroundColor;
  const common = {
    ...(typeof url === "string" ? { url } : {}),
    ...(typeof name === "string" ? { name } : {}),
    ...(typeof caption === "string" ? { caption } : {}),
    ...(typeof backgroundColor === "string" ? { backgroundColor } : {}),
  };

  if (node.type === "file") {
    return { id, type: "file", ...common };
  }

  const showPreview = attrs.showPreview;
  const showPreviewProp =
    typeof showPreview === "boolean" ? { showPreview } : {};

  if (node.type === "audio") {
    return { id, type: "audio", ...common, ...showPreviewProp };
  }

  const previewWidth = attrs.previewWidth;
  const textAlignment = attrs.textAlignment;
  const imageOrVideoProps = {
    ...showPreviewProp,
    ...(typeof previewWidth === "number" ? { previewWidth } : {}),
    ...(typeof textAlignment === "string"
      ? { textAlignment: textAlignment as "left" | "center" | "right" }
      : {}),
  };

  return node.type === "video"
    ? { id, type: "video", ...common, ...imageOrVideoProps }
    : { id, type: "image", ...common, ...imageOrVideoProps };
};

// blockContainer 1개를 재귀로 model Block으로 디코드한다(D19). 컨테이너의
// 첫 자식은 항상 blockContent(paragraph/heading/quote/list/codeBlock), 두
// 번째(선택) 자식은 nestable content의 blockGroup이다. CodeBlock은 leaf라
// 두 번째 자식을 거절한다. 나머지는 스키마 content expression이 순서를
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

  // TextBlockProps(RD-001 DELTA-02) — node는 blockContainer라 이 7개 분기가
  // 모두 공유한다(model-to-tiptap.ts 인코드와 대칭으로 한 곳에서만 읽는다).
  // 값 정책은 여기서 재구현하지 않는다: null/undefined는 필드 부재로 접고
  // (heading의 isToggleable/collapsed와 같은 패턴), 그 외 값(형식 오류
  // 포함)은 마지막 parseDocument가 검증한다.
  const textColor = node.attrs?.textColor;
  const backgroundColor = node.attrs?.backgroundColor;
  const textAlignment = node.attrs?.textAlignment;
  const textBlockProps: TextBlockProps = {
    ...(textColor === undefined || textColor === null
      ? {}
      : { textColor: textColor as string }),
    ...(backgroundColor === undefined || backgroundColor === null
      ? {}
      : { backgroundColor: backgroundColor as string }),
    ...(textAlignment === undefined || textAlignment === null
      ? {}
      : { textAlignment: textAlignment as "left" | "center" | "right" }),
  };

  if (contentNode.type === "paragraph") {
    return {
      ok: true,
      value: {
        id,
        type: "paragraph",
        content: inlineContent.value,
        ...textBlockProps,
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
    // JSON attr은 unknown이지만 값 정책을 여기서 재구현하지 않는다. null은
    // 필드 부재로 직대응하고(numberedListItem.startNumber와 같은 패턴), 그
    // 외 값(불리언이 아닌 값 포함)은 마지막 parseDocument가 검증한다.
    const isToggleable = contentNode.attrs?.isToggleable;
    const collapsed = contentNode.attrs?.collapsed;
    return {
      ok: true,
      value: {
        id,
        type: "heading",
        level,
        content: inlineContent.value,
        ...(isToggleable === undefined || isToggleable === null
          ? {}
          : { isToggleable: isToggleable as boolean }),
        ...(collapsed === undefined || collapsed === null
          ? {}
          : { collapsed: collapsed as boolean }),
        ...textBlockProps,
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
        ...textBlockProps,
        ...(children === undefined ? {} : { children }),
      },
    };
  }

  if (contentNode.type === "bulletListItem") {
    return {
      ok: true,
      value: {
        id,
        type: "bulletListItem",
        content: inlineContent.value,
        ...textBlockProps,
        ...(children === undefined ? {} : { children }),
      },
    };
  }

  if (contentNode.type === "numberedListItem") {
    // JSON attr은 unknown이지만 값 정책을 여기서 재구현하지 않는다. null은
    // 필드 부재로 직대응하고 그 외 값은 마지막 parseDocument가 검증한다.
    const startNumber = contentNode.attrs?.startNumber;
    return {
      ok: true,
      value: {
        id,
        type: "numberedListItem",
        content: inlineContent.value,
        ...(startNumber === undefined || startNumber === null
          ? {}
          : { startNumber: startNumber as number }),
        ...textBlockProps,
        ...(children === undefined ? {} : { children }),
      },
    };
  }

  if (contentNode.type === "checkListItem") {
    // JSON attr은 unknown이지만 값 정책을 여기서 재구현하지 않는다.
    // checked는 model 필수 필드라 numberedListItem.startNumber·
    // toggleListItem.collapsed처럼 부재를 필드 생략으로 옮길 수 없다 —
    // 그대로 옮기고 부재·오타입 거절은 최종 parseDocument에 맡긴다.
    return {
      ok: true,
      value: {
        id,
        type: "checkListItem",
        content: inlineContent.value,
        checked: contentNode.attrs?.checked as boolean,
        ...textBlockProps,
        ...(children === undefined ? {} : { children }),
      },
    };
  }

  if (contentNode.type === "toggleListItem") {
    // JSON attr은 unknown이지만 값 정책을 여기서 재구현하지 않는다. null은
    // model collapsed 필드 부재와 직대응하고(heading·numberedListItem.startNumber와
    // 같은 패턴), 그 외 값은 마지막 parseDocument가 검증한다.
    const collapsed = contentNode.attrs?.collapsed;
    return {
      ok: true,
      value: {
        id,
        type: "toggleListItem",
        content: inlineContent.value,
        ...(collapsed === undefined || collapsed === null
          ? {}
          : { collapsed: collapsed as boolean }),
        ...textBlockProps,
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
  if (
    node.type === "file" ||
    node.type === "image" ||
    node.type === "video" ||
    node.type === "audio"
  ) {
    return {
      ok: true,
      value: mediaBlockFromTiptapJson(node, resolveBlockId(node, createId)),
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
