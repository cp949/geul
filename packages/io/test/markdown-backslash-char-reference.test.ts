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
 * lossy 내보내기는 underline·textColor·backgroundColor 런을 mark 없이 통과시킨다(Issue #399).
 * - 평문 text 노드 둘이 이어지면 앞 노드의 `\` 보정이 뒤 노드의 첫 글자를 구분자로 오인하지 못한다.
 * - 인접 평문 text를 합친 뒤에야 `\a`가 한 노드가 되어 보정된다.
 * - lossy 회귀 케이스는 재가져오기 글자 런이 mark 손실을 뺀 원본과 같음을 확인한다.
 */
import type {
  InlineContent,
  InlineContentItem,
  TextMark,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown } from "../src/index.js";
import {
  importedRuns,
  lossyMarkdown,
  paragraphDocument,
  run,
  strictMarkdown,
  tableCellDocument,
} from "./markdown-inline-run-support.js";

const BOLD: TextMark = { type: "bold" };
const ITALIC: TextMark = { type: "italic" };
const STRIKE: TextMark = { type: "strike" };
const UNDERLINE: TextMark = { type: "underline" };
const TEXT_COLOR: TextMark = { type: "textColor", color: "#FF0000" };
const BACKGROUND_COLOR: TextMark = {
  type: "backgroundColor",
  color: "#00FF00",
};

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

/**
 * lossy 입력과, mark 손실을 뺀 재가져오기 기대 글자 런을 묶은 케이스다.
 */
type LossyCase = readonly [string, InlineContent, InlineContent];

const LOSSY_CASES: readonly LossyCase[] = [
  [
    "`\\` + underline(`a`) + bold(`(`)",
    [{ text: "\\" }, run("a", [UNDERLINE]), bold("(")],
    [{ text: "\\a" }, bold("(")],
  ],
  [
    "`x\\` + underline(`a`) + italic(`(`)",
    [{ text: "x\\" }, run("a", [UNDERLINE]), run("(", [ITALIC])],
    [{ text: "x\\a" }, run("(", [ITALIC])],
  ],
  [
    "`\\` + textColor(`a`) + strike(`(`)",
    [{ text: "\\" }, run("a", [TEXT_COLOR]), run("(", [STRIKE])],
    [{ text: "\\a" }, run("(", [STRIKE])],
  ],
  [
    "`\\` + backgroundColor(`a`) + strike(`(`)",
    [{ text: "\\" }, run("a", [BACKGROUND_COLOR]), run("(", [STRIKE])],
    [{ text: "\\a" }, run("(", [STRIKE])],
  ],
  // 이 케이스는 병합 패스 없이도 통과한다. 구분자 앞에서 바뀌는 글자가 `z`뿐이라
  // `\a`는 글자 그대로다. 빠지는 런이 이어져도 깨지지 않는 회귀 방어용이다.
  [
    "`\\` + underline(`a`) + textColor(`z`) + bold(`(`)",
    [{ text: "\\" }, run("a", [UNDERLINE]), run("z", [TEXT_COLOR]), bold("(")],
    [{ text: "\\az" }, bold("(")],
  ],
  [
    "`x` + underline(`\\`) + textColor(`z`) + bold(`(`)",
    [{ text: "x" }, run("\\", [UNDERLINE]), run("z", [TEXT_COLOR]), bold("(")],
    [{ text: "x\\z" }, bold("(")],
  ],
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

  describe("lossy 내보내기에서 mark 없이 통과하는 런", () => {
    it.each(LOSSY_CASES)(
      "문단의 %s는 재가져오기가 mark 손실을 뺀 글자를 보존한다",
      (_label, content, expected) => {
        const markdown = lossyMarkdown(paragraphDocument(content));

        expect(importedRuns(markdown)).toEqual(expected);
      },
    );

    it.each(LOSSY_CASES)(
      "표 셀의 %s는 재가져오기가 mark 손실을 뺀 글자를 보존한다",
      (_label, content, expected) => {
        const markdown = lossyMarkdown(tableCellDocument(content));

        expect(importedRuns(markdown)).toEqual(expected);
      },
    );

    it("`\\` + underline(`a`) + bold(`(`)의 출력 문자열은 `\\\\&#x61;**(**`다", () => {
      const markdown = lossyMarkdown(
        paragraphDocument([{ text: "\\" }, run("a", [UNDERLINE]), bold("(")]),
      );

      expect(markdown).toBe("\\\\&#x61;**(**\n");
    });

    it("`x\\` + underline(`a`) + italic(`(`)의 출력 문자열은 `x\\\\&#x61;*(*`다", () => {
      const markdown = lossyMarkdown(
        paragraphDocument([
          { text: "x\\" },
          run("a", [UNDERLINE]),
          run("(", [ITALIC]),
        ]),
      );

      expect(markdown).toBe("x\\\\&#x61;*(*\n");
    });

    it("병합 순서 고정: bold(`\\`) + bold·underline(`a`) + `(`는 `**\\\\a**(`로 나간다", () => {
      // mergeAdjacentInline이 두 strong을 합친 뒤에 text를 합쳐야 `\a`가 한 노드가 된다.
      // 순서가 반대이면 `**\a**(`로 나간다. 재가져오기 결과는 같아서 왕복만으로는 못 잡는다.
      const markdown = lossyMarkdown(
        paragraphDocument([
          bold("\\"),
          run("a", [BOLD, UNDERLINE]),
          { text: "(" },
        ]),
      );

      expect(markdown).toBe("**\\\\a**(\n");
    });

    it("손실 경고는 UNDERLINE 한 건 그대로다", () => {
      const result = exportMarkdown(
        paragraphDocument([{ text: "\\" }, run("a", [UNDERLINE]), bold("(")]),
        { mode: "lossy" },
      );

      if (!result.ok)
        throw new Error(`lossy 내보내기 실패: ${result.error.code}`);
      expect(result.value.warnings.map((warning) => warning.kind)).toEqual([
        "UNDERLINE",
      ]);
    });
  });
});
