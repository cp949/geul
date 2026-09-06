import { isNestableBlockType, type NestableBlockType } from "./block-kind.js";
import { isKnownBlockType } from "./block-schema.js";
import { isCanonicalCellAlign } from "./cell-align.js";
import { isCanonicalCellColor } from "./cell-color.js";
import {
  isValidCodeBlockLanguage,
  isValidCodeBlockSource,
} from "./code-block.js";
import { invalid, type DocumentPath } from "./document-validation-helpers.js";
import type { DocumentError } from "./errors.js";
import { isTextRunItem } from "./inline-content-kind.js";
import { isSupportedLinkHref } from "./link-policy.js";
import { firstNonCanonicalTextMarkIndex } from "./mark-canonicalization.js";
import { isValidMediaPreviewWidth } from "./media-block.js";
import type { Result } from "./result.js";
import { isValidDocumentId, isValidInlineText } from "./string-invariants.js";
import { isKnownTextMarkType } from "./text-mark-schema.js";
import type {
  Block,
  DocumentBlock,
  InlineContent,
  TableBlock,
  TextMark,
} from "./types.js";

const validateId = (
  ids: Set<string>,
  id: string,
  path: DocumentPath,
): Result<undefined, DocumentError> => {
  if (!isValidDocumentId(id)) {
    return invalid(
      path,
      "Id must be non-empty and contain no control characters or invalid surrogate code units",
    );
  }
  if (ids.has(id)) {
    return invalid(path, `Duplicate id: ${id}`);
  }
  ids.add(id);
  return { ok: true, value: undefined };
};

const validateContent = (
  content: InlineContent,
  contentPath: DocumentPath,
): Result<undefined, DocumentError> => {
  for (const [contentIndex, item] of content.entries()) {
    // 커스텀 inline 원소(EXT-002)는 customInlineContentItemSchema가 이미
    // envelope을 검증했다 — model은 타입별 의미를 모른다(spec §4.2,
    // ADR-0002 순수성, RD-002-DELTA-12와 같은 근거). isKnownBlockType의
    // divider 분기와 동일하게 여기서 더 볼 필드가 없다(RD-002-DELTA-13).
    if (!isTextRunItem(item)) continue;

    if (!isValidInlineText(item.text)) {
      return invalid(
        [...contentPath, contentIndex, "text"],
        "Inline text must use LF line breaks and contain no other C0 controls, DEL, or invalid surrogate code units",
      );
    }

    // marks는 이제 TextMark 옆에 CustomTextMark(EXT-003)도 담는다.
    // CustomTextMark.type: string(비literal)이 discriminated union 좁히기를
    // 흐려(CustomBlock.type과 동일 원인, DELTA-01 "설계 발견") 아래 4개
    // 판정(href·색상·중복 link·canonical 순서) 전부 "알려진 마크만" 걸러
    // 원본 인덱스(markIndex)를 보존한 목록으로 수행한다 — CustomTextMark가
    // 전혀 없으면 이 필터는 no-op이라 기존 동작과 100% 동일하다.
    const knownMarks = (item.marks ?? [])
      .map((mark, markIndex) => ({ mark, markIndex }))
      .filter((entry): entry is { mark: TextMark; markIndex: number } =>
        isKnownTextMarkType(entry.mark.type),
      );

    for (const { mark, markIndex } of knownMarks) {
      if (mark.type === "link" && !isSupportedLinkHref(mark.href)) {
        return invalid(
          [...contentPath, contentIndex, "marks", markIndex, "href"],
          "Unsupported link URL",
        );
      }
      if (
        (mark.type === "textColor" || mark.type === "backgroundColor") &&
        !isCanonicalCellColor(mark.color)
      ) {
        return invalid(
          [...contentPath, contentIndex, "marks", markIndex, "color"],
          `${mark.type} must be an uppercase #RRGGBB color`,
        );
      }
    }
    let hasLink = false;
    for (const { mark, markIndex } of knownMarks) {
      if (mark.type !== "link") continue;
      if (hasLink) {
        return invalid(
          [...contentPath, contentIndex, "marks", markIndex],
          "Inline item must contain at most one link mark",
        );
      }
      hasLink = true;
    }
    const invalidKnownIndex = firstNonCanonicalTextMarkIndex(
      knownMarks.map((entry) => entry.mark),
    );
    if (invalidKnownIndex !== undefined) {
      const originalIndex = knownMarks[invalidKnownIndex]?.markIndex;
      if (originalIndex !== undefined) {
        return invalid(
          [...contentPath, contentIndex, "marks", originalIndex],
          "Inline marks must use the canonical stored order without duplicate mark types",
        );
      }
    }
  }
  return { ok: true, value: undefined };
};

