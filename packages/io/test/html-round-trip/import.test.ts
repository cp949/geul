/**
 * 일반 HTML 가져오기와 안정 ID 재발급 계약을 검증한다.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  isKnownBlockType,
  type Block,
  type Document,
  type InlineContentItem,
  type TableBlock,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../../src/index.js";

const documentWithMergedTable: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "table-1",
      type: "table",
      columns: [
        { id: "column-1", width: 160 },
        { id: "column-2", width: 240 },
      ],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "column-1",
              rowSpan: 1,
              columnSpan: 2,
              content: [{ text: "Header", marks: [{ type: "bold" }] }],
              textColor: "#112233",
              backgroundColor: "#AABBCC",
            },
          ],
        },
        {
          id: "row-2",
          cells: [
            {
              id: "cell-2",
              columnId: "column-1",
              rowSpan: 2,
              columnSpan: 1,
              content: [{ text: "Row header" }],
            },
            {
              id: "cell-3",
              columnId: "column-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "Body" }],
            },
          ],
        },
        {
          id: "row-3",
          cells: [
            {
              id: "cell-4",
              columnId: "column-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [],
            },
          ],
        },
      ],
      headerRows: 1,
      headerColumns: 1,
    },
  ],
};

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
      importHtml('<p data-be-block-id="html-1">Preserved</p><p>Generated</p>'),
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
  // div/li/blockquote 안에 중첩된 요소의 data-be-block-id를 아예 읽지
  // 않았다 — 중첩 id가 최상위 id와 겹쳐도 항상 무시돼(inert) 조용히
  // 통과했다. block-segmenter.ts 도입으로 이제 중첩 요소도 실제 블록이 돼
  // 그 id를 읽으므로, 같은 id가 중첩 위치에서 재사용되면 model의 기존
  // 중복 id 불변식(schema.ts "Duplicate id")에 걸려 거절된다 — 이건 이번
  // 커밋이 새로 만든 실패가 아니라 이전엔 도달 못 하던 위치에서 기존
  // 불변식이 이제 정상적으로 작동하는 것이다(고쳐야 할 회귀가 아니다).
  it("중첩 요소가 최상위와 같은 data-be-block-id를 재사용하면 거절한다", () => {
    expect(
      importHtml(
        '<p data-be-block-id="x">top</p><div><p data-be-block-id="x">nested</p></div>',
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });
});
