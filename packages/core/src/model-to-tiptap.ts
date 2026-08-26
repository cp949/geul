import {
  type Document,
  type InlineContent,
  isCanonicalTextMarks,
  isSupportedLinkHref,
  isValidInlineText,
  type Result,
  type TableBlock,
  type TextMark,
} from "@cp949/geul-model";

import type { EditorError } from "./errors.js";
import { columnIndexMap } from "./table-grid.js";

export type TiptapJsonMark = {
  type?: string;
  attrs?: Record<string, unknown>;
};

export type TiptapJsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapJsonNode[];
  marks?: TiptapJsonMark[];
  text?: string;
};

const invalid = (message: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "DOCUMENT_INVALID", message },
});

const markKey = (mark: TextMark): string =>
  mark.type === "link" ? `link:${mark.href}` : mark.type;

// 편집기에 커밋되는 인라인 콘텐츠의 항목 계약: 빈 텍스트 런 금지
// (ProseMirror는 빈 텍스트 노드를 만들 수 없다), 빈 마크 배열 금지,
// 미지원 링크 금지(LinkPolicyExtension이 트랜잭션째 버리기 전에 경계에서
// 거절), 정규 마크 순서, 인접 동일 마크 런 금지. 위반이 없으면 null,
// 있으면 위반을 설명하는 서술어를 반환한다 — 호출자가 위치(블록 id, 셀
// 좌표)를 앞에 붙여 message를 만든다.
export const inlineContentViolation = (
  content: InlineContent,
): string | null => {
  let previousMarks: string | undefined;

  for (const item of content) {
    if (item.text.length === 0) {
      return "contains an empty text run";
    }
    if (!isValidInlineText(item.text)) {
      return "contains invalid inline text (control characters, DEL, or an unpaired surrogate)";
    }
    if (item.marks?.length === 0) {
      return "contains an empty mark set";
    }
    for (const mark of item.marks ?? []) {
      if (mark.type === "link" && !isSupportedLinkHref(mark.href)) {
        return "contains an unsupported link URL";
      }
    }
    if (!isCanonicalTextMarks(item.marks ?? [])) {
      return "contains noncanonical mark ordering";
    }

    const currentMarks = JSON.stringify((item.marks ?? []).map(markKey));
    if (currentMarks === previousMarks) {
      return "contains adjacent inline runs with identical marks";
    }
    previousMarks = currentMarks;
  }
  return null;
};

const validateEditableContent = (
  blocks: Document["blocks"],
): Result<void, EditorError> => {
  for (const block of blocks) {
    if (block.type === "table") {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          const violation = inlineContentViolation(cell.content);
          if (violation !== null) {
            return invalid(`Block ${block.id} cell ${cell.id} ${violation}`);
          }
        }
      }
      continue;
    }

    const violation = inlineContentViolation(block.content);
    if (violation !== null) {
      return invalid(`Block ${block.id} ${violation}`);
    }
  }

  return { ok: true, value: undefined };
};

const markToTiptap = (mark: TextMark): TiptapJsonMark => {
  switch (mark.type) {
    case "bold":
      return { type: "bold" };
    case "italic":
      return { type: "italic" };
    case "underline":
      return { type: "underline" };
    case "strike":
      return { type: "strike" };
    case "code":
      return { type: "code" };
    case "link":
      return { type: "link", attrs: { href: mark.href } };
  }
};

export const inlineContentToTiptap = (
  content: InlineContent,
): TiptapJsonNode[] =>
  content.map((item) => ({
    type: "text",
    text: item.text,
    ...(item.marks === undefined
      ? {}
      : { marks: item.marks.map(markToTiptap) }),
  }));

// G-TBL-001: 저장 배열 순서는 논리 열 순서의 권위가 아니다. ProseMirror 표는
// 셀의 물리 문서 순서(형제 노드 순서)로 열 위치를 결정하므로, tiptap JSON을
// 만들 때는 반드시 columnId가 가리키는 table.columns 인덱스로 재정렬한다.
export const tableBlockToTiptapJson = (table: TableBlock): TiptapJsonNode => {
  const columnIndexById = columnIndexMap(table);

  return {
    type: "table",
    attrs: {
      blockId: table.id,
      columns: table.columns,
      headerRows: table.headerRows,
      headerColumns: table.headerColumns,
    },
    content: table.rows.map((row) => ({
      type: "tableRow",
      attrs: { rowId: row.id },
      content: [...row.cells]
        .sort(
          (a, b) =>
            (columnIndexById.get(a.columnId) ?? 0) -
            (columnIndexById.get(b.columnId) ?? 0),
        )
        .map((cell) => ({
          type: "tableCell",
          attrs: {
            cellId: cell.id,
            columnId: cell.columnId,
            colspan: cell.columnSpan,
            rowspan: cell.rowSpan,
            colwidth: null,
            textColor: cell.textColor ?? null,
            backgroundColor: cell.backgroundColor ?? null,
            align: cell.align ?? null,
          },
          content: inlineContentToTiptap(cell.content),
        })),
    })),
  };
};

export const modelToTiptap = (
  document: Document,
): Result<TiptapJsonNode, EditorError> => {
  if (document.blocks.length === 0) {
    return invalid("R0 editor documents require at least one block");
  }
  const representable = validateEditableContent(document.blocks);
  if (!representable.ok) return representable;

  return {
    ok: true,
    value: {
      type: "doc",
      content: document.blocks.map((block) =>
        block.type === "table"
          ? tableBlockToTiptapJson(block)
          : {
              type: block.type,
              attrs:
                block.type === "heading"
                  ? { blockId: block.id, level: block.level }
                  : { blockId: block.id },
              content: inlineContentToTiptap(block.content),
            },
      ),
    },
  };
};
