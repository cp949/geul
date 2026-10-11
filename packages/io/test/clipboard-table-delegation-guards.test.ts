/**
 * `parseClipboardTable`이 표 옆 블록을 `importHtml` 변환기에 맡길 때 표 읽기와 계약이 그대로인지 검증한다(Issue #356 RD-005).
 *
 * - 표가 어느 조상 안에 있어도 `TabularData` variant로 나온다. 자리는 같은 HTML의 `importHtml`과 같다.
 * - 표 거절(`CLIPBOARD_TABLE_INVALID`)은 표 옆 블록이 있어도 그대로 거절한다.
 * - 같은 입력은 id까지 같은 결과를 낸다. 깊은 중첩도 예외 없이 읽는다.
 * - `title` strip과 `table[role]`은 클립보드 sanitize 스키마가 계속 지킨다.
 * - `iframeEmbed` 입력이 있으면 표 옆 iframe 블록 url 판정에 쓴다. 없으면 url이 붙지 않는다(Issue #359).
 */
import { type IframeEmbedConfig, MAX_NESTING_DEPTH } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import type { ClipboardContentBlock } from "../src/clipboard/clipboard-content.js";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { importHtml } from "../src/index.js";
import {
  clipboardBlocks,
  importedBlocks,
  withoutIds,
} from "./clipboard-table-support.js";

const TABLE =
  "<table><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>";

/** 성공 결과의 시퀀스를 꺼낸다. 실패하면 던진다. */
const parse = (html: string): readonly ClipboardContentBlock[] => {
  const result = parseClipboardTable({ html });
  if (!result.ok) throw new Error("parseClipboardTable이 실패했다");
  return result.value;
};

/** 블록 트리의 종류와 children만 남긴다. 표는 `table` 문자열이다. */
const skeleton = (blocks: readonly unknown[]): unknown[] =>
  blocks.map((block) => {
    const record = block as Record<string, unknown>;
    if (record.type === "table") return "table";
    return Array.isArray(record.children)
      ? { type: record.type, children: skeleton(record.children) }
      : { type: record.type };
  });

/** 표 variant를 재귀로 모두 모은다. */
const tablesOf = (
  blocks: readonly ClipboardContentBlock[],
): Extract<ClipboardContentBlock, { type: "table" }>[] =>
  blocks.flatMap((block) =>
    block.type === "table"
      ? [block]
      : tablesOf("children" in block ? (block.children ?? []) : []),
  );

/** 블록 트리의 최대 깊이다. 최상위가 1이다. */
const depthOf = (blocks: readonly ClipboardContentBlock[]): number =>
  blocks.reduce(
    (max, block) =>
      Math.max(
        max,
        1 +
          (block.type !== "table" && "children" in block
            ? depthOf(block.children ?? [])
            : 0),
      ),
    0,
  );

describe("표 노드 판정이 조상 위치와 무관하다 (Issue #356 RD-005)", () => {
  it.each([
    ["최상위", `<p>a</p>${TABLE}`],
    ["li 안", `<ul><li>a${TABLE}</li></ul>`],
    ["blockquote 안", `<blockquote><p>q</p>${TABLE}</blockquote>`],
    [
      "callout 안",
      `<div data-geul-callout="true"><p>c</p><div data-geul-children="1">${TABLE}</div></div>`,
    ],
    [
      "toggle(details) 안",
      `<details data-geul-toggleable="true" open><summary>t</summary><div data-geul-children="1">${TABLE}</div></details>`,
    ],
    [
      "children wrapper 안",
      `<div data-geul-block-id="p1"><p data-geul-block-id="p1">p</p><div data-geul-children="1">${TABLE}</div></div>`,
    ],
    ["figure 안", `<figure>${TABLE}<figcaption>cap</figcaption></figure>`],
    ["span 안", `<p>a</p><span>${TABLE}</span>`],
    ["b 안", `<p>a</p><b>${TABLE}</b>`],
    ["색 span 안", `<p>a</p><span style="color:#ff0000">${TABLE}</span>`],
    [
      "blockquote 안 li 안",
      `<blockquote><ul><li>x${TABLE}</li></ul></blockquote>`,
    ],
  ])("%s 표가 TabularData로 importHtml과 같은 자리에 나온다", (_name, html) => {
    const blocks = parse(html);

    const tables = tablesOf(blocks);
    expect(tables).toHaveLength(1);
    expect(tables[0]?.data.columnCount).toBe(2);
    expect(tables[0]?.data.rows).toHaveLength(2);
    expect(skeleton(blocks)).toEqual(skeleton(importedBlocks(html)));
  });

  it("blockquote 안 표는 quote의 children 자리에 나온다", () => {
    expect(
      skeleton(parse(`<blockquote><p>q</p>${TABLE}</blockquote>`)),
    ).toEqual([{ type: "quote", children: ["table"] }]);
  });

  it("toggle 안 표는 toggleListItem의 children 자리에 나온다", () => {
    expect(
      skeleton(
        parse(
          `<details data-geul-toggleable="true" open><summary>t</summary><div data-geul-children="1">${TABLE}</div></details>`,
        ),
      ),
    ).toEqual([{ type: "toggleListItem", children: ["table"] }]);
  });
});

