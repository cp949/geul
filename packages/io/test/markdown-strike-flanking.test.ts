/**
 * strike 런의 markdown 직렬화가 flanking 규칙을 지키는지 검증한다(Issue #397).
 * mdast-util-gfm-strikethrough 2.0.0의 `delete` 핸들러에는 `attention`이 없다.
 * - strong·emphasis는 `attention`이 있어 앞뒤 공백과 이웃 글자를 문자 참조로 바꾼다.
 * - `delete`는 그 처리를 받지 못해 `a~~ b~~`처럼 flanking에 어긋난 `~~`가 나간다.
 * - 재가져오기에서 `~~`가 글자로 새거나 strike 범위가 달라진다.
 * 구두점 경계(`x~~,a~~y`, `가~~(a)~~`)도 같은 원인이다.
 * 단언은 세 가지다.
 * - strict 내보내기가 성공한다.
 * - 재가져오기가 성공하고 글자 런이 원본과 글자·mark 모두 같다.
 * - 정확한 문자열은 두 건만 고정한다.
 *   - 변환이 필요한 strike(`a `) + `b`는 `~~a&#x20;~~&#x62;`다.
 *   - 변환이 필요 없는 `a` + strike(`b`) + `c`는 `a~~b~~c` 그대로다.
 * mark 달린 빈 런은 입력에 쓰지 않는다(#393 EMPTY_MARKED_RUN 범위).
 * 인접한 같은 mark 런(#395)도 쓰지 않는다.
 */
import type {
  InlineContent,
  InlineContentItem,
  TextMark,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  importedRuns,
  paragraphDocument,
  run,
  strictMarkdown,
  tableCellDocument,
} from "./markdown-inline-run-support.js";

const BOLD: TextMark = { type: "bold" };
const STRIKE: TextMark = { type: "strike" };

/**
 * 입력 content 하나를 묶은 케이스다. 재가져오기 뒤 글자 런은 입력과 같아야 한다.
 */
type Case = readonly [string, InlineContent];

/**
 * strike 런 하나를 만든다.
 */
const strike = (text: string): InlineContentItem => run(text, [STRIKE]);

const FLANKING_CASES: readonly Case[] = [
  ["글자 + 앞 공백 strike", [{ text: "a" }, strike(" b")]],
  ["뒤 공백 strike + 글자", [strike("a "), { text: "b" }]],
  ["글자 + 뒤 공백 strike", [{ text: "a" }, strike("b ")]],
  ["bold·strike 뒤 공백 + 글자", [run("a ", [BOLD, STRIKE]), { text: "b" }]],
  ["bold 뒤 공백 + 글자(대조)", [run("a ", [BOLD]), { text: "b" }]],
  ["글자 + 공백만 가진 strike", [{ text: "a" }, strike(" ")]],
  ["양쪽 공백만 가진 단독 strike", [strike(" a ")]],
];

const PUNCTUATION_CASES: readonly Case[] = [
  [
    "앞 구두점 strike가 글자 사이",
    [{ text: "x" }, strike(",a"), { text: "y" }],
  ],
  ["한글 글자 + 괄호 strike", [{ text: "가" }, strike("(a)")]],
];

const EMOJI_CASES: readonly Case[] = [
  ["이모지 + 앞 공백 strike", [{ text: "😀" }, strike(" a")]],
  ["뒤 공백 strike + 이모지", [strike("a "), { text: "😀" }]],
];

const ALL_CASES: readonly Case[] = [
  ...FLANKING_CASES,
  ...PUNCTUATION_CASES,
  ...EMOJI_CASES,
];

describe("strike 런의 flanking 직렬화", () => {
  it.each(ALL_CASES)(
    "문단의 %s는 strict 내보내기가 성공하고 재가져오기가 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it("표 셀의 글자 + 앞 공백 strike도 글자와 mark를 보존한다", () => {
    const content: InlineContent = [{ text: "a" }, strike(" b")];
    const markdown = strictMarkdown(tableCellDocument(content));

    expect(importedRuns(markdown)).toEqual(content);
  });

  it("표 셀의 앞 구두점 strike가 글자 사이에 와도 글자와 mark를 보존한다", () => {
    const content: InlineContent = [{ text: "x" }, strike(",a"), { text: "y" }];
    const markdown = strictMarkdown(tableCellDocument(content));

    expect(importedRuns(markdown)).toEqual(content);
  });

  it("문자 참조가 필요 없는 strike는 출력이 바뀌지 않는다", () => {
    const markdown = strictMarkdown(
      paragraphDocument([{ text: "a" }, strike("b"), { text: "c" }]),
    );

    expect(markdown).toBe("a~~b~~c\n");
  });

  it("뒤 공백 strike + 글자의 출력 문자열은 `~~a&#x20;~~&#x62;`다", () => {
    const markdown = strictMarkdown(
      paragraphDocument([strike("a "), { text: "b" }]),
    );

    expect(markdown).toBe("~~a&#x20;~~&#x62;\n");
  });
});
