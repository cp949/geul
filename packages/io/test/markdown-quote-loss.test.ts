/**
 * quote children의 GFM round-trip(BLK-005 재평가, Issue #151,
 * roadmap-workflow RD-001)을 검증한다. GFM(mdast)의 blockquote 노드는
 * root와 같은 flow content를 자식으로 가질 수 있어(DELTA-01 실측) quote의
 * children(재귀, 임의 깊이·임의 block 타입)을 blockquote 중첩으로 그대로
 * 표현한다 — strict export가 성공하고 lossy export도 경고 없이 같은 구조를
 * 낸다. 유일한 예외는 목록 항목과 같은 모호성이다: own content가 비고 첫
 * child가 paragraph면 GFM이 둘의 경계를 구분하지 못해 NESTED_CHILDREN을
 * 그대로 보고한다(loss-analysis.ts의 hasAmbiguousLeadingListParagraph).
 * 앞부분(export만)은 DELTA-02 범위, 마지막 "export→import round-trip" describe는
 * DELTA-03이 추가했다 — `blockquoteToBlocks`(import-markdown-blocks.ts)가
 * 이 파일이 만드는 markdown을 다시 quote children 구조로 복원하는지
 * 확인한다. toggleListItem처럼 quote 중첩과 무관하게 원래 손실인 카테고리는
 * (TOGGLE_STATE_LOST 등) 재import 결과가 원본과 달라지는 것이 기대 동작이다.
 */
import { describe, expect, it } from "vitest";

import { analyzeMarkdownLoss, exportMarkdown } from "../src/index.js";
import {
  buildDocument,
  dividerBlock,
  headingBlock,
  paragraphBlock,
  quoteBlock,
} from "./fixtures/quote-divider-document.js";
import { importOk } from "./markdown-round-trip-support.js";

