/**
 * hasAmbiguousLeadingListParagraph가 "own content가 비고 첫 child가
 * paragraph"인 GFM 표현 불가능 경계를 목록 항목 종류·children 형태 전수에
 * 걸쳐 정확히 판정하는지 검증한다. loss-analysis.ts와 export-markdown.ts의
 * flattenBlocks·listNode가 모두 이 판정에 의존한다(아키텍처 리뷰 6차 후보 L5).
 */
import type { Block, InlineContent } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { hasAmbiguousLeadingListParagraph } from "../src/markdown/loss-analysis.js";

const withChildren = (
  type: "bulletListItem" | "numberedListItem",
  content: InlineContent,
  children?: Block[],
): Block =>
  ({
    id: `${type}-fixture`,
    type,
    content,
    ...(children === undefined ? {} : { children }),
  }) as Block;

const paragraphChild: Block = {
  id: "paragraph-child",
  type: "paragraph",
  content: [{ text: "본문" }],
};

const quoteChild: Block = {
  id: "quote-child",
  type: "quote",
  content: [{ text: "인용" }],
};

describe("hasAmbiguousLeadingListParagraph", () => {
  it.each(["bulletListItem", "numberedListItem"] as const)(
    "%s는 own content가 비고 첫 child가 paragraph면 true다",
    (type) => {
      const block = withChildren(type, [], [paragraphChild]);
      expect(hasAmbiguousLeadingListParagraph(block)).toBe(true);
    },
  );

  it("own content가 있으면 첫 child가 paragraph여도 false다", () => {
    const block = withChildren(
      "bulletListItem",
      [{ text: "own" }],
      [paragraphChild],
    );
    expect(hasAmbiguousLeadingListParagraph(block)).toBe(false);
  });

  it("첫 child가 paragraph가 아니면 false다", () => {
    const block = withChildren("bulletListItem", [], [quoteChild]);
    expect(hasAmbiguousLeadingListParagraph(block)).toBe(false);
  });

  it("children이 없으면 false다", () => {
    expect(
      hasAmbiguousLeadingListParagraph(withChildren("bulletListItem", [])),
    ).toBe(false);
  });

  it("children이 빈 배열이면 false다", () => {
    expect(
      hasAmbiguousLeadingListParagraph(withChildren("bulletListItem", [], [])),
    ).toBe(false);
  });

  it("목록 항목이 아니면 own content가 비어도 false다", () => {
    const paragraph: Block = {
      id: "paragraph-parent",
      type: "paragraph",
      content: [],
      children: [paragraphChild],
    };
    expect(hasAmbiguousLeadingListParagraph(paragraph)).toBe(false);
  });

  it("children 필드 자체가 없는 종류(table)는 false다", () => {
    const table: Block = {
      id: "table-fixture",
      type: "table",
      columns: [],
      rows: [],
      headerRows: 0,
      headerColumns: 0,
    };
    expect(hasAmbiguousLeadingListParagraph(table)).toBe(false);
  });
});
