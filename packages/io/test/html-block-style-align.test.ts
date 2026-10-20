/**
 * 텍스트 블록(`p`·`h1`–`h6`·`blockquote`·`li`·callout·문단 `div`)의 `style`
 * `text-align`을 `textAlignment`로 읽는 규칙을 고정한다(Issue #424 RD-003).
 *
 * - 허용값은 `left`·`center`·`right`·`justify` 4종이다. 키워드는 ASCII 대소문자를
 *   구분하지 않는다.
 * - 브라우저 cascade처럼 `!important`가 먼저이고 같은 중요도는 뒤가 이긴다. 이긴
 *   값이 허용값이 아니면 값 없음이다. 앞 선언으로 되돌아가지 않는다.
 * - `data-geul-text-alignment`가 있으면 style은 보지 않는다. 무효 data 값은 필드
 *   없이 경고하고 style로 복구하지 않는다.
 * - 평범한 문단 `div`는 data 속성을 읽지 않고 style만 읽는다.
 * - li·blockquote·callout이 승격한 `p`는 element보다 안쪽이라 먼저다.
 * - 브라우저 복사의 계산 스타일 덤프 안 `text-align: start`는 정렬이 아니다.
 * - 표 셀 `align`·미디어 `textAlignment`는 `justify`를 계속 거절한다.
 */
