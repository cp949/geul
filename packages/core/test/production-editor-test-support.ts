/**
 * production 편집기(`createProductionEditor`)로 문서를 로드해 실제 렌더 HTML을
 * 얻는 fixture. `production-list-item-marker-round-trip.test.ts`(RD-003
 * DELTA-02)가 처음 인라인으로 썼고, `clipboard-paste-list.test.ts`(RD-005
 * DELTA-01)가 두 번째 소비 파일로 등장해 여기로 승격했다(G-TST-002).
 */
import type { Block, Document } from "@cp949/geul-model";

import { createProductionEditor } from "../src/production-editor-assembly.js";

// 문서가 childless paragraph로 끝나지 않으면 ensureTrailingParagraphOnLoad가
// createId로 새 blockContainer id를 발급해 trailing paragraph를 붙인다
// (trailing-block-extension.ts, UI-010 불변식) — 이 fixture는 매번 그
// trailing paragraph를 직접 명시해 예측 불가능한 새 id 발급을 피한다.
export const PRODUCTION_TRAILING_ID = "trailing";

/** 최상위 블록 뒤에 명시적 trailing 빈 paragraph를 덧붙인 production 문서를 만든다. */
export const productionDocumentOf = (...blocks: Block[]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    ...blocks,
    { id: PRODUCTION_TRAILING_ID, type: "paragraph", content: [] },
  ],
});

/** production 편집기로 문서를 로드하고 실제 렌더 HTML을 얻는다. */
export function productionHtml(document: Document): string {
  const editor = createProductionEditor({
    document,
    createId: () => {
      throw new Error(
        "이 fixture는 trailing paragraph를 이미 포함해 새 id 발급이 없어야 한다",
      );
    },
    onUpdate: () => {},
    canApplyDocumentChange: () => true,
  });
  try {
    return editor.getHTML();
  } finally {
    editor.destroy();
  }
}
