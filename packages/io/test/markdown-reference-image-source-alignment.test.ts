/**
 * Markdown 가져오기가 끊어진 참조 이미지를 소스와 글자 단위로 맞춰 평문으로 내리는지 검증한다(Issue #422).
 * - 끊어진 참조 이미지는 정의 없는 `![a][x]`·`![a]`·`![a][]`다. remark가 text로 남긴다.
 * - 이전에는 text 노드의 소스 조각 `raw`와 값 `value`가 통째로 같을 때만 읽었다.
 *   - 인용 `> `와 목록 들여쓰기는 줄마다 소스에 끼지만 값에는 없다.
 *   - 줄머리·줄끝 공백은 파서가 지운다. `\X` 이스케이프와 문자 참조는 값에서 풀린다.
 *   - 불일치하면 노드 전체가 경고 없이 물러나 `![a][x]`가 원문으로 남았다.
 * - 지금은 `import-markdown-source-alignment.ts`가 값과 소스를 글자 단위로 맞춘다.
 *   - 소스에 글자 그대로 있는 글자만 남긴 마스크 위에서 `!`, `[`, `]`를 구조로 읽는다.
 * 단언은 열세 가지다.
 * - 이슈 재현 세 입력이 `a [x]`와 `IMAGE_DOWNGRADED` 경고 1건을 낸다.
 * - 오라클: 컨테이너 안 결과가 컨테이너 없는 같은 내용의 결과와 텍스트·경고 종류가 같다.
 * - 구조 문자는 소스에 글자 그대로일 때만 구조다. alt·식별자 안의 이스케이프·문자 참조는 허용한다.
 * - 음성: 이스케이프·문자 참조로 만든 `!`, 코드 안은 평문 그대로이고 경고가 없다.
 * - 정의 있는 참조 이미지는 기존 결과를 유지한다.
 * - 정렬기 단위: 접두사·공백·이스케이프·문자 참조·정렬 불능을 기대 마스크 또는 `undefined`로 고정한다.
 * - 식별자 디코딩: 라벨에 이스케이프·문자 참조가 있는 끊어진 참조는 같은 글자의 정의에 연결되지 않는다.
 *   CommonMark는 라벨을 디코딩 전 원문으로 대조한다.
 * - 줄바꿈 문자 참조: 소스의 `&#10;`, `&NewLine;`가 만든 값의 `\n`도 맞춘다.
 * - 정렬 성공: 행렬의 모든 text 노드에서 정렬기가 `undefined`를 내지 않는다.
 *   극단 입력(걸음 수 예산을 넘는 이름형 참조 연쇄, 위치 없는 text)은 `undefined`일 수 있다.
 * - 유계성: `&amp;` 2만 개와 1만 줄 인용을 `RangeError` 없이 처리한다.
 * - 글자 그대로인 `>`: 들여쓰기 4칸 이상의 이어짐 줄은 값에 `>`가 남는다. 접두사 `>`와 구별해 맞춘다.
 * - 체크박스만 있는 작업 목록 첫 줄: 다음 줄 text의 시작 위치가 밀려도 맞춘다.
 * - 마지막 매치 뒤 text와 숫자 참조 경계: 풀린 글자를 쓰고, 파서와 같은 규칙으로 푼다.
 */
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import { importMarkdown } from "../src/index.js";
import { alignTextToSource } from "../src/markdown/import-markdown-source-alignment.js";

/** 마스크에서 소스에 글자 그대로 없던 자리를 나타내는 표식. 정렬기 상수와 같다. */
const M = "\uE000";

/** 성공한 가져오기 결과를 반환한다. 실패는 메시지로 드러낸다. */
const importOk = (source: string) => {
  const result = importMarkdown(source);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

/** 블록 트리의 모든 `text` 값을 문서 순서로 모은다. 컨테이너 구조와 무관하게 비교하려는 용도다. */
const collectTexts = (value: unknown, out: string[] = []): string[] => {
  if (Array.isArray(value)) {
    for (const item of value) collectTexts(item, out);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "text" && typeof child === "string") out.push(child);
      else collectTexts(child, out);
    }
  }
  return out;
};

