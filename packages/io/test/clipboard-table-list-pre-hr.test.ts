/**
 * `parseClipboardTable`이 `li` 안 `pre`·`hr`를 `importHtml`과 같게 목록 항목의 자식 `codeBlock`·`divider`로 읽는지 검증한다(Issue #351).
 *
 * - 이전에는 `pre` 글자가 항목 content에 `code` 마크로 붙고 줄바꿈·들여쓰기가 공백 하나로 접혔다.
 * - 이전에는 `hr`가 사라졌다.
 * - 입력마다 뒤에 2×2 데이터 표를 붙인다. 표가 없으면 파서가 표 붙여넣기를 하지 않는다.
 * - 기대값은 같은 HTML의 `importHtml` 결과다. 표를 뺀 블록 트리를 children까지 비교한다.
 * - 비교만으로는 둘이 함께 틀려도 통과하므로, 재현 입력은 명시 값으로도 고정한다.
 * - 내용 없는 `pre`도 `importHtml`처럼 `codeBlock`으로 남는다(Issue #356 Q8). 이전에는 만들지 않았다.
 * - `pre`의 `wrap`·`caption`·`id`는 Issue #356 RD-005부터 `importHtml`처럼 읽는다. 경고는 내지 않는다.
 * - `blockquote`는 Issue #356 RD-005부터 `quote`다. 이전에는 `quote`를 만들지 않았다(#350).
 * - `language`는 model 정규형으로 바꾼다(`ts`는 `typescript`). model이 거부하는 값은 버린다.
 * - 코드 글자의 Tab은 남기고 나머지 무효 코드포인트만 지운다.
 * - 목록 밖 `pre`·`hr`도 Issue #356 RD-005부터 `codeBlock`·`divider`다. 이전에는 문단 글자였고 `hr`는 사라졌다.
 */
import { describe, expect, it } from "vitest";

import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import {
  clipboardBlocks,
  importedBlocks,
  withoutIds,
} from "./clipboard-table-support.js";

const TABLE =
  "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>";

/** 비교에 쓰는 블록 모양이다. id와 블록별 부가 필드는 뺀다. */
type BlockShape = {
  type: unknown;
  language: unknown;
  text: unknown;
  content: unknown;
  children: BlockShape[] | undefined;
};

/** codeBlock의 글자를 content 런에서 문자열로 읽는다. importHtml과 클립보드가 같은 모양이다. */
const codeTextOf = (record: Record<string, unknown>): unknown => {
  if (Array.isArray(record.content)) {
    return record.content
      .map((item) => (item as { text: string }).text)
      .join("");
  }
  return undefined;
};

/** 블록에서 종류·language·코드 글자·콘텐츠를 남기고 children을 재귀로 같은 모양으로 바꾼다. */
const shapeOf = (block: unknown): BlockShape => {
  const record = block as Record<string, unknown>;
  const children = Array.isArray(record.children) ? record.children : [];
  const isCode = record.type === "codeBlock";
  return {
    type: record.type,
    language: record.language,
    text: isCode ? codeTextOf(record) : undefined,
    content: isCode || record.type === "divider" ? undefined : record.content,
    children:
      children.length === 0 ? undefined : shapesOf(children as unknown[]),
  };
};

/** 표 블록을 빼고 나머지를 모양으로 바꾼다. */
const shapesOf = (blocks: readonly unknown[]): BlockShape[] =>
  blocks
    .filter((block) => (block as { type?: unknown }).type !== "table")
    .map(shapeOf);

/** importHtml이 만든 문서 블록의 모양이다. */
const importedShapes = (html: string): BlockShape[] =>
  shapesOf(importedBlocks(html));

/** parseClipboardTable이 만든 블록의 모양이다. */
const clipboardShapes = (html: string): BlockShape[] =>
  shapesOf(clipboardBlocks(html));

/** 글자만 든 불릿 항목의 기대 모양이다. */
const item = (
  text: string,
  children?: BlockShape[],
  type = "bulletListItem",
): BlockShape => ({
  type,
  language: undefined,
  text: undefined,
  content: text.length === 0 ? [] : [{ text }],
  children,
});

