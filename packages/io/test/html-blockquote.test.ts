/**
 * HTML export/import의 quote ↔ blockquote 매핑(DELTA-06a, spec §7.1)을
 * 검증한다. export는 quote를 <blockquote data-be-block-id><p>content</p>
 * [<div data-be-children>…]</blockquote>로 내고, import는 D6 분할 규칙 —
 * 첫 블록 자식이 <p>면 그 인라인이 content, 나머지는 children; 첫 자식이
 * h2 등 비문단 블록 요소면 content 빈 채 전부 children; 첫 자식이 태그 없는
 * 인라인이면 list item(splitListItemChildren)과 동일하게 블록 형제가
 * 없으면 인라인 전체가 content, 있으면 첫 block-boundary 전까지만 content로
 * 승격(Issue #142 정정) — 로 되읽어 자기 출력을 원본 모델로 복원한다.
 * 클립보드 경로의 "blockquote는 문단 경계" 계약(슬라이스 10 소관)은
 * 그대로다(06a-C3).
 */
import type { Block, Document } from "@cp949/geul-model";
import { MAX_NESTING_DEPTH } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml, parseClipboardTable } from "../src/index.js";
import {
  buildDocument,
  dividerBlock,
  headingBlock,
  paragraphBlock,
  quoteBlock,
} from "./fixtures/quote-divider-document.js";
import {
  buildDeepChainHtml,
  documentVisibleText,
} from "./html-depth-support.js";

/**
 * exportHtml이 정확히 expectedHtml을 내고, 그 HTML을 importHtml하면 경고
 * 없이 원본 Document(id 포함)가 복원되는지 한 번에 단언한다. import 결과를
 * Result 통째로 비교해 ok 분기와 warnings 부재를 함께 고정한다.
 */
const expectQuoteRoundTrip = (
  document: Document,
  expectedHtml: string,
): void => {
  const exported = exportHtml(document);
  expect(exported).toEqual({ ok: true, value: expectedHtml });
  if (!exported.ok) return;
  expect(importHtml(exported.value)).toEqual({
    ok: true,
    value: { document, warnings: [] },
  });
};

/**
 * 외부 HTML을 importHtml로 들여온 결과가 경고 없이 정확히 blocks(id는 기본
 * factory의 html-N)인지 단언한다.
 */
const expectImportedBlocks = (html: string, blocks: Block[]): void => {
  expect(importHtml(html)).toEqual({
    ok: true,
    value: { document: buildDocument(blocks), warnings: [] },
  });
};

/**
 * levels 단 blockquote 체인(content 빈 quote, id는 바깥부터 html-1..N)이
 * 만들어야 할 기대 blocks를 조립한다 — 가장 안쪽 quote의 children이
 * leafBlocks다.
 */
const expectedQuoteChain = (levels: number, leafBlocks: Block[]): Block[] => {
  let block: Block = {
    id: `html-${levels}`,
    type: "quote",
    content: [],
    children: leafBlocks,
  };
  for (let level = levels - 1; level >= 1; level -= 1) {
    block = {
      id: `html-${level}`,
      type: "quote",
      content: [],
      children: [block],
    };
  }
  return [block];
};

