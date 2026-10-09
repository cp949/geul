/**
 * 일반 HTML 가져오기와 안정 ID 재발급 계약을 검증한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../../src/index.js";

describe("HTML 왕복 변환", () => {
  it("평범한 HTML 표는 주입된 id와 col 너비로 가져온다", () => {
    const ids = Array.from(
      { length: 10 },
      (_, index) => `generated-${index + 1}`,
    );
    const result = importHtml(
      '<table><colgroup><col width="120"><col width="180"></colgroup><thead><tr><th colspan="2">Header</th></tr></thead><tbody><tr><th scope="row" rowspan="2">Row</th><td>B</td></tr><tr><td>C</td></tr></tbody></table>',
      { createId: () => ids.shift() ?? "unexpected-id" },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "generated-1",
              type: "table",
              columns: [
                { id: "generated-2", width: 120 },
                { id: "generated-3", width: 180 },
              ],
              rows: [
                {
                  id: "generated-4",
                  cells: [
                    {
                      id: "generated-5",
                      columnId: "generated-2",
                      rowSpan: 1,
                      columnSpan: 2,
                      content: [{ text: "Header" }],
                    },
                  ],
                },
                {
                  id: "generated-6",
                  cells: [
                    {
                      id: "generated-7",
                      columnId: "generated-2",
                      rowSpan: 2,
                      columnSpan: 1,
                      content: [{ text: "Row" }],
                    },
                    {
                      id: "generated-8",
                      columnId: "generated-3",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "B" }],
                    },
                  ],
                },
                {
                  id: "generated-9",
                  cells: [
                    {
                      id: "generated-10",
                      columnId: "generated-3",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "C" }],
                    },
                  ],
                },
              ],
              headerRows: 1,
              headerColumns: 1,
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("알 수 없는 최상위 텍스트는 문단으로 강등하고 revision을 초기화한다", () => {
    const ids = ["paragraph-generated", "heading-generated"];
    expect(
      importHtml("<aside>Loose <strong>text</strong></aside><h2>Title</h2>", {
        createId: () => ids.shift() ?? "unexpected-id",
      }),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "paragraph-generated",
              type: "paragraph",
              content: [
                { text: "Loose " },
                { text: "text", marks: [{ type: "bold" }] },
              ],
            },
            {
              id: "heading-generated",
              type: "heading",
              level: 2,
              content: [{ text: "Title" }],
            },
          ],
        },
        warnings: [
          expect.objectContaining({
            kind: "SAFE_BLOCK_DOWNGRADED",
            element: "aside",
          }),
        ],
      },
    });

    const revised: Document = {
      formatVersion: 1,
      revision: 42,
      blocks: [{ id: "stable", type: "paragraph", content: [] }],
    };
    const exported = exportHtml(revised);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).not.toContain("42");
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: {
        document: { ...revised, revision: 0 },
        warnings: [],
      },
    });
  });

  it("보존된 정규 id 옆에서도 기본 생성 id가 겹치지 않는다", () => {
    expect(
      importHtml(
        '<p data-geul-block-id="html-1">Preserved</p><p>Generated</p>',
      ),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "html-1",
              type: "paragraph",
              content: [{ text: "Preserved" }],
            },
            {
              id: "html-2",
              type: "paragraph",
              content: [{ text: "Generated" }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  // ce55f9f 이전에는 documentFromRoot가 최상위 노드만 훑는 평면 루프라
  // div/li/blockquote 안에 중첩된 요소의 data-geul-block-id를 아예 읽지
  // 않았다 — 중첩 id가 최상위 id와 겹쳐도 항상 무시돼(inert) 조용히
  // 통과했다. block-segmenter.ts 도입으로 이제 중첩 요소도 실제 블록이 돼
  // 그 id를 읽으므로, 같은 id가 중첩 위치에서 재사용되면 model의 기존
  // 중복 id 불변식(schema.ts "Duplicate id")에 걸려 거절된다 — 이건 이번
  // 커밋이 새로 만든 실패가 아니라 이전엔 도달 못 하던 위치에서 기존
  // 불변식이 이제 정상적으로 작동하는 것이다(고쳐야 할 회귀가 아니다).
  it("중첩 요소가 최상위와 같은 data-geul-block-id를 재사용하면 거절한다", () => {
    expect(
      importHtml(
        '<p data-geul-block-id="x">top</p><div><p data-geul-block-id="x">nested</p></div>',
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

  // Issue #320: importHtml이 외부 HTML의 소스 공백을 접어도 우리 export가 낸
  // 공백은 왕복에서 보존된다. export는 data-geul-block-id·data-geul-cell-id를
  // 달고, 입력에 그 표식이 하나라도 있으면 접기를 건너뛴다.
  it("exportHtml이 낸 연속·양끝 공백은 importHtml 왕복에서 보존된다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "paragraph", type: "paragraph", content: [{ text: "a  b " }] },
        { id: "item", type: "bulletListItem", content: [{ text: "x  y" }] },
        { id: "quote", type: "quote", content: [{ text: "q  q" }] },
        {
          id: "table",
          type: "table",
          columns: [{ id: "column", width: 160 }],
          rows: [
            {
              id: "row",
              cells: [
                {
                  id: "cell",
                  columnId: "column",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "c  d" }],
                },
              ],
            },
          ],
          headerRows: 0,
          headerColumns: 0,
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    const imported = importHtml(exported.value);

    expect(imported).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  // Issue #322: 미리보기 CSS가 빈 문단에 높이를 주는 쪽(preview.css)으로
  // 풀기로 했다. export 출력은 바꾸지 않고 빈 문단을 `<p …></p>` 그대로
  // 내보낸다. 왕복에서 빈 문단 수가 유지돼야 그 전제가 선다.
  it.each([0, 1, 2, 3])(
    "빈 문단 %i개는 exportHtml이 빈 <p>로 내보내고 importHtml 왕복에서 수가 유지된다",
    (emptyCount) => {
      const document: Document = {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "above", type: "paragraph", content: [{ text: "위" }] },
          ...Array.from({ length: emptyCount }, (_, index) => ({
            id: `empty-${index}`,
            type: "paragraph" as const,
            content: [],
          })),
          { id: "below", type: "paragraph", content: [{ text: "아래" }] },
        ],
      };

      const exported = exportHtml(document);
      expect(exported.ok).toBe(true);
      if (!exported.ok) throw new Error(exported.error.message);
      const emptyParagraphs =
        exported.value.match(/<p data-geul-block-id="empty-\d+"><\/p>/g) ?? [];
      expect(emptyParagraphs).toHaveLength(emptyCount);
      expect(exported.value).not.toContain("<br");

      expect(importHtml(exported.value)).toEqual({
        ok: true,
        value: { document, warnings: [] },
      });
    },
  );

  it("우리 export 조각 옆의 외부 조각도 접지 않는다(문서 단위 판정)", () => {
    const imported = importHtml(
      '<p data-geul-block-id="own">a  b </p><p>c  d\ne</p>',
    );

    expect(imported).toMatchObject({
      ok: true,
      value: {
        document: {
          blocks: [
            { id: "own", content: [{ text: "a  b " }] },
            { content: [{ text: "c  d\ne" }] },
          ],
        },
      },
    });
  });
});
