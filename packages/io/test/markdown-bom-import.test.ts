/**
 * Markdown 가져오기가 선두 BOM(U+FEFF) 유무와 무관하게 같은 결과를 내는지 검증한다(Issue #421).
 * - remark는 선두 BOM을 떼고 파싱해 `position.offset`이 BOM을 뺀 기준이다.
 * - 이전에는 원본 `source`를 offset 기반 후처리와 list 중첩 가드에 그대로 넘겼다.
 *   - 끊어진 참조 이미지의 원문 복원이 한 글자 어긋나 `IMAGE_DOWNGRADED` 경고와 평문화가 사라졌다.
 *   - 한 줄 안 list 중첩(`- - - x`)이 BOM에 가려져 중첩 가드를 통과했다(Issue #206 우회).
 * - remark는 입력의 선두 BOM을 하나 뗀다. 가져오기가 하나만 떼면 남은 BOM을 remark가 또 떼어 다시 어긋난다.
 * - 가져오기는 진입점에서 선두 BOM을 전부 떼고, 가드·파서·후처리가 같은 문자열을 보게 한다.
 * 단언은 다섯 가지다.
 * - 이슈 재현: BOM이 붙은 끊어진 참조 이미지가 문단 `그림 [missing]`과 `IMAGE_DOWNGRADED` 경고를 낸다.
 * - 오라클: 샘플마다 BOM을 붙인 결과와 붙이지 않은 결과가 deep equal이다(BOM 1·2·3개 × LF·CRLF·CR판).
 * - BOM만 있는 소스(1·2·3개)는 빈 소스와 같다.
 * - 선두가 아닌 BOM(문단 중간, `BOM 공백 BOM`)은 글자로 남고 offset을 어긋나게 하지 않는다.
 * - list 중첩 가드는 BOM 개수와 무관하게 400중첩을 거절하고 300중첩(경계)을 통과시킨다.
 */
import { describe, expect, it } from "vitest";

import { importMarkdown } from "../src/index.js";

const BOM = String.fromCharCode(0xfeff);

/** 선두 BOM 개수 이름과 그 문자열. 하나만 떼는 구현을 잡으려고 둘·셋도 본다. */
const BOM_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["BOM 하나", BOM],
  ["BOM 둘", BOM.repeat(2)],
  ["BOM 셋", BOM.repeat(3)],
];

/** 가드 테스트용. BOM 없는 입력을 기준으로 함께 본다. */
const GUARD_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["BOM 없음", ""],
  ...BOM_PREFIXES,
];

/** 줄바꿈 표기 이름과 그 표기 문자열. 테스트가 LF 샘플의 `\n`을 이 문자열로 바꾼다. */
const NEWLINE_STYLES: ReadonlyArray<readonly [string, string]> = [
  ["LF", "\n"],
  ["CRLF", "\r\n"],
  ["CR", "\r"],
];

