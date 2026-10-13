/**
 * strike 뒤 평문의 둘째 글자 `_`가 왕복에서 보존되는지 검증한다(Issue #403).
 * mdast-util-to-markdown 2.2.0의 `containerPhrasing`은 구분자 옆 첫 글자를 `&#x61;`로 바꾼다.
 * - `util/safe.js`의 intraword `_` 예외 정규식은 `/[*_]/`다. `~`가 빠져 있다.
 * - strike 뒤 평문의 첫 글자가 문자 참조로 바뀌면 둘째 글자 `_`가 이스케이프되지 않는다.
 * - `;_b`의 `_`가 여는 구분자로 읽혀 재가져오기에서 글자·mark가 달라진다.
 * 거울 방향도 같은 원인이다. strike가 italic 안쪽에 들어 있으면 text 뒤 `info.after`가 `~`다.
 * - 마지막 글자가 `&#x62;`로 바뀌면 끝에서 둘째 자리 `_`가 닫는 구분자로 읽힌다.
 * - 앞의 여는 `_`와 짝을 이뤄 글자와 mark가 달라진다.
 * text 핸들러가 `info.before`·`info.after`가 `~`일 때 `*`로 바꿔 `state.safe`에 넘겨 해소한다.
 * 단언은 세 가지다.
 * - strict 내보내기가 성공한다.
 * - 재가져오기가 성공하고 글자 런이 원본과 글자·mark 모두 같다.
 * - 정확한 문자열을 고정한다.
 *   - 깨지던 입력(a)은 `~~)~~&#x61;\_b.**_(_**`다.
 *   - 뒤 마크가 italic만이어도 `_`는 `\_`로 나간다.
 * 대조군은 수정 전과 출력이 같음을 문자열로 고정한다.
 * - 앞 마크가 bold·italic·없음이면 이미 `\_`로 나가던 출력 그대로다.
 * - `_`이 셋째 자리이거나 strike 안쪽·앞에 있으면 출력이 바뀌지 않는다.
 * 첫 글자가 문자 참조로 바뀌지 않는 `~~a~~b_c`도 `b\_c`로 나간다. 재가져오기는 같다.
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
 * strike 런 하나를 만든다.
 */
const strike = (text: string): InlineContentItem => run(text, [STRIKE]);

/**
 * bold·italic 런 하나를 만든다.
 */
const boldItalic = (text: string): InlineContentItem =>
  run(text, [BOLD, ITALIC]);

/**
 * 입력 content와 기대 출력 문자열을 묶은 케이스다.
 */
type OutputCase = readonly [string, InlineContent, string];

const BROKEN_CASES: readonly Case[] = [
  [
    "strike(`)`) + `a_b.` + bold·italic(`(`)",
    [strike(")"), { text: "a_b." }, boldItalic("(")],
  ],
  [
    "strike(`)`) + `a_1.` + bold·italic(`(`)",
    [strike(")"), { text: "a_1." }, boldItalic("(")],
  ],
  [
    "strike(`)`) + `a_b)` + bold·italic(`(`)",
    [strike(")"), { text: "a_b)" }, boldItalic("(")],
  ],
  [
    "strike(`)`) + `1_b.` + bold·italic(`(`)",
    [strike(")"), { text: "1_b." }, boldItalic("(")],
  ],
  [
    "strike(`)`) + `가_나.` + bold·italic(`(`)",
    [strike(")"), { text: "가_나." }, boldItalic("(")],
  ],
];

// 수정 전에도 왕복이 통과한다. 출력 변경 입력이라 왕복 보존만 확인한다(문자열은 OUTPUT_CASES가 고정한다).
const ROUND_TRIP_ONLY_CASES: readonly Case[] = [
  // 뒤 마크가 italic만이어도 `_`는 `\_`로 나간다.
  [
    "strike(`)`) + `a_b.` + italic(`(`)",
    [strike(")"), { text: "a_b." }, run("(", [ITALIC])],
  ],
  // 첫 글자가 문자 참조로 바뀌지 않아도 `_`는 `\_`로 나간다.
  ["strike(`a`) + `b_c`", [strike("a"), { text: "b_c" }]],
];

// 거울 방향이다. strike가 italic 안쪽에 있어 text 뒤 `info.after`가 `~`다.
const MIRROR_CASES: readonly Case[] = [
  [
    "bold·italic(`xa_b`) + bold·italic·strike(`~`)",
    [boldItalic("xa_b"), run("~", [BOLD, ITALIC, STRIKE])],
  ],
  [
    "bold(`.`) + italic(`ab_c`) + italic·strike(`_`)",
    [run(".", [BOLD]), run("ab_c", [ITALIC]), run("_", [ITALIC, STRIKE])],
  ],
];

