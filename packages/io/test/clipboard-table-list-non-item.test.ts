/**
 * `parseClipboardTable`이 ul/ol의 `li`가 아닌 직속 자식을 잃지 않는지
 * 검증한다(Issue #326). 비-li 자식은 연속 run으로 모여 블록이 되고,
 * 문서 순서대로 목록 항목 사이에 형제로 놓인다. `ol[start]`가 첫 `li`에만
 * 붙는 규칙, 블록을 만들지 않는 run, 정상 중첩 목록(대조군)도 함께 다룬다.
 * 빈 `p`는 Issue #356 Q8부터 빈 문단으로 남는다.
 * 목록 항목 자체의 변환은 `clipboard-mixed-content-block-boundary.test.ts`가
 * 다룬다.
 */
import { describe, expect, it } from "vitest";
import type { ClipboardContentBlock } from "../src/clipboard/clipboard-content.js";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { withoutIds } from "./clipboard-table-support.js";

const TABLE =
  "<table><tbody><tr><td>1</td><td>2</td></tr>" +
  "<tr><td>3</td><td>4</td></tr></tbody></table>";

// TABLE 리터럴이 파싱된 결과(2x2, 셀 "1"~"4")다. 목록 뒤에 표가 따라오는
// 입력의 마지막 블록을 한 번만 정의해 각 테스트가 재사용한다.
const TABLE_BLOCK: ClipboardContentBlock = {
  type: "table",
  data: {
    columnCount: 2,
    rows: [
      {
        cells: [
          {
            columnIndex: 0,
            rowSpan: 1,
            columnSpan: 1,
            content: [{ text: "1" }],
          },
          {
            columnIndex: 1,
            rowSpan: 1,
            columnSpan: 1,
            content: [{ text: "2" }],
          },
        ],
      },
      {
        cells: [
          {
            columnIndex: 0,
            rowSpan: 1,
            columnSpan: 1,
            content: [{ text: "3" }],
          },
          {
            columnIndex: 1,
            rowSpan: 1,
            columnSpan: 1,
            content: [{ text: "4" }],
          },
        ],
      },
    ],
  },
};

/**
 * 목록 HTML 뒤에 2x2 표를 붙여 `parseClipboardTable`에 넣고 성공한
 * 블록 시퀀스에서 임시 id를 뺀 값을 돌려준다. 표가 있어야 클립보드 표
 * 경로가 시퀀스를 만들므로 모든 테스트가 같은 방식으로 표를 덧붙인다.
 */
const blocksBeforeTable = (listHtml: string): unknown => {
  const result = parseClipboardTable({ html: listHtml + TABLE });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  return withoutIds(result.value);
};

