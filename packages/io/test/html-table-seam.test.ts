/**
 * importHtml 블록 변환기의 표 판정·처리기 seam을 검증한다(Issue #356 RD-003).
 *
 * - `documentFromRoot`는 표 노드 판정(`isTableNode`)과 표 처리(`blocksFromTable`)를 호출자에게서 받는다.
 * - 주입한 처리기는 최상위, 목록 항목 children, 인용 children의 표에서 불린다.
 * - 주입한 판정은 표 판정 소비처 세 곳(세그먼트 정책, 변환기 호출, 목록 항목·인용 분할)이 모두 본다.
 * - 처리기는 블록 0개 이상을 돌려준다. 재귀 콜백은 같은 depth·context로 안쪽 노드를 읽는다.
 * - 기본 처리기는 caption 문단 → 표 블록 순서를 낸다. caption은 처리기 몫이다.
 * - seam은 공개 API가 아니라 `html/import-html-blocks.ts`를 직접 import한다.
 *
 * 표 아닌 노드를 표 자리로 넘기는 판정은 `u`를 쓴다. `u`는 인라인 태그라 모듈 상수 판정이면
 * 블록 자리를 차지하지 않는다. 분할 소비처가 주입 판정을 놓치면 `u`가 본문에 섞여 RED가 된다.
 */
import type { Block, DocumentBlock } from "@cp949/geul-model";
import { MAX_NESTING_DEPTH } from "@cp949/geul-model";
import { sanitize } from "hast-util-sanitize";
import { describe, expect, it } from "vitest";

import { createImportContext } from "../src/html/import-context.js";
import {
  defaultHtmlTableSeam,
  documentFromRoot,
  type HtmlTableSeam,
  type TableSegment,
} from "../src/html/import-html-blocks.js";
import { htmlImportSanitizeSchema } from "../src/html/import-html-sanitize-schema.js";
import type { HtmlElementNode } from "../src/html/inline-content.js";
import { asRoot, parseHtmlFragment } from "../src/html/parse-html.js";
import type { HtmlImportWarning } from "../src/html/import-warnings.js";

const isUnderline = (node: HtmlElementNode): boolean => node.tagName === "u";

const markerBlock = (id: string, text: string): Block => ({
  id,
  type: "paragraph",
  content: [{ text }],
});

type Call = { tagName: string; nonSectionChildCount: number };

/**
 * 호출 기록을 남기고 `표:N` 문단 하나를 돌려주는 처리기를 만든다.
 */
const recordingSeam = (
  isTableNode: HtmlTableSeam["isTableNode"],
): { seam: HtmlTableSeam; calls: Call[] } => {
  const calls: Call[] = [];
  const seam: HtmlTableSeam = {
    isTableNode,
    blocksFromTable: (segment, helpers) => {
      calls.push({
        tagName: segment.node.tagName,
        nonSectionChildCount: segment.nonSectionChildren.length,
      });
      return [markerBlock(helpers.createId(), `표:${calls.length}`)];
    },
  };
  return { seam, calls };
};

/**
 * importHtml의 sanitize 단계까지만 재현하고 documentFromRoot를 seam과 함께 부른다.
 * createId는 순서대로 `id-N`을 낸다.
 */
const convert = (
  html: string,
  seam: HtmlTableSeam,
): { blocks: DocumentBlock[]; warnings: HtmlImportWarning[] } => {
  const parsed = parseHtmlFragment(html);
  if (parsed === undefined) throw new Error("파싱 실패");
  const safeRoot = asRoot(sanitize(parsed.root, htmlImportSanitizeSchema));
  if (safeRoot === undefined) throw new Error("sanitize 실패");
  const warnings: HtmlImportWarning[] = [];
  const context = createImportContext(safeRoot, warnings);
  let next = 0;
  const document = documentFromRoot(
    safeRoot,
    () => `id-${++next}`,
    context,
    {},
    seam,
  );
  return { blocks: document.blocks, warnings };
};

const cellTable = "<table><tbody><tr><td>가</td></tr></tbody></table>";

describe("표 처리기 주입 — 호출 위치", () => {
  it("주입한 처리기가 최상위 표에서 불리고 결과 블록이 표 자리에 들어간다", () => {
    const { seam, calls } = recordingSeam((node) => node.tagName === "table");

    const { blocks } = convert(`<p>앞</p>${cellTable}<p>뒤</p>`, seam);

    expect(calls).toEqual([{ tagName: "table", nonSectionChildCount: 0 }]);
    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
    expect(blocks[1]).toMatchObject({ content: [{ text: "표:1" }] });
  });

  it("주입한 처리기가 목록 항목 children 안 표에서 불린다", () => {
    const { seam, calls } = recordingSeam((node) => node.tagName === "table");

    const { blocks } = convert(
      `<ul><li><p>항목</p>${cellTable}</li></ul>`,
      seam,
    );

    expect(calls).toHaveLength(1);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "bulletListItem",
      children: [{ type: "paragraph", content: [{ text: "표:1" }] }],
    });
  });

  it("주입한 처리기가 인용 children 안 표에서 불린다", () => {
    const { seam, calls } = recordingSeam((node) => node.tagName === "table");

    const { blocks } = convert(
      `<blockquote><p>인용</p>${cellTable}</blockquote>`,
      seam,
    );

    expect(calls).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "quote",
      content: [{ text: "인용" }],
      children: [{ type: "paragraph", content: [{ text: "표:1" }] }],
    });
  });
});