describe("quote ↔ blockquote 왕복(D6)", () => {
  it("children 없는 quote가 <blockquote data-be-block-id><p>…</p></blockquote>로 export되고 re-import된다", () => {
    expectQuoteRoundTrip(
      buildDocument([
        paragraphBlock("paragraph-1", "앞"),
        quoteBlock("quote-1", "인용"),
      ]),
      '<p data-be-block-id="paragraph-1">앞</p><blockquote data-be-block-id="quote-1"><p>인용</p></blockquote>',
    );
  });

  // children에 paragraph(자기 children wrapper 포함)·heading·divider·quote를
  // 섞는다 — data-be-children 컨테이너 안의 wrapper가 평면 처리로 풀리지
  // 않고 blocksFromNodes의 wrapper 인식을 그대로 받는지까지 고정한다.
  it("children 있는 quote가 blockquote 안 <p> + data-be-children 컨테이너로 export되고 자기 출력 re-import로 원본이 복원된다", () => {
    expectQuoteRoundTrip(
      buildDocument([
        quoteBlock("quote-1", "부모", [
          paragraphBlock("paragraph-1", "문단", [
            quoteBlock("quote-2", "손자 인용"),
          ]),
          headingBlock("heading-1", 3, "제목"),
          dividerBlock("divider-1"),
        ]),
      ]),
      '<blockquote data-be-block-id="quote-1"><p>부모</p><div data-be-children="1"><div data-be-block-id="paragraph-1"><p data-be-block-id="paragraph-1">문단</p><div data-be-children="1"><blockquote data-be-block-id="quote-2"><p>손자 인용</p></blockquote></div></div><h3 data-be-block-id="heading-1">제목</h3><hr data-be-block-id="divider-1"></div></blockquote>',
    );
  });

  // content 빈 quote도 <p></p>를 낸다 — D6 첫 문단 승격의 역변환 대칭. 빈
  // <p>가 없으면 re-import가 첫 children 문단을 content로 승격해 원본과
  // 어긋난다.
  it("content 빈 quote + children 문서가 왕복 보존된다", () => {
    expectQuoteRoundTrip(
      buildDocument([
        {
          id: "quote-1",
          type: "quote",
          content: [],
          children: [paragraphBlock("paragraph-1", "본문")],
        },
      ]),
      '<blockquote data-be-block-id="quote-1"><p></p><div data-be-children="1"><p data-be-block-id="paragraph-1">본문</p></div></blockquote>',
    );
  });
});

describe("외부 blockquote import(D6 첫 문단 승격)", () => {
  // 구현 전에는 blockquote가 문단 경계라 A·B가 형제 문단이 됐다(인용 의미
  // 상실). 들여쓰기·개행이 섞인 pretty-print 형태도 같은 결과다 — 공백뿐인
  // 텍스트 노드는 children을 만들지 않는다.
  it("<blockquote><p>A</p><p>B</p></blockquote>가 content=A, children=[paragraph B]인 quote가 된다", () => {
    const expected: Block[] = [
      {
        id: "html-1",
        type: "quote",
        content: [{ text: "A" }],
        children: [paragraphBlock("html-2", "B")],
      },
    ];
    expectImportedBlocks("<blockquote><p>A</p><p>B</p></blockquote>", expected);
    expectImportedBlocks(
      "<blockquote>\n  <p>A</p>\n  <p>B</p>\n</blockquote>",
      expected,
    );
  });

  it("첫 자식이 <h2>면 content 빈 quote에 전부 children으로 들어간다", () => {
    expectImportedBlocks("<blockquote><h2>H</h2><p>B</p></blockquote>", [
      {
        id: "html-1",
        type: "quote",
        content: [],
        children: [
          headingBlock("html-2", 2, "H"),
          paragraphBlock("html-3", "B"),
        ],
      },
    ]);
  });

  // Issue #142 정정: 이전에는 첫 자식이 태그 없는 bare 인라인이면(사람이
  // 손으로 쓴 HTML에서만 나타난다 — geul 자체 export는 own content를 항상
  // <p>로 감싼다) content를 비우고 전부 children으로 넘겼다. list item과
  // 동일 규칙으로 통일해 첫 block-boundary 전까지를 content로 승격한다 —
  // content는 blockContainer 스키마상 항상 children보다 먼저 렌더링되므로
  // 승격해도 문서 순서는 그대로다.
  it("첫 자식이 태그 없는 인라인이고 뒤에 block 형제가 있으면 boundary 전까지 content로 승격된다", () => {
    expectImportedBlocks(
      "<blockquote>lead text<p>middle</p>trailing text</blockquote>",
      [
        {
          id: "html-1",
          type: "quote",
          content: [{ text: "lead text" }],
          children: [
            paragraphBlock("html-2", "middle"),
            paragraphBlock("html-3", "trailing text"),
          ],
        },
      ],
    );
  });

  it("blockquote 안 목록 항목·중첩 blockquote가 각 타입의 children으로 재귀 매핑된다", () => {
    expectImportedBlocks(
      "<blockquote><p>A</p><ul><li>one</li><li>two</li></ul><blockquote><p>inner</p></blockquote></blockquote>",
      [
        {
          id: "html-1",
          type: "quote",
          content: [{ text: "A" }],
          children: [
            {
              id: "html-2",
              type: "bulletListItem",
              content: [{ text: "one" }],
            },
            {
              id: "html-3",
              type: "bulletListItem",
              content: [{ text: "two" }],
            },
            quoteBlock("html-4", "inner"),
          ],
        },
      ],
    );
  });
});

