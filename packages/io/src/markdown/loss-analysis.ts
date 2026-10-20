import {
  isKnownBlockType,
  isMediaBlock,
  mediaBlockHasField,
  isTextRunItem,
  type Block,
  type Document,
  type InlineContent,
} from "@cp949/geul-model";

import { hasCodeTablePipeLoss } from "./code-table-pipe.js";
import { computeColumnAlignments } from "./column-align.js";
import {
  firstChildMergesIntoOwnContent,
  isBulletLineReadAsThematicBreak,
  isCheckboxAnchorLost,
  isGfmContainerLikeBlockType,
} from "./gfm-container-shape.js";
import {
  type HardBreakLossShape,
  hardBreakLossShape,
} from "./hard-break-edges.js";

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
    // Issue #209(BLK-020) RD-003 DELTA-02. callout은 icon 유무·children
    // 유무와 무관하게 GFM에 표현 수단이 없다(TOGGLE_STATE_LOST와 동일
    // 논리) — 설계 §4. children이 있으면 NESTED_CHILDREN도 함께 보고된다
    // (isGfmContainerLikeBlockType에 callout을 넣지 않아 paragraph/heading과
    // 같은 취급을 받는다 — quote/목록류와 다른 지점).
    | "CALLOUT_STATE_LOST"
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
    // RD-001-DELTA-03(Issue #194). GFM code fence에는 wrap(줄바꿈 on/off)을
    // 실을 필드가 없다 — MEDIA_CAPTION과 동일하게 값이 있을 때만(true) 보고.
    | "CODE_BLOCK_WRAP"
    // RD-002-DELTA-04(Issue #194). GFM code fence에는 caption을 실을 필드가
    // 없다 — 비어 있지 않은 문자열일 때만 보고한다(MEDIA_CAPTION의 `!==
    // undefined`와 다르게 non-empty 조건, RD-002-DELTA-04.md "목적" 근거 —
    // caption을 입력했다가 지운 뒤 blur하면 model에 caption: ""가 남는다).
    | "CODE_BLOCK_CAPTION"
    // RD-003. top-level CustomBlock(model, RD-002-DELTA-01) 중
    // customBlockToMarkdown에 등록되지 않은 타입(spec §4.5) — 등록된
    // 타입은 이 kind를 갖지 않는다(정상 렌더).
    | "CUSTOM_BLOCK_LOST"
    // Issue #393. bold·italic·strike·code mark가 붙은 빈 글자 런은 마커만
    // (`****` 등) 나가 재가져오기 때 divider·codeBlock·글자로 구조가 바뀔 수 있다.
    // 런이 content 어디에 있든 보고하고, 블록·셀당 1건이다.
    | "EMPTY_MARKED_RUN"
    // Issue #401. 블록 끝·bold/italic/strike 런 끝의 hardBreak(`\n`)와 제목 3–6의
    // 안쪽 hardBreak는 GFM이 담지 못한다. 블록당 1건이고 표 셀은 대상이 아니다.
    | "HARD_BREAK_LOST"
    // Issue #402. 표 셀 code 런의 홀수 개 백슬래시 뒤 `|`는 표 파서가 열 구분자로
    // 읽는다. 셀당 1건이고 표 밖 code 런은 대상이 아니다.
    | "INLINE_CODE_TABLE_PIPE"
    // Issue #424. GFM 링크 `[text](url)`에는 target을 실을 수 없다. target이 있는 link mark가
    // content 어디에 있든 보고하고, 블록·셀당 1건이다.
    | "LINK_TARGET"
    // Issue #424. GFM 이미지 `![alt](url)`는 alt 하나뿐이고 재가져오기 때 name으로 읽는다.
    // image의 alt가 있고 name과 다르면(둘 다 없는 경우의 빈 alt는 같다고 본다) alt와 name의
    // 구분이 사라진다. 블록당 1건이다.
    | "IMAGE_ALT";
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

const hasLinkTarget = (content: InlineContent): boolean =>
  content.some(
    (item) =>
      isTextRunItem(item) &&
      (item.marks ?? []).some(
        (mark) =>
          mark.type === "link" && "target" in mark && mark.target !== undefined,
      ),
  );

const hasInlineCodeNewline = (content: InlineContent): boolean =>
  content.some(
    (item) =>
      isTextRunItem(item) &&
      item.text.includes("\n") &&
      (item.marks ?? []).some((mark) => mark.type === "code"),
  );

// Issue #393. link 단독과 mark 없는 빈 런은 마커가 나가지 않아 대상이 아니다.
// underline·색 mark는 각자의 kind가 이미 보고한다.
const hasEmptyMarkedRun = (content: InlineContent): boolean =>
  content.some(
    (item) =>
      isTextRunItem(item) &&
      item.text === "" &&
      (item.marks ?? []).some(
        (mark) =>
          mark.type === "bold" ||
          mark.type === "italic" ||
          mark.type === "strike" ||
          mark.type === "code",
      ),
  );

