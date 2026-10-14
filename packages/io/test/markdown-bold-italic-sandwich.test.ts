/**
 * bold·italic 런이 이어질 때 `emphasis · strong[emphasis] · emphasis` 샌드위치의 왕복을 검증한다(Issue #415, #416).
 * 입력 `.`(bold) `a`(italic) `a`(bold·italic) `1`(italic)은 `**.***a****a****1*`로 나갔다.
 * - mdast는 strong[.], emphasis[a], strong[emphasis[a]], emphasis[1]이다.
 * - `mdast-util-to-markdown` 2.2.0의 탐욕 탐색이 `***` 연쇄를 못 푼다.
 * - 구분자 `*`이 연달아 붙어 재가져오기에서 닫는 구분자가 글자로 샌다.
 * - 앞 strong이 없는 `I X I X I`(#416 재현 B1)도 `*.****a****a****a****a*`로 나갔다.
 * `inlineNodes`가 `emphasis · strong[emphasis] · emphasis`를 `emphasis[…, strong[…], …]`로 끌어올려 해소한다.
 * 적용 조건은 둘이다. 모두 만족해야 한다.
 * - 인접 형제가 emphasis, strong(자식이 emphasis 하나), emphasis다. 앞 형제의 종류와 경계 글자는 보지 않는다.
 *   - 앞 형제가 없거나 strong이 아니거나 영숫자로 끝나도 끌어올린다.
 *   - 영숫자 경계 입력(`**a***a*__*a*__*1*`)도 끌어올린 출력으로 나간다. 왕복은 같다.
 * - 샌드위치와 그 이웃 노드에 astral 글자(U+10000 이상)가 없다. 있으면 끌어올리지 않는다.
 *   - 끌어올리면 astral 글자가 문자 참조(`&#x1F600;`)로 바뀌며 앞 `_`가 이스케이프되지 않는다(#414).
 *   - 수정 전에는 `_`로 닫는 emphasis가 astral 글자 뒤에 있어 왕복이 맞았다. 그 출력을 그대로 둔다.
 * 끌어올린 emphasis 뒤에 `strong[emphasis] · emphasis`가 이어지면 새 샌드위치가 생긴다.
 * 그래서 변화가 없을 때까지 끌어올림을 반복한다(고정점).
 * 단언은 네 가지다.
 * - strict 내보내기가 성공하고 재가져온 글자 런이 원본과 글자·mark 모두 같다.
 * - 정확한 출력 문자열을 몇 건 고정한다.
 * - 표 셀 안에서도 왕복이 같다.
 * - 불변 입력은 출력 문자열이 같다. 모양 밖 입력과 가드 창 안에 astral 글자가 든 샌드위치다.
 * - 가드 창 밖 astral 때문에 깨지는 알려진 입력은 `it.fails`로 둔다(#414). #414를 고치면 이 케이스가 실패해 제거 시점을 알린다.
 * 끌어올림 함수(`liftEmphasisSandwich`)는 노드 수준에서도 검증한다.
 * - 앞 형제가 없거나 strong이 아니거나 어떤 잎으로 끝나도 끌어올린다. 빈 children에서도 던지지 않는다.
 * - 겹친 샌드위치는 한 번에 모두 끌어올린다.
 * - 입력 노드를 변경하지 않는다.
 * 문자 약어는 B(bold), I(italic), X(bold·italic), N(mark 없음), S(strike)다. `BS`는 bold·strike다.
 * mark 달린 빈 런(#393)은 입력에 쓰지 않는다.
 */