describe("경계 유지", () => {
  // 64·65단 체인은 HTML 트리 깊이(65·66)가 MAX_HTML_TREE_DEPTH(256)에 한참
  // 못 미쳐 DEEP_TREE_FLATTENED 없이 model 상한 가드(#132)만 걸린다: 상한
  // 깊이(64)의 quote는 content를 지킨 채 children을 잃고, 잃은 children은
  // 그 quote의 형제로 평탄화되며 가드에 걸린 quote마다 경고 하나가 난다.
  // 정확히 64단은 최심부 <p>가 content로 승격돼 잃는 구조가 없어 경고가
  // 없다.
  it("blockquote 중첩이 MAX_NESTING_DEPTH를 넘으면 초과분이 평탄화되고 NESTED_CHILDREN_FLATTENED를 경고한다", () => {
    const atCap = importHtml(
      buildDeepChainHtml("blockquote", MAX_NESTING_DEPTH, "<p>x</p>"),
    );
    expect(atCap).toEqual({
      ok: true,
      value: {
        document: buildDocument(
          expectedQuoteChain(MAX_NESTING_DEPTH - 1, [
            quoteBlock(`html-${MAX_NESTING_DEPTH}`, "x"),
          ]),
        ),
        warnings: [],
      },
    });

    const overCap = importHtml(
      buildDeepChainHtml("blockquote", MAX_NESTING_DEPTH + 1, "x"),
    );
    expect(overCap.ok).toBe(true);
    if (!overCap.ok) throw new Error(overCap.error.message);
    expect(overCap.value.document.blocks).toEqual(
      expectedQuoteChain(MAX_NESTING_DEPTH - 1, [
        { id: `html-${MAX_NESTING_DEPTH}`, type: "quote", content: [] },
        quoteBlock(`html-${MAX_NESTING_DEPTH + 1}`, "x"),
      ]),
    );
    expect(overCap.value.warnings).toEqual([
      expect.objectContaining({ kind: "NESTED_CHILDREN_FLATTENED" }),
    ]);

    // 수천 단은 트리 깊이-캡(#130)이 먼저 절단하고(DEEP_TREE_FLATTENED) 남은
    // 체인을 상한 가드가 평탄화한다 — 두 경고가 함께 나고 텍스트는 남는다.
    const veryDeep = importHtml(buildDeepChainHtml("blockquote", 3000, "x"));
    expect(veryDeep.ok).toBe(true);
    if (!veryDeep.ok) throw new Error(veryDeep.error.message);
    expect(documentVisibleText(veryDeep.value.document)).toContain("x");
    expect(veryDeep.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "DEEP_TREE_FLATTENED" }),
        expect.objectContaining({ kind: "NESTED_CHILDREN_FLATTENED" }),
      ]),
    );
  });

  // 06a-C3: 클립보드 정책은 isQuoteTag를 넘기지 않아 blockquote가 여전히
  // 문단 경계(NESTED_BOUNDARY_TAG_NAMES)다 — 상세 계약은
  // clipboard-mixed-content-block-boundary.test.ts가 소유한다.
  it("클립보드 파서는 blockquote를 여전히 문단 경계로 다룬다", () => {
    const result = parseClipboardTable({
      html: "<blockquote><p>A</p><p>B</p></blockquote><table><tr><td>c</td><td>d</td></tr></table>",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slice(0, 2)).toEqual([
      { type: "paragraph", content: [{ text: "A" }] },
      { type: "paragraph", content: [{ text: "B" }] },
    ]);
    expect(result.value[2]?.type).toBe("table");
  });
});
