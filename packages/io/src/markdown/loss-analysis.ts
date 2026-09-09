import {
  isKnownBlockType,
  isListItemBlockType,
  isTextRunItem,
  type Block,
  type Document,
  type InlineContent,
  type ListItemBlock,
  type ListItemBlockType,
  type QuoteBlock,
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
    | "TOGGLE_STATE_LOST"
    // RD-004 DELTA-03. INLINE_COLOR는 인라인 textColor/backgroundColor
    // mark(DELTA-01, CELL_COLOR와 달리 셀 자체가 아니라 콘텐츠 안 mark).
    // BLOCK_COLOR/BLOCK_ALIGN은 블록 레벨 TextBlockProps(DELTA-02).
    | "INLINE_COLOR"
    | "BLOCK_COLOR"
    | "BLOCK_ALIGN"
    // Issue #152 슬라이스6 RD-002 DELTA-01. 4종 미디어 블록(file/image/
    // video/audio) 전용 손실 카테고리(spec §7.2). backgroundColor는 별도
    // kind를 신설하지 않고 위 BLOCK_COLOR를 재사용한다(RD-002-DELTA-01.md
    // "결정" — table의 CELL_COLOR와 달리 media에는 별도 location 축이
    // 없어 분리할 이유가 없다).
    | "MEDIA_PREVIEW_WIDTH"
    | "MEDIA_SHOW_PREVIEW"
    | "MEDIA_TEXT_ALIGNMENT"
    | "MEDIA_CAPTION"
    // spec이 명명하지 않은 kind다 — video/audio/file은 다른 prop이 전혀
    // 없어도 블록 타입 자체가 GFM에 표현 수단이 없다(TOGGLE_STATE_LOST와
    // 동일 논리, RD-002-DELTA-01.md "결정"). Image는 이 kind를 절대 갖지
    // 않는다.
    | "MEDIA_TYPE_LOST"
    // RD-003. top-level CustomBlock(model, RD-002-DELTA-01) 중
    // customBlockToMarkdown에 등록되지 않은 타입(spec §4.5) — 등록된
    // 타입은 이 kind를 갖지 않는다(정상 렌더).
    | "CUSTOM_BLOCK_LOST";
  blockId: string;
  rowId?: string;
  cellId?: string;
  message: string;
};

// analyzeMarkdownLoss는 exportMarkdown 내부 호출 경로 외에도 직접 호출
// 가능한 공개 API다(DELTA-07 결정 근거) — exportMarkdown의
// blocksInlineContentViolation 게이트(RD-002-DELTA-16)를 우회해 호출될 수
// 있으므로 세 predicate 모두 자체 방어로 isTextRunItem 가드를 둔다. 커스텀
// inline 원소는 손실 카테고리 어휘에 없으므로(exportMarkdown이 이미 별도로
// 거절을 전담) 여기서는 조용히 skip한다(순수 탐색, 판정 로직 무변경 —
// top-level CustomBlock을 collectBlockLosses가 건너뛰는 것과 동일 원칙).
const hasUnderline = (content: InlineContent): boolean =>
  content.some(
    (item) =>
      isTextRunItem(item) &&
      (item.marks ?? []).some((mark) => mark.type === "underline"),
  );

const hasColorMark = (content: InlineContent): boolean =>
  content.some(
    (item) =>
      isTextRunItem(item) &&
      (item.marks ?? []).some(
        (mark) => mark.type === "textColor" || mark.type === "backgroundColor",
      ),
  );