/** 가져오기 결과를 텍스트 목록과 경고 종류 목록으로 줄인다. 블록 id는 비교하지 않는다. */
const summarize = (source: string) => {
  const { document, warnings } = importOk(source);
  return {
    texts: collectTexts(document.blocks),
    kinds: warnings.map((warning) => warning.kind),
  };
};

type Form = {
  name: string;
  /** 컨테이너 없는 본문. 줄바꿈은 LF다. */
  body: string;
  /** 컨테이너 없는 문단으로 가져온 기대 텍스트. */
  text: string;
  /** 기대 `IMAGE_DOWNGRADED` 건수. */
  warnings: number;
  /** 한 줄 형태면 true. 표 셀에 넣을 수 있다. */
  oneLine: boolean;
};

/** 입력 형태. 컨테이너 없는 문단 결과를 정본으로 삼는다. */
const FORMS: ReadonlyArray<Form> = [
  {
    name: "접두사가 낀 여러 줄",
    body: "앞\n![a][x]",
    text: "앞\na [x]",
    warnings: 1,
    oneLine: false,
  },
  {
    name: "참조 이미지 뒤에 다음 줄",
    body: "![a][x]\n뒤",
    text: "a [x]\n뒤",
    warnings: 1,
    oneLine: false,
  },
  {
    name: "첫 줄 글자 뒤 참조 이미지와 다음 줄",
    body: "앞 ![a][x]\n뒤",
    text: "앞 a [x]\n뒤",
    warnings: 1,
    oneLine: false,
  },
  {
    name: "줄머리 공백",
    body: "앞\n  ![a][x]",
    text: "앞\na [x]",
    warnings: 1,
    oneLine: false,
  },
  {
    name: "줄끝 공백",
    body: "앞 \n![a][x]",
    text: "앞\na [x]",
    warnings: 1,
    oneLine: false,
  },
  {
    name: "앞쪽 이스케이프 별표",
    body: "a \\* ![a][x]",
    text: "a * a [x]",
    warnings: 1,
    oneLine: true,
  },
  {
    name: "앞쪽 문자 참조 amp",
    body: "&amp; ![a][x]",
    text: "& a [x]",
    warnings: 1,
    oneLine: true,
  },
  {
    name: "표 셀 이스케이프 파이프",
    body: "a\\|![a][x]",
    text: "a|a [x]",
    warnings: 1,
    oneLine: true,
  },
  {
    name: "한 줄에 둘",
    body: "![a][x] 중간 ![b][y]",
    text: "a [x] 중간 b [y]",
    warnings: 2,
    oneLine: true,
  },
  {
    name: "풀 형태",
    body: "![a][x]",
    text: "a [x]",
    warnings: 1,
    oneLine: true,
  },
  {
    name: "축약 형태",
    body: "![a]",
    text: "a [a]",
    warnings: 1,
    oneLine: true,
  },
  {
    name: "빈 라벨 형태",
    body: "![a][]",
    text: "a [a]",
    warnings: 1,
    oneLine: true,
  },
];

type Container = {
  name: string;
  /** 본문을 컨테이너로 감싼 소스. */
  wrap: (body: string) => string;
  /** 컨테이너가 본문 밖에 더하는 텍스트(표 머리 칸). */
  extraTexts: ReadonlyArray<string>;
  /** 한 줄 형태만 넣을 수 있으면 true. */
  oneLineOnly: boolean;
};

/** 줄마다 접두사를 붙인다. 첫 줄은 `first`, 나머지는 `rest`다. */
const prefixLines = (body: string, first: string, rest: string): string =>
  `${body
    .split("\n")
    .map((line, index) => `${index === 0 ? first : rest}${line}`)
    .join("\n")}\n`;

