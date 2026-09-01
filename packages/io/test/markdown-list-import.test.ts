/**
 * GFM 목록 import가 목록 종류·시작 번호와 mdast가 표현하는 임의 자식
 * 계층을 model 목록 블록으로 보존하고 깊이 상한을 우회하지 않는지 검증한다.
 */
import { MAX_NESTING_DEPTH } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importMarkdown } from "../src/index.js";

/**
 * 성공한 Markdown import 결과를 반환한다. 실패 메시지를 그대로 노출해
 * fixture 파싱 실패와 구조 단언 실패를 구분한다.
 */
const importDocument = (source: string) => {
  const result = importMarkdown(source);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

/**
 * 각 항목이 바로 앞 항목의 자식인 GFM 글머리 목록을 만든다. model depth
 * 경계와 importer의 parseDocument 위임을 같은 공개 seam에서 검증한다.
 */
const buildNestedListMarkdown = (levels: number): string =>
  Array.from(
    { length: levels },
    (_, index) => `${"  ".repeat(index)}- 항목-${index + 1}`,
  ).join("\n");

describe("GFM 목록 기본 의미", () => {
  // task 항목(`- [ ]`/`- [x]`)의 checkListItem 매핑은
  // markdown-check-list-item-import.test.ts가 전담한다(RD-002 DELTA-02).
  it("task가 아닌 글머리·번호 항목은 목록 타입으로 경고 없이 보존한다", () => {
    const { document, warnings } = importDocument("- 일반\n\n1. 번호");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "bulletListItem",
        content: [{ text: "일반" }],
      },
      {
        id: "markdown-2",
        type: "numberedListItem",
        content: [{ text: "번호" }],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("글머리·번호 목록 종류와 명시된 시작 번호만 첫 항목에 보존한다", () => {
    const { document, warnings } = importDocument(
      ["- 글머리", "", "7. 일곱", "8. 여덟", "", "1. 기본"].join("\n"),
    );

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "bulletListItem",
        content: [{ text: "글머리" }],
      },
      {
        id: "markdown-2",
        type: "numberedListItem",
        startNumber: 7,
        content: [{ text: "일곱" }],
      },
      {
        id: "markdown-3",
        type: "numberedListItem",
        content: [{ text: "여덟" }],
      },
      {
        id: "markdown-4",
        type: "numberedListItem",
        content: [{ text: "기본" }],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("인접한 별도 번호 목록이 1부터 다시 시작하면 두 번째 목록 경계를 명시한다", () => {
    const { document, warnings } = importDocument("1. 첫째\n\n1) 다시 하나");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "numberedListItem",
        content: [{ text: "첫째" }],
      },
      {
        id: "markdown-2",
        type: "numberedListItem",
        startNumber: 1,
        content: [{ text: "다시 하나" }],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("목록 children scope의 인접한 별도 번호 목록도 1 재시작 경계를 명시한다", () => {
    const { document, warnings } = importDocument(
      ["- 부모", "", "  1. 첫째", "", "  1) 다시 하나"].join("\n"),
    );

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "bulletListItem",
        content: [{ text: "부모" }],
        children: [
          {
            id: "markdown-2",
            type: "numberedListItem",
            content: [{ text: "첫째" }],
          },
          {
            id: "markdown-3",
            type: "numberedListItem",
            startNumber: 1,
            content: [{ text: "다시 하나" }],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("목록 항목 안 blockquote를 경고 없는 quote 자식으로 보존한다", () => {
    const { document, warnings } = importDocument("- > 인용");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "bulletListItem",
        content: [],
        children: [
          {
            id: "markdown-2",
            type: "quote",
            content: [{ text: "인용" }],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("글머리·번호 혼합 중첩 목록의 content·children·순서를 보존한다", () => {
    const { document, warnings } = importDocument(
      ["- 부모", "", "  3. 번호", "     - 깊은 글머리", "  4. 다음 번호"].join(
        "\n",
      ),
    );

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "bulletListItem",
        content: [{ text: "부모" }],
        children: [
          {
            id: "markdown-2",
            type: "numberedListItem",
            startNumber: 3,
            content: [{ text: "번호" }],
            children: [
              {
                id: "markdown-3",
                type: "bulletListItem",
                content: [{ text: "깊은 글머리" }],
              },
            ],
          },
          {
            id: "markdown-4",
            type: "numberedListItem",
            content: [{ text: "다음 번호" }],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("목록 항목 아래 paragraph·heading·quote·divider·CodeBlock·table·list를 자식으로 보존한다", () => {
    const { document, warnings } = importDocument(
      [
        "- 부모",
        "",
        "  후속 문단",
        "",
        "  ## 제목",
        "",
        "  > 인용",
        "",
        "  ---",
        "",
        "  ```ts",
        "  코드",
        "  ```",
        "",
        "  | 열 |",
        "  | - |",
        "  | 셀 |",
        "",
        "  3. 자식 번호",
      ].join("\n"),
    );

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "bulletListItem",
        content: [{ text: "부모" }],
        children: [
          {
            id: "markdown-2",
            type: "paragraph",
            content: [{ text: "후속 문단" }],
          },
          {
            id: "markdown-3",
            type: "heading",
            level: 2,
            content: [{ text: "제목" }],
          },
          {
            id: "markdown-4",
            type: "quote",
            content: [{ text: "인용" }],
          },
          { id: "markdown-5", type: "divider" },
          {
            id: "markdown-6",
            type: "codeBlock",
            language: "typescript",
            content: [{ text: "코드" }],
          },
          {
            id: "markdown-7",
            type: "table",
            columns: [{ id: "markdown-8", width: 160 }],
            rows: [
              {
                id: "markdown-9",
                cells: [
                  {
                    id: "markdown-10",
                    columnId: "markdown-8",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [{ text: "열" }],
                  },
                ],
              },
              {
                id: "markdown-11",
                cells: [
                  {
                    id: "markdown-12",
                    columnId: "markdown-8",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [{ text: "셀" }],
                  },
                ],
              },
            ],
            headerRows: 1,
            headerColumns: 0,
          },
          {
            id: "markdown-13",
            type: "numberedListItem",
            startNumber: 3,
            content: [{ text: "자식 번호" }],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });
});

describe("GFM 목록 깊이 경계", () => {
  it(`model 깊이 상한 ${MAX_NESTING_DEPTH}을 넘는 목록을 MARKDOWN_DOCUMENT_INVALID로 거절한다`, () => {
    expect(
      importMarkdown(buildNestedListMarkdown(MAX_NESTING_DEPTH + 1)),
    ).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_DOCUMENT_INVALID",
        message: expect.stringContaining(
          `Nesting depth exceeds ${MAX_NESTING_DEPTH}`,
        ),
      },
    });
  });
});
