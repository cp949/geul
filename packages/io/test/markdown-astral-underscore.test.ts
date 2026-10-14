/**
 * 구분자 옆 astral 글자(U+10000 이상) 앞뒤의 `_`가 왕복에서 보존되는지 검증한다(Issue #414).
 * mdast-util-to-markdown 2.2.0의 `util/safe.js`는 구분자 옆 글자가 문자 참조로 바뀔 수 있어 intraword `_`로 치지 않는다.
 * - 앞쪽은 `position - 1 === offset`, 뒤쪽은 `sequenceEnd === end - 1`로 판정한다.
 * - 두 인덱스가 UTF-16 코드 유닛이다. astral 글자(2유닛)가 첫·끝에 오면 판정을 비껴가 `_`가 이스케이프되지 않는다.
 * - `~~)~~&#x1D41A;_b.**_(_**`에서 `;_b`의 `_`가 여는 구분자로 읽혀 재가져오기에서 글자·mark가 달라진다.
 * text 핸들러가 `state.safe`에 넘기는 값의 astral 글자를 U+E000으로 바꾸고, 결과에서 원래 글자로 되돌려 해소한다.
 * - U+E000은 BMP 사설 영역 글자다. micromark의 글자 분류가 서로게이트 코드 유닛과 같아 판정 결과는 BMP 글자와 같다.
 * - 되돌릴 때 astral 글자 순서를 유지한다.
 * 단언은 네 가지다.
 * - strict 내보내기가 성공하고 재가져온 글자 런이 원본과 글자·mark 모두 같다.
 * - 이슈 입력 A·B와 `😀_b.`의 출력 문자열을 고정한다. `&#x1D41A;\_b`처럼 `\_`가 붙는다.
 * - 대조군(BMP 글자, 구분자 옆이 아닌 astral, 중간 astral)은 수정 전과 출력이 같음을 문자열로 고정한다.
 * - 입력에 U+E000이 있으면 치환을 건너뛴다. 글자가 손상되지 않고 astral도 U+E000으로 바뀌지 않는다.
 *   - 한계: 이때는 #414가 남는다. astral 옆 `_`가 이스케이프되지 않아 재가져오기가 깨질 수 있다. 그 출력을 문자열로 고정한다.
 *   - U+E000과 구분자 옆 astral 뒤 `_`가 한 text에 겹치는 글은 드물어 이 한계를 받아들였다.
 * mark 달린 빈 런(#393)은 입력에 쓰지 않는다.
 */
import type { InlineContent } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  BOLD,
  bold,
  boldItalic,
  importedRuns,
  ITALIC,
  italic,
  paragraphDocument,
  run,
  STRIKE,
  strictMarkdown,
  tableCellDocument,
} from "./markdown-inline-run-support.js";

/**
 * 입력 content 하나를 묶은 케이스다. 재가져오기 뒤 글자 런은 입력과 같아야 한다.
 */
type Case = readonly [string, InlineContent];

/**
 * 입력 content와 기대 출력 문자열을 묶은 케이스다.
 */
type OutputCase = readonly [string, InlineContent, string];

// 이슈 입력 A다. strike 뒤 평문의 첫 글자가 astral이다.
const ISSUE_A: InlineContent = [
  run(")", [STRIKE]),
  { text: "𝐚_b." },
  boldItalic("("),
];

// 이슈 입력 B다. 거울 방향이다. bold·italic 안 text의 마지막 글자가 astral이고 뒤에 strike가 온다.
const ISSUE_B: InlineContent = [
  boldItalic("xa_𝐛"),
  run("~", [BOLD, ITALIC, STRIKE]),
];

// 첫 글자가 astral이고 둘째 글자가 `_`인 평문이다. 앞 마크만 다르다.
const EMOJI_CASES: readonly OutputCase[] = [
  [
    "strike(`)`) + `😀_b.` + bold·italic(`(`)",
    [run(")", [STRIKE]), { text: "😀_b." }, boldItalic("(")],
    "~~)~~&#x1F600;\\_b.**_(_**\n",
  ],
  [
    "bold(`)`) + `😀_b.` + bold·italic(`(`)",
    [bold(")"), { text: "😀_b." }, boldItalic("(")],
    "**)**&#x1F600;\\_b.**_(_**\n",
  ],
  [
    "italic(`)`) + `😀_b.` + bold·italic(`(`)",
    [italic(")"), { text: "😀_b." }, boldItalic("(")],
    "*)*&#x1F600;\\_b.**_(_**\n",
  ],
];

