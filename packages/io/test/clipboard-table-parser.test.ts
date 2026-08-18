import { describe, expect, it } from "vitest";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";

describe("parseClipboardTable", () => {
  it("HTML 표를 TabularData로 파싱한다", () => {
    const html =
      "<table><tbody><tr><td>Name</td><td>Score</td></tr>" +
      "<tr><td>Alice</td><td>90</td></tr></tbody></table>";

    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.columnCount).toBe(2);
    expect(result.value.rows).toHaveLength(2);
    expect(result.value.rows[0]?.cells[0]?.content).toEqual([{ text: "Name" }]);
  });

  it("rowSpan/colSpan을 읽는다", () => {
    const html =
      '<table><tbody><tr><td colspan="2">Header</td></tr>' +
      "<tr><td>A</td><td>B</td></tr></tbody></table>";

    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.columnSpan).toBe(2);
  });

  it("style 색상·정렬을 읽는다", () => {
    const html =
      '<table><tbody><tr><td style="background-color:#FF0000;text-align:right;">1</td></tr></tbody></table>';

    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]).toMatchObject({
      backgroundColor: "#FF0000",
      align: "right",
    });
  });

  it("data-be-* 자기복사 속성을 style보다 우선한다", () => {
    const html =
      '<table><tbody><tr><td data-be-background-color="#00FF00" style="background-color:#FF0000;">1</td></tr></tbody></table>';

    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.backgroundColor).toBe("#00FF00");
  });

  it("script/이벤트 핸들러를 제거한다", () => {
    const html =
      '<table><tbody><tr><td onclick="evil()">safe</td></tr></tbody></table><script>evil()</script>';

    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.content).toEqual([{ text: "safe" }]);
  });

  it("지원하지 않는 href는 링크 mark 없이 텍스트만 남긴다", () => {
    const html =
      '<table><tbody><tr><td><a href="//evil.com">x</a></td></tr></tbody></table>';

    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.content).toEqual([{ text: "x" }]);
  });

  it("지원하는 href는 링크 mark로 보존한다", () => {
    const html =
      '<table><tbody><tr><td><a href="https://example.com/">x</a></td></tr></tbody></table>';

    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.content).toEqual([
      { text: "x", marks: [{ type: "link", href: "https://example.com/" }] },
    ]);
  });

  it("HTML에 표가 없으면 탭이 있는 text/plain을 TSV로 파싱한다", () => {
    const result = parseClipboardTable({
      html: "<p>no table</p>",
      text: "a\tb\nc\td",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.columnCount).toBe(2);
    expect(result.value.rows).toHaveLength(2);
    expect(result.value.rows[1]?.cells[1]?.content).toEqual([{ text: "d" }]);
  });

  it("짧은 TSV 행은 빈 셀로 패딩해 직사각형을 유지한다", () => {
    const result = parseClipboardTable({ text: "a\tb\tc\nd" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.columnCount).toBe(3);
    expect(result.value.rows[1]?.cells[1]?.content).toEqual([]);
    expect(result.value.rows[1]?.cells[2]?.content).toEqual([]);
  });

  it("탭 없는 일반 텍스트는 NOT_TABULAR다", () => {
    const result = parseClipboardTable({ text: "hello world\nsecond line" });
    expect(result).toEqual({ ok: false, error: { code: "NOT_TABULAR" } });
  });

  it("html도 text도 없으면 NOT_TABULAR다", () => {
    expect(parseClipboardTable({})).toEqual({
      ok: false,
      error: { code: "NOT_TABULAR" },
    });
  });

  it("10,000셀을 넘는 HTML 표는 CLIPBOARD_TABLE_INVALID다", () => {
    const cells = Array.from({ length: 101 }, () => "<td>x</td>").join("");
    const rows = Array.from({ length: 101 }, () => `<tr>${cells}</tr>`).join(
      "",
    );
    const result = parseClipboardTable({
      html: `<table><tbody>${rows}</tbody></table>`,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });
});