/** 컨테이너 행렬. */
const CONTAINERS: ReadonlyArray<Container> = [
  {
    name: "최상위 문단",
    wrap: (body) => `${body}\n`,
    extraTexts: [],
    oneLineOnly: false,
  },
  {
    name: "인용",
    wrap: (body) => prefixLines(body, "> ", "> "),
    extraTexts: [],
    oneLineOnly: false,
  },
  {
    name: "중첩 인용",
    wrap: (body) => prefixLines(body, "> > ", "> > "),
    extraTexts: [],
    oneLineOnly: false,
  },
  {
    name: "글머리 목록",
    wrap: (body) => prefixLines(body, "- ", "  "),
    extraTexts: [],
    oneLineOnly: false,
  },
  {
    name: "번호 목록 1.",
    wrap: (body) => prefixLines(body, "1. ", "   "),
    extraTexts: [],
    oneLineOnly: false,
  },
  {
    name: "번호 목록 10.",
    wrap: (body) => prefixLines(body, "10. ", "    "),
    extraTexts: [],
    oneLineOnly: false,
  },
  {
    name: "탭 들여쓰기 목록",
    wrap: (body) => prefixLines(body, "-\t", "\t"),
    extraTexts: [],
    oneLineOnly: false,
  },
  {
    name: "중첩 목록",
    wrap: (body) => prefixLines(body, "- - ", "    "),
    extraTexts: [],
    oneLineOnly: false,
  },
  {
    name: "목록 안 인용",
    wrap: (body) => prefixLines(body, "- > ", "  > "),
    extraTexts: [],
    oneLineOnly: false,
  },
  {
    name: "표 셀",
    wrap: (body) => `| h |\n| - |\n| ${body} |\n`,
    extraTexts: ["h"],
    oneLineOnly: true,
  },
];

/** 컨테이너에 들어가는 형태만 고른다. */
const formsFor = (container: Container): ReadonlyArray<Form> =>
  FORMS.filter((form) => form.oneLine || !container.oneLineOnly);

describe("끊어진 참조 이미지 소스 정렬: 이슈 재현", () => {
  it.each([
    ["여러 줄 문단", "앞\n![a][x]\n", "앞\na [x]"],
    ["인용 여러 줄", "> 앞 ![a][x]\n> 뒤\n", "앞 a [x]\n뒤"],
    ["목록 항목 들여쓴 줄", "- ![a][x]\n  뒤\n", "a [x]\n뒤"],
  ])("%s: 평문 `a [x]`와 경고 1건", (_name, source, text) => {
    const { texts, kinds } = summarize(source);

    expect(texts).toEqual([text]);
    expect(kinds).toEqual(["IMAGE_DOWNGRADED"]);
  });
});

describe("끊어진 참조 이미지 소스 정렬: 컨테이너×입력 형태 오라클", () => {
  describe.each(FORMS)("컨테이너 없는 정본: $name", (form) => {
    it("문단 결과가 기대 텍스트와 경고 건수다", () => {
      const { texts, kinds } = summarize(`${form.body}\n`);

      expect(texts).toEqual([form.text]);
      expect(kinds).toEqual(Array(form.warnings).fill("IMAGE_DOWNGRADED"));
    });
  });

  describe.each(CONTAINERS)("$name", (container) => {
    it.each(formsFor(container).map((form) => [form.name, form] as const))(
      "%s: 컨테이너 없는 결과와 텍스트·경고 종류가 같다",
      (_name, form) => {
        const free = summarize(`${form.body}\n`);
        const wrapped = summarize(container.wrap(form.body));

        expect(wrapped.texts).toEqual([...container.extraTexts, ...free.texts]);
        expect(wrapped.kinds).toEqual(free.kinds);
        // 컨테이너 없는 결과 자체가 틀려도 둘이 같게 틀릴 수 있다. 기대값도 직접 본다.
        expect(wrapped.texts).toEqual([...container.extraTexts, form.text]);
        expect(wrapped.kinds).toHaveLength(form.warnings);
      },
    );
  });
});