// astral 글자가 여러 개 든 text다. 되돌린 글자 순서가 맞아야 출력과 재가져오기가 기대와 같다.
const MULTI_ASTRAL_CASES: readonly OutputCase[] = [
  [
    "strike(`)`) + `😀_𝐛.` + bold·italic(`(`)",
    [run(")", [STRIKE]), { text: "😀_𝐛." }, boldItalic("(")],
    "~~)~~&#x1F600;\\_𝐛.**_(_**\n",
  ],
  [
    "strike(`)`) + `😀_b𝐜😀.` + bold·italic(`(`)",
    [run(")", [STRIKE]), { text: "😀_b𝐜😀." }, boldItalic("(")],
    "~~)~~&#x1F600;\\_b𝐜😀.**_(_**\n",
  ],
  [
    "strike(`)`) + `😀𝐚_b𝐜😀.` + bold·italic(`(`)",
    [run(")", [STRIKE]), { text: "😀𝐚_b𝐜😀." }, boldItalic("(")],
    "~~)~~&#x1F600;𝐚_b𝐜😀.**_(_**\n",
  ],
  [
    "bold·italic(`x😀a_𝐛`) + bold·italic·strike(`~`)",
    [boldItalic("x😀a_𝐛"), run("~", [BOLD, ITALIC, STRIKE])],
    "**_x😀a\\_&#x1D41B;~~\\~~~_**\n",
  ],
];

// 구분자 옆 astral 뒤 `_`가 아니어서 수정 전과 출력이 같은 입력이다.
const CONTROL_CASES: readonly OutputCase[] = [
  [
    "strike(`)`) + BMP `a_b.` + bold·italic(`(`)",
    [run(")", [STRIKE]), { text: "a_b." }, boldItalic("(")],
    "~~)~~&#x61;\\_b.**_(_**\n",
  ],
  [
    "bold·italic(`xa_b`) + bold·italic·strike(`~`)",
    [boldItalic("xa_b"), run("~", [BOLD, ITALIC, STRIKE])],
    "**_xa\\_&#x62;~~\\~~~_**\n",
  ],
  [
    "구분자 옆이 아닌 astral `ab_𝐛.`",
    [run(")", [STRIKE]), { text: "ab_𝐛." }, boldItalic("(")],
    "~~)~~&#x61;b_𝐛.**_(_**\n",
  ],
  [
    "구분자 옆이 아닌 astral `a😀b_c.`",
    [run(")", [STRIKE]), { text: "a😀b_c." }, boldItalic("(")],
    "~~)~~&#x61;😀b_c.**_(_**\n",
  ],
  ["구분자가 없는 BMP `a_b.`", [{ text: "a_b." }], "a_b.\n"],
  ["구분자가 없는 중간 astral `a😀b`", [{ text: "a😀b" }], "a😀b\n"],
  ["구분자가 없는 중간 astral `a_𝐛_c`", [{ text: "a_𝐛_c" }], "a_𝐛_c\n"],
  [
    "구분자 앞 중간 astral `x😀y_z` + bold(`w`)",
    [{ text: "x😀y_z" }, bold("w")],
    "x😀y\\_z**w**\n",
  ],
];

// 입력에 U+E000이 있어 치환을 건너뛴다. 글자는 손상되지 않는다.
const PRIVATE_USE_CASES: readonly OutputCase[] = [
  ["U+E000만 든 `\\uE000_b.`", [{ text: "\uE000_b." }], "\uE000_b.\n"],
  [
    "strike(`)`) + `\\uE000𝐚_b.` + bold·italic(`(`)",
    [run(")", [STRIKE]), { text: "\uE000𝐚_b." }, boldItalic("(")],
    "~~)~~&#xE000;𝐚_b.**_(_**\n",
  ],
];

