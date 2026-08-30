/**
 * HTML import에서 지원하지 않는 블록 태그를 문단으로 강등하는 동작과
 * SAFE_BLOCK_DOWNGRADED 경고를 다룬다. html-security.test.ts에서 관심사
 * 단위로 분리했다(AGENTS.md: describe 직속 it 20개 이상 시 분리).
 */
import { MAX_NESTING_DEPTH } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";
import {
  buildNestedWrapperHtml,
  documentVisibleText,
} from "./html-depth-support.js";

describe("HTML 보안", () => {
  it("안전하지만 지원하지 않는 블록을 정화 후 강등하면 경고한다", () => {
    const result = importHtml("<aside>Loose <strong>text</strong></aside>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [
          { text: "Loose " },
          { text: "text", marks: [{ type: "bold" }] },
        ],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: "aside",
      }),
    ]);
  });

  // DELTA-06(Issue #38): model HeadingBlock.level이 1~6으로 넓어지면서
  // h4~h6가 문서 import 공유 목록(htmlAllowedTagNames/htmlSanitizeSchema)과
  // supportedBlockNames(import-warnings.ts)에 함께 들어왔다 — importHtml은
  // h4를 더 이상 문단으로 강등하지 않고 heading 4로 들여오며, 강등이
  // 없으므로 SAFE_BLOCK_DOWNGRADED도 내지 않는다(G-CNV-002: 경고 목록은
  // 실제 지원과 일치). 위 aside 사례(여전히 미지원)와 대비되는 계약이다.
  it("importHtml은 h4를 heading 4로 들여오고 SAFE_BLOCK_DOWNGRADED를 내지 않는다", () => {
    const result = importHtml("<h4>x</h4>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "heading",
        level: 4,
        content: [{ text: "x" }],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  // div는 block-segmenter.ts의 재귀 경계라 그 안의 h4도 최상위 h4와 같은
  // 블록 위치다 — import-warnings.ts의 topLevel 판정이 div를 통과해
  // 내려가도(isBlockBoundaryTag) h4가 이제 supportedBlockNames에 있으므로
  // 경고가 없고, segmentBlocks가 div 안 h4를 heading 세그먼트로 인식한다.
  // (div를 통과한 topLevel 판정 자체가 살아 있는지는 바로 아래 span 사례가
  // 계속 고정한다.)
  it("div에 중첩된 h4도 heading 4로 들어오고 SAFE_BLOCK_DOWNGRADED가 없다", () => {
    const result = importHtml("<div><h4>text</h4></div>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      { id: "html-1", type: "heading", level: 4, content: [{ text: "text" }] },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it("div 안의 strong은 bold mark를 보존하고 강등 경고를 만들지 않는다", () => {
    const result = importHtml("<div>a <strong>b</strong></div>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "a " }, { text: "b", marks: [{ type: "bold" }] }],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it("blockquote 안의 strong은 bold mark를 보존하고 강등 경고를 만들지 않는다", () => {
    const result = importHtml("<blockquote>a <strong>b</strong></blockquote>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "quote",
        content: [{ text: "a " }, { text: "b", marks: [{ type: "bold" }] }],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it("li 목록 항목은 em의 italic mark를 보존하고 강등 경고를 만들지 않는다", () => {
    const result = importHtml("<ul><li>a <em>b</em></li></ul>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "bulletListItem",
        content: [{ text: "a " }, { text: "b", marks: [{ type: "italic" }] }],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it.each([
    ["div", "<div>%s</div>"],
    ["li", "<ul><li>%s</li></ul>"],
    ["blockquote", "<blockquote>%s</blockquote>"],
    ["ul", "<ul>%s</ul>"],
    ["ol", "<ol>%s</ol>"],
  ])(
    "%s 경계 안의 지원 인라인 요소는 강등 경고를 만들지 않는다",
    (_boundary, wrapper) => {
      const inlineHtml =
        '<strong>b</strong><em>i</em><u>u</u><s>s</s><code>c</code><a href="https://example.com">a</a><br>z';
      const result = importHtml(wrapper.replace("%s", inlineHtml));
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);

      expect(result.value.document.blocks).toHaveLength(1);
      expect(result.value.warnings).toEqual([]);
    },
  );

  it("지원 경계 안의 실제 미지원 블록은 강등 경고를 유지한다", () => {
    const result = importHtml("<div><section>text</section></div>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "text" }],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: "section",
      }),
    ]);
  });

  it("지원 인라인 아래의 미지원 블록은 mark를 보존하고 강등 경고를 유지한다", () => {
    const result = importHtml(
      "<div><strong><section>x</section></strong></div>",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "x", marks: [{ type: "bold" }] }],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: "section",
      }),
    ]);
  });

  it("미지원 안전 조상 안의 h4·blockquote·hr도 지원 블록 경계를 보존한다", () => {
    const cases = [
      {
        html: '<a href="https://example.com"><h4>H</h4></a>',
        block: {
          id: "html-1",
          type: "heading",
          level: 4,
          content: [
            {
              text: "H",
              marks: [{ type: "link", href: "https://example.com" }],
            },
          ],
        },
      },
      {
        html: '<a href="https://example.com"><blockquote><p>Q</p><h4>C</h4></blockquote></a>',
        block: {
          id: "html-1",
          type: "quote",
          content: [
            {
              text: "Q",
              marks: [{ type: "link", href: "https://example.com" }],
            },
          ],
          children: [
            {
              id: "html-2",
              type: "heading",
              level: 4,
              content: [
                {
                  text: "C",
                  marks: [{ type: "link", href: "https://example.com" }],
                },
              ],
            },
          ],
        },
      },
      {
        html: '<a href="https://example.com"><hr></a>',
        block: { id: "html-1", type: "divider" },
      },
    ];

    for (const { html, block } of cases) {
      const result = importHtml(html);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);

      expect(result.value.document.blocks).toEqual([block]);
      expect(result.value.warnings).toEqual([
        expect.objectContaining({
          kind: "SAFE_BLOCK_DOWNGRADED",
          element: "a",
        }),
      ]);
    }
  });

  it("heading 안의 quote·divider 경계와 앞뒤 텍스트 순서를 보존한다", () => {
    const cases = [
      {
        html: "<h1>before<blockquote><p>quote</p></blockquote>after</h1>",
        blocks: [
          {
            id: "html-1",
            type: "paragraph",
            content: [{ text: "before" }],
          },
          {
            id: "html-2",
            type: "quote",
            content: [{ text: "quote" }],
          },
          {
            id: "html-3",
            type: "paragraph",
            content: [{ text: "after" }],
          },
        ],
      },
      {
        html: "<h1>before<hr>after</h1>",
        blocks: [
          {
            id: "html-1",
            type: "paragraph",
            content: [{ text: "before" }],
          },
          { id: "html-2", type: "divider" },
          {
            id: "html-3",
            type: "paragraph",
            content: [{ text: "after" }],
          },
        ],
      },
    ];

    for (const { html, blocks } of cases) {
      const result = importHtml(html);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);

      expect(result.value.document.blocks).toEqual(blocks);
      expect(result.value.warnings).toEqual([]);
    }
  });

  // 이미 지원하지 않는 태그(span) 자신이 경고를 낸 뒤에는 그 안에 중첩된
  // 내용까지 각각 다시 경고하지 않는다 — isBlockBoundaryTag는 div/li/
  // blockquote/ul/ol만 통과시키고, span처럼 애초에 미지원인 태그를 지나면
  // topLevel을 false로 낮춰 중복 경고를 막는다(기존 aside 사례와 같은
  // "하나의 경고로 대표한다" 관례). 안쪽 태그는 h4가 지원 태그로 승격된
  // 뒤에도 여전히 미지원인 section을 쓴다 — 지원 태그면 애초에 경고가 없어
  // 중복 억제를 검증하지 못한다.
  it("미지원 태그 안에 중첩된 내용은 중복 경고하지 않는다", () => {
    const result = importHtml(
      "<div><span><section>text</section></span></div>",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: "span",
      }),
    ]);
  });

  // Issue #113이 clipboard 경로(clipboard-table-parser.ts)의 div/li/
  // blockquote/ul/ol 문단 경계 인식을 고쳤을 때 HTML import 경로는 반영되지
  // 않아 남아 있었다 — sanitize가 이 다섯 태그를 unwrap해 인접 텍스트가
  // 구분자 없이 병합됐다(아키텍처 리뷰 2차 후보 G). documentFromRoot가
  // clipboard-table-parser.ts와 같은 재귀 경계 인식(block-segmenter.ts)을
  // 쓰도록 바꿔 더 이상 병합되지 않고, supportedBlockNames
  // (import-warnings.ts)도 함께 갱신해 SAFE_BLOCK_DOWNGRADED가 나지 않는다.
  it("div 두 개는 강등 경고 없이 각각 별도 문단이 된다", () => {
    const result = importHtml("<div>one</div><div>two</div>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      { id: "html-1", type: "paragraph", content: [{ text: "one" }] },
      { id: "html-2", type: "paragraph", content: [{ text: "two" }] },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it("ul/li로 감싼 인접 항목이 개별 글머리 목록으로 보존된다(Issue #113 회귀의 import 경로 재현)", () => {
    const result = importHtml("<ul><li>one</li><li>two</li></ul>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "bulletListItem",
        content: [{ text: "one" }],
      },
      {
        id: "html-2",
        type: "bulletListItem",
        content: [{ text: "two" }],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  // DELTA-06a(Issue #38): blockquote는 더 이상 문단 경계가 아니라 quote
  // 블록이다(D6 — 블록 자식 없이 인라인만 들면 그 인라인이 content). li도
  // 목록 블록으로 승격되고 중첩 ul은 children을 만든다. 클립보드 경로의
  // blockquote 문단 경계 계약은
  // clipboard-mixed-content-block-boundary.test.ts가 따로 고정한다.
  it("blockquote는 quote 블록이 되고 중첩된 li는 강등 경고 없이 목록 children으로 인식된다", () => {
    const result = importHtml(
      "<blockquote>quoted</blockquote><ul><li>outer<ul><li>inner</li></ul></li></ul>",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      { id: "html-1", type: "quote", content: [{ text: "quoted" }] },
      {
        id: "html-2",
        type: "bulletListItem",
        content: [{ text: "outer" }],
        children: [
          {
            id: "html-3",
            type: "bulletListItem",
            content: [{ text: "inner" }],
          },
        ],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });
});

// DELTA-04(children 재귀 왕복): import-html.ts의 blocksFromNodes가
// exportHtml의 children wrapper(<div data-be-block-id><p/>
// <div data-be-children>...)를 재귀적으로 벗겨 children을 복원한다. 이
// 재귀는 model의 findNestingDepthViolation(schema.ts)과 같은 모양의 깊이
// 카운터로 depth < MAX_NESTING_DEPTH일 때만 wrapper를 인식해, 만들어지는
// children 배열이 model 상한(64)을 절대 넘지 않는다. 상한에 걸린 wrapper는
// 거절하는 대신 평탄화해 텍스트를 보존하고 NESTED_CHILDREN_FLATTENED를
// 경고한다(Issue #132, G-CNV-002). HTML 트리 자체의 깊이는 그 이전에
// parseHtmlFragment의 깊이-캡(Issue #130)이 절단하므로 이 파일의 wrapper
// 체인 시나리오는 두 방어가 함께 만드는 결과를 고정한다.

// 레벨별 wrapper가 복원하는 자기 본문 블록. buildNestedWrapperHtml의
// p 요소(dataBeBlockId=p<level>, 텍스트 t<level>)가 그대로 문단이 된다 —
// 기대 트리를 조립하는 아래 두 헬퍼가 공유한다.
const wrapperOwnBlock = (level: number) => ({
  id: `p${level}`,
  type: "paragraph" as const,
  content: [{ text: `t${level}` }],
});

// levels 단 wrapper 체인이 만들어야 할 기대 blocks 트리를 만든다. 가장
// 안쪽(leafBlocks가 비면 children 없는 문단)부터 바깥으로 감싸 올라간다 —
// 테스트가 결과 구조 전체를 toEqual로 고정할 수 있게 한다.
const expectedWrapperChain = (levels: number, leafBlocks: unknown[]) => {
  let block: unknown =
    leafBlocks.length > 0
      ? { ...wrapperOwnBlock(levels), children: leafBlocks }
      : wrapperOwnBlock(levels);
  for (let level = levels - 1; level >= 1; level -= 1) {
    block = { ...wrapperOwnBlock(level), children: [block] };
  }
  return [block];
};

describe("재귀 스택 안전(PIT-0034)", () => {
  it(`children 중첩이 MAX_NESTING_DEPTH(${MAX_NESTING_DEPTH})까지는 구조를 그대로 복원한다`, () => {
    const result = importHtml(buildNestedWrapperHtml(MAX_NESTING_DEPTH));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    // 64단째 wrapper는 가드가 wrapper 인식 대신 평탄화 경로로 보내지만
    // children 컨테이너가 비어 있어 결과 블록(p64 문단, children 없음)은
    // 끝까지 인식했을 때와 동일하다 — 기존 계약 그대로다.
    expect(result.value.document.blocks).toEqual(
      expectedWrapperChain(MAX_NESTING_DEPTH, []),
    );
    expect(result.value.warnings).toEqual([]);
  });

  // Issue #132: 이전 계약(HTML_DOCUMENT_INVALID 전면 거절)은 65단 문서
  // 전체를 소비 불가로 만들었다. 새 계약은 가드를 depth < MAX_NESTING_DEPTH
  // 로 낮춰 children 배열이 model 상한(64)에 정확히 머물게 하고, 상한에
  // 걸린 wrapper(63단째의 children 안, model 깊이 64)를 평탄화해 64단째와
  // 65단째 본문을 형제 문단으로 보존한다.
  it(`children 중첩이 MAX_NESTING_DEPTH(${MAX_NESTING_DEPTH})를 넘으면 초과분을 형제 문단으로 평탄화하고 NESTED_CHILDREN_FLATTENED를 경고한다(Issue #132)`, () => {
    const result = importHtml(buildNestedWrapperHtml(MAX_NESTING_DEPTH + 1));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toEqual(
      expectedWrapperChain(MAX_NESTING_DEPTH - 1, [
        wrapperOwnBlock(MAX_NESTING_DEPTH),
        wrapperOwnBlock(MAX_NESTING_DEPTH + 1),
      ]),
    );
    expect(result.value.warnings).toEqual([
      expect.objectContaining({ kind: "NESTED_CHILDREN_FLATTENED" }),
    ]);
  });

  // 매우 깊은(수천 단계) wrapper 체인은 두 방어를 모두 지난다 —
  // parseHtmlFragment의 트리 깊이-캡(#130)이 캡 너머 서브트리를 텍스트로
  // 절단하고(DEEP_TREE_FLATTENED), blocksFromNodes의 depth 가드(#132)가
  // 남은 wrapper를 model 상한에서 평탄화한다(NESTED_CHILDREN_FLATTENED).
  // 이전 계약("우연한 최외곽 catch가 RangeError를 HTML_PARSE_FAILED로
  // 흡수해 ok:false")은 방어가 아니라 사고 수습이었다 — 새 계약은 크래시
  // 없이 ok:true로 최심부 텍스트까지 보존한다. wall-clock/timeout이 아니라
  // 구조 단언만 쓴다(PIT-0034).
  it("매우 깊게 중첩된(수천 단계) wrapper HTML도 크래시 없이 텍스트를 보존한 문서와 절단·평탄화 경고를 반환한다", () => {
    const veryDeepHtml = buildNestedWrapperHtml(3000);

    expect(() => importHtml(veryDeepHtml)).not.toThrow();

    const result = importHtml(veryDeepHtml);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(documentVisibleText(result.value.document)).toContain("t3000");
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "DEEP_TREE_FLATTENED" }),
        expect.objectContaining({ kind: "NESTED_CHILDREN_FLATTENED" }),
      ]),
    );
  });
});