describe("끊어진 참조 이미지 소스 정렬: 구조 문자 규칙", () => {
  it.each([
    ["alt 안 이스케이프 `\\_`", "![a\\_b][x]\n", "a_b [x]"],
    ["alt 안 문자 참조 `&amp;`", "![a&amp;b][x]\n", "a&b [x]"],
    ["이스케이프된 `]`는 alt를 끝내지 않는다", "![a\\]b][x]\n", "a]b [x]"],
    ["식별자 안 이스케이프", "![a][x\\_y]\n", "a [x_y]"],
    ["인용 안 alt 이스케이프", "> 앞\n> ![a\\_b][x]\n", "앞\na_b [x]"],
  ])("%s", (_name, source, text) => {
    const { texts, kinds } = summarize(source);

    expect(texts).toEqual([text]);
    expect(kinds).toEqual(["IMAGE_DOWNGRADED"]);
  });
});

describe("끊어진 참조 이미지 소스 정렬: 음성(평문 유지, 경고 없음)", () => {
  it.each([
    ["이스케이프된 `!`", "\\![a][x]\n", ["![a][x]"]],
    ["이름 문자 참조로 만든 `!`", "&excl;[a][x]\n", ["![a][x]"]],
    ["숫자 문자 참조로 만든 `!`", "&#33;[a][x]\n", ["![a][x]"]],
    ["인라인 코드 안", "`![a][x]`\n", ["![a][x]"]],
    ["코드 펜스 안", "```\n![a][x]\n```\n", ["![a][x]"]],
    ["인용 안 코드 펜스", "> ```\n> ![a][x]\n> ```\n", ["![a][x]"]],
    [
      "인용 두 번째 줄의 이스케이프된 `!`",
      "> 앞\n> \\![a][x]\n",
      ["앞\n![a][x]"],
    ],
    [
      "목록 들여쓴 줄의 이스케이프된 `!`",
      "- 앞\n  \\![a][x]\n",
      ["앞\n![a][x]"],
    ],
  ])("%s", (_name, source, texts) => {
    const result = summarize(source);

    expect(result.texts).toEqual(texts);
    expect(result.kinds).toEqual([]);
  });
});