// HARD_BREAK_LOST 메시지를 모양별로 고른다. 종류는 하나이고 원인만 다르다.
const hardBreakMessage = (block: Block, shape: HardBreakLossShape): string => {
  switch (shape) {
    case "BLOCK_END":
      return `Block ${block.id} ends with a line break; GFM export drops it`;
    case "MARK_RUN_END":
      return `Block ${block.id} has a line break at the end of a bold, italic or strike run; GFM export moves it out of the formatting`;
    case "HEADING_INNER":
      return `Block ${block.id} is an ATX heading with a line break; GFM export cannot hold it and joins the lines with a space`;
  }
};

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
      // Issue #402. 판정은 code-table-pipe.ts가 소유한다.
      if (hasCodeTablePipeLoss(cell.content)) {
        losses.push({
          kind: "INLINE_CODE_TABLE_PIPE",
          ...location,
          message: `Cell ${cell.id} contains inline code with a backslash before a pipe; GFM table cells cannot represent it`,
        });
      }
      if (hasEmptyMarkedRun(cell.content)) {
        losses.push({
          kind: "EMPTY_MARKED_RUN",
          ...location,
          message: `Cell ${cell.id} contains an empty text run with bold, italic, strike or code formatting; GFM export writes only the markers`,
        });
      }
      if (hasColorMark(cell.content)) {
        losses.push({
          kind: "INLINE_COLOR",
          ...location,
          message: `Cell ${cell.id} contains inline text or background color`,
        });
      }
      if (hasLinkTarget(cell.content)) {
        losses.push({
          kind: "LINK_TARGET",
          ...location,
          message: `Cell ${cell.id} contains a link with a target; GFM links cannot carry it`,
        });
      }
    }
  }
};

// NESTED_CHILDREN 메시지를 모양별로 고른다. 종류는 하나이고 원인만 다르다.
// 빈 목록 항목의 마커 줄이 thematic break로 읽히는 두 모양(Issue #392)은 첫
// 자식이 divider인지로 가른다. 사슬 모양은 첫 자식이 bulletListItem이다.
const nestedChildrenMessage = (block: Block): string => {
  if (!isGfmContainerLikeBlockType(block.type)) {
    return `Block ${block.id} has nested children; GFM export flattens them into sibling blocks`;
  }
  if (isBulletLineReadAsThematicBreak(block)) {
    return block.type === "bulletListItem" &&
      block.children?.[0]?.type === "divider"
      ? `Block ${block.id} is an empty list item whose first child is a divider; GFM can read its marker line as a thematic break`
      : `Block ${block.id} starts a chain of nested empty list items; GFM can read the marker line as a thematic break`;
  }
  return `Block ${block.id} has empty content and a first child that GFM cannot tell apart from the block's own content`;
};

