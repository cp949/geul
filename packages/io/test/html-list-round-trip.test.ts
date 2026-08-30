/**
 * 목록 항목이 자신의 콘텐츠와 재귀 children을 소유하는 HTML 정규형을 검증한다.
 * 명시적 시작 번호와 중첩 블록 round-trip을 확인한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

describe("목록 HTML round-trip", () => {
  it("목록 항목 내부에 children을 재귀 직렬화하고 다시 복원한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "n-1",
          type: "numberedListItem",
          startNumber: 7,
          content: [{ text: "부모" }],
          children: [
            { id: "p-1", type: "paragraph", content: [{ text: "자식" }] },
            { id: "q-1", type: "quote", content: [{ text: "인용" }] },
            { id: "d-1", type: "divider" },
            {
              id: "t-1",
              type: "table",
              columns: [{ id: "col-1", width: 160 }],
              rows: [
                {
                  id: "row-1",
                  cells: [
                    {
                      id: "cell-1",
                      columnId: "col-1",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "셀" }],
                    },
                  ],
                },
              ],
              headerRows: 0,
              headerColumns: 0,
            },
            { id: "c-1", type: "codeBlock", content: [{ text: "코드\n줄" }] },
            {
              id: "b-1",
              type: "bulletListItem",
              content: [{ text: "중첩" }],
              children: [
                {
                  id: "h-1",
                  type: "heading",
                  level: 2,
                  content: [{ text: "깊이" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const exported = exportHtml(document);
    expect(exported).toEqual({
      ok: true,
      value:
        '<ol start="7"><li data-be-block-id="n-1"><p>부모</p><p data-be-block-id="p-1">자식</p>' +
        '<blockquote data-be-block-id="q-1"><p>인용</p></blockquote><hr data-be-block-id="d-1">' +
        '<table data-be-block-id="t-1" data-be-header-rows="0" data-be-header-columns="0"><colgroup>' +
        '<col data-be-column-id="col-1" data-be-width="160"></colgroup><tbody><tr data-be-row-id="row-1">' +
        '<td data-be-cell-id="cell-1" data-be-column-id="col-1" rowspan="1" colspan="1">셀</td></tr></tbody></table>' +
        '<pre data-be-block-id="c-1"><code>코드\n줄</code></pre>' +
        '<ul><li data-be-block-id="b-1"><p>중첩</p><h2 data-be-block-id="h-1">깊이</h2></li></ul></li></ol>',
    });
    if (!exported.ok) return;
    expect(importHtml(exported.value)).toMatchObject({
      ok: true,
      value: { document },
    });
  });

  it("시작 번호가 없으면 ol start 속성을 내보내지 않는다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "n-1", type: "numberedListItem", content: [{ text: "하나" }] },
      ],
    };
    expect(exportHtml(document)).toEqual({
      ok: true,
      value: '<ol><li data-be-block-id="n-1">하나</li></ol>',
    });
  });

  it("빈 콘텐츠와 첫 문단 child의 ID와 귀속을 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "empty",
          type: "bulletListItem",
          content: [],
          children: [
            { id: "child", type: "paragraph", content: [{ text: "자식" }] },
          ],
        },
      ],
    };
    const exported = exportHtml(document);
    expect(exported).toEqual({
      ok: true,
      value:
        '<ul><li data-be-block-id="empty"><p></p><p data-be-block-id="child">자식</p></li></ul>',
    });
    if (!exported.ok) return;
    expect(importHtml(exported.value)).toMatchObject({
      ok: true,
      value: { document },
    });
  });

  it("공백 콘텐츠와 첫 문단 child의 ID와 귀속을 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "space",
          type: "numberedListItem",
          content: [{ text: " " }],
          children: [
            { id: "child", type: "paragraph", content: [{ text: "자식" }] },
          ],
        },
      ],
    };
    const exported = exportHtml(document);
    expect(exported).toEqual({
      ok: true,
      value:
        '<ol><li data-be-block-id="space"><p> </p><p data-be-block-id="child">자식</p></li></ol>',
    });
    if (!exported.ok) return;
    expect(importHtml(exported.value)).toMatchObject({
      ok: true,
      value: { document },
    });
  });
});
