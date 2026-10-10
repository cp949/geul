/**
 * `parseClipboardTable`이 `blockquote`가 감싼 목록을 잃지 않고 읽는지 검증한다(Issue #350).
 *
 * - Issue #356 RD-005부터 `blockquote`는 `importHtml`처럼 `quote` 블록이다. 목록은 그 children이다.
 *   이전에는 `blockquote`를 문단 경계로만 써서 래퍼 없는 목록과 같은 결과를 냈다.
 * - 래퍼 `blockquote`는 마크가 없어 항목 글자에 영향을 줄 수 없다.
 * - 입력마다 표를 붙인다. 표가 없으면 파서가 표 붙여넣기를 하지 않는다.
 * - 기대값은 같은 HTML의 `importHtml` 결과다. 표는 자리만 비교한다.
 * - 항목 글자 총합은 래퍼 없는 입력과 같아야 한다. 글자를 잃지 않는지 본다.
 * - 비교만으로는 둘이 함께 틀려도 통과하므로, 대표 입력은 명시 값으로도 고정한다.
 * - 마크가 있는 조상(`b`)은 계속 항목 글자에 씌워지는지도 고정한다. `blockquote` 안에서 `b`·`a`가
 *   목록을 감싸면 지금은 목록 구조를 잃는다. 그 두 건은 `it.fails`다(importHtml 변환기 후속, #356).
 */
import { describe, expect, it } from "vitest";

import type { ClipboardContentBlock } from "../src/clipboard/clipboard-content.js";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { importedBlocks, withoutIds } from "./clipboard-table-support.js";

const TABLE = "<table><tbody><tr><td>1</td></tr></tbody></table>";

/** 입력 HTML을 파싱해 성공한 결과의 블록 배열을 돌려준다. */
const parse = (html: string): ClipboardContentBlock[] => {
  const result = parseClipboardTable({ html });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return [...result.value];
};

/** 블록 트리에서 id를 빼고 표를 `{ type: "table" }` 자리로 바꾼다. children도 따라간다. */
const treeOf = (blocks: readonly unknown[]): unknown[] =>
  (withoutIds(blocks) as unknown[]).map((block) => {
    const record = block as Record<string, unknown>;
    if (record.type === "table") return { type: "table" };
    return Array.isArray(record.children)
      ? { ...record, children: treeOf(record.children) }
      : record;
  });

/** 표가 아닌 블록의 글자를 문서 순서대로 이어 붙인다. 자식 블록도 포함한다. */
const textOfBlocks = (blocks: readonly unknown[]): string =>
  blocks
    .map((block) => {
      const record = block as Record<string, unknown>;
      if (record.type === "table") return "";
      const content = Array.isArray(record.content) ? record.content : [];
      const own = content
        .map((item) => (item as { text?: string }).text ?? "")
        .join("");
      const children = Array.isArray(record.children) ? record.children : [];
      return own + textOfBlocks(children);
    })
    .join("");

/** `blockquote` 래퍼를 씌우는 함수와 씌우지 않는 함수다. */
type Wrap = (inner: string) => string;
const withQuote: Wrap = (inner) => `<blockquote>${inner}</blockquote>`;
const withoutQuote: Wrap = (inner) => inner;

const UL_A = "<ul><li>a</li></ul>";

