/**
 * 인라인·div 래퍼가 목록이나 표를 품어도 블록 구조를 지키는지 검증한다
 * (Issue #336, Issue #356 RD-005 DELTA-04).
 *
 * - `importHtml`: 래퍼 안 `ul`·`ol`은 목록 항목이다. 블록을 품은 인라인 요소는
 *   `li`·`blockquote` 분할에서 children 자리로 간다. 안쪽 표가 글자로 접히지 않는다.
 * - 래퍼 안 연속 `ol`의 번호 규칙은 최상위 연속 `ol`과 같다.
 * - 블록 자손이 없는 인라인 마크(`span` 색, `b` 굵게)는 이전과 같다.
 * - `parseClipboardTable`: Google Docs 복사 모양(전부 감싼 `b`)의 목록이 표와 함께 목록으로 남는다.
 */
import { describe, expect, it } from "vitest";

import { importHtml, parseClipboardTable } from "../src/index.js";

const TABLE = "<table><tbody><tr><td>1</td><td>2</td></tr></tbody></table>";

/**
 * 블록 트리를 비교용 모양으로 줄인다. id를 빼고 표는 `{ type: "table" }` 자리로 둔다.
 * 표 내부는 이 파일의 관심사가 아니다. children은 재귀로 따라간다.
 */
const shape = (block: unknown): unknown => {
  const rest: Record<string, unknown> = { ...(block as object) };
  delete rest.id;
  if (rest.type === "table") return { type: "table" };
  if (Array.isArray(rest.children)) {
    return { ...rest, children: rest.children.map(shape) };
  }
  return rest;
};

/** importHtml 결과의 최상위 블록 모양이다. 실패하면 던진다. */
const imported = (html: string): unknown[] => {
  const result = importHtml(html);
  if (!result.ok) throw new Error(result.error.code);
  return result.value.document.blocks.map(shape);
};

/** parseClipboardTable 결과의 블록 모양이다. 실패하면 던진다. */
const clipboard = (html: string): unknown[] => {
  const result = parseClipboardTable({ html });
  if (!result.ok) throw new Error(result.error.code);
  return result.value.map((block) =>
    block.type === "table" ? { type: "table" } : shape(block),
  );
};

describe("래퍼 안 목록 (Issue #336)", () => {
  it("span이 감싼 ul은 목록 항목 두 개다", () => {
    expect(imported("<span><ul><li>a</li><li>b</li></ul></span>")).toEqual([
      { type: "bulletListItem", content: [{ text: "a" }] },
      { type: "bulletListItem", content: [{ text: "b" }] },
    ]);
  });

  it("b가 감싼 ul은 굵은 목록 항목이다", () => {
    expect(imported("<b><ul><li>a</li></ul></b>")).toEqual([
      {
        type: "bulletListItem",
        content: [{ text: "a", marks: [{ type: "bold" }] }],
      },
    ]);
  });

  it("div 두 겹이 감싼 ol은 번호 목록 항목이다", () => {
    expect(imported("<div><div><ol><li>a</li></ol></div></div>")).toEqual([
      { type: "numberedListItem", content: [{ text: "a" }] },
    ]);
  });

  it("래퍼 안 목록 앞뒤 글자는 문단으로 남는다", () => {
    expect(imported("<div>x<ul><li>a</li></ul>y</div>")).toEqual([
      { type: "paragraph", content: [{ text: "x" }] },
      { type: "bulletListItem", content: [{ text: "a" }] },
      { type: "paragraph", content: [{ text: "y" }] },
    ]);
  });
});

describe("래퍼 안 연속 ol의 번호", () => {
  it("div가 각각 감싼 연속 ol은 최상위 연속 ol과 같은 startNumber를 낸다", () => {
    const topLevel = imported("<ol><li>a</li></ol><ol><li>b</li></ol>");
    expect(
      imported("<div><ol><li>a</li></ol></div><div><ol><li>b</li></ol></div>"),
    ).toEqual(topLevel);
    expect(topLevel[1]).toEqual({
      type: "numberedListItem",
      content: [{ text: "b" }],
      startNumber: 1,
    });
  });

  it("최상위 ol 뒤 div 안 ol도 번호를 1부터 다시 센다", () => {
    expect(
      imported("<ol><li>a</li></ol><div><ol><li>b</li></ol></div>"),
    ).toEqual(imported("<ol><li>a</li></ol><ol><li>b</li></ol>"));
  });
});