const hasInlineCodeNewline = (content: InlineContent): boolean =>
  content.some(
    (item) =>
      isTextRunItem(item) &&
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
      if (hasColorMark(cell.content)) {
        losses.push({
          kind: "INLINE_COLOR",
          ...location,
          message: `Cell ${cell.id} contains inline text or background color`,
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
// 생기지 않는다(D2가 막은 표 전용 분기 오판 문제 재발 방지). export-markdown.ts의
// blockNode가 단일 목록 항목을 listNode(mdast list/listItem)로 감쌀 때
// 이 좁은 predicate를 그대로 쓴다 — quote는 listNode로 감싸면 안 되므로(아래
// isGfmContainerLikeBlockType과 분리 유지).
export const isGfmListLikeBlockType = (
  type: string,
): type is ListItemBlockType | "toggleListItem" =>
  isListItemBlockType(type) || type === "toggleListItem";

// quote는 BLK-005 재평가(Issue #151, roadmap-workflow RD-001)로 컨테이너
// 취급 대상에 편입됐다 — GFM blockquote의 content model이 root와 같은 flow
// content라 중첩을 그대로 표현할 수 있다(DELTA-01 실측: remark-parse/
// remark-gfm/remark-stringify round-trip 확인). quote는 groupListItemRuns
// 대상이 아니고 listNode(mdast list/listItem)로 감싸지도 않는다 — 그래서 위
// isGfmListLikeBlockType을 넓히지 않고 별도 predicate로 합성한다. "children이
// 있어도 컨테이너를 유지한 채 손실 없이 재귀 순회 가능한 타입"을 판정할 때만
// (loss-analysis의 NESTED_CHILDREN 판정, flattenBlocks의 컨테이너 유지 분기,
// hasAmbiguousLeadingListParagraph) 이 넓은 predicate를 쓴다.
export const isGfmContainerLikeBlockType = (
  type: string,
): type is ListItemBlockType | "toggleListItem" | "quote" =>
  isGfmListLikeBlockType(type) || type === "quote";

// paragraph/heading의 children은 대응 mdast 노드에 블록 슬롯이 없어
// NESTED_CHILDREN이다(확정 사항 9 — 두 타입 다 CommonMark에 자식-컨테이너가
// 없어 원천 불가능). 목록 항목·quote의 children은 mdast listItem·blockquote가
// 직접 표현하므로 손실 없이 재귀 순회한다. 단, GFM은 컨테이너의 own content와
// 첫 child paragraph 경계를 구분하지 못한다 — "own content가 비어 있고 첫
// child가 paragraph"인 모양은 재파싱 때 항상 같은 트리로 뭉친다. 이 판정을
// 여기서 소유하고 export-markdown.ts의 flattenBlocks(승격 여부)·listNode·
// quote 분기(둘 다 own paragraph materialize 여부)가 같은 함수를 호출한다
// (아키텍처 리뷰 6차 후보 L5) — 여러 곳이 독립된 조건을 유지하면 한쪽만
// 조정될 때 손실 보고와 실제 출력이 조용히 어긋난다. 이름은 "List"로 남지만
// quote까지 포함해 판정한다(isGfmContainerLikeBlockType과 같은 편입 이력).
export const hasAmbiguousLeadingListParagraph = (block: Block): boolean => {
  // isGfmContainerLikeBlockType은 block.type(string)만 좁힌다 — block 자신의
  // discriminated union은 좁혀지지 않는다(TS 제약, 아키텍처 리뷰 6차 L1에서
  // 처음 부딪힘). predicate가 이미 그 계약을 증명했으므로 캐스트는 안전하다.
  if (!isGfmContainerLikeBlockType(block.type)) return false;
  const item = block as ListItemBlock | ToggleListItemBlock | QuoteBlock;
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
  // 4종 미디어 블록(Issue #152 슬라이스6, RD-002 DELTA-01, spec §7.2).
  // Image만 GFM 고유 표현 수단(`![name](url)`)이 있어 MEDIA_TYPE_LOST를
  // 갖지 않는다 — 나머지 prop(previewWidth/showPreview/textAlignment/
  // caption/backgroundColor)은 값이 실제로 있을 때만 개별 보고한다.
  // Video/Audio/File은 그 prop들과 무관하게 항상 MEDIA_TYPE_LOST를 추가로
  // 보고한다(TOGGLE_STATE_LOST와 동일 논리 — 재import 시 어떤 조합으로도
  // 원래 타입으로 복원되지 않는다, spec §7.3). previewWidth/textAlignment는
  // image/video만, showPreview는 image/video/audio만 갖는다(model
  // MediaBlockCommon 확장 shape, file은 넷 다 없음).
  if (
    block.type === "file" ||
    block.type === "image" ||
    block.type === "video" ||
    block.type === "audio"
  ) {
    if (block.backgroundColor !== undefined) {
      losses.push({
        kind: "BLOCK_COLOR",
        blockId: block.id,
        message: `Block ${block.id} has a background color`,
      });
    }
    if (block.caption !== undefined) {
      losses.push({
        kind: "MEDIA_CAPTION",
        blockId: block.id,
        message: `Block ${block.id} has a caption`,
      });
    }
    if (
      (block.type === "image" || block.type === "video") &&
      block.previewWidth !== undefined
    ) {
      losses.push({
        kind: "MEDIA_PREVIEW_WIDTH",
        blockId: block.id,
        message: `Block ${block.id} has a preview width`,
      });
    }
    if (
      block.type !== "file" && // file은 showPreview 자체가 없다(mediaVisualNode 전례와 동일 조건)
      block.showPreview === false
    ) {
      losses.push({
        kind: "MEDIA_SHOW_PREVIEW",
        blockId: block.id,
        message: `Block ${block.id} has showPreview overridden to false`,
      });
    }
    if (
      (block.type === "image" || block.type === "video") &&
      block.textAlignment !== undefined
    ) {
      losses.push({
        kind: "MEDIA_TEXT_ALIGNMENT",
        blockId: block.id,
        message: `Block ${block.id} has text alignment`,
      });
    }
    if (block.type !== "image") {
      losses.push({
        kind: "MEDIA_TYPE_LOST",
        blockId: block.id,
        message: `Block ${block.id} has type "${block.type}"; GFM has no native syntax for it`,
      });
    }
    return;
  }

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
  // RD-004 DELTA-03. table/divider/codeBlock은 위에서 이미 반환했으므로
  // 남는 타입(paragraph/heading/quote/목록 4종)이 전부 TextBlockProps를
  // 가진다(실측 확인, export-html.ts의 blockNode와 같은 TS 좁힘).
  if (hasColorMark(block.content)) {
    losses.push({
      kind: "INLINE_COLOR",
      blockId: block.id,
      message: `Block ${block.id} contains inline text or background color`,
    });
  }
  if (block.textColor !== undefined || block.backgroundColor !== undefined) {
    losses.push({
      kind: "BLOCK_COLOR",
      blockId: block.id,
      message: `Block ${block.id} has text or background color`,
    });
  }
  if (block.textAlignment !== undefined) {
    losses.push({
      kind: "BLOCK_ALIGN",
      blockId: block.id,
      message: `Block ${block.id} has text alignment`,
    });
  }
  const hasChildren = block.children !== undefined && block.children.length > 0;

  if (hasChildren) {
    if (
      !isGfmContainerLikeBlockType(block.type) ||
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

// analyzeMarkdownLoss는 exportMarkdown 내부 호출 경로 외에도 직접 호출
// 가능한 공개 API다(DELTA-07 결정 근거 재확인) — customBlockTypes를
// 생략하면(외부 소비자가 등록 정보를 모르는 기본 호출) 모든 top-level
// CustomBlock을 미등록으로 간주해 CUSTOM_BLOCK_LOST를 보고한다(안전한
// 기본값 — "알려주지 않으면 아무것도 등록되지 않은 것으로 취급").
export const analyzeMarkdownLoss = (
  document: Document,
  customBlockTypes?: ReadonlySet<string>,
): MarkdownLoss[] => {
  const losses: MarkdownLoss[] = [];

  for (const block of document.blocks) {
    if (!isKnownBlockType(block.type)) {
      // 등록된 타입(customBlockTypes에 있음)은 exportMarkdown이 렌더러로
      // 정상 변환하므로 손실이 아니다 — RD-003, spec §4.5.
      if (customBlockTypes?.has(block.type) !== true) {
        losses.push({
          kind: "CUSTOM_BLOCK_LOST",
          blockId: block.id,
          message: `Block ${block.id} has unregistered custom type "${block.type}"; no customBlockToMarkdown renderer is registered for it`,
        });
      }
      continue;
    }
    collectBlockLosses(block as Block, losses);
  }

  return losses;
};
