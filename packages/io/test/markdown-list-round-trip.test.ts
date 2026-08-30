/**
 * GFM 목록 export/import가 목록 항목의 표현 가능한 자식 계층과 시작 번호를
 * ID를 제외한 저장 의미로 보존하는지 검증한다.
 */
import type { Block, Document, TableBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  analyzeMarkdownLoss,
  exportMarkdown,
  importMarkdown,
} from "../src/index.js";

type BlockMeaning = Record<string, unknown>;

/**
 * 표 내부의 행·열·셀 ID와 columnId 참조를 열 순서로 치환한다. GFM이 새
 * ID를 발급해도 표의 셀 콘텐츠와 행·열 순서가 같은지 검증하기 위한 표현이다.
 */
const tableMeaning = (table: TableBlock): BlockMeaning => ({
  type: table.type,
  columns: table.columns.map((column) => ({ width: column.width })),
  rows: table.rows.map((row) => ({
    cells: row.cells.map((cell) => ({
      columnIndex: table.columns.findIndex(
        (column) => column.id === cell.columnId,
      ),
      rowSpan: cell.rowSpan,
      columnSpan: cell.columnSpan,
      content: cell.content,
      ...(cell.align === undefined ? {} : { align: cell.align }),
    })),
  })),
  headerRows: table.headerRows,
  headerColumns: table.headerColumns,
});

/**
 * GFM이 보존하지 않는 안정 ID만 제거해 목록의 재귀 구조와 형제 순서를
 * 직접 비교할 수 있는 의미 표현을 만든다.
 */
const blockMeaning = (block: Block): BlockMeaning => {
  if (block.type === "table") return tableMeaning(block);
  const withoutId = Object.fromEntries(
    Object.entries(block).filter(([key]) => key !== "id" && key !== "children"),
  );
  if (!("children" in block) || block.children === undefined) {
    return withoutId;
  }
  return {
    ...withoutId,
    children: block.children.map(blockMeaning),
  };
};

/**
 * strict export와 재-import가 성공했다고 단언하고 ID를 제외한 블록 의미가
 * 원본과 같은지 비교한다.
 */
const expectMeaningRoundTrip = (document: Document): string => {
  expect(analyzeMarkdownLoss(document)).toEqual([]);
  const exported = exportMarkdown(document, { mode: "strict" });
  expect(exported.ok).toBe(true);
  if (!exported.ok) throw new Error(exported.error.code);

  const imported = importMarkdown(exported.value);
  expect(imported.ok).toBe(true);
  if (!imported.ok) throw new Error(imported.error.message);
  expect(imported.value.warnings).toEqual([]);
  expect(imported.value.document.blocks.map(blockMeaning)).toEqual(
    document.blocks.map(blockMeaning),
  );
  return exported.value;
};

describe("GFM 목록 계층 왕복", () => {
  it("빈 목록 content와 첫 non-paragraph child는 무손실로 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "empty-list-parent",
          type: "bulletListItem",
          content: [],
          children: [
            {
              id: "quote-child",
              type: "quote",
              content: [{ text: "인용" }],
            },
          ],
        },
      ],
    };

    expect(expectMeaningRoundTrip(document)).toBe("* > 인용\n");
  });

  it("혼합 중첩 목록과 명시·미지정 시작 번호를 strict export/import로 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "bullet-parent",
          type: "bulletListItem",
          content: [{ text: "부모" }],
          children: [
            {
              id: "numbered-3",
              type: "numberedListItem",
              startNumber: 3,
              content: [{ text: "번호" }],
              children: [
                {
                  id: "bullet-deep",
                  type: "bulletListItem",
                  content: [{ text: "깊은 글머리" }],
                },
              ],
            },
            {
              id: "numbered-next",
              type: "numberedListItem",
              content: [{ text: "다음 번호" }],
            },
          ],
        },
      ],
    };

    expect(expectMeaningRoundTrip(document)).toBe(
      "* 부모\n\n  3. 번호\n\n     * 깊은 글머리\n\n  3. 다음 번호\n",
    );
  });

  it("목록 항목의 paragraph·heading·quote·divider·CodeBlock·table·list 자식과 순서를 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent",
          type: "bulletListItem",
          content: [{ text: "부모" }],
          children: [
            {
              id: "paragraph",
              type: "paragraph",
              content: [{ text: "후속 문단" }],
            },
            {
              id: "heading",
              type: "heading",
              level: 2,
              content: [{ text: "제목" }],
            },
            { id: "quote", type: "quote", content: [{ text: "인용" }] },
            { id: "divider", type: "divider" },
            {
              id: "code",
              type: "codeBlock",
              language: "typescript",
              content: [{ text: "코드" }],
            },
            {
              id: "table",
              type: "table",
              columns: [
                { id: "column-1", width: 160 },
                { id: "column-2", width: 160 },
              ],
              rows: [
                {
                  id: "row-1",
                  cells: [
                    {
                      id: "cell-1",
                      columnId: "column-1",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "열" }],
                    },
                    {
                      id: "cell-2",
                      columnId: "column-2",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "값" }],
                    },
                  ],
                },
                {
                  id: "row-2",
                  cells: [
                    {
                      id: "cell-3",
                      columnId: "column-1",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "셀" }],
                    },
                    {
                      id: "cell-4",
                      columnId: "column-2",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "내용" }],
                    },
                  ],
                },
              ],
              headerRows: 1,
              headerColumns: 0,
            },
            {
              id: "child-list",
              type: "bulletListItem",
              content: [{ text: "하위 글머리" }],
            },
          ],
        },
      ],
    };

    expect(expectMeaningRoundTrip(document)).toBe(
      [
        "* 부모",
        "",
        "  후속 문단",
        "",
        "  ## 제목",
        "",
        "  > 인용",
        "",
        "  ---",
        "",
        "  ```typescript",
        "  코드",
        "  ```",
        "",
        "  | 열 | 값  |",
        "  | - | -- |",
        "  | 셀 | 내용 |",
        "",
        "  * 하위 글머리",
        "",
      ].join("\n"),
    );
  });
});
