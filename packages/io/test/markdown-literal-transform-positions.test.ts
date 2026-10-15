/**
 * Markdown 가져오기 파서가 위치 없는 text·link를 만들지 않는지 검증한다(Issue #423).
 * - remark-gfm의 autolink literal 변환(`transforms`)은 이스케이프 URL·NBSP·`\@`가 낀 text를 쪼갠다.
 * - 쪼개진 text와 link는 `position`을 잃는다. 소스와 글자 단위로 맞출 수 없다.
 * - 그래서 같은 text에 있는 끊어진 참조 이미지 `![a][x]`가 평문으로 내려가지 않았다.
 * - `gfm-parse-processor.ts`가 그 변환만 끈다. literal은 어차피 평문으로 되돌린다.
 * 단언은 네 가지다.
 * - 이슈 재현 두 입력이 `a [x]`와 `IMAGE_DOWNGRADED` 경고를 낸다.
 * - 행렬: literal 3종 × 컨테이너 6종에서 `<literal> ![a][x]`가 `<literal> a [x]`와 경고 1건을 낸다.
 *   컨테이너 안 결과는 컨테이너 없는 문단 결과와 텍스트가 같다.
 * - 불변식: 파서 출력 트리에 `position`이 없는 text·link 노드가 0개다. remark-gfm 구조가 바뀌어
 *   비우기가 조용히 무효가 되면 이 단언이 깨진다.
 * - 회귀 방지: 정의 있는 참조 이미지, 명시 링크와 함께 쓴 참조 이미지는 이전 결과를 유지한다.
 *   최상위 정의 있는 참조 이미지는 이미지 블록으로 승격된다.
 *   행렬 첫 단언이 literal을 이스케이프만 풀린 평문으로 가져오는지도 함께 본다.
 */
import { describe, expect, it } from "vitest";

import { importMarkdown } from "../src/index.js";
import { parseProcessor } from "../src/markdown/gfm-parse-processor.js";

const NBSP = String.fromCharCode(0xa0);

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

/** 파서 출력 트리에서 `position`이 없는 text·link 노드의 type 목록을 모은다. 입력이 작아 재귀를 쓴다. */
const positionlessNodes = (node: unknown, out: string[] = []): string[] => {
  if (typeof node !== "object" || node === null) return out;
  const { type, position, children } = node as {
    type?: unknown;
    position?: unknown;
    children?: unknown;
  };
  if ((type === "text" || type === "link") && position === undefined) {
    out.push(String(type));
  }
  if (Array.isArray(children)) {
    for (const child of children) positionlessNodes(child, out);
  }
  return out;
};

type Literal = {
  name: string;
  /** 소스에 쓰는 literal. */
  source: string;
  /** 가져온 평문. */
  plain: string;
};

/** 변환이 text를 쪼개던 literal 3종. */
const LITERALS: ReadonlyArray<Literal> = [
  { name: "이스케이프 URL", source: "https\\://a.com", plain: "https://a.com" },
  {
    name: "NBSP 낀 www",
    source: `a${NBSP}www.x.com`,
    plain: `a${NBSP}www.x.com`,
  },
  { name: "이스케이프 이메일", source: "foo\\@bar.com", plain: "foo@bar.com" },
];

type Container = {
  name: string;
  /** 한 줄 본문을 컨테이너로 감싼 소스. */
  wrap: (body: string) => string;
  /** 컨테이너가 본문 밖에 더하는 텍스트(표 머리 칸). */
  extraTexts: ReadonlyArray<string>;
};

/** 컨테이너 행렬. */
const CONTAINERS: ReadonlyArray<Container> = [
  { name: "최상위 문단", wrap: (body) => `${body}\n`, extraTexts: [] },
  { name: "인용", wrap: (body) => `> ${body}\n`, extraTexts: [] },
  { name: "글머리 목록", wrap: (body) => `- ${body}\n`, extraTexts: [] },
  { name: "번호 목록", wrap: (body) => `1. ${body}\n`, extraTexts: [] },
  {
    name: "표 셀",
    wrap: (body) => `| h |\n| - |\n| ${body} |\n`,
    extraTexts: ["h"],
  },
  { name: "제목", wrap: (body) => `# ${body}\n`, extraTexts: [] },
];

const MATRIX = CONTAINERS.flatMap((container) =>
  LITERALS.map(
    (literal) => [container.name, literal.name, container, literal] as const,
  ),
);

