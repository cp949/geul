/**
 * 텍스트 블록 정렬이 `justify`를 받고, 표 셀·미디어의 허용값은 그대로인지 확인한다(Issue #424,
 * RD-003-DELTA-01). 판정은 model `isCanonicalTextBlockAlign`이 소유한다(G-CNV-001).
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import type { TextBlockProps } from "../src/index.js";
import {
  isCanonicalCellAlign,
  isCanonicalTextBlockAlign,
  parseDocument,
  TEXT_BLOCK_ALIGNMENTS,
} from "../src/index.js";

const NESTABLE_CASES = [
  { type: "paragraph", extra: {} },
  { type: "heading", extra: { level: 2 } },
  { type: "quote", extra: {} },
  { type: "bulletListItem", extra: {} },
  { type: "numberedListItem", extra: {} },
  { type: "checkListItem", extra: { checked: false } },
  { type: "toggleListItem", extra: {} },
  { type: "callout", extra: {} },
] as const;

const documentOf = (block: unknown) => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

describe("텍스트 블록 정렬 판정", () => {
  it.each(["left", "center", "right", "justify"])(
    "%s는 정규형이다",
    (value) => {
      expect(isCanonicalTextBlockAlign(value)).toBe(true);
    },
  );

  it.each([
    "start",
    "end",
    "JUSTIFY",
    "Justify",
    "",
    " justify",
    "justify ",
    "match-parent",
  ])("%j는 정규형이 아니다", (value) => {
    expect(isCanonicalTextBlockAlign(value)).toBe(false);
  });

  it("허용값 목록이 4값이다", () => {
    expect([...TEXT_BLOCK_ALIGNMENTS]).toEqual([
      "left",
      "center",
      "right",
      "justify",
    ]);
  });

  it("표 셀·미디어가 쓰는 isCanonicalCellAlign은 justify를 계속 거절한다", () => {
    expect(isCanonicalCellAlign("justify")).toBe(false);
  });

  it("TextBlockProps.textAlignment 타입이 4값 유니온이다", () => {
    expectTypeOf<TextBlockProps["textAlignment"]>().toEqualTypeOf<
      "left" | "center" | "right" | "justify" | undefined
    >();
  });
});

describe("parseDocument 텍스트 블록 textAlignment", () => {
  it.each(NESTABLE_CASES)(
    "$type 블록의 justify를 보존한다",
    ({ type, extra }) => {
      const input = documentOf({
        id: "b1",
        type,
        content: [],
        textAlignment: "justify",
        ...extra,
      });
      expect(parseDocument(input)).toEqual({ ok: true, value: input });
    },
  );

  it.each(["start", "end", "JUSTIFY", "", "justify "])(
    "정규형이 아닌 textAlignment %j를 textAlignment 경로로 거절한다",
    (textAlignment) => {
      const result = parseDocument(
        documentOf({ id: "p1", type: "paragraph", content: [], textAlignment }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(JSON.stringify(result.error)).toContain("textAlignment");
    },
  );

  it("중첩 children의 justify도 보존한다", () => {
    const input = documentOf({
      id: "p1",
      type: "paragraph",
      content: [],
      children: [
        { id: "p2", type: "paragraph", content: [], textAlignment: "justify" },
      ],
    });
    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });
});

describe("표 셀·미디어 정렬은 justify를 거절한다", () => {
  it("표 셀 align: justify", () => {
    const result = parseDocument(
      documentOf({
        id: "t1",
        type: "table",
        headerRows: 0,
        headerColumns: 0,
        columns: [{ id: "c1", width: 160 }],
        rows: [
          {
            id: "r1",
            cells: [
              {
                id: "x1",
                columnId: "c1",
                rowSpan: 1,
                columnSpan: 1,
                content: [],
                align: "justify",
              },
            ],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it.each(["image", "video", "iframe"])("%s textAlignment: justify", (type) => {
    expect(
      parseDocument(documentOf({ id: "m1", type, textAlignment: "justify" }))
        .ok,
    ).toBe(false);
  });
});
