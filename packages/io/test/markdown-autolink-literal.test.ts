/**
 * Markdown 가져오기가 GFM autolink literal을 link 마크로 만들지 않는지 검증한다(Issue #400).
 * remark-gfm은 맨몸 `http(s)://…`, `www.…`, 이메일을 mdast `link`로 바꾼다.
 * - 내보내기의 `\:`·`\.`·`\@` 이스케이프는 재가져오기에서 풀려 효과가 없다.
 * - 그래서 평문 content가 왕복 뒤 link 마크를 얻는다.
 * - 가져오기는 맨몸 literal을 평문으로 둔다. 명시 링크 `[t](u)`·`<u>`는 그대로 link다.
 * 단언은 일곱 가지다.
 * - strict 왕복 뒤 content가 원본과 같고 경고가 없다.
 * - 맨몸 URL이 앞뒤 글자와 한 평문 런으로 합쳐진다.
 * - 표 셀, 제목, 목록 항목, quote, bold 안에서도 같다. bold 안은 bold 마크만 붙는다.
 * - href가 무효인 맨몸 입력(`http://.` + NBSP)도 가져오기가 실패하지 않는다.
 * - 대조군: `<url>`, `<이메일>`, `[t](u)`, 참조 링크는 link로 남고 href가 바뀌지 않는다.
 * - 선두 BOM이 붙은 문서에서도 명시 링크는 link, literal은 평문이다(offset은 BOM을 뺀 기준).
 * - 깊은 중첩 입력에서도 크래시 없이 성공한다.
 */
import type { InlineContent } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importMarkdown } from "../src/index.js";
import {
  buildNestedBlockquoteMarkdown,
  buildNestedEmphasisMarkdown,
} from "./markdown-depth-support.js";
import {
  importedRuns,
  paragraphDocument,
  run,
  strictMarkdown,
  tableCellDocument,
} from "./markdown-inline-run-support.js";
import { importOk } from "./markdown-round-trip-support.js";

const NBSP = String.fromCharCode(0xa0);
const BOM = String.fromCharCode(0xfeff);

const LITERALS = ["https://a.com", "www.a.com", "a@b.com"] as const;

/**
 * 문서 전체 JSON에 link 마크가 하나라도 있는지 본다.
 */
const hasLinkMark = (value: unknown): boolean =>
  JSON.stringify(value).includes('"type":"link"');

/**
 * 맨몸 literal을 담은 문맥 케이스다. 소스 생성기와 기대 content 생성기를 묶는다.
 */
type ContextCase = readonly [
  string,
  (literal: string) => string,
  (literal: string) => InlineContent,
];

const CONTEXT_CASES: readonly ContextCase[] = [
  [
    "표 셀",
    (literal) => `| ${literal} |\n| --- |`,
    (literal) => [{ text: literal }],
  ],
  ["제목", (literal) => `## ${literal}`, (literal) => [{ text: literal }]],
  ["목록 항목", (literal) => `- ${literal}`, (literal) => [{ text: literal }]],
  ["quote", (literal) => `> ${literal}`, (literal) => [{ text: literal }]],
  [
    "bold",
    (literal) => `**${literal}**`,
    (literal) => [run(literal, [{ type: "bold" }])],
  ],
];

describe("strict 왕복", () => {
  it.each([
    ["URL", "see https://example.com now"],
    ["www", "www.example.com"],
    ["이메일", "mail a@b.com"],
  ])(
    "평문 %s content가 내보내기→가져오기 뒤 원본과 같고 경고가 없다",
    (_label, text) => {
      const content: InlineContent = [{ text }];
      const markdown = strictMarkdown(paragraphDocument(content));

      expect(importedRuns(markdown)).toEqual(content);
      expect(importOk(markdown).warnings).toEqual([]);
    },
  );

  it("text와 href가 같은 link 마크는 왕복 뒤에도 link다", () => {
    const content: InlineContent = [
      run("https://a.com", [{ type: "link", href: "https://a.com" }]),
    ];
    const markdown = strictMarkdown(paragraphDocument(content));

    expect(importedRuns(markdown)).toEqual(content);
  });

  it("표 셀 안 평문 URL도 왕복 뒤 원본과 같다", () => {
    const content: InlineContent = [{ text: "see https://example.com now" }];
    const markdown = strictMarkdown(tableCellDocument(content));

    expect(importedRuns(markdown)).toEqual(content);
  });
});

