import {
  isListItemBlockType,
  type Block,
  type Document,
  type InlineContent,
  type ListItemBlock,
  type ListItemBlockType,
  type ToggleListItemBlock,
} from "@cp949/geul-model";

import { computeColumnAlignments } from "./column-align.js";

const DEFAULT_COLUMN_WIDTH = 160;

export type MarkdownLoss = {
  kind:
    | "MERGED_CELL"
    | "COLUMN_WIDTH"
    | "COLUMN_ALIGN"
    | "CELL_COLOR"
    | "UNDERLINE"
    | "HEADER_ROW"
    | "HEADER_COLUMN"
    | "INLINE_CODE_NEWLINE"
    | "NESTED_CHILDREN"
    | "CHECKED_STATE_LOST"
    | "TOGGLE_STATE_LOST";
  blockId: string;
  rowId?: string;
  cellId?: string;
  message: string;
};

const hasUnderline = (content: InlineContent): boolean =>
  content.some((item) =>
    (item.marks ?? []).some((mark) => mark.type === "underline"),
  );

const hasInlineCodeNewline = (content: InlineContent): boolean =>
  content.some(
    (item) =>
      item.text.includes("\n") &&
      (item.marks ?? []).some((mark) => mark.type === "code"),
  );

const collectTableLosses = (
  block: Extract<Block, { type: "table" }>,
  losses: MarkdownLoss[],
): void => {
  if (block.headerRows !== 1) {
    losses.push({
      kind: "HEADER_ROW",
      blockId: block.id,
      message: `Table ${block.id} has ${block.headerRows} header rows; GFM export uses 1`,
    });
  }
  if (block.headerColumns !== 0) {
    losses.push({
      kind: "HEADER_COLUMN",
      blockId: block.id,
      message: `Table ${block.id} has ${block.headerColumns} header columns; GFM export uses 0`,
    });
  }

  const columnAlignments = computeColumnAlignments(block);

  for (const column of block.columns) {
    if (column.width !== DEFAULT_COLUMN_WIDTH) {
      losses.push({
        kind: "COLUMN_WIDTH",
        blockId: block.id,
        message: `Column ${column.id} has non-default width ${column.width}`,
      });
    }
    if (columnAlignments.get(column.id) === "mixed") {
      losses.push({
        kind: "COLUMN_ALIGN",
        blockId: block.id,
        message: `Column ${column.id} has cells with different align values`,
      });
    }
  }

  for (const row of block.rows) {
    for (const cell of row.cells) {
      const location = {
        blockId: block.id,
        rowId: row.id,
        cellId: cell.id,
      };
      if (cell.rowSpan !== 1 || cell.columnSpan !== 1) {
        losses.push({
          kind: "MERGED_CELL",
          ...location,
          message: `Cell ${cell.id} spans ${cell.rowSpan} rows and ${cell.columnSpan} columns`,
        });
      }
      if (cell.textColor !== undefined || cell.backgroundColor !== undefined) {
        losses.push({
          kind: "CELL_COLOR",
          ...location,
          message: `Cell ${cell.id} has text or background color`,
        });
      }
      if (hasUnderline(cell.content)) {
        losses.push({
          kind: "UNDERLINE",
          ...location,
          message: `Cell ${cell.id} contains underline formatting`,
        });
      }
      if (hasInlineCodeNewline(cell.content)) {
        losses.push({
          kind: "INLINE_CODE_NEWLINE",
          ...location,
          message: `Cell ${cell.id} contains inline code with a newline`,
        });
      }
    }
  }
};

// toggleListItem은 model isListItemBlockType(로드맵 D2, <ul>/<li> HTML 직렬화
// 축)에 없어 GFM export가 기본적으로 이를 목록으로 인식하지 못하고 default
// 분기로 떨어뜨려 글머리 기호 자체를 잃는다. GFM lossy export는 toggleListItem을
// 접힘 정보만 버린 채 일반 글머리 목록으로 낮추므로(spec §7.2) "GFM에서
// 목록처럼 다뤄야 하는 블록"을 판정하는 이 지역 predicate가 필요하다. model에
// 추가하지 않는다 — groupListItemRuns(html·markdown 공유)는 isListItemBlockType을
// 그대로 쓰는 채로 남아야 toggleListItem이 <ul>/<li>로 다시 묶이려는 시도가
// 생기지 않는다(D2가 막은 표 전용 분기 오판 문제 재발 방지).
export const isGfmListLikeBlockType = (
  type: string,
): type is ListItemBlockType | "toggleListItem" =>
  isListItemBlockType(type) || type === "toggleListItem";

