/**
 * 독립 문서 모델의 구조·id·revision 등 기본 계약을 검증한다.
 * mark 정렬은 document-mark-ordering.test.ts, 링크 정책은 document-link-policy.test.ts,
 * 표 크기·색상·정렬 검증은 document-table-validation.test.ts로 분리되어 있다.
 */
import { describe, expect, it } from "vitest";
import {
  createEmptyDocument,
  parseDocument,
  sanitizeInlineText,
} from "../src/index.js";

const documentWithText = (text: string) => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "paragraph-text",
      type: "paragraph",
      content: [{ text }],
    },
  ],
});

describe("독립 문서 모델", () => {
  it("빈 문서를 만들면 버전과 리비전이 고정된 문단 문서가 나온다", () => {
    const document = createEmptyDocument(() => "block-1");

    expect(document).toEqual({
      formatVersion: 1,
      revision: 0,
      blocks: [{ id: "block-1", type: "paragraph", content: [] }],
    });
  });

  it("중복된 id는 예외를 던지지 않고 검증 실패로 보고한다", () => {
    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "same", type: "paragraph", content: [] },
        { id: "same", type: "heading", level: 2, content: [] },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 1, "id"],
        message: "Duplicate id: same",
      },
    });
  });

  it("지원하지 않는 formatVersion은 거부한다", () => {
    expect(
      parseDocument({ formatVersion: 2, revision: 0, blocks: [] }),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_FORMAT_UNSUPPORTED" },
    });
  });

  it("유효한 문서는 구조를 복사해 반환한다", () => {
    const input = {
      formatVersion: 1,
      revision: 3,
      blocks: [
        { id: "paragraph-1", type: "paragraph", content: [{ text: "Hello" }] },
      ],
    };
    const result = parseDocument(input);

    expect(result).toEqual({ ok: true, value: input });
    if (result.ok) {
      expect(result.value).not.toBe(input);
      expect(result.value.blocks).not.toBe(input.blocks);
    }
  });

  it("LF 텍스트는 허용하고 CRLF는 저장 전에 호출자가 정규화하도록 거부한다", () => {
    expect(parseDocument(documentWithText("line 1\nline 2"))).toMatchObject({
      ok: true,
    });
    expect(parseDocument(documentWithText("line 1\r\nline 2"))).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "text"],
      },
    });
  });

  it.each([
    ["NUL", "text\u0000value"],
    ["tab", "text\tvalue"],
    ["DEL", "text\u007fvalue"],
    ["lone surrogate", `text${String.fromCharCode(0xd800)}value`],
  ])("인라인 텍스트에 %s 문자가 있으면 거부한다", (_name, text) => {
    expect(parseDocument(documentWithText(text))).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "text"],
      },
    });
  });

  it.each([
    ["NUL", "text\u0000value", "textvalue"],
    ["DEL", "text\u007fvalue", "textvalue"],
    ["lone surrogate", `text${String.fromCharCode(0xd800)}value`, "textvalue"],
  ])(
    "sanitizeInlineText는 %s 문자를 제거하고 나머지는 그대로 둔다",
    (_name, text, expected) => {
      const sanitized = sanitizeInlineText(text);
      expect(sanitized).toBe(expected);
      expect(parseDocument(documentWithText(sanitized))).toMatchObject({
        ok: true,
      });
    },
  );

  it("sanitizeInlineText는 LF와 정상 surrogate pair를 보존한다", () => {
    expect(sanitizeInlineText("line 1\nline 2")).toBe("line 1\nline 2");
    expect(sanitizeInlineText("😀")).toBe("😀");
  });

  it.each([
    ["LF", "block\nid"],
    ["CR", "block\rid"],
    ["NUL", "block\u0000id"],
    ["DEL", "block\u007fid"],
    ["lone surrogate", `block${String.fromCharCode(0xdfff)}id`],
  ])("안정 ID에 %s 문자가 있으면 거부한다", (_name, id) => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [{ id, type: "paragraph", content: [] }],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "id"] },
    });
  });

  it("음수이거나 안전 정수 범위를 벗어난 revision은 거부한다", () => {
    expect(
      parseDocument({ formatVersion: 1, revision: -1, blocks: [] }),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["revision"] },
    });
    expect(
      parseDocument({
        formatVersion: 1,
        revision: Number.MAX_SAFE_INTEGER + 1,
        blocks: [],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["revision"] },
    });
  });

  it("표 구성 요소끼리 id가 중복되면 거부한다", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "table-1",
            type: "table",
            columns: [{ id: "shared", width: 48 }],
            rows: [
              {
                id: "row-1",
                cells: [
                  {
                    id: "shared",
                    columnId: "shared",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [],
                  },
                ],
              },
            ],
            headerRows: 0,
            headerColumns: 0,
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "rows", 0, "cells", 0, "id"],
      },
    });
  });

  it("서로 다른 블록에 걸쳐 id 중복과 링크 위반이 있으면 순회 순서(앞쪽 블록부터)로 보고한다", () => {
    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "duplicate",
          type: "paragraph",
          content: [
            {
              text: "link",
              marks: [{ type: "link", href: "javascript:alert(1)" }],
            },
          ],
        },
        { id: "duplicate", type: "paragraph", content: [] },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 0, "href"],
      },
    });
  });

  it("서로 다른 블록에 걸쳐 링크 위반과 텍스트 위반이 있으면 순회 순서(앞쪽 블록부터)로 보고한다", () => {
    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "block-with-bad-link",
          type: "paragraph",
          content: [
            {
              text: "link",
              marks: [{ type: "link", href: "javascript:alert(1)" }],
            },
          ],
        },
        {
          id: "block-with-bad-text",
          type: "paragraph",
          content: [{ text: "bad\u0000text" }],
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 0, "href"],
      },
    });
  });

  it("같은 블록의 content 배열 안에서 앞 아이템의 링크 위반과 뒤 아이템의 텍스트 위반이 있으면 순회 순서(앞쪽 아이템부터)로 보고한다", () => {
    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "block-with-mixed-items",
          type: "paragraph",
          content: [
            {
              text: "link",
              marks: [{ type: "link", href: "javascript:alert(1)" }],
            },
            { text: "bad\u0000text" },
          ],
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 0, "href"],
      },
    });
  });
});
