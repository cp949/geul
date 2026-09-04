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
//
// 단일 블록이 GFM 전용 타입이어도 그 인라인 content가 완전히 비어 있으면
// (예: "- " 하나만 — 뒤에 아무 내용도 없는 목록 마커) 감지하지 않는다.
// "- "/"> "/"# " 처럼 문장 중간에 흔히 타이핑되는 순수 텍스트가 우연히
// GFM 마커 문법과 겹치는 경우를 사용자가 의도한 구조로 오인하지 않기
// 위해서다(RD-004 core ClipboardPasteExtension 통합 중 실측 회귀 —
// list-input-rule-extension.test.ts "paste insertion은 exact shorthand를
// 변환하지 않는다"). divider·table처럼 InlineContent 필드 자체가 없는
// 타입은 이 예외 대상이 아니다 — 마커만으로 이미 완결된 의미를 가진다.
const isComplexMarkdownStructure = (document: Document): boolean => {
  if (document.blocks.length !== 1) {
    return document.blocks.length > 1;
  }
  const only = document.blocks[0];
  if (only === undefined || only.type === "paragraph") return false;
  if (!("content" in only)) return true;
  return only.content.length > 0;
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
