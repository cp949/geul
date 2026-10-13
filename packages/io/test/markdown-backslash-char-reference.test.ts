/**
 * 구분자 앞에서 끝나는 `\`+글자의 markdown 직렬화가 왕복에서 글자를 보존하는지 검증한다(Issue #398).
 * mdast-util-to-markdown 2.2.0의 `containerPhrasing`은 구분자 옆 글자를 `&#x61;`로 바꾼다.
 * - 그 글자 앞의 `\`는 그대로 둔다.
 * - `\a`가 `\&#x61;`로 나가면 `\&`가 이스케이프된 `&`로 읽힌다.
 * - 재가져오기에서 문자 참조가 글자 `&#x61;`로 남아 원본과 달라진다.
 * 바깥 글자(구분자 앞 text의 끝)와 안쪽 끝 글자(mark 안 text의 끝)가 같은 원인이다.
 * 단언은 세 가지다.
 * - strict 내보내기가 성공한다.
 * - 재가져오기가 성공하고 글자 런이 원본과 글자·mark 모두 같다.
 * - 정확한 문자열은 한 건만 고정한다.
 *   - `\a` + bold(`(`)는 `\\&#x61;**(**`다.
 * 보정이 필요 없는 입력은 출력이 바뀌지 않음을 문자열로 확인한다.
 * mark 달린 빈 런(#393)은 입력에 쓰지 않는다.
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
const ITALIC: TextMark = { type: "italic" };
const STRIKE: TextMark = { type: "strike" };

/**
 * 입력 content 하나를 묶은 케이스다. 재가져오기 뒤 글자 런은 입력과 같아야 한다.
 */
type Case = readonly [string, InlineContent];

/**
 * bold 런 하나를 만든다.
 */
const bold = (text: string): InlineContentItem => run(text, [BOLD]);

const OUTER_CASES: readonly Case[] = [
  ["`\\a` + bold(`(`)", [{ text: "\\a" }, bold("(")]],
  ["bold(`\\a`) + bold·italic(`(`)", [bold("\\a"), run("(", [BOLD, ITALIC])]],
];

const INNER_CASES: readonly Case[] = [
  ["bold(`\\ `) + `x`", [bold("\\ "), { text: "x" }]],
  ["bold(`x\\ `) + `y`", [bold("x\\ "), { text: "y" }]],
  ["bold(`x\\a`) + `(`", [bold("x\\a"), { text: "(" }]],
  ["bold(`x\\a`) + `y`", [bold("x\\a"), { text: "y" }]],
];

const RUN_LENGTH_CASES: readonly Case[] = [
  ["`\\\\a`(백슬래시 2개) + bold(`(`)", [{ text: "\\\\a" }, bold("(")]],
  ["`\\\\\\a`(백슬래시 3개) + bold(`(`)", [{ text: "\\\\\\a" }, bold("(")]],
];

const MARK_CASES: readonly Case[] = [
  ["`\\a` + strike(`(`)", [{ text: "\\a" }, run("(", [STRIKE])]],
  ["`\\a` + italic(`(`)", [{ text: "\\a" }, run("(", [ITALIC])]],
];

const ALL_CASES: readonly Case[] = [
  ...OUTER_CASES,
  ...INNER_CASES,
  ...RUN_LENGTH_CASES,
  ...MARK_CASES,
];

describe("구분자 앞 백슬래시+글자의 직렬화", () => {
  it.each(ALL_CASES)(
    "문단의 %s는 strict 내보내기가 성공하고 재가져오기가 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it("표 셀의 `\\a` + bold(`(`)도 글자와 mark를 보존한다", () => {
    const content: InlineContent = [{ text: "\\a" }, bold("(")];
    const markdown = strictMarkdown(tableCellDocument(content));

    expect(importedRuns(markdown)).toEqual(content);
  });

  it("`\\a` + bold(`(`)의 출력 문자열은 `\\\\&#x61;**(**`다", () => {
    const markdown = strictMarkdown(
      paragraphDocument([{ text: "\\a" }, bold("(")]),
    );

    expect(markdown).toBe("\\\\&#x61;**(**\n");
  });

  it("구분자가 뒤따르지 않는 끝의 `\\a`는 출력이 바뀌지 않는다", () => {
    const markdown = strictMarkdown(paragraphDocument([{ text: "x\\a" }]));

    expect(markdown).toBe("x\\a\n");
  });

  it("문자 참조가 필요 없는 bold는 출력이 바뀌지 않는다", () => {
    const markdown = strictMarkdown(
      paragraphDocument([{ text: "a" }, bold("b"), { text: "c" }]),
    );

    expect(markdown).toBe("a**b**c\n");
  });

  it("끝 글자가 구두점인 `\\.` + bold는 이스케이프된 채 글자와 mark를 보존한다", () => {
    const content: InlineContent = [{ text: "\\." }, bold("(")];
    const markdown = strictMarkdown(paragraphDocument(content));

    expect(markdown).toBe("\\\\.**(**\n");
    expect(importedRuns(markdown)).toEqual(content);
  });
});
