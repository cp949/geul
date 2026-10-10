/**
 * `parseClipboardTable`이 표 옆 블록을 `importHtml` 블록 변환기로 읽는지 검증한다(Issue #356 RD-005).
 *
 * - 행렬 15행은 이전 클립보드 순회가 `importHtml`과 다르게 읽던 입력이다.
 * - 입력마다 2×2 데이터 표를 앞이나 뒤에 붙인다. 표가 없으면 파서가 표 붙여넣기를 하지 않는다.
 * - 기대값은 같은 HTML의 `importHtml` 결과다. children까지 비교하고 id는 뺀다.
 * - 표는 자리만 비교한다. 표 내용은 클립보드 표 처리기가 따로 읽는다(RD-003 seam).
 * - 비교만으로는 둘이 함께 틀려도 통과하므로 핵심 행은 명시 값으로도 고정한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml } from "../src/index.js";
import { clipboardBlocks, importedBlocks } from "./clipboard-table-support.js";

const TABLE =
  "<table><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>";

/**
 * 블록 트리에서 표를 `{ type: "table" }` 자리표시로 바꾼다. children은 재귀로 따라간다.
 * 두 경로의 표 모양(model TableBlock과 TabularData variant)이 달라 자리만 남긴다.
 */
const tableAsSlot = (blocks: readonly unknown[]): unknown[] =>
  blocks.map((block) => {
    const record = block as Record<string, unknown>;
    if (record.type === "table") return { type: "table" };
    if (!Array.isArray(record.children)) return record;
    return { ...record, children: tableAsSlot(record.children) };
  });

/** importHtml 결과에서 id를 빼고 표를 자리표시로 바꾼 트리다. */
const importedTree = (html: string): unknown[] =>
  tableAsSlot(clipboardLike(importedBlocks(html)));

/** parseClipboardTable 결과에서 id를 빼고 표를 자리표시로 바꾼 트리다. */
const clipboardTree = (html: string): unknown[] =>
  tableAsSlot(clipboardBlocks(html));

/** id를 재귀로 뺀다. importedBlocks는 id를 남기므로 비교 전에 맞춘다. */
const clipboardLike = (blocks: readonly unknown[]): unknown[] =>
  JSON.parse(
    JSON.stringify(blocks, (key, value: unknown) =>
      key === "id" ? undefined : value,
    ),
  ) as unknown[];

/** exportHtml로 자기 export HTML을 만든다. 실패하면 던진다. */
const ownExport = (blocks: Document["blocks"]): string => {
  const result = exportHtml({ formatVersion: 1, revision: 0, blocks });
  if (!result.ok) throw new Error("exportHtml이 실패했다");
  return result.value;
};

/** 자기 export의 callout·toggle·quote·paragraph children 구조다. */
const OWN_EXPORT_CHILDREN = ownExport([
  {
    id: "c1",
    type: "callout",
    content: [{ text: "call" }],
    children: [{ id: "c2", type: "paragraph", content: [{ text: "in" }] }],
  },
  {
    id: "t1",
    type: "toggleListItem",
    content: [{ text: "tog" }],
    children: [{ id: "t2", type: "paragraph", content: [{ text: "tin" }] }],
  },
  {
    id: "q1",
    type: "quote",
    content: [{ text: "q" }],
    children: [{ id: "q2", type: "paragraph", content: [{ text: "qin" }] }],
  },
  {
    id: "p1",
    type: "paragraph",
    content: [{ text: "p" }],
    children: [{ id: "p2", type: "paragraph", content: [{ text: "pin" }] }],
  },
]);

/** 자기 export의 codeBlock wrap이다. */
const OWN_EXPORT_CODE_WRAP = ownExport([
  {
    id: "k1",
    type: "codeBlock",
    content: [{ text: "a\n  b" }],
    language: "javascript",
    wrap: true,
  },
]);

