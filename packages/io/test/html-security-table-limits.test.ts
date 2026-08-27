/**
 * HTML import에서 표 크기 상한(colspan/추론 열/colgroup) 거부와 셀
 * 콘텐츠(C0 제어문자, style 속성) 정제를 다룬다. html-security.test.ts에서
 * 관심사 단위로 분리했다(AGENTS.md: describe 직속 it 20개 이상 시 분리).
 */
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

describe("HTML 보안", () => {
  it("과도한 span은 열 생성으로 확장하지 않고 거부한다", () => {
    let idCalls = 0;
    const result = importHtml(
      '<table><tbody><tr><td colspan="100001">oversized</td></tr></tbody></table>',
      {
        createId: () => {
          idCalls += 1;
          return `generated-${idCalls}`;
        },
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
    expect(idCalls).toBeLessThan(20);
  });

  it("행·열이 없는 빈 표는 거부한다", () => {
    const result = importHtml("<table></table>");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

  it("추론 열 10000개는 허용하고 10001개는 모델 할당 전에 거부한다", () => {
    const atLimit = importHtml(
      `<table><tbody><tr>${"<td>x</td>".repeat(10_000)}</tr></tbody></table>`,
    );
    expect(atLimit.ok).toBe(true);
    if (!atLimit.ok) throw new Error(atLimit.error.message);
    const table = atLimit.value.document.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("Expected table block");
    expect(table.columns).toHaveLength(10_000);
    expect(table.rows[0]?.cells).toHaveLength(10_000);

    let idCalls = 0;
    const excessive = importHtml(
      `<table><tbody><tr>${"<td>x</td>".repeat(10_001)}</tr></tbody></table>`,
      {
        createId: () => {
          idCalls += 1;
          return `generated-${idCalls}`;
        },
      },
    );
    expect(excessive).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
    expect(idCalls).toBeLessThan(20);
  });

  it("과도한 colgroup은 열 생성 전에 거부한다", () => {
    let idCalls = 0;
    const result = importHtml(
      `<table><colgroup>${"<col>".repeat(10_001)}</colgroup></table>`,
      {
        createId: () => {
          idCalls += 1;
          return `generated-${idCalls}`;
        },
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
    expect(idCalls).toBeLessThan(20);
  });

  it("td 셀의 C0 제어문자·짝 없는 surrogate는 throw 없이 제거하고 경고한다", () => {
    const html = `<table><tbody><tr><td>bad\u0001\u000b${String.fromCharCode(0xd800)}text</td></tr></tbody></table>`;
    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const table = result.value.document.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("Expected table block");
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "badtext" }]);
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSAFE_CODE_POINT_REMOVED",
          element: "td",
        }),
      ]),
    );
  });

  it("th 셀의 C0 제어문자·짝 없는 surrogate는 throw 없이 제거하고 경고한다", () => {
    const html = `<table><thead><tr><th>bad\u0001${String.fromCharCode(0xd800)}text</th></tr></thead></table>`;
    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const table = result.value.document.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("Expected table block");
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "badtext" }]);
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSAFE_CODE_POINT_REMOVED",
          element: "th",
        }),
      ]),
    );
  });

  it("셀의 style 속성은 import에서 제거되고 경고로 보고된다", () => {
    const result = importHtml(
      '<table><tbody><tr><td style="color:#FF0000">a</td></tr></tbody></table>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings).toContainEqual(
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "td",
        attribute: "style",
      }),
    );
  });
});
