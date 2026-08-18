import { describe, expect, it } from "vitest";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";

// Excel이 클립보드에 심는 대표 구조: office 네임스페이스, mso-* 선언, style
// 블록, StartFragment 주석, colgroup 없는 col, background 축약형 배경색,
// 그리고 셀 텍스트에 그대로 실리는 마크업 들여쓰기.
const excelClipboardHtml = [
  '<html xmlns:o="urn:schemas-microsoft-com:office:office"',
  ' xmlns:x="urn:schemas-microsoft-com:office:excel">',
  "<head><meta name=ProgId content=Excel.Sheet>",
  "<style><!--table {mso-displayed-decimal-separator:\\.;}",
  ".xl65 {background:#FFFF00;}--></style></head>",
  '<body link="#0563C1" vlink="#954F72">',
  "<table border=0 cellpadding=0 cellspacing=0 width=128",
  " style='border-collapse:collapse;width:96pt'>",
  "<!--StartFragment-->",
  "<col width=64 style='width:48pt'><col width=64 style='width:48pt'>",
  "<tr height=20 style='height:15.0pt'>",
  "<td height=20 width=64 style='height:15.0pt;width:48pt;",
  "background:#FFFF00;color:#FF0000;mso-number-format:General'>",
  "\n\tName\n\t</td>",
  "<td width=64 style='width:48pt;text-align:right;",
  "mso-number-format:General'>Score</td></tr>",
  "<tr height=20 style='height:15.0pt'>",
  "<td height=20 style='height:15.0pt'>Alice</td>",
  "<td style='text-align:right'>90</td></tr>",
  "<!--EndFragment--></table></body></html>",
].join("");

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

  it("Excel 대표 클립보드 HTML의 표·색상·정렬을 읽는다", () => {
    const result = parseClipboardTable({ html: excelClipboardHtml });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.columnCount).toBe(2);
    expect(result.value.rows).toHaveLength(2);
    // background 축약형과 mso-* 선언이 섞여 있어도 색상만 정확히 읽는다.
    expect(result.value.rows[0]?.cells[0]).toMatchObject({
      content: [{ text: "Name" }],
      backgroundColor: "#FFFF00",
      textColor: "#FF0000",
    });
    expect(result.value.rows[0]?.cells[1]).toMatchObject({
      content: [{ text: "Score" }],
      align: "right",
    });
    expect(result.value.rows[1]?.cells[0]?.content).toEqual([
      { text: "Alice" },
    ]);
    expect(result.value.rows[1]?.cells[1]).toMatchObject({
      content: [{ text: "90" }],
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
