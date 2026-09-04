import type { Document, IdFactory } from "@cp949/geul-model";

import type { ImportWarning } from "../markdown/import-markdown.js";
import { importMarkdown } from "../markdown/import-markdown.js";

export type MarkdownPasteDetection =
  | { detected: true; document: Document; warnings: ImportWarning[] }
  | { detected: false };

// 단일 plain paragraph보다 구조가 복잡한지로 감지 여부를 정한다 —
// 블록 2개 이상이거나, 블록 1개의 type이 paragraph가 아니면(heading·quote·
// 목록류·codeBlock·divider 등 GFM 전용 타입) 복잡한 것으로 본다. 인라인
// 서식(bold 등)만 있는 단일 paragraph는 복잡하다고 보지 않는다(RD-001.md
// "## 결정" — 파서 기반 판정, 정규식 사전 휴리스틱 배제).
const isComplexMarkdownStructure = (document: Document): boolean => {
  if (document.blocks.length !== 1) {
    return document.blocks.length > 1;
  }
  return document.blocks[0]?.type !== "paragraph";
};

/**
 * 클립보드 `text/plain` 소스가 GFM Markdown으로 해석해야 할 구조인지
 * 판정한다. `importMarkdown`을 정확히 1회 호출하고 그 결과의 구조
 * 복잡도로만 판정한다(별도 정규식 사전 휴리스틱 없음). 빈/공백 입력과
 * `importMarkdown` 파싱 실패는 예외 없이 `{ detected: false }`다.
 */
export const detectMarkdownPaste = (
  source: string,
  options?: { createId?: IdFactory },
): MarkdownPasteDetection => {
  if (source.trim().length === 0) {
    return { detected: false };
  }

  const result = importMarkdown(source, options);
  if (!result.ok) {
    return { detected: false };
  }

  const { document, warnings } = result.value;
  if (!isComplexMarkdownStructure(document)) {
    return { detected: false };
  }

  return { detected: true, document, warnings };
};