import type { Document, DocumentBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { exportHtml, exportMarkdown, importHtml } from "../src/index.js";

/** `importHtml` 성공 결과를 꺼낸다. 실패하면 오류 코드로 던진다. */
const imported = (html: string) => {
  const result = importHtml(html);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};

/** 첫 블록을 돌려준다. 없으면 던진다. */
const firstBlock = (html: string): DocumentBlock => {
  const [block] = imported(html).document.blocks;
  if (block === undefined) throw new Error("블록이 없다");
  return block;
};

/** 첫 블록의 `textAlignment`다. 필드가 없으면 undefined다. */
const alignmentOf = (html: string): unknown =>
  (firstBlock(html) as { textAlignment?: unknown }).textAlignment;

/** 블록 하나를 만드는 HTML 생성기다. `style`은 속성 값이다. */
type Container = [name: string, build: (style: string) => string];

const textBlockContainers: Container[] = [
  ["p", (s) => `<p style="${s}">x</p>`],
  ["h1", (s) => `<h1 style="${s}">x</h1>`],
  ["h6", (s) => `<h6 style="${s}">x</h6>`],
  ["blockquote", (s) => `<blockquote style="${s}">x</blockquote>`],
  ["ul > li", (s) => `<ul><li style="${s}">x</li></ul>`],
  ["ol > li", (s) => `<ol><li style="${s}">x</li></ol>`],
  ["callout div", (s) => `<div data-geul-callout="true" style="${s}">x</div>`],
  ["블록 자식 없는 div", (s) => `<div style="${s}">x</div>`],
];

describe("블록 style의 text-align은 textAlignment로 읽는다", () => {
  describe.each(textBlockContainers)("%s", (_name, build) => {
    it.each(["left", "center", "right", "justify"])(
      "text-align:%s를 읽는다",
      (value) => {
        expect(alignmentOf(build(`text-align: ${value}`))).toBe(value);
      },
    );
  });

  it("이스케이프한 정렬 키워드도 토큰 값으로 읽는다", () => {
    expect(alignmentOf(String.raw`<p style="text-align:c\65 nter">x</p>`)).toBe(
      "center",
    );
  });

  it("키워드 대소문자와 앞뒤 공백을 무시한다", () => {
    expect(alignmentOf('<p style="text-align:  CENTER ">x</p>')).toBe("center");
    expect(alignmentOf('<p style="TEXT-ALIGN: Justify">x</p>')).toBe("justify");
  });

  it("다른 선언과 섞여 있어도 읽는다", () => {
    expect(
      alignmentOf('<p style="color:#ff0000;text-align:right;margin:0">x</p>'),
    ).toBe("right");
  });

  it("text-align이 없는 style은 정렬 필드를 만들지 않는다", () => {
    expect(firstBlock('<p style="color:#ff0000">x</p>')).not.toHaveProperty(
      "textAlignment",
    );
  });

  it("허용 밖 값(start·end·match-parent·justify-all)은 값 없음이다", () => {
    for (const value of ["start", "end", "match-parent", "justify-all"]) {
      expect(
        firstBlock(`<p style="text-align:${value}">x</p>`),
      ).not.toHaveProperty("textAlignment");
    }
  });
});

describe("같은 요소의 text-align 선언은 브라우저 cascade로 고른다", () => {
  it("같은 중요도면 뒤 선언이 이긴다", () => {
    expect(
      alignmentOf('<p style="text-align:center;text-align:right">x</p>'),
    ).toBe("right");
  });

  it("!important 선언은 뒤의 일반 선언을 이긴다", () => {
    expect(
      alignmentOf(
        '<p style="text-align:center !important;text-align:right">x</p>',
      ),
    ).toBe("center");
  });

  it("!important끼리는 뒤가 이긴다", () => {
    expect(
      alignmentOf(
        '<p style="text-align:center !important;text-align:right !important">x</p>',
      ),
    ).toBe("right");
  });

  it("이긴 선언이 허용 밖이면 앞의 허용값으로 되돌아가지 않고 값 없음이다", () => {
    expect(
      firstBlock('<p style="text-align:center;text-align:start">x</p>'),
    ).not.toHaveProperty("textAlignment");
  });

  it("!important인 허용 밖 값이 뒤의 허용값을 이기면 값 없음이다", () => {
    expect(
      firstBlock(
        '<p style="text-align:start !important;text-align:right">x</p>',
      ),
    ).not.toHaveProperty("textAlignment");
  });

  it("문법상 무효한 값의 선언은 브라우저처럼 버려 앞 값이 남는다", () => {
    for (const invalid of [
      "foo",
      "var(foo)",
      "var()",
      "center left",
      '"left"',
      "10px",
      "",
    ]) {
      expect(
        alignmentOf(`<p style="text-align:center;text-align:${invalid}">x</p>`),
      ).toBe("center");
    }
  });

  it("!important인 무효 선언도 버려 앞의 !important 값이 남는다", () => {
    expect(
      alignmentOf(
        '<p style="text-align:center !important;text-align:foo !important">x</p>',
      ),
    ).toBe("center");
  });

  it("무효 선언뿐이면 값 없음이다", () => {
    expect(firstBlock('<p style="text-align:foo">x</p>')).not.toHaveProperty(
      "textAlignment",
    );
  });

  it.each([
    "inherit",
    "initial",
    "unset",
    "revert",
    "revert-layer",
    "INHERIT",
    "var(--align)",
    "var(--align",
    "-webkit-right",
    "-webkit-center",
    "-webkit-left",
    "-webkit-match-parent",
    "justify-all",
    "match-parent",
    "end",
  ])(
    "유효하지만 지원하지 않는 값 %s가 이기면 앞의 center로 되돌아가지 않고 값 없음이다",
    (value) => {
      expect(
        firstBlock(`<p style="text-align:center;text-align:${value}">x</p>`),
      ).not.toHaveProperty("textAlignment");
    },
  );

  it("문법 오류 선언은 버려 앞 값이 남는다", () => {
    expect(alignmentOf('<p style="text-align:center;text-align:">x</p>')).toBe(
      "center",
    );
  });
});

describe("data-geul-text-alignment가 style보다 우선한다", () => {
  it("data 값이 있으면 style의 text-align을 쓰지 않는다", () => {
    expect(
      alignmentOf(
        '<p data-geul-text-alignment="left" style="text-align:right">x</p>',
      ),
    ).toBe("left");
  });

  it("data의 justify를 읽는다", () => {
    expect(alignmentOf('<p data-geul-text-alignment="justify">x</p>')).toBe(
      "justify",
    );
  });

  it.each(["start", ""])(
    "무효 data 값 %j는 필드 없이 경고하고 style로 복구하지 않는다",
    (invalid) => {
      const value = imported(
        `<p data-geul-block-id="p1" data-geul-text-alignment="${invalid}" style="text-align:right">x</p>`,
      );
      expect(value.document.blocks[0]).not.toHaveProperty("textAlignment");
      expect(value.warnings).toContainEqual({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "p",
        attribute: "data-geul-text-alignment",
        message:
          "Unsupported data-geul-text-alignment attribute was removed from p",
      });
    },
  );

  it("li·blockquote·callout도 같은 규칙이다", () => {
    expect(
      alignmentOf(
        '<ul><li data-geul-text-alignment="center" style="text-align:right">x</li></ul>',
      ),
    ).toBe("center");
    expect(
      alignmentOf(
        '<blockquote data-geul-text-alignment="center" style="text-align:right">x</blockquote>',
      ),
    ).toBe("center");
    expect(
      alignmentOf(
        '<div data-geul-callout="true" data-geul-text-alignment="center" style="text-align:right">x</div>',
      ),
    ).toBe("center");
  });

  it("평범한 문단 div는 유효한 data 값도 읽지 않고 style만 읽는다", () => {
    expect(
      alignmentOf(
        '<div data-geul-text-alignment="left" style="text-align:right">x</div>',
      ),
    ).toBe("right");
    expect(
      firstBlock('<div data-geul-text-alignment="left">x</div>'),
    ).not.toHaveProperty("textAlignment");
  });
});

describe("승격한 p의 text-align이 element보다 안쪽 우선이다", () => {
  it("li 안 p의 정렬이 li의 정렬을 이긴다", () => {
    expect(
      alignmentOf(
        '<ul><li style="text-align:left"><p style="text-align:justify">x</p></li></ul>',
      ),
    ).toBe("justify");
  });

  it("blockquote 안 p의 정렬이 blockquote의 정렬을 이긴다", () => {
    expect(
      alignmentOf(
        '<blockquote style="text-align:left"><p style="text-align:right">x</p></blockquote>',
      ),
    ).toBe("right");
  });

  it("p가 정렬을 정하지 않으면 element의 정렬이 남는다", () => {
    expect(
      alignmentOf('<ul><li style="text-align:center"><p>x</p></li></ul>'),
    ).toBe("center");
  });

  it("p의 이긴 값이 허용 밖이면 element 정렬로 되돌아가지 않는다", () => {
    expect(
      firstBlock(
        '<blockquote style="text-align:left"><p style="text-align:start">x</p></blockquote>',
      ),
    ).not.toHaveProperty("textAlignment");
  });

  it("data 값이 있으면 승격한 p의 style보다 먼저다", () => {
    expect(
      alignmentOf(
        '<blockquote data-geul-text-alignment="center"><p style="text-align:right">x</p></blockquote>',
      ),
    ).toBe("center");
  });
});

describe("브라우저 복사의 계산 스타일 덤프는 정렬을 만들지 않는다", () => {
  const DUMP =
    "color: rgb(36, 41, 47); font-style: normal; orphans: 2; text-align: start; text-indent: 0px; widows: 2; -webkit-text-stroke-width: 0px; white-space: normal; text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;";

  it("덤프 안 text-align:start는 값 없음이다", () => {
    expect(firstBlock(`<p style="${DUMP}">x</p>`)).not.toHaveProperty(
      "textAlignment",
    );
  });

  it("덤프 안 text-align:center도 작성자 값이 아니라 읽지 않는다", () => {
    expect(
      firstBlock(`<p style="${DUMP.replace("start", "center")}">x</p>`),
    ).not.toHaveProperty("textAlignment");
  });

  it("덤프 뒤 작성자 선언의 text-align은 읽는다", () => {
    expect(alignmentOf(`<p style="${DUMP} text-align: right;">x</p>`)).toBe(
      "right",
    );
  });
});

describe("클립보드 문단 경로는 importHtml과 같게 읽는다", () => {
  const TABLE = "<table><tbody><tr><td>1</td><td>2</td></tr></tbody></table>";

  it("표 앞 div·p 문단의 text-align을 읽는다", () => {
    const result = parseClipboardTable({
      html:
        '<div style="text-align:justify">a</div><p style="text-align:center">b</p>' +
        TABLE,
    });
    if (!result.ok) throw new Error(result.error.code);
    const alignments = result.value
      .filter((block) => block.type !== "table")
      .map((block) => (block as { textAlignment?: unknown }).textAlignment);
    expect(alignments).toEqual(["justify", "center"]);
  });
});

describe("justify 왕복", () => {
  const document: Document = {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "p1",
        type: "paragraph",
        content: [{ text: "x" }],
        textAlignment: "justify",
      },
      {
        id: "h1",
        type: "heading",
        level: 2,
        content: [{ text: "t" }],
        textAlignment: "justify",
      },
    ],
  };

  it("exportHtml이 data와 style에 justify를 그대로 낸다", () => {
    const exported = exportHtml(document);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain(
      'data-geul-text-alignment="justify" style="text-align:justify"',
    );
  });

  it("export한 HTML을 다시 읽으면 같은 문서이고 경고가 없다", () => {
    const exported = exportHtml(document);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  it("data 속성이 지워져도 style만으로 justify를 읽는다", () => {
    expect(
      alignmentOf(
        '<p data-geul-block-id="p1" style="text-align:justify">x</p>',
      ),
    ).toBe("justify");
  });
});

describe("GFM strict export는 justify를 BLOCK_ALIGN 손실로 보고한다", () => {
  it("justify 정렬 블록을 거절한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          content: [{ text: "x" }],
          textAlignment: "justify",
        },
      ],
    };
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "BLOCK_ALIGN",
            blockId: "p1",
            message: "Block p1 has text alignment",
          },
        ],
      },
    });
  });
});

describe("표 셀·미디어는 justify를 계속 거절한다", () => {
  it("표 셀 data-geul-align=justify는 필드 없이 경고한다", () => {
    const value = imported(
      '<table><tbody><tr><td data-geul-align="justify">a</td></tr></tbody></table>',
    );
    expect(JSON.stringify(value.document)).not.toContain("justify");
    expect(value.warnings.map((warning) => warning.kind)).toContain(
      "UNSAFE_ATTRIBUTE_REMOVED",
    );
  });

  it("표 셀 style text-align:justify는 읽지 않는다", () => {
    const value = imported(
      '<table><tbody><tr><td style="text-align:justify">a</td></tr></tbody></table>',
    );
    expect(JSON.stringify(value.document)).not.toContain("justify");
  });

  it("이미지 data-geul-text-alignment=justify는 필드 없이 경고한다", () => {
    const value = imported(
      '<img data-geul-media-type="image" data-geul-src="https://e.com/a.png" data-geul-text-alignment="justify" src="https://e.com/a.png">',
    );
    expect(JSON.stringify(value.document)).not.toContain("justify");
  });
});