/** 오라클 샘플. 모두 LF로 쓰고, 테스트가 CRLF·CR판을 만든다. */
const SAMPLES: ReadonlyArray<readonly [string, string]> = [
  ["끊어진 참조 이미지 풀 형태", "앞\n\n![a][x]\n"],
  ["끊어진 참조 이미지 축약 형태", "앞\n\n![a]\n"],
  ["끊어진 참조 이미지 빈 라벨 형태", "앞\n\n![a][]\n"],
  ["한 줄에 끊어진 참조 이미지 둘", "![a][x] 중간 ![b][y]\n"],
  ["목록 안 끊어진 참조 이미지", "- 앞 ![a][x]\n- ![b][y] 뒤\n"],
  ["인용 안 끊어진 참조 이미지", "> 앞 ![a][x]\n"],
  [
    "표 셀 안 끊어진 참조 이미지",
    "| h1 | h2 |\n| --- | --- |\n| ![a][x] | b |\n",
  ],
  [
    "정의 있는 참조 이미지",
    "![a][pic] 와 ![pic]\n\n[pic]: https://example.com/a.png\n",
  ],
  ["맨몸 URL", "see https://a.com and www.b.com\n"],
  ["명시 링크", "a [t](https://b.com) b\n"],
  ["꺾쇠 링크", "a <https://c.com> b <a@b.com>\n"],
  [
    "링크와 끊어진 참조 이미지가 섞인 문서",
    "see https://a.com\n[t](https://b.com)\n\n![그림][missing]\n",
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

describe("Markdown 가져오기 선두 BOM", () => {
  it("BOM이 붙은 끊어진 참조 이미지를 문단 `그림 [missing]`과 IMAGE_DOWNGRADED 경고로 가져온다", () => {
    const withBom = importOk(`${BOM}앞\n\n![그림][missing]\n`);

    expect(withBom.document.blocks).toEqual([
      { id: "markdown-1", type: "paragraph", content: [{ text: "앞" }] },
      {
        id: "markdown-2",
        type: "paragraph",
        content: [{ text: "그림 [missing]" }],
      },
    ]);
    expect(withBom.warnings).toEqual([
      expect.objectContaining({ kind: "IMAGE_DOWNGRADED" }),
    ]);
    expect(withBom).toEqual(importOk("앞\n\n![그림][missing]\n"));
  });

  describe.each(BOM_PREFIXES)("%s", (_prefixName, prefix) => {
    describe.each(NEWLINE_STYLES)("%s판", (_name, newline) => {
      it.each(SAMPLES)("%s 샘플이 BOM 없는 결과와 같다", (_sample, lf) => {
        const source = lf.replace(/\n/g, newline);

        expect(importOk(`${prefix}${source}`)).toEqual(importOk(source));
      });
    });
  });

  it.each(BOM_PREFIXES)(
    "%s 뒤 끊어진 참조 이미지가 IMAGE_DOWNGRADED 경고와 함께 평문이 된다",
    (_name, prefix) => {
      const { document, warnings } = importOk(`${prefix}![a][x]\n`);

      expect(document.blocks).toEqual([
        {
          id: "markdown-1",
          type: "paragraph",
          content: [{ text: "a [x]" }],
        },
      ]);
      expect(warnings).toEqual([
        expect.objectContaining({ kind: "IMAGE_DOWNGRADED" }),
      ]);
    },
  );

  it("BOM 뒤 첫 문단 글자에 BOM이 남지 않는다", () => {
    for (const [, prefix] of BOM_PREFIXES) {
      const { document } = importOk(`${prefix}앞\n`);

      expect(JSON.stringify(document)).not.toContain("\ufeff");
    }
  });

  it.each([
    ["BOM 하나", BOM],
    ["BOM 둘", BOM.repeat(2)],
    ["BOM 셋", BOM.repeat(3)],
  ])("%s만 있는 소스는 빈 소스와 같은 결과다", (_name, source) => {
    expect(importOk(source)).toEqual(importOk(""));
  });

  // 선두가 아닌 BOM은 글자로 남는다. 전역 제거나 선두 공백까지 제거하는 변이를 막는다.
  it.each([
    ["문단 중간 BOM", `앞\n\n${BOM}![a][x]\n`, `${BOM}a [x]`],
    ["BOM 사이 공백", `${BOM} ${BOM}![a][x]\n`, `${BOM}a [x]`],
  ])(
    "%s은 글자로 남고 offset을 어긋나게 하지 않는다",
    (_name, source, text) => {
      const { document, warnings } = importOk(source);

      expect(document.blocks.at(-1)).toEqual(
        expect.objectContaining({ content: [{ text }] }),
      );
      expect(warnings).toEqual([
        expect.objectContaining({ kind: "IMAGE_DOWNGRADED" }),
      ]);
    },
  );

  describe("list 중첩 가드", () => {
    it.each(GUARD_PREFIXES)(
      "한 줄 안 400중첩은 %s이어도 MARKDOWN_LIST_NESTING_TOO_DEEP로 거절한다",
      (_name, prefix) => {
        expect(importMarkdown(`${prefix}${"- ".repeat(400)}x\n`)).toEqual({
          ok: false,
          error: expect.objectContaining({
            code: "MARKDOWN_LIST_NESTING_TOO_DEEP",
          }),
        });
      },
    );

    it.each(GUARD_PREFIXES)(
      "한 줄 안 300중첩(경계)은 %s이어도 거절하지 않는다",
      (_name, prefix) => {
        const result = importMarkdown(`${prefix}${"- ".repeat(300)}x\n`);

        expect(result.ok).toBe(true);
      },
    );
  });
});