// 인용 안 인라인 래퍼(span·b·a)가 표를 품어도 표는 TabularData다. 블록을 품은
// 인라인 요소는 splitQuoteChildren이 children 자리로 넘긴다(Issue #356 RD-005
// DELTA-04). 그 전에는 표가 quote content 글자로 접혔다.
describe("인용 안 인라인 래퍼가 품은 표 (Issue #356 RD-005)", () => {
  it.each([
    ["span", `<blockquote><span>q${TABLE}</span></blockquote>`],
    ["b", `<blockquote><b>q${TABLE}</b></blockquote>`],
    [
      "a",
      `<blockquote>text <a href="https://e.com">l${TABLE}</a></blockquote>`,
    ],
  ])("%s 안 표가 TabularData로 나온다", (_name, html) => {
    const tables = tablesOf(parse(html));
    expect(tables).toHaveLength(1);
    expect(tables[0]?.data.columnCount).toBe(2);
  });
});

describe("표 거절 전달 (Issue #356 RD-005)", () => {
  it.each([
    [
      "열 span 위반 표 + blockquote",
      '<blockquote>q</blockquote><table><tbody><tr><td colspan="500">a</td></tr></tbody></table>',
    ],
    [
      "격자 밖 rowspan 표 + 최상위 pre",
      '<pre>x</pre><table><tbody><tr><td rowspan="5">a</td><td>b</td></tr><tr><td>c</td></tr></tbody></table>',
    ],
    [
      "quote 안 열 span 위반 표",
      '<blockquote><p>q</p><table><tbody><tr><td colspan="500">a</td></tr></tbody></table></blockquote>',
    ],
  ])("%s는 CLIPBOARD_TABLE_INVALID로 거절한다", (_name, html) => {
    expect(parseClipboardTable({ html })).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("크기 상한을 넘는 표는 표 옆 hr가 있어도 거절한다", () => {
    const cells = Array.from({ length: 101 }, () => "<td>x</td>").join("");
    const rows = Array.from({ length: 101 }, () => `<tr>${cells}</tr>`).join(
      "",
    );
    expect(
      parseClipboardTable({
        html: `<hr><table><tbody>${rows}</tbody></table>`,
        text: "a\tb",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("거절 표 뒤의 정상 표가 있어도 첫 거절을 낸다", () => {
    expect(
      parseClipboardTable({
        html: `<table><tbody><tr><td colspan="500">a</td></tr></tbody></table><p>b</p>${TABLE}`,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });
});

describe("id와 깊이 (Issue #356 RD-005)", () => {
  const html =
    `<blockquote><p>q</p><ul><li>a</li></ul></blockquote><hr>` +
    `<pre>x</pre>${TABLE}<details data-geul-toggleable="true"><summary>t</summary></details>`;

  it("같은 입력을 두 번 파싱하면 id까지 같다", () => {
    const first = parse(html);
    parse(`<p>다른 입력</p>${TABLE}`);
    expect(parse(html)).toEqual(first);
  });

  it("id가 문서 순서로 clipboard-1부터 이어진다", () => {
    const ids: string[] = [];
    const collect = (blocks: readonly ClipboardContentBlock[]): void => {
      for (const block of blocks) {
        if (block.type === "table") continue;
        ids.push(block.id);
        if ("children" in block) collect(block.children ?? []);
      }
    };
    collect(parse(html));
    expect(ids).toEqual(ids.map((_, index) => `clipboard-${index + 1}`));
  });

  it("html의 data-geul-block-id와 겹치지 않게 임시 id를 고른다", () => {
    const blocks = parse(
      `<p data-geul-block-id="clipboard-1">a</p><p>b</p>${TABLE}`,
    );
    const ids = blocks.flatMap((block) =>
      block.type === "table" ? [] : [block.id],
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("html이 같은 data-geul-block-id를 두 번 써도 호출 안 id가 유일하다", () => {
    const blocks = parse(
      `<p data-geul-block-id="d">a</p><p data-geul-block-id="d">b</p>${TABLE}`,
    );
    const ids = blocks.flatMap((block) =>
      block.type === "table" ? [] : [block.id],
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it(`깊게 중첩된 quote·목록 + 표를 예외 없이 깊이 ${MAX_NESTING_DEPTH} 안으로 읽는다`, () => {
    const count = MAX_NESTING_DEPTH + 10;
    const quotes = `${"<blockquote><p>q</p>".repeat(count)}${"</blockquote>".repeat(count)}`;
    const lists = `${"<ul><li>a".repeat(count)}${"</li></ul>".repeat(count)}`;
    const blocks = parse(`${quotes}${lists}${TABLE}`);

    expect(tablesOf(blocks)).toHaveLength(1);
    expect(depthOf(blocks)).toBeLessThanOrEqual(MAX_NESTING_DEPTH);
  });
});

describe("변환기가 표 자리로 읽지 않는 데이터 표 (Issue #356 RD-005)", () => {
  it("pre 안 표는 importHtml처럼 코드 글자가 되고 다른 표만 표다", () => {
    const html = `<pre>x${TABLE}</pre><p>a</p>${TABLE}`;
    const blocks = parse(html);

    expect(tablesOf(blocks)).toHaveLength(1);
    expect(skeleton(blocks)).toEqual(skeleton(importedBlocks(html)));
  });

  it("표 자리가 하나도 없으면 NOT_TABULAR라 TSV 짝으로 폴백한다", () => {
    const result = parseClipboardTable({
      html: `<pre>x${TABLE}</pre>`,
      text: "a\tb",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.type).toBe("table");
  });

  it("표 자리가 없고 TSV 짝도 없으면 NOT_TABULAR다", () => {
    expect(parseClipboardTable({ html: `<pre>x${TABLE}</pre>` })).toEqual({
      ok: false,
      error: { code: "NOT_TABULAR" },
    });
  });
});

describe("클립보드 sanitize 스키마 (Issue #356 RD-005)", () => {
  it("title은 글자째 지운다. 표만 든 스프레드시트 html이 표 하나다", () => {
    expect(
      clipboardBlocks(
        `<html><head><title>Sheet1</title></head><body>${TABLE}</body></html>`,
      ),
    ).toEqual([{ type: "table", data: expect.any(Object) }]);
  });

  it("table[role=presentation]을 레이아웃 표로 보고 안쪽 데이터 표를 고른다", () => {
    const blocks = parse(
      `<table role="presentation"><tr><td>${TABLE}</td></tr></table>`,
    );
    expect(tablesOf(blocks)).toHaveLength(1);
    expect(tablesOf(blocks)[0]?.data.columnCount).toBe(2);
  });

  it("안쪽 표가 없는 table[role=presentation]도 데이터 표가 아니다", () => {
    expect(
      clipboardBlocks(
        `<table role="presentation"><tr><td>sig</td></tr></table>${TABLE}`,
      ),
    ).toEqual([
      { type: "paragraph", content: [{ text: "sig" }] },
      { type: "table", data: expect.objectContaining({ columnCount: 2 }) },
    ]);
  });

  it("role이 없는 바깥 표는 안쪽 데이터 표만 표로 고른다", () => {
    const blocks = parse(
      `<table><tr><td>side</td><td>${TABLE}</td></tr></table>`,
    );
    expect(tablesOf(blocks)).toHaveLength(1);
  });
});

// 소스 공백 접기 조건은 importHtml과 같다(Issue #320, #356 Q9):
// 절단되지 않았고 자기 export 표식(data-geul-block-id 등)이 없을 때만 접는다.
describe("소스 공백 접기 조건 (Issue #356 RD-005)", () => {
  /** 첫 블록의 content다. */
  const firstContent = (html: string): unknown =>
    (parse(html)[0] as { content?: unknown }).content;
  const DEEP = `${"<div>".repeat(300)}x${"</div>".repeat(300)}`;

  it("외부 html은 소스 공백을 접는다", () => {
    expect(firstContent(`<p>a\n   b</p>${TABLE}`)).toEqual([{ text: "a b" }]);
  });

  it("자기 export 표식이 있으면 접지 않는다", () => {
    expect(
      firstContent(`<p data-geul-block-id="q">a\n   b</p>${TABLE}`),
    ).toEqual([{ text: "a\n   b" }]);
  });

  it("깊이 캡으로 절단된 입력은 접지 않는다", () => {
    expect(firstContent(`<p>a\n   b</p>${DEEP}${TABLE}`)).toEqual([
      { text: "a\n   b" },
    ]);
  });
});

// 셀 안 details·figure는 import sanitize 스키마로 남아 그 경계에 줄바꿈이 생긴다
// (이전 클립보드 스키마는 태그를 벗겨 "sd"·"cx"였다). importHtml 표 셀과 같은
// 값이다(#325 셀 블록 경계 줄바꿈 정책).
describe("셀 안 details·figure 경계 (Issue #356 RD-005)", () => {
  it("summary 뒤와 figcaption 뒤에 줄바꿈이 들어가고 importHtml 셀과 같다", () => {
    const html =
      "<table><tr><td><details><summary>s</summary>d</details></td>" +
      "<td><figure><figcaption>c</figcaption></figure>x</td></tr></table>";
    const cells = tablesOf(parse(html))[0]?.data.rows[0]?.cells.map(
      (cell) => cell.content,
    );
    const imported = (
      importedBlocks(html)[0] as {
        rows: Array<{ cells: Array<{ content: unknown }> }>;
      }
    ).rows[0]?.cells.map((cell) => cell.content);

    expect(cells).toEqual([[{ text: "s\nd" }], [{ text: "c\nx" }]]);
    expect(cells).toEqual(imported);
  });
});

// 표 경로는 입력의 iframeEmbed를 변환기에 넘긴다(Issue #359). 일반 html 붙여넣기의
// deps.iframeEmbed와 같은 호스트 설정이다. 생략하면 importHtml을 설정 없이 부른
// 결과와 같다.
describe("iframe 설정 (Issue #356 RD-005, #359)", () => {
  const SRC = "https://www.youtube.com/embed/x";
  const iframe = (src: string): string =>
    `<div data-geul-block-id="j" data-geul-media-type="iframe" data-geul-src="${src}"></div>`;
  const YOUTUBE: IframeEmbedConfig = {
    providers: [
      {
        name: "youtube",
        match: { type: "wildcard", pattern: "*.youtube.com" },
      },
    ],
  };

  /** 입력으로 parseClipboardTable을 부른다. 블록에서 id는 뺀다. */
  const parseWith = (
    input: Parameters<typeof parseClipboardTable>[0],
  ): unknown[] => {
    const result = parseClipboardTable(input);
    if (!result.ok) throw new Error("parseClipboardTable이 실패했다");
    return withoutIds(result.value) as unknown[];
  };

  it("own-export iframe wrapper는 url 없는 iframe 블록으로 붙고 importHtml 기본 결과와 같다", () => {
    const html = iframe("https://example.com/x");
    const imported = importedBlocks(html);

    expect(imported).toEqual([{ id: "j", type: "iframe" }]);
    expect(clipboardBlocks(`${html}${TABLE}`)).toEqual([
      ...(withoutIds(imported) as unknown[]),
      { type: "table", data: expect.any(Object) },
    ]);
  });

  it("iframeEmbed가 그 url을 허용하면 표 옆 iframe 블록에 url이 붙는다", () => {
    expect(
      parseWith({ html: `${iframe(SRC)}${TABLE}`, iframeEmbed: YOUTUBE }),
    ).toEqual([
      { type: "iframe", url: SRC },
      { type: "table", data: expect.any(Object) },
    ]);
  });

  it("iframeEmbed를 주지 않으면 허용 설정과 무관하게 url 없는 iframe 블록이다", () => {
    expect(parseWith({ html: `${iframe(SRC)}${TABLE}` })).toEqual([
      { type: "iframe" },
      { type: "table", data: expect.any(Object) },
    ]);
  });

  it("iframeEmbed가 그 url을 허용하지 않으면 url 없는 iframe 블록이다", () => {
    expect(
      parseWith({
        html: `${iframe("https://evil.example.com/x")}${TABLE}`,
        iframeEmbed: YOUTUBE,
      }),
    ).toEqual([
      { type: "iframe" },
      { type: "table", data: expect.any(Object) },
    ]);
  });

  it("providers 밖 url도 allowCustomUrl이면 붙는다 — 설정 전체가 변환기에 닿는다", () => {
    // providers만 넘기는 변이를 잡는다(IMPL-REVIEW-01 F1).
    const custom = "https://example.org/custom/x";
    expect(
      parseWith({
        html: `${iframe(custom)}${TABLE}`,
        iframeEmbed: { allowCustomUrl: true },
      }),
    ).toEqual([
      { type: "iframe", url: custom },
      { type: "table", data: expect.any(Object) },
    ]);
  });

  it("허용된 url이 든 표 옆 iframe은 표 없는 importHtml 결과와 같다", () => {
    const imported = importHtml(iframe(SRC), { iframeEmbed: YOUTUBE });
    if (!imported.ok) throw new Error("importHtml이 실패했다");

    expect(
      parseWith({ html: `${iframe(SRC)}${TABLE}`, iframeEmbed: YOUTUBE })[0],
    ).toEqual(withoutIds(imported.value.document.blocks[0]));
  });
});

// RD-005.md "대조군" 중 기존 테스트가 덮지 않던 행이다. 위임 전과 같은 결과를 고정한다.
describe("대조군: 위임 전과 같은 결과 (Issue #356 RD-005)", () => {
  it("own-format 마커 없는 details는 summary·본문 문단이다", () => {
    expect(
      clipboardBlocks(
        `<details><summary>s</summary><p>body</p></details>${TABLE}`,
      ),
    ).toEqual([
      { type: "paragraph", content: [{ text: "s" }] },
      { type: "paragraph", content: [{ text: "body" }] },
      { type: "table", data: expect.any(Object) },
    ]);
  });

  it("javascript 링크는 링크 마크 없이 글자만 남는다", () => {
    expect(
      clipboardBlocks(`<p><a href="javascript:alert(1)">x</a></p>${TABLE}`),
    ).toEqual([
      { type: "paragraph", content: [{ text: "x" }] },
      { type: "table", data: expect.any(Object) },
    ]);
  });

  it("th는 header가 아니고 td text-align은 셀 align이다", () => {
    expect(
      clipboardBlocks(
        '<table><tr><th>h</th><td style="text-align:center">c</td></tr></table>',
      ),
    ).toEqual([
      {
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
                  content: [{ text: "h" }],
                },
                {
                  columnIndex: 1,
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "c" }],
                  align: "center",
                },
              ],
            },
          ],
        },
      },
    ]);
  });

  it("빈 table 뒤 데이터 표는 데이터 표 하나다", () => {
    expect(clipboardBlocks(`<table></table>${TABLE}`)).toEqual([
      { type: "table", data: expect.objectContaining({ columnCount: 2 }) },
    ]);
  });

  it("레이아웃 표 안 데이터 표는 옆 셀 문단과 안쪽 표다", () => {
    expect(
      clipboardBlocks(
        `<table role="presentation"><tr><td>side</td><td>${TABLE}</td></tr></table>`,
      ),
    ).toEqual([
      { type: "paragraph", content: [{ text: "side" }] },
      { type: "table", data: expect.objectContaining({ columnCount: 2 }) },
    ]);
  });
});