/** RD-005.md "결과 차이 행렬" 15행이다. 12행은 figure 안 img와 단독 img 두 입력이다. */
const MATRIX: ReadonlyArray<readonly [string, string]> = [
  ["1 p data-geul-text-color", '<p data-geul-text-color="#FF0000">x</p>'],
  ["2 빈 p", "<p></p>"],
  ["3 연속 ol", "<ol><li>a</li></ol><ol><li>b</li></ol>"],
  ["4 li data-geul-checked", '<ul><li data-geul-checked="true">a</li></ul>'],
  ["5 blockquote", "<blockquote>q</blockquote>"],
  ["6 blockquote 안 p 두 개", "<blockquote><p>a</p><p>b</p></blockquote>"],
  ["7 blockquote 안 목록", "<blockquote><ul><li>x</li></ul></blockquote>"],
  ["8 최상위 pre language", '<pre data-language="javascript">a\n  b</pre>'],
  ["9 최상위 pre 안 무효 문자", "<pre>a&#1;b</pre>"],
  ["10 pre 무효 language 후보", '<pre data-language="a&#1;b">x</pre>'],
  [
    "11 figure 안 pre+figcaption",
    "<figure><pre>x</pre><figcaption>cap</figcaption></figure>",
  ],
  [
    "12 figure 안 img",
    '<figure><img src="https://example.com/a.png"><figcaption>cap</figcaption></figure>',
  ],
  ["12 단독 img", '<img src="https://example.com/a.png">'],
  ["13 최상위 hr", "<hr>"],
  ["14 자기 export children 구조", OWN_EXPORT_CHILDREN],
  ["15 자기 export codeBlock wrap", OWN_EXPORT_CODE_WRAP],
];

const CASES = MATRIX.flatMap(([name, html]) => [
  [`${name}, 표 뒤`, `${TABLE}${html}`] as const,
  [`${name}, 표 앞`, `${html}${TABLE}`] as const,
]);

describe("parseClipboardTable 표 옆 블록 importHtml 위임 행렬 (Issue #356 RD-005)", () => {
  it.each(CASES)("%s: importHtml과 같은 블록 트리로 읽는다", (_name, html) => {
    expect(clipboardTree(html)).toEqual(importedTree(html));
  });
});

describe("행렬 핵심 행의 명시 기대값 (Issue #356 RD-005)", () => {
  it("p의 data-geul-text-color를 텍스트 색으로 읽는다", () => {
    expect(
      clipboardTree(`<p data-geul-text-color="#FF0000">x</p>${TABLE}`),
    ).toEqual([
      { type: "paragraph", content: [{ text: "x" }], textColor: "#FF0000" },
      { type: "table" },
    ]);
  });

  it("빈 p를 빈 문단으로 남긴다", () => {
    expect(clipboardTree(`<p></p>${TABLE}`)).toEqual([
      { type: "paragraph", content: [] },
      { type: "table" },
    ]);
  });

  it("blockquote를 quote로 읽고 둘째 p를 children으로 둔다", () => {
    expect(
      clipboardTree(`<blockquote><p>a</p><p>b</p></blockquote>${TABLE}`),
    ).toEqual([
      {
        type: "quote",
        content: [{ text: "a" }],
        children: [{ type: "paragraph", content: [{ text: "b" }] }],
      },
      { type: "table" },
    ]);
  });

  it("최상위 pre를 개행을 지킨 javascript codeBlock으로 읽는다", () => {
    expect(
      clipboardTree(`<pre data-language="javascript">a\n  b</pre>${TABLE}`),
    ).toEqual([
      {
        type: "codeBlock",
        language: "javascript",
        content: [{ text: "a\n  b" }],
      },
      { type: "table" },
    ]);
  });

  it("뒤 ol의 첫 항목에 startNumber 1을 단다", () => {
    expect(
      clipboardTree(`<ol><li>a</li></ol><ol><li>b</li></ol>${TABLE}`),
    ).toEqual([
      { type: "numberedListItem", content: [{ text: "a" }] },
      { type: "numberedListItem", content: [{ text: "b" }], startNumber: 1 },
      { type: "table" },
    ]);
  });

  it("data-geul-checked가 있는 li를 checkListItem으로 읽는다", () => {
    expect(
      clipboardTree(`<ul><li data-geul-checked="true">a</li></ul>${TABLE}`),
    ).toEqual([
      { type: "checkListItem", content: [{ text: "a" }], checked: true },
      { type: "table" },
    ]);
  });

  it("최상위 hr를 divider로 읽는다", () => {
    expect(clipboardTree(`<p>a</p><hr>${TABLE}`)).toEqual([
      { type: "paragraph", content: [{ text: "a" }] },
      { type: "divider" },
      { type: "table" },
    ]);
  });

  it("단독 img를 image로 읽는다", () => {
    expect(
      clipboardTree(`<img src="https://example.com/a.png">${TABLE}`),
    ).toEqual([
      { type: "image", url: "https://example.com/a.png" },
      { type: "table" },
    ]);
  });
});