describe("표 판정 주입 — 표 아닌 노드를 표 자리로 넘김", () => {
  it("최상위에서 주입 판정이 고른 노드가 처리기로 넘어간다", () => {
    const { seam, calls } = recordingSeam(isUnderline);

    const { blocks } = convert("<p>앞</p><u>밑줄</u><p>뒤</p>", seam);

    expect(calls).toEqual([{ tagName: "u", nonSectionChildCount: 1 }]);
    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
    expect(blocks[1]).toMatchObject({ content: [{ text: "표:1" }] });
  });

  it("목록 항목이 인라인 글자로 시작해도 주입 판정이 고른 노드부터 children이 된다", () => {
    const { seam, calls } = recordingSeam(isUnderline);

    const { blocks } = convert("<ul><li>항목<u>밑줄</u></li></ul>", seam);

    expect(calls).toHaveLength(1);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "bulletListItem",
      content: [{ text: "항목" }],
      children: [{ type: "paragraph", content: [{ text: "표:1" }] }],
    });
  });

  it("인용이 인라인 글자로 시작해도 주입 판정이 고른 노드부터 children이 된다", () => {
    const { seam, calls } = recordingSeam(isUnderline);

    const { blocks } = convert(
      "<blockquote>인용<u>밑줄</u></blockquote>",
      seam,
    );

    expect(calls).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "quote",
      content: [{ text: "인용" }],
      children: [{ type: "paragraph", content: [{ text: "표:1" }] }],
    });
  });

  it("인용의 첫 자식이 주입 판정이 고른 노드면 본문은 비고 전부 children이다", () => {
    const { seam, calls } = recordingSeam(isUnderline);

    const { blocks } = convert("<blockquote><u>밑줄</u></blockquote>", seam);

    expect(calls).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "quote",
      content: [],
      children: [{ type: "paragraph", content: [{ text: "표:1" }] }],
    });
  });

  it("주입 판정이 거짓이면 같은 노드는 처리기로 넘어가지 않는다", () => {
    const { seam, calls } = recordingSeam(() => false);

    const { blocks } = convert(`<p>앞</p><u>밑줄</u>${cellTable}`, seam);

    expect(calls).toEqual([]);
    expect(blocks.some((block) => block.type === "table")).toBe(false);
  });
});