describe("블록을 품은 인라인 요소 (Issue #336)", () => {
  it("li 안 span이 품은 표는 항목의 children이다", () => {
    expect(imported(`<ul><li>i<span>x${TABLE}</span></li></ul>`)).toEqual([
      {
        type: "bulletListItem",
        content: [{ text: "i" }],
        children: [
          { type: "paragraph", content: [{ text: "x" }] },
          { type: "table" },
        ],
      },
    ]);
  });

  it("blockquote 안 span이 품은 표는 quote의 children이다", () => {
    expect(imported(`<blockquote><span>q${TABLE}</span></blockquote>`)).toEqual(
      [
        {
          type: "quote",
          content: [],
          children: [
            { type: "paragraph", content: [{ text: "q" }] },
            { type: "table" },
          ],
        },
      ],
    );
  });

  // 링크 앞 공백은 남는다. 소스 공백 접기는 인라인 요소 앞을 블록 경계로 보지 않는다.
  // 표를 품은 div 안 같은 입력(`<div>t <a>l<table>`)도 이전부터 "t "다.
  it("blockquote 안 글자 뒤 링크가 품은 표는 글자가 content이고 표가 children이다", () => {
    expect(
      imported(
        `<blockquote>t <a href="https://e.com/">l${TABLE}</a></blockquote>`,
      ),
    ).toEqual([
      {
        type: "quote",
        content: [{ text: "t " }],
        children: [
          {
            type: "paragraph",
            content: [
              { text: "l", marks: [{ type: "link", href: "https://e.com/" }] },
            ],
          },
          { type: "table" },
        ],
      },
    ]);
  });
});

describe("같은 규칙이 닿는 다른 자리", () => {
  // 제목 안 인용·callout은 이전부터 컨테이너 아래 자식 제목이다. 제목 안 목록도 같다.
  it("제목 안 목록은 항목 아래 자식 제목이다", () => {
    expect(imported("<h2><ol><li>a</li></ol></h2>")).toEqual([
      {
        type: "numberedListItem",
        content: [],
        children: [{ type: "heading", level: 2, content: [{ text: "a" }] }],
      },
    ]);
    expect(imported("<h2><blockquote>a</blockquote></h2>")).toEqual([
      {
        type: "quote",
        content: [],
        children: [{ type: "heading", level: 2, content: [{ text: "a" }] }],
      },
    ]);
  });

  // 링크가 감싼 이미지는 미디어 블록이라 블록 자손이다. 이전에는 항목 글자로 접혀 사라졌다.
  it("li 안 글자 뒤 링크가 감싼 이미지는 항목의 자식 image다", () => {
    expect(
      imported(
        '<ul><li>t <a href="https://e.com/"><img src="https://e.com/a.png"></a></li></ul>',
      ),
    ).toEqual([
      {
        type: "bulletListItem",
        content: [{ text: "t" }],
        children: [{ type: "image", url: "https://e.com/a.png" }],
      },
    ]);
  });
});

describe("블록 자손이 없는 인라인 마크는 이전과 같다", () => {
  it("인용 안 span 색은 quote content의 색 마크다", () => {
    expect(
      imported('<blockquote><span style="color:#ff0000">q</span></blockquote>'),
    ).toEqual([
      {
        type: "quote",
        content: [
          { text: "q", marks: [{ type: "textColor", color: "#FF0000" }] },
        ],
      },
    ]);
  });

  it("li 안 b는 항목 content의 굵은 글자다", () => {
    expect(imported("<ul><li><b>a</b> b</li></ul>")).toEqual([
      {
        type: "bulletListItem",
        content: [{ text: "a", marks: [{ type: "bold" }] }, { text: " b" }],
      },
    ]);
  });
});

describe("Google Docs 복사 모양 (Issue #356 RD-005 DELTA-04)", () => {
  const googleDocs = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc"><h1 dir="ltr"><span>Title</span></h1><p dir="ltr"><span>para</span></p><ul><li dir="ltr"><p dir="ltr"><span>a</span></p></li><li><p><span>b</span></p></li></ul><ol><li><p><span>n</span></p></li></ol><div dir="ltr" align="left">${TABLE}</div><br></b>`;

  it("표가 든 붙여넣기에서 목록이 굵지 않은 목록 항목으로 남는다", () => {
    expect(clipboard(googleDocs)).toEqual([
      { type: "heading", level: 1, content: [{ text: "Title" }] },
      { type: "paragraph", content: [{ text: "para" }] },
      { type: "bulletListItem", content: [{ text: "a" }] },
      { type: "bulletListItem", content: [{ text: "b" }] },
      { type: "numberedListItem", content: [{ text: "n" }] },
      { type: "table" },
    ]);
  });
});