const OUTPUT_CASES: readonly OutputCase[] = [
  [
    "strike(`)`) + `a_b.` + bold·italic(`(`)",
    [strike(")"), { text: "a_b." }, boldItalic("(")],
    "~~)~~&#x61;\\_b.**_(_**\n",
  ],
  [
    "strike(`)`) + `a_b.` + italic(`(`)",
    [strike(")"), { text: "a_b." }, run("(", [ITALIC])],
    "~~)~~&#x61;\\_b.*(*\n",
  ],
  ["strike(`a`) + `b_c`", [strike("a"), { text: "b_c" }], "~~a~~b\\_c\n"],
  [
    "bold·italic(`xa_b`) + bold·italic·strike(`~`)",
    [boldItalic("xa_b"), run("~", [BOLD, ITALIC, STRIKE])],
    "**_xa\\_&#x62;~~\\~~~_**\n",
  ],
];

// 앞 마크만 다르고 뒤 text 모양은 (a)와 같다. 수정 전 출력이 곧 기대값이다.
const CONTROL_CASES: readonly OutputCase[] = [
  [
    "bold(`)`) + `a_b.` + bold·italic(`(`)",
    [run(")", [BOLD]), { text: "a_b." }, boldItalic("(")],
    "**)**&#x61;\\_b.**_(_**\n",
  ],
  [
    "italic(`)`) + `a_b.` + bold(`(`)",
    [run(")", [ITALIC]), { text: "a_b." }, run("(", [BOLD])],
    "*)*&#x61;\\_b.**(**\n",
  ],
  [
    "`)` + `a_b.` + bold(`(`)",
    [{ text: ")a_b." }, run("(", [BOLD])],
    ")a_b.**(**\n",
  ],
];

// `_`이 둘째 자리가 아니거나 strike 안쪽·앞에 있어 수정 전과 출력이 같은 입력이다.
const UNCHANGED_CASES: readonly OutputCase[] = [
  [
    "strike(`)`) + `ab_c.` + bold·italic(`(`)",
    [strike(")"), { text: "ab_c." }, boldItalic("(")],
    "~~)~~&#x61;b_c.**_(_**\n",
  ],
  [
    "strike(`a_b.`) + bold·italic(`(`)",
    [strike("a_b."), boldItalic("(")],
    "~~a_b.~~**_(_**\n",
  ],
  [
    "`x` + strike(`a_b.`) + bold·italic(`(`)",
    [{ text: "x" }, strike("a_b."), boldItalic("(")],
    "x~~a_b.~~**_(_**\n",
  ],
];

describe("strike 뒤 평문 둘째 글자 `_`의 직렬화", () => {
  it.each(BROKEN_CASES)(
    "문단의 %s는 strict 내보내기가 성공하고 재가져오기가 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it.each(ROUND_TRIP_ONLY_CASES)(
    "문단의 %s는 출력이 바뀌어도 재가져오기가 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it.each(MIRROR_CASES)(
    "문단의 거울 방향 %s는 strict 내보내기가 성공하고 재가져오기가 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it("표 셀의 strike(`)`) + `a_b.` + bold·italic(`(`)도 글자와 mark를 보존한다", () => {
    const content: InlineContent = [
      strike(")"),
      { text: "a_b." },
      boldItalic("("),
    ];
    const markdown = strictMarkdown(tableCellDocument(content));

    expect(importedRuns(markdown)).toEqual(content);
  });

  it.each(OUTPUT_CASES)(
    "%s의 출력 문자열을 고정한다",
    (_label, content, expected) => {
      expect(strictMarkdown(paragraphDocument(content))).toBe(expected);
    },
  );

  describe("대조군: 앞 마크가 strike가 아니면 출력이 바뀌지 않는다", () => {
    it.each(CONTROL_CASES)(
      "%s의 출력은 수정 전과 같다",
      (_label, content, expected) => {
        expect(strictMarkdown(paragraphDocument(content))).toBe(expected);
      },
    );
  });

  describe("불변 입력: 둘째 글자가 `_`인 strike 뒤 평문이 아니면 출력이 바뀌지 않는다", () => {
    it.each(UNCHANGED_CASES)(
      "%s의 출력은 수정 전과 같다",
      (_label, content, expected) => {
        const markdown = strictMarkdown(paragraphDocument(content));

        expect(markdown).toBe(expected);
        expect(importedRuns(markdown)).toEqual(content);
      },
    );
  });
});