describe("표 처리기 주입 — 출력과 재귀 콜백", () => {
  it("처리기가 빈 배열을 돌려주면 표 자리에 블록이 없다", () => {
    const seam: HtmlTableSeam = {
      isTableNode: isUnderline,
      blocksFromTable: () => [],
    };

    const { blocks } = convert("<p>앞</p><u>밑줄</u><p>뒤</p>", seam);

    expect(blocks).toMatchObject([
      { type: "paragraph", content: [{ text: "앞" }] },
      { type: "paragraph", content: [{ text: "뒤" }] },
    ]);
  });

  it("목록 항목 children 자리의 표를 빈 배열로 읽으면 children 필드가 생기지 않는다", () => {
    const seam: HtmlTableSeam = {
      isTableNode: isUnderline,
      blocksFromTable: () => [],
    };

    const { blocks } = convert(
      "<ul><li><p>항목</p><u>밑줄</u></li></ul>",
      seam,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).not.toHaveProperty("children");
  });

  it("처리기가 여러 블록을 돌려주면 문서 순서대로 모두 들어간다", () => {
    const seam: HtmlTableSeam = {
      isTableNode: isUnderline,
      blocksFromTable: (_segment, helpers) => [
        markerBlock(helpers.createId(), "하나"),
        markerBlock(helpers.createId(), "둘"),
      ],
    };

    const { blocks } = convert("<p>앞</p><u>밑줄</u><p>뒤</p>", seam);

    expect(blocks.map((block) => block.id)).toEqual([
      "id-1",
      "id-2",
      "id-3",
      "id-4",
    ]);
    expect(
      blocks.map((block) => block.type === "paragraph" && block.content),
    ).toEqual([
      [{ text: "앞" }],
      [{ text: "하나" }],
      [{ text: "둘" }],
      [{ text: "뒤" }],
    ]);
  });

  it("처리기가 재귀 콜백으로 안쪽 노드를 읽으면 안쪽 문단 두 개가 블록 두 개가 된다", () => {
    const seam: HtmlTableSeam = {
      isTableNode: isUnderline,
      blocksFromTable: (segment, helpers) =>
        helpers.blocksFromNodes(segment.node.children),
    };

    const { blocks } = convert("<u><p>가</p><p>나</p></u>", seam);

    expect(blocks).toMatchObject([
      { type: "paragraph", content: [{ text: "가" }] },
      { type: "paragraph", content: [{ text: "나" }] },
    ]);
  });

  it("재귀 콜백이 안쪽 표도 같은 처리기로 읽는다", () => {
    const calls: string[] = [];
    const seam: HtmlTableSeam = {
      isTableNode: (node) => node.tagName === "u" || node.tagName === "table",
      blocksFromTable: (segment, helpers) => {
        calls.push(segment.node.tagName);
        return segment.node.tagName === "u"
          ? helpers.blocksFromNodes(segment.node.children)
          : [markerBlock(helpers.createId(), "안쪽 표")];
      },
    };

    const { blocks } = convert(`<u><p>가</p>${cellTable}</u>`, seam);

    expect(calls).toEqual(["u", "table"]);
    expect(blocks).toMatchObject([
      { type: "paragraph", content: [{ text: "가" }] },
      { type: "paragraph", content: [{ text: "안쪽 표" }] },
    ]);
  });

  it("재귀 콜백이 호출자의 context를 그대로 써서 경고가 같은 목록에 쌓인다", () => {
    const seam: HtmlTableSeam = {
      isTableNode: isUnderline,
      blocksFromTable: (segment, helpers) =>
        helpers.blocksFromNodes(segment.node.children),
    };

    const { warnings } = convert("<u><p>가\u0008나</p></u>", seam);

    expect(warnings).toMatchObject([{ kind: "UNSAFE_CODE_POINT_REMOVED" }]);
  });

  it("재귀 콜백은 표 노드의 깊이를 그대로 써서 감싸지 않은 입력과 같은 결과를 낸다", () => {
    const chain = `${"<blockquote>".repeat(MAX_NESTING_DEPTH + 2)}<p>끝</p>${"</blockquote>".repeat(MAX_NESTING_DEPTH + 2)}`;
    const wrapped: HtmlTableSeam = {
      isTableNode: isUnderline,
      blocksFromTable: (segment, helpers) =>
        helpers.blocksFromNodes(segment.node.children),
    };

    const plain = convert(chain, {
      isTableNode: () => false,
      blocksFromTable: () => [],
    });
    const viaCallback = convert(`<u>${chain}</u>`, wrapped);

    expect(plain.warnings.length).toBeGreaterThan(0);
    expect(
      plain.warnings.every((w) => w.kind === "NESTED_CHILDREN_FLATTENED"),
    ).toBe(true);
    expect(viaCallback).toEqual(plain);
  });
});