describe("끊어진 참조 이미지 소스 정렬: 정의 있는 참조 이미지 회귀", () => {
  it("최상위 정의 있는 참조 이미지는 이미지 블록으로 승격된다", () => {
    const { document, warnings } = importOk(
      "![a][x]\n\n[x]: https://example.com/a.png\n",
    );

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "image",
        url: "https://example.com/a.png",
        name: "a",
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it.each([
    [
      "인용",
      "> ![a][x]\n\n[x]: https://example.com/a.png\n",
      "a (https://example.com/a.png)",
    ],
    [
      "글머리 목록",
      "- ![a][x]\n\n[x]: https://example.com/a.png\n",
      "a (https://example.com/a.png)",
    ],
    [
      "인용 여러 줄",
      "> 앞\n> ![a][x]\n\n[x]: https://example.com/a.png\n",
      "앞\na (https://example.com/a.png)",
    ],
    [
      "컨테이너 안 정의",
      "> ![a][x]\n>\n> [x]: https://example.com/a.png\n",
      "a [x]",
    ],
  ])("%s: 기존 결과 그대로다", (_name, source, text) => {
    const { texts, kinds } = summarize(source);

    expect(texts).toEqual([text]);
    expect(kinds).toEqual(["IMAGE_DOWNGRADED"]);
  });
});

describe("끊어진 참조 이미지 소스 정렬: 식별자 디코딩과 정의 연결", () => {
  // 라벨 대조는 디코딩 전 원문 기준이다. 일치했다면 파서가 이미 참조로 읽었다.
  // 라벨에 이스케이프·문자 참조가 있는 text는 어떤 정의와도 원문이 맞지 않는다.
  it.each([
    ["이스케이프 라벨", "![a][x\\_y]\n\n[x_y]: http://u\n", "a [x_y]"],
    ["문자 참조 라벨", "![a][x&amp;y]\n\n[x&y]: http://u\n", "a [x&y]"],
    [
      "소스에 `&amp;amp;`인 라벨",
      "![a][x&amp;amp;y]\n\n[x&y]: http://u\n",
      "a [x&amp;y]",
    ],
    [
      "이스케이프된 `&`로 시작하는 문자 참조 표기 라벨",
      "![a][x\\&amp;y]\n\n[x&amp;y]: http://u\n",
      "a [x&amp;y]",
    ],
    [
      "인용 여러 줄 안 이스케이프 라벨",
      "> 앞\n> ![a][x\\_y]\n\n[x_y]: http://u\n",
      "앞\na [x_y]",
    ],
    ["축약 형태 alt 이스케이프", "![a\\_b]\n\n[a_b]: http://u\n", "a_b [a_b]"],
    [
      "빈 라벨 형태 alt 이스케이프",
      "![a\\_b][]\n\n[a_b]: http://u\n",
      "a_b [a_b]",
    ],
  ])("%s: 정의에 연결되지 않고 평문과 경고 1건", (_name, source, text) => {
    const { texts, kinds } = summarize(source);

    expect(texts).toEqual([text]);
    expect(kinds).toEqual(["IMAGE_DOWNGRADED"]);
  });

  it.each([
    ["이스케이프 없는 라벨", "![a][x_y]\n\n[x_y]: http://u\n", "a"],
    ["alt에만 이스케이프", "![a\\_b][x]\n\n[x]: http://u\n", "a_b"],
    ["축약 형태", "![a]\n\n[a]: http://u\n", "a"],
    ["빈 라벨 형태", "![a][]\n\n[a]: http://u\n", "a"],
  ])(
    "대조: %s는 파서가 정의로 해석해 이미지 블록이 된다",
    (_name, source, name) => {
      const { document, warnings } = importOk(source);

      expect(document.blocks).toEqual([
        { id: "markdown-1", type: "image", url: "http://u", name },
      ]);
      expect(warnings).toEqual([]);
    },
  );
});

describe("끊어진 참조 이미지 소스 정렬: 줄바꿈 문자 참조", () => {
  it.each([
    ["`&#10;`로 이은 둘", "![a][x]&#10;![b][y]\n", "a [x]\nb [y]", 2],
    ["`&NewLine;` 뒤 참조 이미지", "x&NewLine;![a][x]\n", "x\na [x]", 1],
    ["인용 안 `&#10;`", "> 앞&#10;![a][x]\n> 뒤\n", "앞\na [x]\n뒤", 1],
  ])("%s", (_name, source, text, warnings) => {
    const result = summarize(source);

    expect(result.texts).toEqual([text]);
    expect(result.kinds).toEqual(Array(warnings).fill("IMAGE_DOWNGRADED"));
  });
});

describe("끊어진 참조 이미지 소스 정렬: 글자 그대로인 `>`로 시작하는 이어짐 줄", () => {
  // 들여쓰기 4칸 이상의 `>` 줄은 인용이 아니라 문단 이어짐이다. 값에 `>`가 글자 그대로 남는다.
  it.each([
    ["4칸 들여쓴 이어짐 줄", "a ![x][y]\n    > b\n", "a x [y]\n> b"],
    [
      "인용 안 4칸 들여쓴 이어짐 줄",
      "> a ![x][y]\n>     > b\n",
      "a x [y]\n> b",
    ],
    ["목록 안 이어짐 줄", "- a ![x][y]\n  b\n      > c\n", "a x [y]\nb\n> c"],
    ["이스케이프된 `>`는 이전처럼", "a ![x][y]\n  \\> b\n", "a x [y]\n> b"],
    ["문자 참조 `&gt;`는 이전처럼", "a ![x][y]\n  &gt; b\n", "a x [y]\n> b"],
  ])("%s", (_name, source, text) => {
    const result = summarize(source);

    expect(result.texts).toEqual([text]);
    expect(result.kinds).toEqual(["IMAGE_DOWNGRADED"]);
  });

  it.each([
    ["4칸 들여쓴 이어짐 줄", "a\n> b", "a\n    > b", "a\n> b"],
    ["인용 접두사 뒤 글자 그대로인 `>`", "a\n> b", "a\n>     > b", "a\n> b"],
    ["접두사 `>`와 이스케이프된 `>`", "a\n> b", "a\n> \\> b", `a\n${M} b`],
  ])("정렬기: %s", (_name, value, raw, mask) => {
    expect(alignTextToSource(value, raw)).toBe(mask);
  });
});

describe("끊어진 참조 이미지 소스 정렬: 체크박스만 있는 작업 목록 첫 줄", () => {
  // remark-gfm이 체크박스를 떼면 다음 줄 text의 시작 위치가 들여쓰기 안쪽으로 밀린다.
  it.each([
    ["체크박스 뒤 공백", "- [ ] \n  ![a][x]\n"],
    ["체크박스 바로 뒤 줄바꿈", "- [ ]\n  ![a][x]\n"],
    ["체크박스 뒤 공백과 탭", "- [ ] \t\n  ![a][x]\n"],
    ["체크한 항목", "- [x] \n  ![a][x]\n"],
  ])("%s", (_name, source) => {
    const result = summarize(source);

    expect(result.texts).toEqual(["a [x]"]);
    expect(result.kinds).toEqual(["IMAGE_DOWNGRADED"]);
  });

  it("체크박스 뒤 줄에 글자가 앞서도 맞춘다", () => {
    const result = summarize("- [ ] \n  b ![a][x]\n");

    expect(result.texts).toEqual(["b a [x]"]);
    expect(result.kinds).toEqual(["IMAGE_DOWNGRADED"]);
  });

  it("시작이 값의 공백이면 소스의 공백을 건너뛰지 않는다", () => {
    expect(alignTextToSource(" b", " b")).toBe(" b");
    expect(alignTextToSource("b", "   b")).toBe("b");
  });
});

describe("끊어진 참조 이미지 소스 정렬: 마지막 매치 뒤 text와 숫자 참조 경계", () => {
  it("마지막 참조 뒤 text의 이스케이프·문자 참조는 풀린 글자다", () => {
    const result = summarize("![a][x] a\\*b &amp; c\n");

    expect(result.texts).toEqual(["a [x] a*b & c"]);
    expect(result.texts.join("")).not.toContain(M);
  });

  it.each([
    ["대문자 X 16진", "A", "&#X41;", M],
    ["16진 6자리 비문자 `&#x10FFFE;`는 U+FFFD", "\uFFFD", "&#x10FFFE;", M],
    ["16진 7자리는 참조가 아니다", "&#x1234567;", "&#x1234567;", "&#x1234567;"],
    ["10진 8자리는 참조가 아니다", "&#12345678;", "&#12345678;", "&#12345678;"],
    ["10진 7자리", "\uFFFD", "&#1114112;", M],
    ["탭 `&#9;`", "\t", "&#9;", M],
    ["수직 탭 `&#11;`은 U+FFFD", "\uFFFD", "&#11;", M],
    ["제어 `&#14;`는 U+FFFD", "\uFFFD", "&#14;", M],
    ["제어 `&#31;`은 U+FFFD", "\uFFFD", "&#31;", M],
    ["공백 `&#32;`", " ", "&#32;", M],
    ["DEL `&#127;`은 U+FFFD", "\uFFFD", "&#127;", M],
    ["C1 끝 `&#159;`는 U+FFFD", "\uFFFD", "&#159;", M],
    ["`&#160;`는 NBSP", "\u00A0", "&#160;", M],
    ["비문자 `&#xFDD0;`은 U+FFFD", "\uFFFD", "&#xFDD0;", M],
    ["비문자 `&#xFDEF;`는 U+FFFD", "\uFFFD", "&#xFDEF;", M],
    ["비문자 `&#xFDF0;`는 문자", "\uFDF0", "&#xFDF0;", M],
    ["비문자 `&#xFFFE;`는 U+FFFD", "\uFFFD", "&#xFFFE;", M],
    ["비문자 `&#x1FFFF;`는 U+FFFD", "\uFFFD", "&#x1FFFF;", M],
    ["서로게이트 경계 `&#xDFFF;`", "\uFFFD", "&#xDFFF;", M],
    ["서로게이트 앞 `&#xD7FF;`", "\uD7FF", "&#xD7FF;", M],
  ])("숫자 참조 경계: %s", (_name, value, raw, mask) => {
    expect(alignTextToSource(value, raw)).toBe(mask);
  });
});

describe("정렬기 alignTextToSource 단위", () => {
  it.each([
    [
      "인용 접두사 `> `",
      "앞 ![a][x]\n뒤",
      "앞 ![a][x]\n> 뒤",
      "앞 ![a][x]\n뒤",
    ],
    ["중첩 인용 접두사 `> > `", "앞\n![a]", "앞\n> > ![a]", "앞\n![a]"],
    ["목록 들여쓰기", "앞\n![a]", "앞\n   ![a]", "앞\n![a]"],
    ["탭 들여쓰기", "앞\n![a]", "앞\n\t![a]", "앞\n![a]"],
    ["줄머리 공백", "앞\n![a]", "앞\n  ![a]", "앞\n![a]"],
    ["줄끝 공백", "앞\n![a]", "앞 \n![a]", "앞\n![a]"],
    ["줄끝 공백과 접두사", "앞\n![a]", "앞  \n>  ![a]", "앞\n![a]"],
    ["이스케이프 `\\*`", "a*", "a\\*", `a${M}`],
    ["이스케이프 `\\]`", "a]b", "a\\]b", `a${M}b`],
    ["이스케이프 백슬래시", "a\\b", "a\\\\b", `a${M}b`],
    ["구두점이 아닌 글자 앞 백슬래시는 글자 그대로", "\\a", "\\a", "\\a"],
    ["16진 숫자 참조와 10진 숫자 참조", "AA", "&#x41;&#65;", `${M}${M}`],
    ["이름 문자 참조", "©", "&copy;", M],
    ["이름 문자 참조 `&excl;`", "![a]", "&excl;[a]", `${M}[a]`],
    [
      "두 코드포인트 문자 참조",
      "\u2242\u0338 x",
      "&NotEqualTilde; x",
      `${M}${M} x`,
    ],
    ["서로게이트 쌍 숫자 참조", "\u{1F600}!", "&#x1F600;!", `${M}${M}!`],
    [
      "알려지지 않은 이름은 글자 그대로",
      "&foo; ![a]",
      "&foo; ![a]",
      "&foo; ![a]",
    ],
    ["유효하지 않은 숫자 참조는 U+FFFD", "\uFFFD![a]", "&#0;![a]", `${M}![a]`],
    ["참조 뒤 재동기", "<[a]", "&lt;[a]", `${M}[a]`],
    ["소스에 이미 있던 U+E000", "\uE000", "\uE000", "\uE000"],
    ["숫자 참조가 푼 값과 같은 `&#65;`", "A", "&#65;", M],
    ["C1 제어 숫자 참조는 U+FFFD", "\uFFFD", "&#128;", M],
    ["서로게이트 숫자 참조는 U+FFFD", "\uFFFD", "&#xD800;", M],
    ["비문자 숫자 참조는 U+FFFD", "\uFFFD", "&#65535;", M],
    ["범위 밖 숫자 참조는 U+FFFD", "\uFFFD", "&#x110000;", M],
    ["줄바꿈 숫자 참조 `&#10;`", "a\nb", "a&#10;b", `a${M}b`],
    ["줄바꿈 이름 참조 `&NewLine;`", "x\n![a]", "x&NewLine;![a]", `x${M}![a]`],
    ["줄바꿈 소스와 참조가 섞인다", "a\nb\nc", "a\n> b&#10;c", `a\nb${M}c`],
    ["빈 입력", "", "", ""],
  ])("%s", (_name, value, raw, mask) => {
    expect(alignTextToSource(value, raw)).toBe(mask);
  });

  it.each([
    ["글자가 다르다", "abc", "abd"],
    ["값이 남는다", "abc", "ab"],
    ["소스가 남는다", "ab", "abc"],
    ["줄 끝 뒤 글자가 다르다", "a\nb", "a\n> c"],
    ["이스케이프가 값과 맞지 않는다", "a*", "a\\+"],
    ["숫자 참조가 푼 값과 다르다", "B", "&#65;"],
    ["16진 숫자 참조가 푼 값과 다르다", "B", "&#x41;"],
    ["C1 제어 숫자 참조 값을 그대로 쓴 값", "\u0080", "&#128;"],
    ["줄바꿈 참조 자리에 다른 글자", "a b", "a&#10;b"],
  ])("정렬 불능은 undefined다: %s", (_name, value, raw) => {
    expect(alignTextToSource(value, raw)).toBeUndefined();
  });
});

describe("일반 입력의 정렬 성공", () => {
  const parser = unified().use(remarkParse).use(remarkGfm);

  type ParsedNode = {
    type: string;
    value?: string;
    children?: ParsedNode[];
    position?: { start: { offset?: number }; end: { offset?: number } };
  };

  /** text 노드 중 `![`를 담은 것의 (값, 소스 조각) 쌍을 모은다. 재귀 없이 스택으로 훑는다. */
  const textPairs = (source: string): Array<[string, string]> => {
    const pairs: Array<[string, string]> = [];
    const stack: ParsedNode[] = [parser.parse(source) as unknown as ParsedNode];
    for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (
        node.type === "text" &&
        node.value?.includes("![") === true &&
        start !== undefined &&
        end !== undefined
      ) {
        pairs.push([node.value, source.slice(start, end)]);
      }
      stack.push(...(node.children ?? []));
    }
    return pairs;
  };

  const matrixSources = CONTAINERS.flatMap((container) =>
    formsFor(container).map(
      (form) =>
        [
          `${container.name} / ${form.name}`,
          container.wrap(form.body),
        ] as const,
    ),
  );

  it.each(matrixSources)(
    "%s: 모든 text 노드가 정렬에 성공한다",
    (_name, source) => {
      const pairs = textPairs(source);

      expect(pairs.length).toBeGreaterThan(0);
      for (const [value, raw] of pairs) {
        const mask = alignTextToSource(value, raw);
        expect(mask).toBeDefined();
        expect(mask?.length).toBe(value.length);
      }
    },
  );
});

describe("끊어진 참조 이미지 소스 정렬: 유계성", () => {
  it("`&amp;` 2만 개를 이은 text 노드를 RangeError 없이 처리한다", () => {
    const { texts, kinds } = summarize(`${"&amp;".repeat(20_000)} ![a][x]\n`);

    expect(texts).toEqual([`${"&".repeat(20_000)} a [x]`]);
    expect(kinds).toEqual(["IMAGE_DOWNGRADED"]);
  });

  it("정렬기는 `&amp;` 2만 개의 마스크를 재귀 없이 만든다", () => {
    expect(alignTextToSource("&".repeat(20_000), "&amp;".repeat(20_000))).toBe(
      M.repeat(20_000),
    );
  });

  it("정렬 불능 입력은 `&amp;` 2만 개에서도 걸음 수 예산 안에 undefined를 낸다", () => {
    expect(
      alignTextToSource("&".repeat(20_000) + "x", "&amp;".repeat(20_000) + "y"),
    ).toBeUndefined();
  });

  it("줄 1만 개짜리 인용을 RangeError 없이 처리한다", () => {
    const lines = Array.from({ length: 10_000 }, (_, index) => `줄${index}`);
    lines.push("![a][x]");
    const { texts, kinds } = summarize(
      `${lines.map((line) => `> ${line}`).join("\n")}\n`,
    );

    expect(texts).toEqual([`${lines.slice(0, -1).join("\n")}\na [x]`]);
    expect(kinds).toEqual(["IMAGE_DOWNGRADED"]);
  });
});
