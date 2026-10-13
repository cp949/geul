/**
 * 같은 mark를 가진 인접 글자 런의 markdown 직렬화를 검증한다(Issue #395).
 * 런마다 mark 노드를 따로 감싸면 인접한 같은 mark 노드가 합쳐지지 않는다.
 * - strike(`delete`)와 code(`inlineCode`)는 `~~a~~~~b~~`, `` `a``b` ``처럼 나란히 나간다.
 *   재가져오기에서 구분자가 글자로 샌다.
 * - bold·italic·link는 mdast-util-to-markdown 2.2.0(#394)의 attention 처리 덕에 이미 왕복이 맞다.
 *   이 파일에서는 회귀 고정(대조)이다.
 * 출력은 인접한 같은 종류 mdast 노드를 한 구문으로 합친다.
 * 단언은 네 가지다.
 * - strict 내보내기가 성공한다.
 * - 재가져오기 글자 런이 기대와 같다. 합쳐지는 케이스는 `ab` 하나다. 합쳐지지 않는 케이스는 원본이다.
 * - 정확한 문자열은 strike 두 런 `~~ab~~\n` 한 건만 고정한다.
 * - 병합 함수 단위 단언이 노드 종류별 병합·재귀·입력 비변경을 고정한다.
 *   bold·italic·link는 병합 전에도 왕복이 맞아서 왕복 단언만으로는 병합 여부를 가르지 못한다.
 * mark 달린 빈 런은 입력에 쓰지 않는다(#393 EMPTY_MARKED_RUN 범위).
 */
import type {
  InlineContent,
  InlineContentItem,
  TextMark,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { mergeAdjacentInline } from "../src/markdown/merge-adjacent-inline.js";
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
const CODE: TextMark = { type: "code" };
const linkTo = (href: string): TextMark => ({ type: "link", href });

/**
 * 입력 content와, 재가져오기 뒤 기대하는 글자 런 목록을 묶은 케이스다.
 */
type Case = readonly [string, InlineContent, InlineContentItem[]];

/**
 * 같은 marks를 가진 두 런 `a`·`b`가 재가져오기에서 `ab` 하나가 되는 케이스를 만든다.
 */
const pairCase = (label: string, marks: TextMark[]): Case => [
  label,
  [run("a", marks), run("b", marks)],
  [run("ab", marks)],
];

const MERGED_CASES: readonly Case[] = [
  pairCase("strike 두 런", [STRIKE]),
  pairCase("code 두 런", [CODE]),
  pairCase("bold 두 런(대조)", [BOLD]),
  pairCase("italic 두 런(대조)", [ITALIC]),
  pairCase("같은 href의 link 두 런(대조)", [linkTo("https://a.com")]),
  [
    "strike 세 런",
    [run("a", [STRIKE]), run("b", [STRIKE]), run("c", [STRIKE])],
    [run("abc", [STRIKE])],
  ],
  [
    "공백이 낀 strike 두 런",
    [run("a", [STRIKE]), run(" b", [STRIKE])],
    [run("a b", [STRIKE])],
  ],
  [
    "backtick을 가진 code 두 런",
    [run("a`", [CODE]), run("b", [CODE])],
    [run("a`b", [CODE])],
  ],
];

/**
 * 일부만 겹치는 mark 조합이다. 글자와 mark가 원본 그대로 돌아와야 한다.
 */
const PARTIAL_OVERLAP_CASES: readonly Case[] = [
  [
    "bold·italic 런 + bold 런",
    [run("a", [BOLD, ITALIC]), run("b", [BOLD])],
    [run("a", [BOLD, ITALIC]), run("b", [BOLD])],
  ],
  [
    "bold 런 + bold·strike 런",
    [run("a", [BOLD]), run("b", [BOLD, STRIKE])],
    [run("a", [BOLD]), run("b", [BOLD, STRIKE])],
  ],
];

/**
 * 합치지 않는 케이스다. 출력이 바뀌지 않고 원본 런이 그대로 돌아온다.
 */
const UNMERGED_CASES: readonly Case[] = [
  [
    "평문이 사이에 낀 strike 두 런",
    [run("a", [STRIKE]), { text: "x" }, run("b", [STRIKE])],
    [run("a", [STRIKE]), { text: "x" }, run("b", [STRIKE])],
  ],
  [
    "href가 다른 link 두 런",
    [run("a", [linkTo("https://a.com")]), run("b", [linkTo("https://b.com")])],
    [run("a", [linkTo("https://a.com")]), run("b", [linkTo("https://b.com")])],
  ],
];

describe("인접한 같은 mark 런의 직렬화", () => {
  it.each(MERGED_CASES)(
    "%s: 문단에서 strict 내보내기가 성공하고 재가져오기가 한 런으로 합쳐 돌려준다",
    (_label, content, expected) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(expected);
    },
  );

  it.each(PARTIAL_OVERLAP_CASES)(
    "%s: 일부만 겹쳐도 글자와 mark를 보존한다",
    (_label, content, expected) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(expected);
    },
  );

  it.each(UNMERGED_CASES)(
    "%s: 합쳐지지 않고 원본 런을 보존한다",
    (_label, content, expected) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(expected);
    },
  );

  it("표 셀의 strike 두 런도 한 런으로 합쳐 돌려준다", () => {
    const markdown = strictMarkdown(
      tableCellDocument([run("a", [STRIKE]), run("b", [STRIKE])]),
    );

    expect(importedRuns(markdown)).toEqual([run("ab", [STRIKE])]);
  });

  it("strike 두 런의 출력 문자열은 `~~ab~~`다", () => {
    const markdown = strictMarkdown(
      paragraphDocument([run("a", [STRIKE]), run("b", [STRIKE])]),
    );

    expect(markdown).toBe("~~ab~~\n");
  });
});