// 블록 하나의 손실을 모으고 children을 재귀 순회한다. 목록 항목·quote의
// children은 mdast가 직접 표현하므로 손실 없이 순회한다. 단, 빈 own content 뒤
// 첫 자식이 mdast paragraph로 나가면(paragraph, image, callout, 미디어) GFM이
// own content와 첫 자식 경계를 구분하지 못하므로 부모의 NESTED_CHILDREN이다.
const collectBlockLosses = (block: Block, losses: MarkdownLoss[]): void => {
  if (block.type === "table") {
    collectTableLosses(block, losses);
    return;
  }
  if (block.type === "divider") return;
  if (block.type === "codeBlock") {
    if (block.wrap === true) {
      losses.push({
        kind: "CODE_BLOCK_WRAP",
        blockId: block.id,
        message: `Block ${block.id} has line wrap enabled`,
      });
    }
    if (block.caption !== undefined && block.caption.length > 0) {
      losses.push({
        kind: "CODE_BLOCK_CAPTION",
        blockId: block.id,
        message: `Block ${block.id} has a caption`,
      });
    }
    return;
  }
  // 4종 미디어 블록(Issue #152 슬라이스6, RD-002 DELTA-01, spec §7.2).
  // Image만 GFM 고유 표현 수단(`![name](url)`)이 있어 MEDIA_TYPE_LOST를
  // 갖지 않는다 — 나머지 prop(previewWidth/showPreview/textAlignment/
  // caption/backgroundColor)은 값이 실제로 있을 때만 개별 보고한다.
  // Video/Audio/File은 그 prop들과 무관하게 항상 MEDIA_TYPE_LOST를 추가로
  // 보고한다(TOGGLE_STATE_LOST와 동일 논리 — 재import 시 어떤 조합으로도
  // 원래 타입으로 복원되지 않는다, spec §7.3). previewWidth/textAlignment는
  // image/video만, showPreview는 image/video/audio만 갖는다(model
  // MediaBlockCommon 확장 shape, file은 넷 다 없음).
  if (isMediaBlock(block)) {
    if (block.backgroundColor !== undefined) {
      losses.push({
        kind: "BLOCK_COLOR",
        blockId: block.id,
        message: `Block ${block.id} has a background color`,
      });
    }
    if (
      mediaBlockHasField(block, "alt") &&
      block.alt !== undefined &&
      block.alt !== (block.name ?? "")
    ) {
      losses.push({
        kind: "IMAGE_ALT",
        blockId: block.id,
        message: `Block ${block.id} has an alt text different from its name; GFM images carry a single alt text`,
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
      mediaBlockHasField(block, "previewWidth") &&
      block.previewWidth !== undefined
    ) {
      losses.push({
        kind: "MEDIA_PREVIEW_WIDTH",
        blockId: block.id,
        message: `Block ${block.id} has a preview width`,
      });
    }
    if (
      mediaBlockHasField(block, "showPreview") &&
      block.showPreview === false
    ) {
      losses.push({
        kind: "MEDIA_SHOW_PREVIEW",
        blockId: block.id,
        message: `Block ${block.id} has showPreview overridden to false`,
      });
    }
    if (
      mediaBlockHasField(block, "textAlignment") &&
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
  if (hasEmptyMarkedRun(block.content)) {
    losses.push({
      kind: "EMPTY_MARKED_RUN",
      blockId: block.id,
      message: `Block ${block.id} contains an empty text run with bold, italic, strike or code formatting; GFM export writes only the markers`,
    });
  }
  // Issue #401. 판정은 hard-break-edges.ts가 소유한다. 제목은 level이 필요하다.
  const hardBreakShape = hardBreakLossShape(
    block.content,
    block.type === "heading" ? block.level : undefined,
  );
  if (hardBreakShape !== null) {
    losses.push({
      kind: "HARD_BREAK_LOST",
      blockId: block.id,
      message: hardBreakMessage(block, hardBreakShape),
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
  if (hasLinkTarget(block.content)) {
    losses.push({
      kind: "LINK_TARGET",
      blockId: block.id,
      message: `Block ${block.id} contains a link with a target; GFM links cannot carry it`,
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

  if (
    hasChildren &&
    (!isGfmContainerLikeBlockType(block.type) ||
      firstChildMergesIntoOwnContent(block) ||
      isBulletLineReadAsThematicBreak(block))
  ) {
    losses.push({
      kind: "NESTED_CHILDREN",
      blockId: block.id,
      message: nestedChildrenMessage(block),
    });
  } else if (isCheckboxAnchorLost(block)) {
    // mdast-util-gfm-task-list-item은 listItem의 첫 자식이 paragraph일 때만
    // `[ ]`/`[x]`를 붙인다(export-markdown.ts listNode 주석 참고). own
    // content가 비고 첫 자식이 없거나 mdast paragraph가 아니면(예: quote)
    // 체크박스가 stringify에서 조용히 사라진다. 콘텐츠·중첩은 보존되지만
    // checked만 손실되는 별도 카테고리라 NESTED_CHILDREN과 분리한다.
    losses.push({
      kind: "CHECKED_STATE_LOST",
      blockId: block.id,
      message: `Block ${block.id} has empty content and no leading paragraph; GFM cannot anchor the checkbox marker`,
    });
  }

  // "토글이라는 사실 자체"는 GFM이 표현할 수 없는 상태라 children 유무와
  // 무관하게 항상 보고한다(spec §7.2) — CHECKED_STATE_LOST처럼 특정 구조
  // 조합에서만 나는 손실과 다르다. children이 있으면 위 NESTED_CHILDREN과
  // 함께 보고된다(서로 억제하지 않음).
  if (block.type === "toggleListItem") {
    losses.push({
      kind: "TOGGLE_STATE_LOST",
      blockId: block.id,
      message: `Block ${block.id} is a toggle; GFM export does not preserve the collapsed state`,
    });
  }

  // "callout이라는 사실 자체"는 GFM이 표현할 수 없는 상태라 icon·children
  // 유무와 무관하게 항상 보고한다(Issue #209, 설계 §4) — TOGGLE_STATE_LOST와
  // 동일 논리. children이 있으면 위 NESTED_CHILDREN과 함께 보고된다(서로
  // 억제하지 않음, callout은 isGfmContainerLikeBlockType 밖이라 quote/
  // 목록류와 달리 항상 그렇다).
  if (block.type === "callout") {
    losses.push({
      kind: "CALLOUT_STATE_LOST",
      blockId: block.id,
      message: `Block ${block.id} is a callout; GFM export does not preserve the icon or callout type`,
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
