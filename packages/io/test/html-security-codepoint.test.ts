/**
 * HTML import에서 금지 코드포인트(C0 제어문자, DEL, 짝 없는 surrogate)를
 * throw 없이 제거하고 경고로 보고하는 동작을 다룬다. html-security.test.ts
 * 에서 관심사 단위로 분리했다(AGENTS.md: describe 직속 it 20개 이상 시 분리).
 */
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

describe("HTML 보안", () => {
  it("C0 제어문자·짝 없는 surrogate가 섞인 문단은 throw 없이 제거하고 경고한다", () => {
    const html = `<p>bad\u0001\u000b${String.fromCharCode(0xd800)}text</p>`;
    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "badtext" }],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "UNSAFE_CODE_POINT_REMOVED",
        element: "p",
      }),
    ]);
  });

  it("같은 조건을 헤딩(h1-h3)에도 적용한다", () => {
    const html = `<h2>bad\u0001text</h2>`;
    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "heading",
        level: 2,
        content: [{ text: "badtext" }],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "UNSAFE_CODE_POINT_REMOVED",
        element: "h2",
      }),
    ]);
  });

  it("제어문자 제거로 빈 조각이 사라지면 같은 mark를 가진 이웃 조각을 병합한다", () => {
    const html = `<p><strong>abc</strong><em>\u0001</em><strong>def</strong></p>`;
    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "abcdef", marks: [{ type: "bold" }] }],
      },
    ]);
  });

  it("표 직속 비섹션 자식(caption)의 제어문자도 표 앞 문단에서 제거하고 경고한다", () => {
    const html = `<table><caption>Cap\u0001tion</caption><tbody><tr><td>a</td></tr></tbody></table>`;
    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const [paragraph, table] = result.value.document.blocks;
    expect(paragraph).toMatchObject({
      type: "paragraph",
      content: [{ text: "Caption" }],
    });
    expect(table?.type).toBe("table");
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSAFE_CODE_POINT_REMOVED",
          element: "caption",
        }),
      ]),
    );
  });

  it("금지 코드포인트가 없는 입력은 UNSAFE_CODE_POINT_REMOVED 경고를 만들지 않는다", () => {
    const result = importHtml("<p>clean text</p>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.warnings).toEqual([]);
  });
});
