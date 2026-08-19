/**
 * 독립 문서 모델의 링크 href 허용 정책과 link mark 중복 검증을 확인한다.
 */
import { describe, expect, it } from "vitest";
import { isSupportedLinkHref, parseDocument } from "../src/index.js";

const documentWithLink = (href: string) => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "paragraph-link",
      type: "paragraph",
      content: [{ text: "link", marks: [{ type: "link", href }] }],
    },
  ],
});

describe("독립 문서 모델 - 링크 정책", () => {
  it("지원하는 링크 프로토콜만 허용하고 나머지는 거부한다", () => {
    for (const href of [
      "https://example.com",
      "http://example.com",
      "mailto:a@example.com",
      "tel:+821012345678",
      "/relative",
      "#section",
    ]) {
      expect(
        parseDocument({
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: `paragraph-${href}`,
              type: "paragraph",
              content: [{ text: "link", marks: [{ type: "link", href }] }],
            },
          ],
        }),
      ).toMatchObject({ ok: true });
    }

    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "paragraph-invalid-link",
            type: "paragraph",
            content: [
              {
                text: "link",
                marks: [{ type: "link", href: "javascript:alert(1)" }],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 0, "href"],
      },
    });
  });

  it("문서의 링크 정책을 재사용 가능한 술어 함수로 공개한다", () => {
    expect(isSupportedLinkHref("https://example.com/encoded%20space")).toBe(
      true,
    );
    expect(isSupportedLinkHref("https://example.com/raw space")).toBe(false);
  });

  it.each([
    "https://example.com/raw space",
    "/relative\tpath",
    "java\nscript:alert(1)",
    "java\u0000script:alert(1)",
    "https://example.com/\u007fpath",
    "//example.com/protocol-relative",
    "\\evil.example",
    "/\\evil.example",
    "\\/evil.example",
  ])("공백·제어문자·프로토콜 상대 경로가 든 링크를 거부한다 — %s", (href) => {
    expect(parseDocument(documentWithLink(href))).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 0, "href"],
      },
    });
  });

  it.each([
    "https://example.com/encoded%20space",
    "/relative%09tab",
    "#encoded%7Fcontrol",
  ])("퍼센트 인코딩된 링크는 허용한다 — %s", (href) => {
    expect(parseDocument(documentWithLink(href))).toMatchObject({ ok: true });
  });

  it("같은 문단 인라인 항목에 두 번째 link mark가 오면 거부한다", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "paragraph-duplicate-links",
            type: "paragraph",
            content: [
              {
                text: "nested links",
                marks: [
                  { type: "link", href: "https://outer.example" },
                  { type: "link", href: "https://inner.example" },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 1],
        message: "Inline item must contain at most one link mark",
      },
    });
  });

  it("표 셀 인라인 내용에 두 번째 link mark가 오면 거부한다", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "table-duplicate-links",
            type: "table",
            columns: [{ id: "column-duplicate-links", width: 160 }],
            rows: [
              {
                id: "row-duplicate-links",
                cells: [
                  {
                    id: "cell-duplicate-links",
                    columnId: "column-duplicate-links",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [
                      {
                        text: "nested links",
                        marks: [
                          { type: "link", href: "/outer" },
                          { type: "link", href: "/inner" },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
            headerRows: 0,
            headerColumns: 0,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "rows", 0, "cells", 0, "content", 0, "marks", 1],
        message: "Inline item must contain at most one link mark",
      },
    });
  });

  it("지원하지 않는 링크 URL 검사를 link 중복 검사보다 먼저 수행한다", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "paragraph-invalid-duplicate-links",
            type: "paragraph",
            content: [
              {
                text: "nested links",
                marks: [
                  { type: "link", href: "https://safe.example" },
                  { type: "link", href: "javascript:alert(1)" },
                ],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 1, "href"],
        message: "Unsupported link URL",
      },
    });
  });
});