describe("기본 표 처리기", () => {
  const captionTable =
    "<table><caption>제목</caption><tbody><tr><td>가</td></tr></tbody></table>";

  it("caption 문단 다음에 표 블록을 낸다", () => {
    const { blocks } = convert(captionTable, defaultHtmlTableSeam);

    expect(blocks).toMatchObject([
      { type: "paragraph", content: [{ text: "제목" }] },
      { type: "table" },
    ]);
  });

  it("caption이 없으면 표 블록 하나만 낸다", () => {
    const { blocks } = convert(cellTable, defaultHtmlTableSeam);

    expect(blocks).toMatchObject([{ type: "table" }]);
  });

  it("caption 문단은 처리기 몫이라 다른 처리기가 빈 배열을 돌려주면 문단도 없다", () => {
    const { blocks } = convert(captionTable, {
      isTableNode: defaultHtmlTableSeam.isTableNode,
      blocksFromTable: () => [],
    });

    expect(blocks).toEqual([]);
  });

  it("기본 판정은 table 태그만 표로 본다", () => {
    expect(
      defaultHtmlTableSeam.isTableNode({
        type: "element",
        tagName: "table",
        properties: {},
        children: [],
      }),
    ).toBe(true);
    expect(
      defaultHtmlTableSeam.isTableNode({
        type: "element",
        tagName: "u",
        properties: {},
        children: [],
      }),
    ).toBe(false);
  });

  it("처리기 입력 타입의 표 세그먼트는 table 노드와 비섹션 자식을 가진다", () => {
    const seen: TableSegment[] = [];
    convert(captionTable, {
      isTableNode: defaultHtmlTableSeam.isTableNode,
      blocksFromTable: (segment) => {
        seen.push(segment);
        return [];
      },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.kind).toBe("table");
    expect(seen[0]?.nonSectionChildren).toHaveLength(1);
  });
});

describe("표 판정 주입 — 나머지 children 재귀 경로", () => {
  it("callout 본문이 인라인 글자로 시작해도 주입 판정이 고른 노드가 callout children으로 간다", () => {
    const { seam, calls } = recordingSeam(isUnderline);

    const { blocks } = convert(
      '<div data-geul-callout="true">본문<u>x</u></div>',
      seam,
    );

    expect(calls).toHaveLength(1);
    expect(blocks).toEqual([
      {
        id: "id-1",
        type: "callout",
        content: [{ text: "본문" }],
        children: [
          { id: "id-2", type: "paragraph", content: [{ text: "표:1" }] },
        ],
      },
    ]);
  });

  it("toggle children 안 노드에서 주입 처리기가 불린다", () => {
    const { seam, calls } = recordingSeam(isUnderline);

    const { blocks } = convert(
      '<details data-geul-toggleable="true"><summary>s</summary><div data-geul-children="1"><u>x</u></div></details>',
      seam,
    );

    expect(calls).toHaveLength(1);
    expect(blocks).toEqual([
      {
        id: "id-2",
        type: "toggleListItem",
        content: [{ text: "s" }],
        children: [
          { id: "id-1", type: "paragraph", content: [{ text: "표:1" }] },
        ],
      },
    ]);
  });

  it("children wrapper의 children 안 노드에서 주입 처리기가 불린다", () => {
    const { seam, calls } = recordingSeam(isUnderline);

    const { blocks } = convert(
      '<div data-geul-block-id="a"><p>p</p><div data-geul-children="1"><u>x</u></div></div>',
      seam,
    );

    expect(calls).toHaveLength(1);
    expect(blocks).toEqual([
      {
        id: "a",
        type: "paragraph",
        content: [{ text: "p" }],
        children: [
          { id: "id-2", type: "paragraph", content: [{ text: "표:1" }] },
        ],
      },
    ]);
  });

  it("ul 안 li 아닌 구간의 노드에서 주입 처리기가 불린다", () => {
    const { seam, calls } = recordingSeam(isUnderline);

    const { blocks } = convert("<ul><li>a</li><u>x</u></ul>", seam);

    expect(calls).toHaveLength(1);
    expect(blocks).toEqual([
      { id: "id-1", type: "bulletListItem", content: [{ text: "a" }] },
      { id: "id-2", type: "paragraph", content: [{ text: "표:1" }] },
    ]);
  });

  // children 컨테이너를 비워 둔다. 컨테이너에 블록이 있으면 own-content 인용의
  // children을 덮어써서 주입 처리기 결과가 출력에서 빠진다(이 seam과 무관한 기존 동작).
  it("children wrapper의 own-content 안 노드도 주입 판정으로 본문과 children이 갈린다", () => {
    const { seam, calls } = recordingSeam(isUnderline);

    const { blocks } = convert(
      '<div data-geul-block-id="a"><blockquote>인용<u>x</u></blockquote><div data-geul-children="1"></div></div>',
      seam,
    );

    expect(calls).toHaveLength(1);
    expect(blocks).toEqual([
      {
        id: "a",
        type: "quote",
        content: [{ text: "인용" }],
        children: [
          { id: "id-2", type: "paragraph", content: [{ text: "표:1" }] },
        ],
      },
    ]);
  });
});

/**
 * 같은 여는·닫는 태그를 `count`번 겹쳐 `inner`를 감싼다.
 */
const nest = (open: string, close: string, count: number, inner: string) =>
  `${open.repeat(count)}${inner}${close.repeat(count)}`;

describe("표 판정 주입 — 깊이 상한 평탄화 경로", () => {
  // 가장 안쪽 블록이 depth MAX_NESTING_DEPTH에 놓여 children 자리를 형제로 평탄화한다.
  it.each([
    {
      name: "인용",
      html: nest(
        "<blockquote>",
        "</blockquote>",
        MAX_NESTING_DEPTH - 1,
        "<blockquote>인용<u>x</u></blockquote>",
      ),
    },
    {
      name: "callout",
      html: nest(
        '<div data-geul-callout="true">',
        "</div>",
        MAX_NESTING_DEPTH - 1,
        '<div data-geul-callout="true">본문<u>x</u></div>',
      ),
    },
    {
      name: "목록 항목",
      html: `<ul>${nest("<li><ul>", "</ul></li>", MAX_NESTING_DEPTH - 1, "<li>항목<u>x</u></li>")}</ul>`,
    },
  ])("$name 평탄화 경로에서도 주입 처리기가 불린다", ({ html }) => {
    const { seam, calls } = recordingSeam(isUnderline);

    const { warnings } = convert(html, seam);

    expect(calls).toHaveLength(1);
    expect(warnings).toMatchObject([{ kind: "NESTED_CHILDREN_FLATTENED" }]);
  });
});