describe("literal 변환 위치: 이슈 재현", () => {
  it("이스케이프 URL 뒤 끊어진 참조 이미지가 평문 `a [x]`와 경고 1건이다", () => {
    const { texts, kinds } = summarize("https\\://a.com ![a][x]");

    expect(texts).toEqual(["https://a.com a [x]"]);
    expect(kinds).toEqual(["IMAGE_DOWNGRADED"]);
  });

  it("인용 두 줄의 참조 이미지가 모두 내려가고 경고 2건이다", () => {
    const { document, warnings } = importOk(
      "> https\\://a.com ![a][x]\n> ![b][y]",
    );

    expect(document.blocks).toHaveLength(1);
    expect(collectTexts(document.blocks)).toEqual([
      "https://a.com a [x]\nb [y]",
    ]);
    expect(warnings.map((warning) => warning.kind)).toEqual([
      "IMAGE_DOWNGRADED",
      "IMAGE_DOWNGRADED",
    ]);
  });
});

describe("literal 변환 위치: 컨테이너 × literal 행렬", () => {
  it.each(MATRIX)(
    "%s 안 %s 뒤 끊어진 참조 이미지가 `a [x]`와 경고 1건이다",
    (_containerName, _literalName, container, literal) => {
      const { texts, kinds } = summarize(
        container.wrap(`${literal.source} ![a][x]`),
      );

      expect(texts).toEqual([
        ...container.extraTexts,
        `${literal.plain} a [x]`,
      ]);
      expect(kinds).toEqual(["IMAGE_DOWNGRADED"]);
    },
  );

  it.each(MATRIX)(
    "%s 안 %s의 결과가 컨테이너 없는 문단과 같다",
    (_containerName, _literalName, container, literal) => {
      const body = `${literal.source} ![a][x]`;
      const bare = summarize(`${body}\n`);
      const wrapped = summarize(container.wrap(body));

      expect(wrapped.texts.slice(container.extraTexts.length)).toEqual(
        bare.texts,
      );
      expect(wrapped.kinds).toEqual(bare.kinds);
    },
  );
});

describe("literal 변환 위치: 위치 없는 노드 불변식", () => {
  const sources = [
    "https\\://a.com ![a][x]",
    "> https\\://a.com ![a][x]\n> ![b][y]",
    ...MATRIX.map(([, , container, literal]) =>
      container.wrap(`${literal.source} ![a][x]`),
    ),
  ];

  it.each(sources)(
    "파서 출력에 position 없는 text·link가 없다: %j",
    (source) => {
      expect(positionlessNodes(parseProcessor.parse(source))).toEqual([]);
    },
  );
});

describe("literal 변환 위치: 회귀 방지", () => {
  it("정의 있는 참조 이미지는 이스케이프 URL과 한 문단에서 이전 결과를 유지한다", () => {
    const { document, warnings } = importOk(
      "https\\://a.com ![a][x]\n\n[x]: https://e.com/a.png\n",
    );

    expect(collectTexts(document.blocks)).toEqual([
      "https://a.com a (https://e.com/a.png)",
    ]);
    expect(warnings.map((warning) => warning.kind)).toEqual([
      "IMAGE_DOWNGRADED",
    ]);
  });

  it("최상위 정의 있는 참조 이미지는 이미지 블록으로 승격된다", () => {
    const { document, warnings } = importOk(
      "![a][x]\n\n[x]: https://e.com/a.png\n",
    );

    expect(document.blocks).toMatchObject([
      { type: "image", url: "https://e.com/a.png", name: "a" },
    ]);
    expect(warnings).toEqual([]);
  });

  it("명시 링크 옆 정의 있는 참조 이미지는 link 마크와 이전 결과를 유지한다", () => {
    const { document } = importOk(
      "[t](https://a.com) ![a][x]\n\n[x]: https://e.com/a.png\n",
    );

    expect(document.blocks).toMatchObject([
      {
        type: "paragraph",
        content: [
          { text: "t", marks: [{ type: "link", href: "https://a.com" }] },
          { text: " a (https://e.com/a.png)" },
        ],
      },
    ]);
  });

  it("명시 링크 옆 끊어진 참조 이미지는 link 마크를 유지하고 평문으로 내려간다", () => {
    const { document, warnings } = importOk("[t](https://a.com) ![a][x]\n");

    expect(document.blocks).toMatchObject([
      {
        type: "paragraph",
        content: [
          { text: "t", marks: [{ type: "link", href: "https://a.com" }] },
          { text: " a [x]" },
        ],
      },
    ]);
    expect(warnings.map((warning) => warning.kind)).toEqual([
      "IMAGE_DOWNGRADED",
    ]);
  });
});
