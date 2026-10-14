/**
 * Markdown 가져오기가 CRLF·CR 줄바꿈을 LF와 같게 읽는지 검증한다(Issue #418).
 * - 이전에는 소스에서 `\0`만 치환했다. CR이 문단·inlineCode·html 값에 남아
 *   model 검증이 MARKDOWN_DOCUMENT_INVALID로 거절했다.
 * - 이미지 alt `name`은 검증하지 않아 `\r\n`이 조용히 남았다.
 * - 가져오기는 소스를 `\r\n?` → `\n`으로 정규화한 문자열을 파서와 offset 기반 후처리에 함께 넘긴다.
 * 단언은 다섯 가지다.
 * - 이슈 본문 기대값: `a\r\nb\r\n`·`a\rb`는 문단 하나, 글자 `a\nb`다.
 * - 오라클: 샘플마다 LF판 결과와 CRLF판·CR판 결과가 deep equal이다.
 * - 한 문서에 세 표기가 섞여도 LF판과 같다.
 * - 이미지 alt `name`에 `\r`이 없다.
 * - `\r` 외 C0 제어문자는 여전히 MARKDOWN_DOCUMENT_INVALID로 거절된다.
 */
import { describe, expect, it } from "vitest";

import { importMarkdown } from "../src/index.js";

const BOM = String.fromCharCode(0xfeff);
const SOH = String.fromCharCode(0x01);

/** 줄바꿈 표기 이름과 그 표기 문자열. 테스트가 LF 샘플의 `\n`을 이 문자열로 바꾼다. */
const NEWLINE_STYLES: ReadonlyArray<readonly [string, string]> = [
  ["CRLF", "\r\n"],
  ["CR", "\r"],
];

/** 오라클 샘플. 모두 LF로 쓰고, 테스트가 CRLF·CR판을 만든다. */
const SAMPLES: ReadonlyArray<readonly [string, string]> = [
  ["문단", "a\nb\n\nc\n"],
  ["제목", "# 제목\n\n본문\n"],
  ["목록", "- a\n- b\n\n1. c\n2. d\n"],
  ["중첩 목록", "- a\n  - b\n    - c\n- d\n"],
  ["인용", "> a\n> b\n>\n> c\n"],
  ["표 셀", "| h1 | h2 |\n| --- | --- |\n| a | b |\n"],
  ["inlineCode", "앞 `a\nb` 뒤\n"],
  ["인라인 html", "a <span>x\ny</span> b\n"],
  ["블록 html", "<div>\nx\n</div>\n"],
  ["맨몸 URL 뒤 줄바꿈", "see https://a.com\nnext\n"],
  ["줄바꿈 뒤 명시 링크", "a\nb\n\n[t](https://b.com)\n<https://c.com>\n"],
  ["이미지 alt", "![a\nb](https://example.com/a.png)\n"],
  ["참조 이미지 정의", "![a\nb][pic]\n\n[pic]: https://example.com/a.png\n"],
  ["끊어진 참조 이미지", "앞 문단\n\n![그림][missing]\n"],
  ["펜스 코드 블록", "```ts\na\n\nb\n```\n"],
  ["하드 브레이크", "a  \nb\\\nc\n"],
  [
    "선두 BOM",
    `${BOM}see https://a.com\n[t](https://b.com)\n\n![그림][missing]\n`,
  ],
];

/**
 * 가져오기에 성공했다고 단언하고 결과 값을 돌려준다. 실패하면 오류 메시지로
 * 즉시 실패시켜 deep equal 비교가 실패 결과끼리 같아 보이는 일을 막는다.
 */
const importOk = (source: string) => {
  const result = importMarkdown(source);
  if (!result.ok)
    throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
};

describe("Markdown 가져오기 CRLF·CR 정규화", () => {
  it("`a\\r\\nb\\r\\n`을 문단 하나, 글자 `a\\nb`로 가져온다", () => {
    const { document } = importOk("a\r\nb\r\n");

    expect(document.blocks).toEqual([
      { id: "markdown-1", type: "paragraph", content: [{ text: "a\nb" }] },
    ]);
  });

  it("`a\\rb`를 문단 하나, 글자 `a\\nb`로 가져온다", () => {
    const { document } = importOk("a\rb");

    expect(document.blocks).toEqual([
      { id: "markdown-1", type: "paragraph", content: [{ text: "a\nb" }] },
    ]);
  });

  describe.each(NEWLINE_STYLES)("%s판", (_name, newline) => {
    it.each(SAMPLES)("%s 샘플이 LF판과 같은 결과다", (_sample, lf) => {
      expect(importOk(lf.replace(/\n/g, newline))).toEqual(importOk(lf));
    });
  });

  it("한 문서에 CRLF·CR·LF가 섞여도 LF판과 같은 결과다", () => {
    const lf = "a\nb\n\nc\n\n- x\n  y\n- z\n";
    const mixed = "a\r\nb\r\rc\n\r- x\r  y\r\n- z\n";

    expect(importOk(mixed)).toEqual(importOk(lf));
  });

  it("이미지 alt에 줄바꿈이 있어도 name에 CR이 남지 않는다", () => {
    for (const [, newline] of NEWLINE_STYLES) {
      const { document } = importOk(
        `![a${newline}b](https://example.com/a.png)${newline}`,
      );
      const [image] = document.blocks;

      expect(image).toMatchObject({ type: "image", name: "a\nb" });
      expect(JSON.stringify(document)).not.toContain("\\r");
    }
  });

  it("CR 외 C0 제어문자(U+0001)는 여전히 MARKDOWN_DOCUMENT_INVALID로 거절한다", () => {
    expect(importMarkdown(`a${SOH}b`)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "MARKDOWN_DOCUMENT_INVALID" }),
    });
  });
});