// paragraph/heading/quote의 children은 대응 mdast 노드에 블록 슬롯이 없어
// NESTED_CHILDREN이다. 목록 항목의 children은 mdast listItem이 직접
// GFM은 목록 항목의 own content와 첫 child paragraph 경계를 구분하지
// 못한다 — "own content가 비어 있고 첫 child가 paragraph"인 모양은 재파싱 때
// 항상 같은 트리로 뭉친다. 이 판정을 여기서 소유하고 export-markdown.ts의
// flattenBlocks(승격 여부)·listNode(own paragraph materialize 여부)가
// 같은 함수를 호출한다(아키텍처 리뷰 6차 후보 L5) — 세 곳이 독립된 조건을
// 유지하면 한쪽만 조정될 때 손실 보고와 실제 출력이 조용히 어긋난다.
export const hasAmbiguousLeadingListParagraph = (block: Block): boolean => {
  // isGfmListLikeBlockType은 block.type(string)만 좁힌다 — block 자신의
  // discriminated union은 좁혀지지 않는다(TS 제약, 아키텍처 리뷰 6차 L1에서
  // 처음 부딪힘). predicate가 이미 그 계약을 증명했으므로 캐스트는 안전하다.
  if (!isGfmListLikeBlockType(block.type)) return false;
  const item = block as ListItemBlock | ToggleListItemBlock;
  return item.content.length === 0 && item.children?.[0]?.type === "paragraph";
};

// 표현하므로 손실 없이 재귀 순회한다. 단, 빈 own content 뒤 첫 paragraph는
// GFM이 own paragraph와 child paragraph 경계를 구분하지 못하므로 부모 목록
// 항목의 NESTED_CHILDREN으로 분류한다.
const collectBlockLosses = (block: Block, losses: MarkdownLoss[]): void => {
  if (block.type === "table") {
    collectTableLosses(block, losses);
    return;
  }
  if (block.type === "divider" || block.type === "codeBlock") return;

  if (hasUnderline(block.content)) {
    losses.push({
      kind: "UNDERLINE",
      blockId: block.id,
      message: `Block ${block.id} contains underline formatting`,
    });
  }
  if (hasInlineCodeNewline(block.content)) {
    losses.push({
      kind: "INLINE_CODE_NEWLINE",
      blockId: block.id,
      message: `Block ${block.id} contains inline code with a newline`,
    });
  }
  const hasChildren = block.children !== undefined && block.children.length > 0;

  if (hasChildren) {
    if (
      !isGfmListLikeBlockType(block.type) ||
      hasAmbiguousLeadingListParagraph(block)
    ) {
      losses.push({
        kind: "NESTED_CHILDREN",
        blockId: block.id,
        message: `Block ${block.id} has nested children; GFM export flattens them into sibling blocks`,
      });
    } else if (
      block.type === "checkListItem" &&
      block.content.length === 0 &&
      block.children?.[0]?.type !== "paragraph"
    ) {
      // mdast-util-gfm-task-list-item은 listItem의 첫 자식이 paragraph일 때만
      // `[ ]`/`[x]`를 붙인다(export-markdown.ts listNode 주석 참고). own
      // content가 비고 첫 child가 non-paragraph면(예: quote) 체크박스가
      // stringify에서 조용히 사라진다 — 콘텐츠·중첩은 보존되지만 checked만
      // 손실되는 별도 카테고리라 NESTED_CHILDREN과 분리한다.
      losses.push({
        kind: "CHECKED_STATE_LOST",
        blockId: block.id,
        message: `Block ${block.id} has empty content and a non-paragraph first child; GFM cannot anchor the checkbox marker`,
      });
    }
  }

  // "토글이라는 사실 자체"는 GFM이 표현할 수 없는 상태라 children 유무와
  // 무관하게 항상 보고한다(spec §7.2) — CHECKED_STATE_LOST처럼 특정 구조
  // 조합에서만 나는 손실과 다르다. heading에 children이 있으면 위
  // NESTED_CHILDREN과 함께 보고된다(서로 억제하지 않음).
  if (
    (block.type === "heading" && block.isToggleable === true) ||
    block.type === "toggleListItem"
  ) {
    losses.push({
      kind: "TOGGLE_STATE_LOST",
      blockId: block.id,
      message: `Block ${block.id} is a toggle; GFM export does not preserve the collapsed state`,
    });
  }

  if (hasChildren) {
    for (const child of block.children ?? []) {
      collectBlockLosses(child, losses);
    }
  }
};

export const analyzeMarkdownLoss = (document: Document): MarkdownLoss[] => {
  const losses: MarkdownLoss[] = [];

  for (const block of document.blocks) {
    collectBlockLosses(block, losses);
  }

  return losses;
};