describe("맨몸 literal 가져오기", () => {
  it.each(LITERALS)("%s는 link 마크 없는 평문이다", (literal) => {
    expect(importedRuns(literal)).toEqual([{ text: literal }]);
  });

  it.each(LITERALS)("앞뒤 글자와 한 평문 런으로 합쳐진다: %s", (literal) => {
    expect(importedRuns(`see ${literal} now`)).toEqual([
      { text: `see ${literal} now` },
    ]);
  });

  it("끝 구두점은 글자 그대로 한 런에 남는다", () => {
    expect(importedRuns("a https://a.com/x_(y).")).toEqual([
      { text: "a https://a.com/x_(y)." },
    ]);
  });

  it("이스케이프가 낀 literal은 position 없는 link 경로여도 평문이다", () => {
    expect(importedRuns("see https\\://a.com now")).toEqual([
      { text: "see https://a.com now" },
    ]);
  });

  it("backslash로 연 `<` 뒤 URL도 평문이다", () => {
    expect(importedRuns("\\<https://a.com")).toEqual([
      { text: "<https://a.com" },
    ]);
  });
});

describe("문맥별 맨몸 literal", () => {
  const rows = CONTEXT_CASES.flatMap(([label, source, expected]) =>
    LITERALS.map((literal) => [label, literal, source, expected] as const),
  );

  it.each(rows)("%s 안 %s는 link 없이 평문이다", (_l, literal, src, exp) => {
    const runs = importedRuns(src(literal));

    expect(runs).toEqual(exp(literal));
    expect(hasLinkMark(runs)).toBe(false);
  });
});

describe("href가 무효인 맨몸 입력", () => {
  it.each([
    ["문단", `http://.${NBSP}`],
    ["제목", `## http://.${NBSP}`],
  ])("%s의 `http://.` + NBSP는 실패 없이 평문으로 들어온다", (_label, src) => {
    const { document } = importOk(src);

    expect(hasLinkMark(document)).toBe(false);
    expect(importedRuns(src)).toEqual([{ text: `http://.${NBSP}` }]);
  });
});

describe("명시 링크 대조군", () => {
  it.each([
    ["<url>", "<https://a.com>", "https://a.com", "https://a.com"],
    ["<이메일>", "<a@b.com>", "a@b.com", "mailto:a@b.com"],
    ["[t](u)", "[t](https://a.com)", "t", "https://a.com"],
    [
      "text가 URL인 [t](u)",
      "[https://a.com](https://b.com)",
      "https://a.com",
      "https://b.com",
    ],
  ])("%s는 link로 남고 href가 같다", (_label, src, text, href) => {
    expect(importedRuns(src)).toEqual([run(text, [{ type: "link", href }])]);
  });

  it("참조 링크는 link로 남는다", () => {
    expect(importedRuns("[g][d]\n\n[d]: https://a.com")).toEqual([
      run("g", [{ type: "link", href: "https://a.com" }]),
    ]);
  });

  it("평문 URL과 명시 링크가 섞이면 명시 링크만 link다", () => {
    expect(importedRuns("https://a.com [t](https://b.com) www.c.com")).toEqual([
      { text: "https://a.com " },
      run("t", [{ type: "link", href: "https://b.com" }]),
      { text: " www.c.com" },
    ]);
  });
});

describe("선두 BOM이 붙은 문서", () => {
  // remark는 선두 BOM을 떼고 파싱해 position offset이 BOM을 뺀 기준이다.
  it.each([
    ["<url>", `${BOM}<https://a.com>`, "https://a.com", "https://a.com"],
    ["<이메일>", `${BOM}<a@b.com>`, "a@b.com", "mailto:a@b.com"],
    ["[t](u)", `${BOM}[t](https://a.com)`, "t", "https://a.com"],
  ])("%s는 link로 남고 href가 같다", (_label, src, text, href) => {
    expect(importedRuns(src)).toEqual([run(text, [{ type: "link", href }])]);
  });

  it("글 중간의 명시 링크도 link로 남는다", () => {
    expect(importedRuns(`${BOM}x [t](https://a.com)`)).toEqual([
      { text: "x " },
      run("t", [{ type: "link", href: "https://a.com" }]),
    ]);
  });

  it("`<` 바로 뒤 이메일 literal은 평문이다", () => {
    const document = importOk(`${BOM}<a@b.com x`).document;
    expect(hasLinkMark(document)).toBe(false);
  });

  it.each(LITERALS)("맨몸 %s는 평문이다", (literal) => {
    expect(importedRuns(`${BOM}${literal}`)).toEqual([{ text: literal }]);
  });
});

describe("깊은 중첩", () => {
  it("깊이 캡을 넘는 blockquote 안 URL도 크래시 없이 성공한다", () => {
    const result = importMarkdown(
      buildNestedBlockquoteMarkdown(2000, "https://a.com"),
    );

    expect(result.ok).toBe(true);
  });

  it("깊이 캡을 넘는 emphasis 안 URL도 크래시 없이 성공한다", () => {
    const result = importMarkdown(
      buildNestedEmphasisMarkdown(2000, "https://a.com"),
    );

    expect(result.ok).toBe(true);
  });
});
