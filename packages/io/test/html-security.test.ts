/**
 * HTML import/export의 보안 경계를 확인하는 테스트.
 * 위험한 요소·속성·URL 제거와, 제거 사실이 경고로 보고되는지를 다룬다.
 * 지원하지 않는 블록의 SAFE_BLOCK_DOWNGRADED 경고는 html-security-block-
 * boundary.test.ts, 금지 코드포인트 정제는 html-security-codepoint.test.ts,
 * 표 크기 상한·셀 정제는 html-security-table-limits.test.ts로 분리했다
 * (AGENTS.md: describe 직속 it 20개 이상 시 관심사 단위 분리).
 */
import { readFileSync } from "node:fs";

import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

const dangerousFixture = readFileSync(
  new URL("./fixtures/dangerous.html", import.meta.url),
  "utf8",
);

describe("HTML 보안", () => {
  it("문단 앞의 주석은 무시하고 본문만 가져온다", () => {
    expect(importHtml("<!--note--><p>ok</p>")).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "html-1",
              type: "paragraph",
              content: [{ text: "ok" }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("주석만 있는 HTML은 빈 문서로 가져온다", () => {
    expect(importHtml("<!--note-->")).toEqual({
      ok: true,
      value: {
        document: { formatVersion: 1, revision: 0, blocks: [] },
        warnings: [],
      },
    });
  });

  it("주석 안의 script 텍스트는 위험한 HTML로 취급하지 않는다", () => {
    const result = importHtml("<!--<script>alert(1)</script>--><p>safe</p>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "safe" }],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it("실행 가능한 HTML을 제거한다", () => {
    const result = importHtml(dangerousFixture);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSAFE_ELEMENT_REMOVED",
          element: "script",
        }),
        expect.objectContaining({
          kind: "UNSAFE_ELEMENT_REMOVED",
          element: "img",
        }),
        expect.objectContaining({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: "p",
          attribute: "onClick",
        }),
        expect.objectContaining({
          kind: "UNSAFE_URL_REMOVED",
          element: "a",
          attribute: "href",
        }),
      ]),
    );

    const exported = exportHtml(result.value.document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);

    expect(exported.value).not.toMatch(
      /script|onerror|onclick|javascript:|data:text\/html/i,
    );
    expect(exported.value).not.toMatch(
      /(?:\s|<)(?:style|class|id|src|on\w+|data-arbitrary|data-__proto__|__proto__|constructor|prototype)=/i,
    );
    expect(exported.value).not.toMatch(/<\/?(?:svg|style|img|iframe|object)/i);
  });

  it("지원하는 링크와 상대 경로는 남기고 위험한 링크만 제거한다", () => {
    const result = importHtml(
      '<p data-be-block-id="links"><a href="//evil.example">scheme-relative</a><a href="tel:+821012345678">phone</a><a href="/safe">relative</a></p>',
    );

    expect(result).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "links",
              type: "paragraph",
              content: [
                { text: "scheme-relative" },
                {
                  text: "phone",
                  marks: [{ type: "link", href: "tel:+821012345678" }],
                },
                {
                  text: "relative",
                  marks: [{ type: "link", href: "/safe" }],
                },
              ],
            },
          ],
        },
        warnings: [
          expect.objectContaining({
            kind: "UNSAFE_URL_REMOVED",
            element: "a",
            attribute: "href",
          }),
        ],
      },
    });
  });

  it.each(["\\evil.example", "/\\evil.example", "\\/evil.example"])(
    "브라우저가 authority로 해석하는 변형 링크를 경고와 함께 제거한다 — %s",
    (href) => {
      const result = importHtml(`<p><a href="${href}">unsafe</a></p>`);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.value.document.blocks[0]).toMatchObject({
        type: "paragraph",
        content: [{ text: "unsafe" }],
      });
      expect(result.value.warnings).toEqual([
        expect.objectContaining({
          kind: "UNSAFE_URL_REMOVED",
          element: "a",
          attribute: "href",
        }),
      ]);
    },
  );

  it("공백으로 위장한 실행 가능 URL은 내보내지 않는다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "unsafe-link",
          type: "paragraph",
          content: [
            {
              text: "unsafe",
              marks: [{ type: "link", href: " javascript:alert(1)" }],
            },
          ],
        },
      ],
    };

    const result = exportHtml(document);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Unsafe URL was exported");
    expect(result.error.code).toBe("HTML_DOCUMENT_INVALID");
  });

  it("제어문자로 위장한 실행 가능 URL은 내보내지 않는다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "unsafe-control-link",
          type: "paragraph",
          content: [
            {
              text: "unsafe",
              marks: [{ type: "link", href: "java\nscript:alert(1)" }],
            },
          ],
        },
      ],
    };

    expect(exportHtml(document)).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });
});