// ids는 트리 전체(모든 깊이)가 공유하는 단일 Set이다 — 재귀 호출마다 새로
// 만들면 서로 다른 깊이의 중복 id를 놓친다(완료 조건 2). path는 현재 순회
// 위치의 blockPath 접두사이고, 최상위 호출은 validateBlocks가 ["blocks"]로
// 시작한다.
const validateBlocksAt = (
  blocks: DocumentBlock[],
  path: DocumentPath,
  ids: Set<string>,
): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    const blockPath = [...path, blockIndex];
    const blockId = validateId(ids, block.id, [...blockPath, "id"]);
    if (!blockId.ok) return blockId;

    // CustomBlock(top-level 전용, RD-002-DELTA-01)은 envelope을
    // customBlockSchema가 이미 검증했다 — 위 id 유일성 외에 이 함수가 추가로
    // 볼 필드가 없다. divider와 같은 자리에서 끝낸다. isKnownBlockType은
    // block.type만 좁히고 discriminated union인 block 자체는 좁히지 못해
    // (isNestableBlockType과 같은 이유), 아래부터는 명시적으로 as Block
    // 캐스트한 known을 쓴다 — CustomBlock.type: string이 나머지 분기의
    // 리터럴 비교(예: known.type === "divider")에 섞여 discriminated union
    // 좁히기가 흐려지는 것을 막는다.
    if (!isKnownBlockType(block.type)) continue;
    const known = block as Block;

    // divider는 id 외에 검증할 필드가 없다 — 아래 표 코드 경로로 떨어지지
    // 않게 여기서 끝낸다.
    if (known.type === "divider") continue;

    if (known.type === "codeBlock") {
      // codeBlockSchema는 content를 codeBlockContentSchema(marks 없음,
      // 커스텀 변형 없음, .max(1))라는 별도의 더 좁은 스키마로 이미
      // 검증한다 — 이 지점에 커스텀 inline 원소가 올 수 없다.
      // isTextRunItem은 InlineContent 위젠(RD-002-DELTA-13)이 넓힌
      // known.content의 타입을 순수하게 좁히는 용도이고 새 거절 로직이
      // 아니다.
      const item = known.content[0];
      if (item !== undefined && isTextRunItem(item)) {
        if (item.text.length === 0) {
          return invalid(
            [...blockPath, "content", 0, "text"],
            "CodeBlock source run must not be empty",
          );
        }
        if (!isValidCodeBlockSource(item.text)) {
          return invalid(
            [...blockPath, "content", 0, "text"],
            "CodeBlock source may contain LF and Tab but no other C0 controls, DEL, or invalid surrogate code units",
          );
        }
      }
      if (
        known.language !== undefined &&
        !isValidCodeBlockLanguage(known.language)
      ) {
        return invalid(
          [...blockPath, "language"],
          "CodeBlock language must be non-empty and contain no control characters or invalid surrogate code units",
        );
      }
      continue;
    }

    // 4종 leaf 미디어 블록(spec §3.1) — divider/codeBlock과 같은 자리에서
    // 타입 전용 검증을 마치고 continue한다. known.type 판별자 비교 3개를
    // 겹쳐 쓰면 discriminated union인 known이 좁혀진다(codeBlock처럼
    // 별도 as 캐스트가 필요 없다). url/backgroundColor는 4종 공통,
    // previewWidth/textAlignment는 image/video만 존재한다 — audio/file은
    // zod .strict() shape 자체가 이 필드를 거절하므로 여기서 다시 확인하지
    // 않는다(완료 조건 5는 스키마 계층이 담당, G-CNV-001 — 같은 불변식을
    // 두 계층에서 판정하지 않는다).
    if (
      known.type === "file" ||
      known.type === "image" ||
      known.type === "video" ||
      known.type === "audio"
    ) {
      if (known.url !== undefined && !isSupportedLinkHref(known.url)) {
        return invalid([...blockPath, "url"], "Unsupported media URL");
      }
      if (
        known.backgroundColor !== undefined &&
        !isCanonicalCellColor(known.backgroundColor)
      ) {
        return invalid(
          [...blockPath, "backgroundColor"],
          "backgroundColor must be an uppercase #RRGGBB color",
        );
      }
      if (known.type === "image" || known.type === "video") {
        if (
          known.previewWidth !== undefined &&
          !isValidMediaPreviewWidth(known.previewWidth)
        ) {
          return invalid(
            [...blockPath, "previewWidth"],
            "previewWidth must be a positive finite number",
          );
        }
        if (
          known.textAlignment !== undefined &&
          !isCanonicalCellAlign(known.textAlignment)
        ) {
          return invalid(
            [...blockPath, "textAlignment"],
            "textAlignment must be one of left, center, right",
          );
        }
      }
      continue;
    }

    // heading 전용 불변식(spec §4.1): collapsed가 있는데 isToggleable이
    // true가 아니면 거절한다. codeBlock과 같은 구조 — nestable 공통 처리
    // (content·children 재귀) 전에 타입 전용 검증을 먼저 건다. 이 판정을
    // 다른 곳(core codec 등)에 복제하지 않는다(G-CNV-001) — heading의
    // collapsed·isToggleable은 여기서만 유효성을 판정하고 나머지 계층은
    // 값을 그대로 직대응한다.
    if (
      known.type === "heading" &&
      known.collapsed !== undefined &&
      known.isToggleable !== true
    ) {
      return invalid(
        [...blockPath, "collapsed"],
        "Heading collapsed requires isToggleable: true",
      );
    }

    if (isNestableBlockType(known.type)) {
      // isNestableBlockType은 model 밖(core의 PM node.type.name 등)에서도
      // 쓰는 문자열 predicate라 discriminated union인 known은 좁히지
      // 못한다 — 명시적으로 좁힌다.
      const nestable = known as Extract<Block, { type: NestableBlockType }>;
      const content = validateContent(nestable.content, [
        ...blockPath,
        "content",
      ]);
      if (!content.ok) return content;
      if (nestable.children !== undefined) {
        const children = validateBlocksAt(
          nestable.children,
          [...blockPath, "children"],
          ids,
        );
        if (!children.ok) return children;
      }
      continue;
    }

    // 위에서 divider/codeBlock/4종 미디어/nestable을 모두 걸러냈으니
    // predicate 계약상 이 지점은 table뿐이다.
    const table = known as TableBlock;
    for (const [columnIndex, column] of table.columns.entries()) {
      const columnId = validateId(ids, column.id, [
        ...blockPath,
        "columns",
        columnIndex,
        "id",
      ]);
      if (!columnId.ok) return columnId;
    }

    for (const [rowIndex, row] of table.rows.entries()) {
      const rowId = validateId(ids, row.id, [
        ...blockPath,
        "rows",
        rowIndex,
        "id",
      ]);
      if (!rowId.ok) return rowId;

      for (const [cellIndex, cell] of row.cells.entries()) {
        const cellPath = [
          ...blockPath,
          "rows",
          rowIndex,
          "cells",
          cellIndex,
        ] as const;
        const cellId = validateId(ids, cell.id, [...cellPath, "id"]);
        if (!cellId.ok) return cellId;
        if (!isValidDocumentId(cell.columnId)) {
          return invalid(
            [...cellPath, "columnId"],
            "Column reference must contain no control characters or invalid surrogate code units",
          );
        }
        const content = validateContent(cell.content, [...cellPath, "content"]);
        if (!content.ok) return content;
      }
    }
  }
  return { ok: true, value: undefined };
};

export const validateBlocks = (
  blocks: DocumentBlock[],
): Result<undefined, DocumentError> =>
  validateBlocksAt(blocks, ["blocks"], new Set<string>());