import type { InlineContent } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { liftEmphasisSandwich } from "../src/markdown/lift-emphasis-sandwich.js";
import {
  BOLD,
  bold,
  boldItalic,
  CODE,
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

/**
 * 첫 런 글자만 바꾼 `B I X I` 입력을 만든다. 나머지 글자는 `a`·`a`·`1`이다.
 */
const sandwich = (first: string): InlineContent => [
  bold(first),
  italic("a"),
  boldItalic("a"),
  italic("1"),
];

const BROKEN_CASES: readonly Case[] = [
  ["bold(`.`) + italic(`a`) + bold·italic(`a`) + italic(`1`)", sandwich(".")],
  ["첫 런 `!`", sandwich("!")],
  ["첫 런 `(`", sandwich("(")],
  ["첫 런 `_`", sandwich("_")],
  ["첫 런 `~`", sandwich("~")],
  ["첫 런 `*`", sandwich("*")],
];

// 길이 5 대표다. 앞이나 뒤에 런이 하나 더 붙어도 샌드위치가 깨지지 않아야 한다.
const LENGTH_FIVE_CASES: readonly Case[] = [
  [
    "X B I X I",
    [boldItalic("a"), bold("."), italic("a"), boldItalic("a"), italic("a")],
  ],
  [
    "N B I X I",
    [{ text: "a" }, bold("."), italic("a"), boldItalic("a"), italic("a")],
  ],
  [
    "B I X I N",
    [bold("."), italic("a"), boldItalic("a"), italic("a"), { text: "a" }],
  ],
];

// 앞 strong이 `strong[delete[a]]`로 끝나는 샌드위치다. 마지막 잎은 영숫자지만 직전 글자는 닫는 `~~`다.
const STRIKE_CASES: readonly Case[] = [
  [
    "BS I X I",
    [run("a", [BOLD, STRIKE]), italic("a"), boldItalic("a"), italic("1")],
  ],
  [
    "BS I XS I",
    [
      run("a", [BOLD, STRIKE]),
      italic("a"),
      run("a", [BOLD, ITALIC, STRIKE]),
      italic("1"),
    ],
  ],
  [
    "BS I X IS",
    [
      run("a", [BOLD, STRIKE]),
      italic("a"),
      boldItalic("a"),
      run("1", [ITALIC, STRIKE]),
    ],
  ],
];

// 끌어올린 emphasis 뒤에 `strong[emphasis] · emphasis`가 또 오는 겹친 샌드위치다.
// 한 번만 끌어올리면 `**.***a.**a**a****.****a*`처럼 `****` 연쇄가 남는다.
const FIXED_POINT_CASES: readonly Case[] = [
  [
    "B I(`a.`) X I X(`.`) I",
    [
      bold("."),
      italic("a."),
      boldItalic("a"),
      italic("a"),
      boldItalic("."),
      italic("a"),
    ],
  ],
  [
    "B I(`a.`) X I X I",
    [
      bold("."),
      italic("a."),
      boldItalic("a"),
      italic("a"),
      boldItalic("a"),
      italic("a"),
    ],
  ],
];

// 앞 strong은 영숫자로 끝나지만 head italic이 구두점으로 시작한다. 수정 전에는 `**a***.a****a****a*`로 나갔다.
const HEAD_PUNCTUATION_CASES: readonly Case[] = [
  [
    "B(`a`) I(`.a`) X I",
    [bold("a"), italic(".a"), boldItalic("a"), italic("a")],
  ],
  [
    "B I X I B I(`.a`) X I",
    [
      bold("."),
      italic("ab"),
      boldItalic("a"),
      italic("."),
      bold("a"),
      italic(".a"),
      boldItalic("a"),
      italic("a"),
    ],
  ],
];

// 앞 strong 조건 없이 모양만 맞는 샌드위치다(#416). 구분자 `*`이 연달아 붙어 재가져오기가 깨졌다.
const CHAIN_CASES: readonly Case[] = [
  [
    "재현 B1 I(`.`) X I X I",
    [italic("."), boldItalic("a"), italic("a"), boldItalic("a"), italic("a")],
  ],
  [
    "재현 B2 X(`.`) B I X I",
    [boldItalic("."), bold("a"), italic("a"), boldItalic("a"), italic("a")],
  ],
  ["앞 런이 없는 I X I", [italic("a"), boldItalic("a"), italic("a")]],
  [
    "앞이 평문인 N I X I",
    [{ text: "." }, italic("a"), boldItalic("a"), italic("a")],
  ],
];

// 샌드위치 text에 astral 글자가 있다. 끌어올리면 `_`가 이스케이프되지 않아(#414) 왕복이 깨진다.
const ASTRAL_CASES: readonly OutputCase[] = [
  [
    "B(`.`) I(`ab_😀`) X(`!`) I(`!`)",
    [bold("."), italic("ab_😀"), boldItalic("!"), italic("!")],
    "**.**_ab_😀_**_!_***!*\n",
  ],
];

// 앞 strong의 마지막 잎이 닫는 구분자를 가진 inlineCode·html이다.
const CODE_CASES: readonly Case[] = [
  [
    "bold·code(`.`) + italic(`a`) + bold·italic(`a`) + italic(`1`)",
    [run(".", [BOLD, CODE]), italic("a"), boldItalic("a"), italic("1")],
  ],
  [
    "bold·code(`a`) + italic(`a`) + bold·italic(`a`) + italic(`1`)",
    [run("a", [BOLD, CODE]), italic("a"), boldItalic("a"), italic("1")],
  ],
];

// 표 셀의 개행은 `<br>` html 노드로 나간다. 앞 bold가 `<br>`로 끝난다.
const HTML_BREAK_CASES: readonly Case[] = [
  [
    "bold(`.` + 개행) + italic(`a`) + bold·italic(`a`) + italic(`1`)",
    [bold(".\n"), italic("a"), boldItalic("a"), italic("1")],
  ],
  [
    "bold(`a` + 개행) + italic(`a`) + bold·italic(`a`) + italic(`1`)",
    [bold("a\n"), italic("a"), boldItalic("a"), italic("1")],
  ],
];

const OUTPUT_CASES: readonly OutputCase[] = [
  ["재현 B1 I(`.`) X I X I", CHAIN_CASES[0]?.[1] ?? [], "*.**a**a**a**a*\n"],
  [
    "재현 B2 X(`.`) B I X I",
    CHAIN_CASES[1]?.[1] ?? [],
    "***.*&#x61;***&#x61;__&#x61;__&#x61;*\n",
  ],
  [
    "bold(`.`) + italic(`a`) + bold·italic(`a`) + italic(`1`)",
    sandwich("."),
    "**.***&#x61;__&#x61;__&#x31;*\n",
  ],
  [
    "bold·strike(`a`) + italic(`a`) + bold·italic(`a`) + italic(`1`)",
    [run("a", [BOLD, STRIKE]), italic("a"), boldItalic("a"), italic("1")],
    "**~~a~~***&#x61;__&#x61;__&#x31;*\n",
  ],
  [
    "B I(`a.`) X I X(`.`) I",
    FIXED_POINT_CASES[0]?.[1] ?? [],
    "**.**_a.**a**&#x61;**.**&#x61;_\n",
  ],
  [
    "bold·code(`.`) + italic(`a`) + bold·italic(`a`) + italic(`1`)",
    CODE_CASES[0]?.[1] ?? [],
    "**`.`***&#x61;__&#x61;__&#x31;*\n",
  ],
  [
    "B(`a`) I(`.a`) X(`a`) I(`a`)",
    HEAD_PUNCTUATION_CASES[0]?.[1] ?? [],
    "**a**_.a**a**a_\n",
  ],
];

// 앞 strong의 끝 글자가 영숫자·한글이어도 모양이 맞으면 끌어올린다.
// 수정 전 출력은 `**a***a*__*a*__*1*`이었다.
const ALNUM_CASES: readonly OutputCase[] = [
  ["첫 런 `a`", sandwich("a"), "**a***a**a**1*\n"],
  ["첫 런 `가`", sandwich("가"), "**가***a**a**1*\n"],
  ["첫 런 `1`", sandwich("1"), "**1***a**a**1*\n"],
];

// 앞 strong의 마지막 자식이 delete가 아니거나 앞 strong이 없어도 모양이 맞으면 끌어올린다.
const STRIKE_LIFTED_CASES: readonly OutputCase[] = [
  [
    "delete가 마지막 자식이 아닌 BS B I X I",
    [
      run("a", [BOLD, STRIKE]),
      bold("b"),
      italic("a"),
      boldItalic("a"),
      italic("1"),
    ],
    "**~~a~~b***a**a**1*\n",
  ],
  [
    "delete가 emphasis 안인 XS I X I",
    [
      run("a", [BOLD, ITALIC, STRIKE]),
      italic("a"),
      boldItalic("a"),
      italic("1"),
    ],
    "__*~~a~~*__*a**a**1*\n",
  ],
  [
    "bold가 없는 S I X I",
    [run("a", [STRIKE]), italic("a"), boldItalic("a"), italic("1")],
    "~~a~~*a**a**1*\n",
  ],
];

// 앞이 strong이 아니어도 모양이 맞으면 끌어올린다. 수정 전 출력은 `.*a*__*a*__*1*`이었다.
const PLAIN_PREVIOUS_CASES: readonly OutputCase[] = [
  [
    "앞이 평문 `.`인 N I X I",
    [{ text: "." }, italic("a"), boldItalic("a"), italic("1")],
    ".*a**a**1*\n",
  ],
];

// 모양 밖이면 수정 전과 출력이 같다.
const OUTSIDE_SHAPE_CASES: readonly OutputCase[] = [
  [
    "뒤 italic이 없는 B I X",
    [bold("."), italic("a"), boldItalic("a")],
    "**.**_a_**_a_**\n",
  ],
  [
    "앞 italic이 없는 B X I",
    [bold("."), boldItalic("a"), italic("1")],
    "**.*a****1*\n",
  ],
  [
    "strong 자식이 둘인 B I X B I",
    [bold("."), italic("a"), boldItalic("a"), bold("b"), italic("1")],
    "**.**_a_***a*b***1*\n",
  ],
];

describe("bold·italic 연쇄 샌드위치의 직렬화", () => {
  it.each(BROKEN_CASES)(
    "문단의 %s는 strict 내보내기가 성공하고 재가져오기가 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it.each(LENGTH_FIVE_CASES)(
    "문단의 길이 5 %s는 재가져오기가 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it.each(STRIKE_CASES)(
    "문단의 앞 strong이 strike로 끝나는 %s는 재가져오기가 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it.each(FIXED_POINT_CASES)(
    "문단의 겹친 샌드위치 %s는 재가져오기가 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it("표 셀의 겹친 샌드위치 B I(`a.`) X I X(`.`) I도 글자와 mark를 보존한다", () => {
    const content = FIXED_POINT_CASES[0]?.[1] ?? [];
    const markdown = strictMarkdown(tableCellDocument(content));

    expect(importedRuns(markdown)).toEqual(content);
  });

  it.each(HEAD_PUNCTUATION_CASES)(
    "문단의 head가 구두점으로 시작하는 %s는 재가져오기가 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it.each(CHAIN_CASES)(
    "문단의 앞 strong 없는 샌드위치 %s는 재가져오기가 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it.each(CHAIN_CASES.slice(0, 2))(
    "표 셀의 앞 strong 없는 샌드위치 %s도 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(tableCellDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  describe("불변 입력: 샌드위치에 astral 글자가 있으면 출력이 바뀌지 않는다", () => {
    it.each(ASTRAL_CASES)(
      "%s의 출력은 수정 전과 같고 재가져오기가 글자와 mark를 보존한다",
      (_label, content, expected) => {
        const markdown = strictMarkdown(paragraphDocument(content));

        expect(markdown).toBe(expected);
        expect(importedRuns(markdown)).toEqual(content);
      },
    );
  });

  // 앞쪽 샌드위치(0–2)는 가드 창에 astral이 없어 끌어올려진다. astral이 든 뒤쪽 샌드위치(3–5, 6)는
  // 구분자 배치가 바뀌어 `_`가 이스케이프되지 않는다(#414). 수정 전에는 왕복이 맞았다.
  // #414를 고치면 이 케이스가 실패해 `it.fails`를 `it`으로 바꿀 시점을 알린다.
  it.fails(
    "가드 창 밖 astral이 든 뒤쪽 샌드위치가 있으면 왕복이 깨진다(#414)",
    () => {
      const content: InlineContent = [
        italic("_"),
        boldItalic("."),
        italic("a"),
        boldItalic("a_"),
        italic("𝐚"),
        boldItalic("a_"),
        italic("😀"),
      ];
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it.each(CODE_CASES)(
    "문단의 앞 strong이 inlineCode로 끝나는 %s는 재가져오기가 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it.each(HTML_BREAK_CASES)(
    "표 셀의 앞 bold가 `<br>`로 끝나는 %s는 재가져오기가 글자와 mark를 보존한다",
    (_label, content) => {
      const markdown = strictMarkdown(tableCellDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
    },
  );

  it("표 셀의 bold(`.`) + italic(`a`) + bold·italic(`a`) + italic(`1`)도 글자와 mark를 보존한다", () => {
    const content = sandwich(".");
    const markdown = strictMarkdown(tableCellDocument(content));

    expect(importedRuns(markdown)).toEqual(content);
  });

  it.each(OUTPUT_CASES)(
    "%s의 출력 문자열을 고정한다",
    (_label, content, expected) => {
      expect(strictMarkdown(paragraphDocument(content))).toBe(expected);
    },
  );

  describe("앞 strong이 영숫자·한글로 끝나도 끌어올린 출력으로 나간다", () => {
    it.each(ALNUM_CASES)(
      "%s의 출력을 고정하고 재가져오기가 글자와 mark를 보존한다",
      (_label, content, expected) => {
        const markdown = strictMarkdown(paragraphDocument(content));

        expect(markdown).toBe(expected);
        expect(importedRuns(markdown)).toEqual(content);
      },
    );
  });

  describe("앞 strong의 마지막 자식이 delete가 아니거나 앞 strong이 없어도 끌어올린 출력으로 나간다", () => {
    it.each(STRIKE_LIFTED_CASES)(
      "%s의 출력을 고정하고 재가져오기가 글자와 mark를 보존한다",
      (_label, content, expected) => {
        const markdown = strictMarkdown(paragraphDocument(content));

        expect(markdown).toBe(expected);
        expect(importedRuns(markdown)).toEqual(content);
      },
    );
  });

  describe("앞이 strong이 아니어도 끌어올린 출력으로 나간다", () => {
    it.each(PLAIN_PREVIOUS_CASES)(
      "%s의 출력을 고정하고 재가져오기가 글자와 mark를 보존한다",
      (_label, content, expected) => {
        const markdown = strictMarkdown(paragraphDocument(content));

        expect(markdown).toBe(expected);
        expect(importedRuns(markdown)).toEqual(content);
      },
    );
  });

  describe("불변 입력: 모양 밖이면 출력이 바뀌지 않는다", () => {
    it.each(OUTSIDE_SHAPE_CASES)(
      "%s의 출력은 수정 전과 같다",
      (_label, content, expected) => {
        const markdown = strictMarkdown(paragraphDocument(content));

        expect(markdown).toBe(expected);
        expect(importedRuns(markdown)).toEqual(content);
      },
    );
  });

  describe("liftEmphasisSandwich 노드 수준", () => {
    type Node = {
      type: string;
      value?: string;
      children?: Node[];
    };

    /**
     * 글자 하나를 가진 text 노드를 만든다.
     */
    const text = (value: string): Node => ({ type: "text", value });

    /**
     * 자식을 가진 노드를 만든다.
     */
    const node = (type: string, ...children: Node[]): Node => ({
      type,
      children,
    });

    /**
     * `emphasis · strong[emphasis] · emphasis` 세 노드를 만든다.
     */
    const sandwichNodes = (): Node[] => [
      node("emphasis", text("a")),
      node("strong", node("emphasis", text("b"))),
      node("emphasis", text("c")),
    ];

    /**
     * 끌어올린 결과 emphasis 노드를 만든다.
     */
    const liftedNode = (): Node =>
      node("emphasis", text("a"), node("strong", text("b")), text("c"));

    it("앞 형제가 없어도 emphasis 하나로 끌어올린다", () => {
      expect(liftEmphasisSandwich(sandwichNodes())).toEqual([liftedNode()]);
    });

    it("앞 형제가 strong이 아닌 노드여도 끌어올린다", () => {
      for (const previous of [
        text("."),
        node("emphasis", text("x")),
        node("delete", text("x")),
        { type: "inlineCode", value: "x" },
      ]) {
        expect(liftEmphasisSandwich([previous, ...sandwichNodes()])).toEqual([
          previous,
          liftedNode(),
        ]);
      }
    });

    it("앞 strong의 끝 글자와 head의 첫 글자를 보지 않고 끌어올린다", () => {
      const previousStrongs = [
        node("strong", text(".")),
        node("strong", text("a")),
        node("strong", node("delete", text("a"))),
        node("strong", node("emphasis", node("delete", text("a")))),
        node("strong", { type: "inlineCode", value: "a" }),
        node("strong", text("a"), { type: "html", value: "<br>" }),
      ];

      for (const previous of previousStrongs) {
        expect(liftEmphasisSandwich([previous, ...sandwichNodes()])).toEqual([
          previous,
          liftedNode(),
        ]);
      }
      expect(
        liftEmphasisSandwich([
          node("strong", text("a")),
          node("emphasis", text(".a")),
          node("strong", node("emphasis", text("b"))),
          node("emphasis", text("c")),
        ]),
      ).toEqual([
        node("strong", text("a")),
        node("emphasis", text(".a"), node("strong", text("b")), text("c")),
      ]);
    });

    it("앞 strong의 마지막 잎이 break이거나 빈 text여도 끌어올린다", () => {
      for (const previous of [
        node("strong", text("a"), { type: "break" }),
        node("strong", text("")),
        node("strong", node("delete", text(""))),
      ]) {
        expect(liftEmphasisSandwich([previous, ...sandwichNodes()])).toEqual([
          previous,
          liftedNode(),
        ]);
      }
    });

    it("샌드위치나 앞 strong, 뒤 형제에 astral 글자가 있으면 적용하지 않는다", () => {
      const astral = text("😀");
      const cases = [
        [node("strong", text(".")), node("emphasis", astral)],
        [node("strong", text(".")), node("emphasis", text("a"))],
      ];
      const [headCase, bodyCase] = cases as [Node[], Node[]];
      const withHead = [
        ...headCase,
        node("strong", node("emphasis", text("b"))),
        node("emphasis", text("c")),
      ];
      const withStrong = [
        ...bodyCase,
        node("strong", node("emphasis", astral)),
        node("emphasis", text("c")),
      ];
      const withTail = [
        ...bodyCase,
        node("strong", node("emphasis", text("b"))),
        node("emphasis", astral),
      ];
      const withPrevious = [
        node("strong", astral, text(".")),
        ...sandwichNodes(),
      ];
      const withNext = [node("strong", text(".")), ...sandwichNodes(), astral];

      for (const nodes of [
        withHead,
        withStrong,
        withTail,
        withPrevious,
        withNext,
      ]) {
        expect(liftEmphasisSandwich(nodes)).toEqual(nodes);
      }
    });

    it("끌어올린 emphasis 뒤에 샌드위치가 또 생기면 고정점까지 끌어올린다", () => {
      const nodes = [
        node("strong", text(".")),
        ...sandwichNodes(),
        node("strong", node("emphasis", text("d"))),
        node("emphasis", text("e")),
      ];

      expect(liftEmphasisSandwich(nodes)).toEqual([
        node("strong", text(".")),
        node(
          "emphasis",
          text("a"),
          node("strong", text("b")),
          text("c"),
          node("strong", text("d")),
          text("e"),
        ),
      ]);
    });

    it("앞 strong의 children이 빈 배열이어도 던지지 않고 끌어올린다", () => {
      const previous = node("strong");

      expect(liftEmphasisSandwich([previous, ...sandwichNodes()])).toEqual([
        previous,
        liftedNode(),
      ]);
    });

    it("빈 배열과 모양 밖 배열은 던지지 않고 그대로 돌려준다", () => {
      const outside = [
        node("emphasis", text("a")),
        node("strong", node("emphasis", text("b"))),
      ];

      expect(liftEmphasisSandwich([])).toEqual([]);
      expect(liftEmphasisSandwich(outside)).toEqual(outside);
    });

    it("빈 children과 빈 값 text로 된 샌드위치도 던지지 않는다", () => {
      const nodes = [
        node("emphasis"),
        node("strong", node("emphasis")),
        node("emphasis", text("")),
      ];

      expect(liftEmphasisSandwich(nodes)).toEqual([
        node("emphasis", node("strong"), text("")),
      ]);
    });

    it("입력 노드를 변경하지 않는다", () => {
      const nodes = [node("strong", text(".")), ...sandwichNodes()];
      const snapshot = structuredClone(nodes);

      liftEmphasisSandwich(nodes);

      expect(nodes).toEqual(snapshot);
    });
  });
});