/** codeBlock의 기대 모양이다. */
const code = (text: string, language?: string): BlockShape => ({
  type: "codeBlock",
  language,
  text,
  content: undefined,
  children: undefined,
});

/** divider의 기대 모양이다. */
const divider = (): BlockShape => ({
  type: "divider",
  language: undefined,
  text: undefined,
  content: undefined,
  children: undefined,
});

describe("parseClipboardTable li 안 pre·hr 자식 블록 (Issue #351)", () => {
  it.each([
    [
      "글자 뒤 language-* pre",
      '<ul><li>t<pre><code class="language-ts">a\n  b</code></pre></li></ul>',
    ],
    ["pre만 든 항목", "<ul><li><pre>code</pre></li></ul>"],
    ["글자 뒤 hr", "<ul><li>t<hr></li></ul>"],
    ["hr로 시작하는 항목", "<ul><li><hr>t</li></ul>"],
    ["hr만 든 항목", "<ul><li><hr></li></ul>"],
    ["pre 뒤 글자", "<ul><li>t<pre>c</pre>u</li></ul>"],
    ["pre 뒤 p", "<ul><li>t<pre>c</pre><p>p</p></li></ul>"],
    ["pre 뒤 hr 뒤 pre", "<ul><li>t<pre>a</pre><hr><pre>b</pre></li></ul>"],
    ["순서 목록 pre", "<ol><li>t<pre>c</pre></li></ol>"],
    ["div가 감싼 pre", "<ul><li>t<div><pre>c</pre></div></li></ul>"],
    ["div가 감싼 hr", "<ul><li>t<div><hr></div></li></ul>"],
    ["중첩 목록 안 pre", "<ul><li>a<ul><li>b<pre>c</pre></li></ul></li></ul>"],
    ["중첩 목록 안 hr", "<ul><li>a<ul><li><hr></li></ul></li></ul>"],
    ["여러 줄 pre의 br", "<ul><li>t<pre>a<br>b</pre></li></ul>"],
    [
      "들여쓰기 있는 여러 줄 pre",
      "<ul><li>t<pre>if (x) {\n    y();\n}\n</pre></li></ul>",
    ],
  ])("%s: importHtml과 같은 블록 트리로 읽는다", (_name, before) => {
    const html = `${before}${TABLE}`;

    expect(clipboardShapes(html)).toEqual(importedShapes(html));
  });

  describe("재현 입력의 명시 기대값", () => {
    it("글자 뒤 language-* pre는 줄바꿈·들여쓰기를 보존한 자식 codeBlock이다", () => {
      const html = `<ul><li>t<pre><code class="language-ts">a\n  b</code></pre></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([
        item("t", [code("a\n  b", "typescript")]),
      ]);
    });

    it("pre만 든 항목은 content가 비고 자식 codeBlock만 남는다", () => {
      const html = `<ul><li><pre>code</pre></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([item("", [code("code")])]);
    });

    it("글자 뒤 hr는 자식 divider다", () => {
      const html = `<ul><li>t<hr></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([item("t", [divider()])]);
    });

    it("hr로 시작하는 항목은 content가 비고 divider 뒤에 글자 문단이 온다", () => {
      const html = `<ul><li><hr>t</li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([
        item("", [
          divider(),
          {
            type: "paragraph",
            language: undefined,
            text: undefined,
            content: [{ text: "t" }],
            children: undefined,
          },
        ]),
      ]);
    });

    // blockquote는 Issue #356 RD-005부터 importHtml처럼 quote가 된다(이전에는
    // quote 없이 항목의 자식이었다, #350).
    it("blockquote가 감싼 pre는 항목 자식 quote 안의 codeBlock이다", () => {
      const html = `<ul><li>t<blockquote><pre>c</pre></blockquote></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([
        item("t", [item("", [code("c")], "quote")]),
      ]);
      expect(clipboardShapes(html)).toEqual(importedShapes(html));
    });

    it("blockquote가 감싼 hr는 항목 자식 quote 안의 divider다", () => {
      const html = `<ul><li>t<blockquote><hr></blockquote></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([
        item("t", [item("", [divider()], "quote")]),
      ]);
      expect(clipboardShapes(html)).toEqual(importedShapes(html));
    });

    it("pre 글자가 항목 content에 붙지 않는다", () => {
      const html = `<ul><li>t<pre>code</pre></li></ul>${TABLE}`;

      expect(clipboardShapes(html)[0]?.content).toEqual([{ text: "t" }]);
    });
  });

  describe("코드 텍스트", () => {
    it("br은 줄바꿈이 된다", () => {
      const html = `<ul><li>t<pre>a<br>b</pre></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([item("t", [code("a\nb")])]);
    });

    it("여러 줄 들여쓰기와 끝 줄바꿈을 보존한다", () => {
      const html = `<ul><li>t<pre>if (x) {\n    y();\n}\n</pre></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([
        item("t", [code("if (x) {\n    y();\n}\n")]),
      ]);
    });

    it("Tab은 코드 내용이라 남긴다", () => {
      const html = `<ul><li>t<pre>a\n\tb</pre></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([item("t", [code("a\n\tb")])]);
    });

    it("code 안 span의 글자도 이어 붙인다", () => {
      const html = `<ul><li>t<pre><code><span>a</span> <span>b</span></code></pre></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([item("t", [code("a b")])]);
    });

    it("무효 코드포인트만 지운다", () => {
      const html = `<ul><li>t<pre>a\u0001b\u007fc\ud800d\n e</pre></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([item("t", [code("abcd\n e")])]);
    });

    it("pre 안 인라인 마크는 코드에 싣지 않는다", () => {
      const html = `<ul><li>t<pre><b>x</b><i>y</i></pre></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([item("t", [code("xy")])]);
    });
  });

  // 내용 없는 pre도 importHtml처럼 codeBlock으로 남긴다(Issue #356 Q8을 pre까지
  // 넓혔다). 이전에는 블록을 만들지 않았다. 표 유무로 결과가 갈리지 않게 한다.
  // 공백·줄바꿈은 코드 내용이라 그대로 둔다. pre 바로 뒤 첫 줄바꿈 하나는 HTML
  // 파서가 지운다.
  describe("내용 없는 pre와 hr", () => {
    it.each([
      ["빈 pre", "<ul><li>t<pre></pre></li></ul>", ""],
      ["공백뿐인 pre", "<ul><li>t<pre>   </pre></li></ul>", "   "],
      ["줄바꿈뿐인 pre", "<ul><li>t<pre>\n\n</pre></li></ul>", "\n"],
      ["빈 code만 든 pre", "<ul><li>t<pre><code></code></pre></li></ul>", ""],
    ])(
      "%s: importHtml과 같은 자식 codeBlock이 남는다",
      (_name, before, text) => {
        const html = `${before}${TABLE}`;

        expect(clipboardShapes(html)).toEqual([item("t", [code(text)])]);
        expect(clipboardShapes(html)).toEqual(importedShapes(html));
      },
    );

    it("pre만 든 항목은 content가 비고 빈 codeBlock 자식을 가진다", () => {
      const html = `<ul><li><pre></pre></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([item("", [code("")])]);
      expect(clipboardShapes(html)).toEqual(importedShapes(html));
    });

    it("hr는 항상 divider다", () => {
      expect(clipboardShapes(`<ul><li><hr></li></ul>${TABLE}`)).toEqual([
        item("", [divider()]),
      ]);
    });

    it("연속 hr는 divider 둘이다", () => {
      expect(clipboardShapes(`<ul><li>t<hr><hr></li></ul>${TABLE}`)).toEqual([
        item("t", [divider(), divider()]),
      ]);
    });
  });

  describe("language", () => {
    it.each([
      ["pre의 class", '<pre class="language-py">c</pre>', "python"],
      [
        "code의 class",
        '<pre><code class="language-rust">c</code></pre>',
        "rust",
      ],
      ["pre의 data-language", '<pre data-language="sh">c</pre>', "bash"],
      [
        "code의 data-language",
        '<pre><code data-language="go">c</code></pre>',
        "go",
      ],
      [
        "code와 pre가 어긋나면 첫 후보",
        '<pre class="language-ts"><code class="language-js">c</code></pre>',
        "javascript",
      ],
      ["language 후보 없음", "<pre><code>c</code></pre>", undefined],
    ])("%s: importHtml과 같게 읽는다", (_name, pre, language) => {
      const html = `<ul><li>t${pre}</li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([item("t", [code("c", language)])]);
      expect(clipboardShapes(html)).toEqual(importedShapes(html));
    });

    it("제어문자만 든 data-language는 language 없이 코드만 남긴다", () => {
      const html = `<ul><li>t<pre data-language="\u0001">c</pre></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([item("t", [code("c")])]);
    });

    it("무효 data-language와 유효 class가 함께면 class 값을 쓰고 importHtml과 같다(Issue #353)", () => {
      const html = `<ul><li>t<pre data-language="a&#1;b" class="language-py">c</pre></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([item("t", [code("c", "python")])]);
      expect(clipboardShapes(html)).toEqual(importedShapes(html));
    });
  });

  // Issue #356 RD-005부터 importHtml 변환기가 읽어 wrap을 싣는다. id는
  // data-geul-block-id를 쓰고 core가 붙여넣을 때 재발급한다.
  describe("importHtml처럼 읽는 pre 속성", () => {
    it("wrap을 싣고 id는 data-geul-block-id를 쓴다", () => {
      const html = `<ul><li>t<pre data-geul-block-id="id1" data-geul-code-wrap="">c</pre></li></ul>${TABLE}`;
      const result = parseClipboardTable({ html });
      if (!result.ok) throw new Error("parseClipboardTable이 실패했다");

      const codeBlock = (
        result.value[0] as { children?: readonly Record<string, unknown>[] }
      ).children?.[0];
      expect(withoutIds(codeBlock)).toEqual({
        type: "codeBlock",
        content: [{ text: "c" }],
        wrap: true,
      });
      expect(codeBlock?.id).toBe("id1");
    });
  });

  // 목록 밖 pre·hr도 Issue #356 RD-005부터 importHtml처럼 codeBlock·divider다.
  // 이전에는 pre가 문단 글자였고 hr는 사라졌다.
  describe("목록 밖 pre·hr는 codeBlock·divider다", () => {
    /** 최상위 블록의 종류와 문단 글자만 남긴다. */
    const topLevel = (html: string): unknown[] => {
      const result = parseClipboardTable({ html });
      if (!result.ok) throw new Error("parseClipboardTable이 실패했다");
      return result.value.map((block) =>
        block.type === "paragraph"
          ? { type: block.type, content: block.content }
          : { type: block.type },
      );
    };

    it("표 앞뒤의 pre는 문단이 아니라 codeBlock이다", () => {
      const html = `<pre>before</pre>${TABLE}<pre>after</pre>`;

      expect(topLevel(html)).toEqual([
        { type: "codeBlock" },
        { type: "table" },
        { type: "codeBlock" },
      ]);
      expect(clipboardShapes(html)).toEqual([code("before"), code("after")]);
    });

    it("표 앞뒤의 hr는 divider다", () => {
      expect(topLevel(`<hr>${TABLE}<hr>`)).toEqual([
        { type: "divider" },
        { type: "table" },
        { type: "divider" },
      ]);
    });

    it("목록 밖 div 안의 pre는 codeBlock, hr는 divider다", () => {
      const html = `<div><pre>c</pre><hr></div>${TABLE}`;

      expect(topLevel(html)).toEqual([
        { type: "codeBlock" },
        { type: "divider" },
        { type: "table" },
      ]);
      expect(clipboardShapes(html)).toEqual(importedShapes(html));
    });

    it("목록 안 비-li 자식 run의 pre·hr도 codeBlock·divider다", () => {
      const html = `<ul><li>a</li><div><pre>c</pre><hr></div></ul>${TABLE}`;

      expect(topLevel(html)).toEqual([
        { type: "bulletListItem" },
        { type: "codeBlock" },
        { type: "divider" },
        { type: "table" },
      ]);
      expect(clipboardShapes(html)).toEqual(importedShapes(html));
    });
  });
});