describe("quote children의 GFM round-trip(BLK-005)", () => {
  it("children 있는 quote의 strict export가 성공하고 중첩 blockquote(`>`/`>>`)를 낸다", () => {
    const document = buildDocument([
      quoteBlock("parent-quote", "부모 인용", [
        paragraphBlock("child-paragraph", "자식 문단"),
      ]),
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([]);
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "> 부모 인용\n>\n> 자식 문단\n",
    });
  });

  it("lossy export도 같은 구조를 경고 없이 낸다(더 이상 형제로 평탄화하지 않는다)", () => {
    const document = buildDocument([
      quoteBlock("parent-quote", "부모 인용", [
        paragraphBlock("child-paragraph", "자식 문단"),
      ]),
    ]);

    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toEqual({
      markdown: "> 부모 인용\n>\n> 자식 문단\n",
      warnings: [],
    });
  });

  it("quote children 안의 quote(3단계 중첩)도 손실 없이 재귀 export된다", () => {
    const document = buildDocument([
      quoteBlock("outer-quote", "바깥 인용", [
        quoteBlock("inner-quote", "안쪽 인용", [
          paragraphBlock("grandchild-paragraph", "손자 문단"),
        ]),
      ]),
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([]);
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "> 바깥 인용\n>\n> > 안쪽 인용\n> >\n> > 손자 문단\n",
    });
  });

  it("analyzeMarkdownLoss가 quote·divider 문서에서 예외를 던지지 않고 손실 없이 기록한다", () => {
    const divider = dividerBlock("divider-1");
    const document = buildDocument([
      quoteBlock("quote-parent", "부모 인용", [dividerBlock("divider-child")]),
      divider,
    ]);

    expect(() => analyzeMarkdownLoss(document)).not.toThrow();
    expect(analyzeMarkdownLoss(document)).toEqual([]);
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      // quote-parent(children: divider)와 top-level 형제 divider가 각각
      // 독립적으로 렌더된다.
      value: "> 부모 인용\n>\n> ---\n\n---\n",
    });
  });

  it("heading이 quote 안에서도 손실 없이 구조를 보존하고, own content가 진짜 빈 배열이면 own paragraph를 materialize하지 않는다", () => {
    // quoteBlock 헬퍼는 항상 content: [{ text }] 한 원소를 만든다 — own
    // content가 "진짜 빈 배열"(hasAmbiguousLeadingListParagraph의 전제)인
    // 조합은 리터럴로 직접 구성해야 한다.
    const document = buildDocument([
      {
        id: "quote-with-heading",
        type: "quote",
        content: [],
        children: [headingBlock("heading-child", 2, "중첩 제목")],
      },
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([]);
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      // own content가 비고 첫 child가 heading(non-paragraph)이라 own
      // paragraph를 materialize하지 않는다 — hasAmbiguousLeadingListParagraph가
      // 목록 항목에 적용하는 것과 동일한 판정.
      value: "> ## 중첩 제목\n",
    });
  });

  // own content가 "진짜 빈 배열"이고 첫 child가 paragraph인 조합만 GFM이
  // 재파싱 때 둘의 경계를 구분하지 못한다(목록 항목의
  // hasAmbiguousLeadingListParagraph와 동일 모호성) — 이 한 조합만
  // NESTED_CHILDREN을 그대로 보고한다.
  it("own content가 빈 배열이고 첫 child가 paragraph면 여전히 NESTED_CHILDREN을 보고한다(모호성)", () => {
    const document = buildDocument([
      {
        id: "ambiguous-quote",
        type: "quote",
        content: [],
        children: [
          paragraphBlock("promoted-paragraph", "승격 대상 문단"),
          dividerBlock("trailing-divider"),
        ],
      },
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([
      {
        kind: "NESTED_CHILDREN",
        blockId: "ambiguous-quote",
        message: expect.stringContaining("ambiguous-quote"),
      },
    ]);
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "NESTED_CHILDREN",
            blockId: "ambiguous-quote",
            message: expect.stringContaining("ambiguous-quote"),
          },
        ],
      },
    });
  });

  it("모호한 own-empty quote의 lossy export는 첫 paragraph를 own content로 승격한다(flattenBlocks와 동일 판정)", () => {
    const document = buildDocument([
      {
        id: "ambiguous-quote",
        type: "quote",
        content: [],
        children: [
          paragraphBlock("promoted-paragraph", "승격 대상 문단"),
          dividerBlock("trailing-divider"),
        ],
      },
    ]);

    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    // 승격 후에도 quote는 컨테이너로 유지된다(paragraph/heading의 D5
    // 형제-평탄화와 다르다) — content만 첫 paragraph로 바뀌고 나머지
    // children(divider)은 그대로 남는다.
    expect(exported.value).toEqual({
      markdown: "> 승격 대상 문단\n>\n> ---\n",
      warnings: [
        {
          kind: "NESTED_CHILDREN",
          blockId: "ambiguous-quote",
          message: expect.stringContaining("ambiguous-quote"),
        },
      ],
    });
  });

  // 아래부터는 사용자가 명시적으로 선택한 전체 범위(2026-09-09, RD-001.md
  // "결정") 확인 — QuoteBlock.children이 model상 허용하는 14종 Block 중
  // paragraph/quote/divider/heading 외 나머지가 quote 안에서도 export
  // 손실 없이 구조를 보존하는지를 대표 유형별로 확인한다.

  it("연속된 bulletListItem 2개가 quote 안에서 하나의 mdast list로 묶인다", () => {
    const document = buildDocument([
      quoteBlock("quote-with-list", "목록 앞", [
        {
          id: "item-1",
          type: "bulletListItem",
          content: [{ text: "첫째" }],
        },
        {
          id: "item-2",
          type: "bulletListItem",
          content: [{ text: "둘째" }],
        },
      ]),
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([]);
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "> 목록 앞\n>\n> * 첫째\n> * 둘째\n",
    });
  });

  it("codeBlock이 quote 안에서도 fence·language를 그대로 보존한다", () => {
    const document = buildDocument([
      quoteBlock("quote-with-code", "설명", [
        {
          id: "code-child",
          type: "codeBlock",
          language: "ts",
          content: [{ text: "const x = 1;" }],
        },
      ]),
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([]);
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      // remark-stringify가 "ts"를 표준 이름 "typescript"로 정규화한다(quote
      // 중첩과 무관한 codeBlockLanguage 기존 동작, 실측 확인).
      value: "> 설명\n>\n> ```typescript\n> const x = 1;\n> ```\n",
    });
  });

  it("table이 quote 안에서도 구조를 보존한다", () => {
    const document = buildDocument([
      {
        id: "quote-with-table",
        type: "quote",
        content: [],
        children: [
          {
            id: "table-child",
            type: "table",
            columns: [
              { id: "col-a", width: 160 },
              { id: "col-b", width: 160 },
            ],
            rows: [
              {
                id: "row-1",
                cells: [
                  {
                    id: "cell-a1",
                    columnId: "col-a",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [{ text: "a" }],
                  },
                  {
                    id: "cell-b1",
                    columnId: "col-b",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [{ text: "b" }],
                  },
                ],
              },
            ],
            // headerRows: 0은 quote 중첩과 무관한 별도 손실(HEADER_ROW)을
            // 낸다(table 자체 계약) — 이 테스트의 관심사가 아니므로 1로 둔다.
            headerRows: 1,
            headerColumns: 0,
          },
        ],
      },
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([]);
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "> | a | b |\n> | - | - |\n",
    });
  });

  it("checkListItem이 quote 안에서도 checked 상태를 보존한다(quote 중첩 자체는 손실이 아니다)", () => {
    const document = buildDocument([
      quoteBlock("quote-with-checklist", "할 일", [
        {
          id: "check-child",
          type: "checkListItem",
          checked: true,
          content: [{ text: "완료" }],
        },
      ]),
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([]);
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "> 할 일\n>\n> * [x] 완료\n",
    });
  });

  it("toggleListItem이 quote 안에 있어도 TOGGLE_STATE_LOST는 quote 중첩과 별개로 그대로 보고된다", () => {
    const document = buildDocument([
      quoteBlock("quote-with-toggle", "토글", [
        {
          id: "toggle-child",
          type: "toggleListItem",
          collapsed: false,
          content: [{ text: "펼침" }],
        },
      ]),
    ]);

    // TOGGLE_STATE_LOST는 "토글이라는 사실 자체"가 GFM에 없다는 손실이라
    // quote가 컨테이너로 편입된 것과 무관하게 계속 보고된다(loss-analysis.ts).
    expect(analyzeMarkdownLoss(document)).toEqual([
      {
        kind: "TOGGLE_STATE_LOST",
        blockId: "toggle-child",
        message: expect.stringContaining("toggle-child"),
      },
    ]);
    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value.markdown).toBe("> 토글\n>\n> * 펼침\n");
  });

  it("image가 quote 안에서도 `![]()` 구문을 그대로 보존한다", () => {
    const document = buildDocument([
      quoteBlock("quote-with-image", "그림", [
        {
          id: "image-child",
          type: "image",
          url: "https://example.com/a.png",
          name: "alt-text",
        },
      ]),
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([]);
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "> 그림\n>\n> ![alt-text](https://example.com/a.png)\n",
    });
  });
});