// 한계(#414 잔존)다. U+E000이 든 text는 astral을 치환하지 않아 구분자 옆 astral 뒤 `_`가 이스케이프되지 않는다.
const PRIVATE_USE_LIMIT: OutputCase = [
  "strike(`)`) + `𝐚_b\\uE000.` + bold·italic(`(`)",
  [run(")", [STRIKE]), { text: "𝐚_b\uE000." }, boldItalic("(")],
  "~~)~~&#x1D41A;_b\uE000.**_(_**\n",
];

describe("구분자 옆 astral 글자 뒤 `_`의 직렬화", () => {
  it("문단의 이슈 입력 A는 strict 내보내기가 성공하고 출력이 `\\_`를 가진다", () => {
    const markdown = strictMarkdown(paragraphDocument(ISSUE_A));

    expect(markdown).toBe("~~)~~&#x1D41A;\\_b.**_(_**\n");
    expect(importedRuns(markdown)).toEqual(ISSUE_A);
  });

  it("문단의 이슈 입력 B는 strict 내보내기가 성공하고 출력이 `a\\_&#x1D41B;`를 가진다", () => {
    const markdown = strictMarkdown(paragraphDocument(ISSUE_B));

    expect(markdown).toContain("a\\_&#x1D41B;");
    expect(importedRuns(markdown)).toEqual(ISSUE_B);
  });

  it.each(EMOJI_CASES)(
    "문단의 %s는 출력을 고정하고 재가져오기가 글자와 mark를 보존한다",
    (_label, content, expected) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(markdown).toBe(expected);
      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it.each<Case>([
    ["이슈 입력 A", ISSUE_A],
    ["이슈 입력 B", ISSUE_B],
    ["strike(`)`) + `😀_b.` + bold·italic(`(`)", EMOJI_CASES[0]?.[1] ?? []],
  ])("표 셀의 %s도 재가져오기가 글자와 mark를 보존한다", (_label, content) => {
    const markdown = strictMarkdown(tableCellDocument(content));

    expect(importedRuns(markdown)).toEqual(content);
  });

  describe("astral 글자가 여러 개 든 text는 되돌린 글자 순서가 맞다", () => {
    it.each(MULTI_ASTRAL_CASES)(
      "%s의 출력을 고정하고 재가져오기가 글자와 mark를 보존한다",
      (_label, content, expected) => {
        const markdown = strictMarkdown(paragraphDocument(content));

        expect(markdown).toBe(expected);
        expect(importedRuns(markdown)).toEqual(content);
      },
    );
  });

  describe("대조군: 구분자 옆 astral 뒤 `_`가 아니면 출력이 바뀌지 않는다", () => {
    it.each(CONTROL_CASES)(
      "%s의 출력은 수정 전과 같다",
      (_label, content, expected) => {
        const markdown = strictMarkdown(paragraphDocument(content));

        expect(markdown).toBe(expected);
        expect(importedRuns(markdown)).toEqual(content);
      },
    );
  });

  describe("입력에 U+E000이 있으면 치환을 건너뛰고 글자가 손상되지 않는다", () => {
    it.each(PRIVATE_USE_CASES)(
      "%s의 출력을 고정하고 재가져오기가 글자와 mark를 보존한다",
      (_label, content, expected) => {
        const markdown = strictMarkdown(paragraphDocument(content));

        expect(markdown).toBe(expected);
        expect(importedRuns(markdown)).toEqual(content);
      },
    );

    it("astral 글자는 U+E000으로 바뀌지 않고 문자 참조로 나가며 글자 순서가 유지된다", () => {
      const content: InlineContent = [
        run(")", [STRIKE]),
        { text: "\uE000😀𝐚." },
        boldItalic("("),
      ];
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(markdown).toBe("~~)~~&#xE000;😀𝐚.**_(_**\n");
      expect(importedRuns(markdown)).toEqual(content);
    });

    it("알려진 한계: U+E000이 든 text의 구분자 옆 astral 뒤 `_`는 이스케이프되지 않는다(#414 잔존)", () => {
      const [, content, expected] = PRIVATE_USE_LIMIT;

      expect(strictMarkdown(paragraphDocument(content))).toBe(expected);
    });
  });
});
