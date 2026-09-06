import {
  type Block,
  type InlineContent,
  isKnownTextMarkType,
  isTextRunItem,
} from "@cp949/geul-model";

// core의 model-to-tiptap.ts::inlineContentViolation과 동형 판정이지만 훨씬
// 단순하다 — io export(exportHtml/exportMarkdown)는 이미 parseDocument를
// 통과한 문서만 다루므로(빈 텍스트 런·mark 순서 등 model 계약 위반은
// parseDocument가 이미 걸러낸다) 여기서는 "커스텀 inline 원소·미등록
// CustomTextMark가 있는가"만 확인하면 된다. core처럼 DOCUMENT_INVALID/
// EDITOR_FEATURE_UNAVAILABLE 코드를 분기하지 않는다(RD-002-DELTA-16 "설계
// 결정" 3 — io는 기존 HTML_DOCUMENT_INVALID/MARKDOWN_DOCUMENT_INVALID
// 하나만 재사용한다).
export const inlineContentViolation = (
  content: InlineContent,
): { reason: string } | null => {
  for (const item of content) {
    if (!isTextRunItem(item)) {
      return {
        reason: `contains an unregistered custom inline type "${item.customType}"`,
      };
    }
    const unregisteredMark = (item.marks ?? []).find(
      (mark) => !isKnownTextMarkType(mark.type),
    );
    if (unregisteredMark !== undefined) {
      return {
        reason: `contains an unregistered custom mark type "${unregisteredMark.type}"`,
      };
    }
  }
  return null;
};

// core의 validateEditableContent와 동형 재귀(block/children/table cell) —
// exportHtml/exportMarkdown의 top-level 게이트(isKnownBlockType, DELTA-05/07)
// 뒤에서 호출되므로 blocks는 이미 CustomBlock이 없는 Block[]로 캐스트된
// 상태를 받는다.
export const blocksInlineContentViolation = (
  blocks: readonly Block[],
): { blockId: string; cellId?: string; reason: string } | null => {
  for (const block of blocks) {
    if (block.type === "divider" || block.type === "codeBlock") continue;
    if (
      block.type === "file" ||
      block.type === "image" ||
      block.type === "video" ||
      block.type === "audio"
    )
      continue;

    if (block.type === "table") {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          const violation = inlineContentViolation(cell.content);
          if (violation !== null) {
            return { blockId: block.id, cellId: cell.id, reason: violation.reason };
          }
        }
      }
      continue;
    }

    const violation = inlineContentViolation(block.content);
    if (violation !== null) {
      return { blockId: block.id, reason: violation.reason };
    }

    if (block.children !== undefined && block.children.length > 0) {
      const childViolation = blocksInlineContentViolation(block.children);
      if (childViolation !== null) return childViolation;
    }
  }
  return null;
};