type Node = {
  type: string;
  value?: string;
  url?: string;
  children?: Node[];
};

const text = (value: string): Node => ({ type: "text", value });
const wrap = (type: string, children: Node[], url?: string): Node =>
  url === undefined ? { type, children } : { type, url, children };

/**
 * 객체 트리를 재귀로 얼려 변경 시도가 던지게 한다.
 */
const deepFreeze = <T extends object>(value: T): T => {
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) deepFreeze(child);
  }
  return Object.freeze(value);
};

describe("mergeAdjacentInline", () => {
  it.each(["strong", "emphasis", "delete"])(
    "인접한 %s 두 개의 자식을 이어 붙여 하나로 합친다",
    (type) => {
      const merged = mergeAdjacentInline([
        wrap(type, [text("a")]),
        wrap(type, [text("b")]),
      ]);

      expect(merged).toEqual([wrap(type, [text("a"), text("b")])]);
    },
  );

  it("url이 같은 link 두 개는 합치고 url이 다르면 합치지 않는다", () => {
    const same = mergeAdjacentInline([
      wrap("link", [text("a")], "https://a.com"),
      wrap("link", [text("b")], "https://a.com"),
    ]);
    const different = mergeAdjacentInline([
      wrap("link", [text("a")], "https://a.com"),
      wrap("link", [text("b")], "https://b.com"),
    ]);

    expect(same).toEqual([
      wrap("link", [text("a"), text("b")], "https://a.com"),
    ]);
    expect(different).toHaveLength(2);
  });

  it("inlineCode 두 개는 값을 이어 붙이고 text 두 개는 합치지 않는다", () => {
    const code = mergeAdjacentInline([
      { type: "inlineCode", value: "a" },
      { type: "inlineCode", value: "b" },
    ]);
    const plain = mergeAdjacentInline([text("a"), text("b")]);

    expect(code).toEqual([{ type: "inlineCode", value: "ab" }]);
    expect(plain).toEqual([text("a"), text("b")]);
  });

  it("합친 자식 안의 인접 노드도 다시 합친다", () => {
    const merged = mergeAdjacentInline([
      wrap("strong", [wrap("delete", [text("a")])]),
      wrap("strong", [wrap("delete", [text("b")])]),
    ]);

    expect(merged).toEqual([
      wrap("strong", [wrap("delete", [text("a"), text("b")])]),
    ]);
  });

  it("종류가 다른 인접 노드는 합치지 않고 입력 트리를 바꾸지 않는다", () => {
    const input = deepFreeze([
      wrap("strong", [text("a")]),
      wrap("emphasis", [text("b")]),
      wrap("strong", [text("c")]),
      wrap("strong", [text("d")]),
    ]);

    const merged = mergeAdjacentInline(input);

    expect(merged).toEqual([
      wrap("strong", [text("a")]),
      wrap("emphasis", [text("b")]),
      wrap("strong", [text("c"), text("d")]),
    ]);
  });
});
