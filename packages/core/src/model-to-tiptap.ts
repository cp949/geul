import {
  type Block,
  type BulletListItemBlock,
  type CheckListItemBlock,
  type CodeBlock,
  type Document,
  type HeadingBlock,
  type InlineContent,
  isCanonicalTextMarks,
  isSupportedLinkHref,
  isValidInlineText,
  type NumberedListItemBlock,
  type ParagraphBlock,
  type QuoteBlock,
  type Result,
  type TableBlock,
  type TextMark,
  type ToggleListItemBlock,
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

// children까지 재귀로 훑는다 — 중첩 블록의 인라인 콘텐츠도 최상위와 같은
// 경계 계약(빈 텍스트 런 금지 등)을 적용받는다(G-CNV-001: codec은 구조
// 직대응만 하고 검증 권위는 여전히 model parseDocument다 — 이 함수는 PM
// 조립이 던지는 예외를 막는 사전 방어일 뿐, 최종 권위가 아니다).
const validateEditableContent = (
  blocks: readonly Block[],
): Result<void, EditorError> => {
  for (const block of blocks) {
    // divider는 content·children이 없어 검사 대상이 없다(DividerBlock 리프).
    if (block.type === "divider") continue;

    // CodeBlock source는 일반 inline text와 달리 literal Tab을 허용한다.
    // source·language 판정과 canonicalization은 model parseDocument만 소유하고,
    // core는 여기서 일반 inline validator를 중복 적용하지 않는다(G-CNV-001).
    if (block.type === "codeBlock") continue;

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

    if (block.children !== undefined && block.children.length > 0) {
      const childResult = validateEditableContent(block.children);
      if (!childResult.ok) return childResult;
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
    case "textColor":
      return { type: "textColor", attrs: { color: mark.color } };
    case "backgroundColor":
      return { type: "backgroundColor", attrs: { color: mark.color } };
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

// 문단·헤딩·인용·목록 노드 자체(컨테이너 내부의 blockContent) 인코딩.
// blockId는 더 이상 여기 붙지 않는다 — D19가 identity를 blockContainer로
// 옮겼다. 번호 목록의 null attr은 model 필드 부재와 직대응한다. checkListItem의
// checked는 model 필수 필드라 numberedListItem.startNumber·
// toggleListItem.collapsed와 달리 null(필드 부재)로 떨어지는 경우가 없다 —
// 항상 boolean 값을 그대로 옮긴다(RD-001 DELTA-02).
const blockContentToTiptapJson = (
  block:
    | ParagraphBlock
    | HeadingBlock
    | QuoteBlock
    | BulletListItemBlock
    | NumberedListItemBlock
    | CheckListItemBlock
    | ToggleListItemBlock,
): TiptapJsonNode => ({
  type: block.type,
  ...(block.type === "heading"
    ? {
        attrs: {
          level: block.level,
          // null은 model 필드 부재와 직대응한다(numberedListItem.startNumber와
          // 같은 패턴) — isToggleable/collapsed 값 자체의 유효성은 model
          // parseDocument가 단독 판정한다(G-CNV-001).
          isToggleable: block.isToggleable ?? null,
          collapsed: block.collapsed ?? null,
        },
      }
    : block.type === "numberedListItem"
      ? { attrs: { startNumber: block.startNumber ?? null } }
      : block.type === "checkListItem"
        ? { attrs: { checked: block.checked } }
        : block.type === "toggleListItem"
          ? { attrs: { collapsed: block.collapsed ?? null } }
          : {}),
  content: inlineContentToTiptap(block.content),
});

// CodeBlock은 source run 경계를 저장하지 않는 model 정규형을 그대로 PM의
// text* content로 옮긴다. language 부재는 CodeBlockExtension attr 기본값과
// 같은 null로 명시한다. source·language 보정은 model 권위라 여기서 하지 않는다.
const codeBlockContentToTiptapJson = (block: CodeBlock): TiptapJsonNode => ({
  type: "codeBlock",
  attrs: { language: block.language ?? null },
  content: inlineContentToTiptap(block.content),
});

// Block 1개를 재귀로 PM JSON 노드로 인코딩한다(D19). table·divider는
// 컨테이너로 감싸지 않는다 — table은 tableBlockToTiptapJson 결과를 그대로
// 직결하고, divider는 table처럼 컨테이너 없이 직결하고 id를 명시
// 배정한다(parseDOM 없음과 짝 — 변환기·명령이 명시 배정). 둘 다 children을
// 가질 수 없어(model 계층, DELTA-01) 재귀 종료 조건이기도 하다.
// paragraph/heading/quote는 blockContainer(blockContent, blockGroup?(
// children…))로 감싼다 — blockGroup은 children이 있을 때만 만든다(빈
// 배열/undefined 둘 다 "자식 없음"으로 접는다). CodeBlock도 container로
// 감싸지만 leaf라 own blockGroup을 만들지 않는다.
const blockToTiptapJson = (block: Block): TiptapJsonNode => {
  if (block.type === "table") return tableBlockToTiptapJson(block);
  if (block.type === "divider") {
    return { type: "divider", attrs: { blockId: block.id } };
  }

  if (block.type === "codeBlock") {
    return {
      type: "blockContainer",
      attrs: { blockId: block.id },
      content: [codeBlockContentToTiptapJson(block)],
    };
  }

  const content: TiptapJsonNode[] = [blockContentToTiptapJson(block)];
  if (block.children !== undefined && block.children.length > 0) {
    content.push({
      type: "blockGroup",
      content: block.children.map(blockToTiptapJson),
    });
  }

  return {
    type: "blockContainer",
    attrs: { blockId: block.id },
    content,
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
      content: document.blocks.map(blockToTiptapJson),
    },
  };
};