/** 래퍼를 어디에 둘지만 다른 입력 변형이다. text는 표가 아닌 블록의 글자 총합이다. */
const VARIANTS: ReadonlyArray<{
  title: string;
  text: string;
  build: (w: Wrap) => string;
}> = [
  { title: "항목 하나", text: "a", build: (w) => w(UL_A) },
  {
    title: "여러 항목",
    text: "abc",
    build: (w) => w("<ul><li>a</li><li>b</li><li>c</li></ul>"),
  },
  {
    title: "순서 목록",
    text: "ab",
    build: (w) => w("<ol><li>a</li><li>b</li></ol>"),
  },
  {
    title: "중첩 목록",
    text: "abc",
    build: (w) => w("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>"),
  },
  {
    title: "span으로 감싼 목록",
    text: "a",
    build: (w) => w(`<span>${UL_A}</span>`),
  },
  {
    title: "span 안에 blockquote가 목록을 감싼 경우",
    text: "a",
    build: (w) => `<span>${w(UL_A)}</span>`,
  },
  {
    title: "blockquote 안 blockquote",
    text: "a",
    build: (w) => w(w(UL_A)),
  },
  {
    title: "blockquote 안 div",
    text: "a",
    build: (w) => w(`<div>${UL_A}</div>`),
  },
  {
    title: "div 안 blockquote",
    text: "a",
    build: (w) => `<div>${w(UL_A)}</div>`,
  },
  {
    title: "li 안 blockquote 속 목록",
    text: "a",
    build: (w) => `<li>${w(UL_A)}</li>`,
  },
  {
    title: "목록 항목 안 blockquote 속 목록",
    text: "ab",
    build: (w) => `<ul><li>a${w("<ul><li>b</li></ul>")}</li></ul>`,
  },
  {
    title: "blockquote 안 목록 앞뒤 글자",
    text: "xay",
    build: (w) => w(`x${UL_A}y`),
  },
  {
    title: "blockquote 안 문단과 목록",
    text: "pa",
    build: (w) => w(`<p>p</p>${UL_A}`),
  },
  {
    title: "blockquote 두 개가 이웃한 목록",
    text: "ab",
    build: (w) => `${w(UL_A)}${w("<ul><li>b</li></ul>")}`,
  },
];

/**
 * 표가 입력의 어디에 놓이는지다. count는 목록 입력이 들어간 횟수다.
 * 표 앞뒤는 문단 q도 싣는다. 글자 총합의 기대값은 text를 count번 이은 뒤 q를 앞에 붙인 값이다.
 */
const PLACEMENTS: ReadonlyArray<
  [string, (list: string) => string, number, string]
> = [
  ["표 앞", (list) => `${TABLE}${list}`, 1, ""],
  ["표 뒤", (list) => `${list}${TABLE}`, 1, ""],
  ["표 앞뒤", (list) => `<p>q</p>${list}${TABLE}${list}`, 2, "q"],
];