describe("export→import round-trip(BLK-005 RD-001 DELTA-03)", () => {
  it("quote-in-quote(3단계 중첩)를 export한 markdown을 재import하면 같은 계층이 복원된다", () => {
    const document = buildDocument([
      quoteBlock("outer-quote", "바깥 인용", [
        quoteBlock("inner-quote", "안쪽 인용", [
          paragraphBlock("grandchild-paragraph", "손자 문단"),
        ]),
      ]),
    ]);
    const exported = exportMarkdown(document, { mode: "strict" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.code);

    const { document: reimported, warnings } = importOk(exported.value);

    expect(reimported.blocks).toEqual([
      {
        id: "markdown-1",
        type: "quote",
        content: [{ text: "바깥 인용" }],
        children: [
          {
            id: "markdown-2",
            type: "quote",
            content: [{ text: "안쪽 인용" }],
            children: [
              {
                id: "markdown-3",
                type: "paragraph",
                content: [{ text: "손자 문단" }],
              },
            ],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("own content가 빈 배열인 heading child를 export한 markdown을 재import하면 같은 구조(content 빈 배열, heading child)가 복원된다", () => {
    const document = buildDocument([
      {
        id: "quote-with-heading",
        type: "quote",
        content: [],
        children: [headingBlock("heading-child", 2, "중첩 제목")],
      },
    ]);
    const exported = exportMarkdown(document, { mode: "strict" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.code);

    const { document: reimported, warnings } = importOk(exported.value);

    expect(reimported.blocks).toEqual([
      {
        id: "markdown-1",
        type: "quote",
        content: [],
        children: [
          {
            id: "markdown-2",
            type: "heading",
            level: 2,
            content: [{ text: "중첩 제목" }],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("연속된 bulletListItem 2개를 export한 markdown을 재import하면 quote children으로 그대로 복원된다", () => {
    const document = buildDocument([
      quoteBlock("quote-with-list", "목록 앞", [
        { id: "item-1", type: "bulletListItem", content: [{ text: "첫째" }] },
        { id: "item-2", type: "bulletListItem", content: [{ text: "둘째" }] },
      ]),
    ]);
    const exported = exportMarkdown(document, { mode: "strict" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.code);

    const { document: reimported, warnings } = importOk(exported.value);

    expect(reimported.blocks).toEqual([
      {
        id: "markdown-1",
        type: "quote",
        content: [{ text: "목록 앞" }],
        children: [
          {
            id: "markdown-2",
            type: "bulletListItem",
            content: [{ text: "첫째" }],
          },
          {
            id: "markdown-3",
            type: "bulletListItem",
            content: [{ text: "둘째" }],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("codeBlock을 export한 markdown을 재import하면 quote children으로 복원된다(language는 stringify 정규화값 기준)", () => {
    const document = buildDocument([
      quoteBlock("quote-with-code", "설명", [
        {
          id: "code-child",
          type: "codeBlock",
          language: "ts",
          content: [{ text: "const x = 1;" }],
        },
      ]),
    ]);
    const exported = exportMarkdown(document, { mode: "strict" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.code);

    const { document: reimported, warnings } = importOk(exported.value);

    expect(reimported.blocks).toEqual([
      {
        id: "markdown-1",
        type: "quote",
        content: [{ text: "설명" }],
        children: [
          {
            id: "markdown-2",
            type: "codeBlock",
            // export가 "ts"를 remark-stringify 표준 이름 "typescript"로 내므로
            // (quote 중첩과 무관한 기존 codeBlockLanguage 동작) 재import도
            // "typescript"를 얻는다 — round-trip identity 대상이 아니다.
            language: "typescript",
            content: [{ text: "const x = 1;" }],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("table을 export한 markdown을 재import하면 quote children으로 복원되고 헤더 셀 내용이 보존된다", () => {
    const document = buildDocument([
      {
        id: "quote-with-table",
        type: "quote",
        content: [],
        children: [
          {
            id: "table-child",
            type: "table",
            columns: [
              { id: "col-a", width: 160 },
              { id: "col-b", width: 160 },
            ],
            rows: [
              {
                id: "row-1",
                cells: [
                  {
                    id: "cell-a1",
                    columnId: "col-a",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [{ text: "a" }],
                  },
                  {
                    id: "cell-b1",
                    columnId: "col-b",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [{ text: "b" }],
                  },
                ],
              },
            ],
            headerRows: 1,
            headerColumns: 0,
          },
        ],
      },
    ]);
    const exported = exportMarkdown(document, { mode: "strict" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.code);

    const { document: reimported, warnings } = importOk(exported.value);

    // table 내부 id(columns·rows·cells)는 import가 새로 발급하므로 여기서는
    // "quote children으로 복원됐다"와 "헤더 셀 내용이 보존됐다"만 대조한다.
    expect(reimported.blocks).toHaveLength(1);
    const quote = reimported.blocks[0];
    expect(quote?.type).toBe("quote");
    expect(quote?.children).toHaveLength(1);
    const table = quote?.children?.[0];
    expect(table).toMatchObject({
      type: "table",
      headerRows: 1,
      headerColumns: 0,
      rows: [
        {
          cells: [{ content: [{ text: "a" }] }, { content: [{ text: "b" }] }],
        },
      ],
    });
    expect(warnings).toEqual([]);
  });

  it("checkListItem을 export한 markdown을 재import하면 checked 상태와 quote children 구조가 함께 복원된다", () => {
    const document = buildDocument([
      quoteBlock("quote-with-checklist", "할 일", [
        {
          id: "check-child",
          type: "checkListItem",
          checked: true,
          content: [{ text: "완료" }],
        },
      ]),
    ]);
    const exported = exportMarkdown(document, { mode: "strict" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.code);

    const { document: reimported, warnings } = importOk(exported.value);

    expect(reimported.blocks).toEqual([
      {
        id: "markdown-1",
        type: "quote",
        content: [{ text: "할 일" }],
        children: [
          {
            id: "markdown-2",
            type: "checkListItem",
            checked: true,
            content: [{ text: "완료" }],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("toggleListItem을 export(lossy)한 markdown을 재import하면 toggle 상태만 손실되고(bulletListItem으로) 나머지 quote children 구조는 보존된다", () => {
    const document = buildDocument([
      quoteBlock("quote-with-toggle", "토글", [
        {
          id: "toggle-child",
          type: "toggleListItem",
          collapsed: false,
          content: [{ text: "펼침" }],
        },
      ]),
    ]);
    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);

    const { document: reimported, warnings } = importOk(
      exported.value.markdown,
    );

    // toggleListItem은 GFM에 표현 수단이 없어(TOGGLE_STATE_LOST) 재import는
    // 접힘 정보 없는 bulletListItem으로 복원한다 — quote 중첩 자체는
    // 여전히 손실 없이 보존된다는 것이 이 테스트의 관심사다.
    expect(reimported.blocks).toEqual([
      {
        id: "markdown-1",
        type: "quote",
        content: [{ text: "토글" }],
        children: [
          {
            id: "markdown-2",
            type: "bulletListItem",
            content: [{ text: "펼침" }],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("image를 export한 markdown을 재import하면 quote children으로 복원된다", () => {
    const document = buildDocument([
      quoteBlock("quote-with-image", "그림", [
        {
          id: "image-child",
          type: "image",
          url: "https://example.com/a.png",
          name: "alt-text",
        },
      ]),
    ]);
    const exported = exportMarkdown(document, { mode: "strict" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.code);

    const { document: reimported, warnings } = importOk(exported.value);

    expect(reimported.blocks).toEqual([
      {
        id: "markdown-1",
        type: "quote",
        content: [{ text: "그림" }],
        children: [
          {
            id: "markdown-2",
            type: "image",
            url: "https://example.com/a.png",
            name: "alt-text",
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });
});