describe("parseClipboardTable 목록의 li가 아닌 자식", () => {
  it("ul 안에 직접 놓인 ul의 항목이 부모 항목 뒤 형제로 남는다", () => {
    expect(blocksBeforeTable("<ul><li>a</li><ul><li>b</li></ul></ul>")).toEqual(
      [
        { type: "bulletListItem", content: [{ text: "a" }] },
        { type: "bulletListItem", content: [{ text: "b" }] },
        TABLE_BLOCK,
      ],
    );
  });

  it("li 없이 텍스트만 든 ul을 div가 감싸도 텍스트가 문단으로 남는다", () => {
    expect(blocksBeforeTable("<div><ul>q</ul></div>")).toEqual([
      { type: "paragraph", content: [{ text: "q" }] },
      TABLE_BLOCK,
    ]);
  });

  it("li 사이에 끼인 비-li 자식은 문서 순서대로 항목 사이에 놓인다", () => {
    expect(
      blocksBeforeTable(
        "<ul><li>a</li>x<li>b</li><ul><li>c</li></ul><li>d</li></ul>",
      ),
    ).toEqual([
      { type: "bulletListItem", content: [{ text: "a" }] },
      { type: "paragraph", content: [{ text: "x" }] },
      { type: "bulletListItem", content: [{ text: "b" }] },
      { type: "bulletListItem", content: [{ text: "c" }] },
      { type: "bulletListItem", content: [{ text: "d" }] },
      TABLE_BLOCK,
    ]);
  });

  it("li 사이의 연속한 비-li 자식은 한 run으로 묶여 한 문단이 된다", () => {
    expect(
      blocksBeforeTable("<ul><li>a</li>x<span>y</span><li>b</li></ul>"),
    ).toEqual([
      { type: "bulletListItem", content: [{ text: "a" }] },
      { type: "paragraph", content: [{ text: "xy" }] },
      { type: "bulletListItem", content: [{ text: "b" }] },
      TABLE_BLOCK,
    ]);
  });

  it("마지막 li 뒤의 비-li 자식도 잃지 않는다", () => {
    expect(blocksBeforeTable("<ul><li>a</li>z</ul>")).toEqual([
      { type: "bulletListItem", content: [{ text: "a" }] },
      { type: "paragraph", content: [{ text: "z" }] },
      TABLE_BLOCK,
    ]);
  });

  it("비-li 자식이 앞서도 ol[start]는 첫 li에만 붙는다", () => {
    expect(
      blocksBeforeTable(
        '<ol start="3"><ul><li>n</li></ul><li>a</li><li>b</li></ol>',
      ),
    ).toEqual([
      { type: "bulletListItem", content: [{ text: "n" }] },
      { type: "numberedListItem", content: [{ text: "a" }], startNumber: 3 },
      { type: "numberedListItem", content: [{ text: "b" }] },
      TABLE_BLOCK,
    ]);
  });

  it("li가 하나도 없고 비-li 자식만 든 목록도 텍스트를 잃지 않는다", () => {
    expect(blocksBeforeTable("<ul>q<ul><li>r</li></ul>s</ul>")).toEqual([
      { type: "paragraph", content: [{ text: "q" }] },
      { type: "bulletListItem", content: [{ text: "r" }] },
      { type: "paragraph", content: [{ text: "s" }] },
      TABLE_BLOCK,
    ]);
    expect(blocksBeforeTable("<ol>q</ol>")).toEqual([
      { type: "paragraph", content: [{ text: "q" }] },
      TABLE_BLOCK,
    ]);
  });

  // 빈 p는 Issue #356 Q8부터 importHtml처럼 빈 문단으로 남는다. 이전에는
  // 블록을 만들지 않았다. 텍스트 없는 span과 공백뿐인 run은 여전히 블록이 없다.
  it("텍스트가 없는 span과 공백뿐인 run은 블록을 만들지 않고 빈 p는 빈 문단이다", () => {
    expect(
      blocksBeforeTable("<ul><li>a</li><span></span><p></p><li>b</li></ul>"),
    ).toEqual([
      { type: "bulletListItem", content: [{ text: "a" }] },
      { type: "paragraph", content: [] },
      { type: "bulletListItem", content: [{ text: "b" }] },
      TABLE_BLOCK,
    ]);
    expect(
      blocksBeforeTable("<ul><li>a</li><span></span><li>b</li></ul>"),
    ).toEqual([
      { type: "bulletListItem", content: [{ text: "a" }] },
      { type: "bulletListItem", content: [{ text: "b" }] },
      TABLE_BLOCK,
    ]);
    expect(blocksBeforeTable("<ul><li>a</li>  \n <li>b</li></ul>")).toEqual([
      { type: "bulletListItem", content: [{ text: "a" }] },
      { type: "bulletListItem", content: [{ text: "b" }] },
      TABLE_BLOCK,
    ]);
  });

  it("li 안에 중첩된 목록은 이전과 같이 부모 항목의 children이 된다", () => {
    expect(
      blocksBeforeTable(
        "<ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul>",
      ),
    ).toEqual([
      {
        type: "bulletListItem",
        content: [{ text: "one" }],
        children: [{ type: "bulletListItem", content: [{ text: "nested" }] }],
      },
      { type: "bulletListItem", content: [{ text: "two" }] },
      TABLE_BLOCK,
    ]);
  });
});