describe("parseClipboardTable blockquote가 감싼 목록 (Issue #350)", () => {
  describe.each(PLACEMENTS)("%s", (_placement, place, count, lead) => {
    it.each(VARIANTS)(
      "$title: importHtml과 같은 블록 트리로 읽는다",
      ({ build }) => {
        const html = place(build(withQuote));
        expect(treeOf(parse(html))).toEqual(treeOf(importedBlocks(html)));
      },
    );

    it.each(VARIANTS)(
      "$title: 항목 글자 총합이 래퍼 없는 입력과 같다",
      ({ build, text }) => {
        const wrapped = textOfBlocks(parse(place(build(withQuote))));
        const bare = textOfBlocks(parse(place(build(withoutQuote))));
        expect(bare).toBe(lead + text.repeat(count));
        expect(wrapped).toBe(bare);
      },
    );
  });

  describe("래퍼 없는 입력의 모양 고정", () => {
    /** 결과 블록 중 표 블록만 모은다. */
    const tableBlock = (blocks: ClipboardContentBlock[]) =>
      blocks.filter((block) => block.type === "table");

    // quote는 content가 비고 목록 항목이 그 children이다(Issue #356 RD-005).
    it("항목 하나는 quote children 항목의 content에 글자가 들어가고 자식 문단이 없다", () => {
      const blocks = parse(`<blockquote>${UL_A}</blockquote>${TABLE}`);
      expect(
        withoutIds(blocks.filter((block) => block.type !== "table")),
      ).toEqual([
        {
          type: "quote",
          content: [],
          children: [{ type: "bulletListItem", content: [{ text: "a" }] }],
        },
      ]);
      expect(tableBlock(blocks)).toHaveLength(1);
    });

    it("여러 항목은 quote children 항목마다 content에 글자가 든다", () => {
      const blocks = parse(
        `<blockquote><ul><li>a</li><li>b</li></ul></blockquote>${TABLE}`,
      );
      expect(
        withoutIds(blocks.filter((block) => block.type !== "table")),
      ).toEqual([
        {
          type: "quote",
          content: [],
          children: [
            { type: "bulletListItem", content: [{ text: "a" }] },
            { type: "bulletListItem", content: [{ text: "b" }] },
          ],
        },
      ]);
    });

    it("순서 목록은 quote children의 numberedListItem이다", () => {
      const blocks = parse(
        `${TABLE}<blockquote><ol><li>a</li><li>b</li></ol></blockquote>`,
      );
      expect(
        withoutIds(blocks.filter((block) => block.type !== "table")),
      ).toEqual([
        {
          type: "quote",
          content: [],
          children: [
            { type: "numberedListItem", content: [{ text: "a" }] },
            { type: "numberedListItem", content: [{ text: "b" }] },
          ],
        },
      ]);
    });

    it("중첩 목록은 자식 항목 content에 글자가 든다", () => {
      const blocks = parse(
        `<blockquote><ul><li>a<ul><li>b</li></ul></li></ul></blockquote>${TABLE}`,
      );
      expect(
        withoutIds(blocks.filter((block) => block.type !== "table")),
      ).toEqual([
        {
          type: "quote",
          content: [],
          children: [
            {
              type: "bulletListItem",
              content: [{ text: "a" }],
              children: [{ type: "bulletListItem", content: [{ text: "b" }] }],
            },
          ],
        },
      ]);
    });

    it("blockquote 안 blockquote는 중첩 quote이고 안쪽 항목 content에 글자가 든다", () => {
      const blocks = parse(
        `<blockquote><blockquote>${UL_A}</blockquote></blockquote>${TABLE}`,
      );
      expect(
        withoutIds(blocks.filter((block) => block.type !== "table")),
      ).toEqual([
        {
          type: "quote",
          content: [],
          children: [
            {
              type: "quote",
              content: [],
              children: [{ type: "bulletListItem", content: [{ text: "a" }] }],
            },
          ],
        },
      ]);
    });
  });

  describe("마크가 있는 조상은 계속 항목 글자에 씌워진다", () => {
    // importHtml 변환기가 div·span·b·a 안의 ul/ol을 문단으로 읽어 클립보드 표 경로도 목록 구조를 잃는다(후속, #356 댓글 모음). 변환기가 고쳐지면 it.fails 실패로 알려진다.
    it.fails("blockquote 안 b가 목록을 감싸면 항목 글자가 굵다", () => {
      const blocks = parse(`<blockquote><b>${UL_A}</b></blockquote>${TABLE}`);
      expect(
        withoutIds(blocks.filter((block) => block.type !== "table")),
      ).toEqual([
        {
          type: "bulletListItem",
          content: [{ text: "a", marks: [{ type: "bold" }] }],
        },
      ]);
    });

    it("b 안 blockquote가 목록을 감싸면 quote children 항목 글자가 굵다", () => {
      const blocks = parse(`<b><blockquote>${UL_A}</blockquote></b>${TABLE}`);
      expect(
        withoutIds(blocks.filter((block) => block.type !== "table")),
      ).toEqual([
        {
          type: "quote",
          content: [],
          children: [
            {
              type: "bulletListItem",
              content: [{ text: "a", marks: [{ type: "bold" }] }],
            },
          ],
        },
      ]);
    });

    // importHtml 변환기가 div·span·b·a 안의 ul/ol을 문단으로 읽어 클립보드 표 경로도 목록 구조를 잃는다(후속, #356 댓글 모음). 변환기가 고쳐지면 it.fails 실패로 알려진다.
    it.fails(
      "blockquote 안 링크가 목록을 감싸면 항목 글자에 링크가 남는다",
      () => {
        const blocks = parse(
          `<blockquote><a href="https://x.test/">${UL_A}</a></blockquote>${TABLE}`,
        );
        expect(
          withoutIds(blocks.filter((block) => block.type !== "table")),
        ).toEqual([
          {
            type: "bulletListItem",
            content: [
              {
                text: "a",
                marks: [{ type: "link", href: "https://x.test/" }],
              },
            ],
          },
        ]);
      },
    );
  });
});
