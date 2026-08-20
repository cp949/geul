/**
 * `parseClipboardTable`가 클립보드 HTML/TSV를 블록 시퀀스(ClipboardContent)로
 * 옮기는지 검증한다. Excel·Google Sheets 대표 구조, 서식 속성의 정규 형식
 * 처리, 불량 span 보정, 표가 아닌 입력을 NOT_TABULAR로 흘려보내는 판정,
 * 표 앞뒤 문단을 문단 블록으로 보존하는 시퀀스 변환을 함께 다룬다.
 */
import { describe, expect, it } from "vitest";
import type { ClipboardContent } from "../src/clipboard/clipboard-content.js";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import type { TabularData } from "../src/clipboard/tabular-data.js";
import type { ClipboardParseError } from "../src/errors.js";
import type { Result } from "../src/result.js";

// 시퀀스가 표 하나뿐인 성공 결과에서 그 TabularData만 꺼낸다. 표만 있는
// 클립보드의 반환 타입이 [{type:"table", data}] 1개짜리 배열로 바뀌었으므로
// (Issue #71), 기존처럼 result.value.columnCount로 바로 접근할 수 없다.
const expectSingleTable = (
  result: Result<ClipboardContent, ClipboardParseError>,
): TabularData => {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  expect(result.value).toHaveLength(1);
  const [block] = result.value;
  expect(block?.type).toBe("table");
  if (block?.type !== "table") throw new Error("unreachable");
  return block.data;
};

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
  it("HTML 표를 블록 시퀀스로 파싱한다", () => {
    const html =
      "<table><tbody><tr><td>Name</td><td>Score</td></tr>" +
      "<tr><td>Alice</td><td>90</td></tr></tbody></table>";

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.columnCount).toBe(2);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "Name" }]);
  });

  it("rowSpan/colSpan을 읽는다", () => {
    const html =
      '<table><tbody><tr><td colspan="2">Header</td></tr>' +
      "<tr><td>A</td><td>B</td></tr></tbody></table>";

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.columnSpan).toBe(2);
  });

  it("style 색상·정렬을 읽는다", () => {
    const html =
      '<table><tbody><tr><td style="background-color:#FF0000;text-align:right;">1</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]).toMatchObject({
      backgroundColor: "#FF0000",
      align: "right",
    });
  });

  it("Excel 대표 클립보드 HTML의 표·색상·정렬을 읽는다", () => {
    const table = expectSingleTable(
      parseClipboardTable({ html: excelClipboardHtml }),
    );

    expect(table.columnCount).toBe(2);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.cells[0]).toMatchObject({
      content: [{ text: "Name" }],
      backgroundColor: "#FFFF00",
      textColor: "#FF0000",
    });
    expect(table.rows[0]?.cells[1]).toMatchObject({
      content: [{ text: "Score" }],
      align: "right",
    });
    expect(table.rows[1]?.cells[0]?.content).toEqual([{ text: "Alice" }]);
    expect(table.rows[1]?.cells[1]).toMatchObject({
      content: [{ text: "90" }],
      align: "right",
    });
  });

  it("data-be-* 자기복사 속성을 style보다 우선한다", () => {
    const html =
      '<table><tbody><tr><td data-be-background-color="#00FF00" style="background-color:#FF0000;">1</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.backgroundColor).toBe("#00FF00");
  });

  it("script/이벤트 핸들러를 제거한다", () => {
    const html =
      '<table><tbody><tr><td onclick="evil()">safe</td></tr></tbody></table><script>evil()</script>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "safe" }]);
  });

  it("지원하지 않는 href는 링크 mark 없이 텍스트만 남긴다", () => {
    const html =
      '<table><tbody><tr><td><a href="//evil.com">x</a></td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "x" }]);
  });

  it("지원하는 href는 링크 mark로 보존한다", () => {
    const html =
      '<table><tbody><tr><td><a href="https://example.com/">x</a></td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.content).toEqual([
      { text: "x", marks: [{ type: "link", href: "https://example.com/" }] },
    ]);
  });

  it("HTML에 표가 없으면 탭이 있는 text/plain을 TSV로 파싱한다", () => {
    const table = expectSingleTable(
      parseClipboardTable({ html: "<p>no table</p>", text: "a\tb\nc\td" }),
    );
    expect(table.columnCount).toBe(2);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1]?.cells[1]?.content).toEqual([{ text: "d" }]);
  });

  // 교체된 계약: 예전에는 짧은 TSV 행을 빈 셀로 패딩했다. 들쭉날쭉한 탭
  // 텍스트는 스프레드시트 클립보드가 아니라 탭 들여쓰기 코드일 가능성이
  // 훨씬 크고, 패딩해서 표로 만들면 확장이 이벤트를 소비해 사용자가 기본
  // 붙여넣기를 되찾을 수 없다.
  it("들쭉날쭉한 TSV는 NOT_TABULAR로 흘려보낸다", () => {
    const result = parseClipboardTable({ text: "a\tb\tc\nd" });
    expect(result).toEqual({ ok: false, error: { code: "NOT_TABULAR" } });
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

  // 표를 찾아 그 내용을 보고 거절했다면(CLIPBOARD_TABLE_INVALID) 함께 온
  // text/plain 짝이 우연히 표와 같은 탭 구조를 가져도 TSV로 다시 새서 이
  // 거절을 무력화하면 안 된다 — 혼합 콘텐츠 자체는 더 이상 거절 사유가
  // 아니므로(Issue #71), 여전히 유효한 거절 사유(셀 한도 초과)로 이 보호를
  // 검증한다.
  it("표 파싱이 실패하면 표와 같은 탭 구조의 text/plain으로도 TSV 폴백하지 않는다", () => {
    const cells = Array.from({ length: 101 }, () => "<td>x</td>").join("");
    const rows = Array.from({ length: 101 }, () => `<tr>${cells}</tr>`).join(
      "",
    );
    const result = parseClipboardTable({
      html: `<table><tbody>${rows}</tbody></table>`,
      text: "a\tb\nc\td",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("정규 형식이 아닌 data-be-text-color는 무시한다", () => {
    const html =
      '<table><tbody><tr><td data-be-text-color="red">1</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.textColor).toBeUndefined();
  });

  it("정규 형식이 아닌 data-be-background-color는 무시한다", () => {
    const html =
      '<table><tbody><tr><td data-be-background-color="#ff0000">1</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.backgroundColor).toBeUndefined();
  });

  it("정규 형식이 아닌 data-be-align은 무시한다", () => {
    const html =
      '<table><tbody><tr><td data-be-align="justify">1</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.align).toBeUndefined();
  });

  it("rowspan=0은 1로 보정해 표를 살린다", () => {
    const html =
      '<table><tbody><tr><td rowspan="0">a</td><td>b</td></tr>' +
      "<tr><td>c</td><td>d</td></tr></tbody></table>";

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.cells[0]?.rowSpan).toBe(1);
  });

  it("colspan=0은 1로 보정해 표를 살린다", () => {
    const html =
      '<table><tbody><tr><td colspan="0">a</td><td>b</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.columnSpan).toBe(1);
  });

  it("정수가 아닌 rowspan은 1로 보정해 표를 살린다", () => {
    const html =
      '<table><tbody><tr><td rowspan="2.5">a</td><td>b</td></tr>' +
      "<tr><td>c</td><td>d</td></tr></tbody></table>";

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.rowSpan).toBe(1);
  });

  it("role=presentation 표는 건너뛰고 안쪽 데이터 표를 고른다", () => {
    const html =
      '<table role="presentation"><tbody><tr><td>' +
      "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>" +
      "</td></tr></tbody></table>";

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.columnCount).toBe(2);
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "a" }]);
  });

  it("표를 품은 바깥 표 대신 안쪽 표를 고른다", () => {
    const html =
      "<table><tbody><tr><td>" +
      "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>" +
      "</td></tr></tbody></table>";

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.columnCount).toBe(2);
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "a" }]);
  });

  it("표 앞뒤에 문단이 있으면 문단과 표를 순서대로 보존한다", () => {
    const html =
      "<p>intro</p>" +
      "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>" +
      "<p>outro</p>";

    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value[0]).toEqual({
      type: "paragraph",
      content: [{ text: "intro" }],
    });
    expect(result.value[1]?.type).toBe("table");
    if (result.value[1]?.type !== "table") return;
    expect(result.value[1].data.columnCount).toBe(2);
    expect(result.value[1].data.rows[0]?.cells[0]?.content).toEqual([
      { text: "a" },
    ]);
    expect(result.value[2]).toEqual({
      type: "paragraph",
      content: [{ text: "outro" }],
    });
  });

  it("html과 text가 함께 오는 실제 붙여넣기 모양에서도 문단과 표를 순서대로 보존한다", () => {
    const result = parseClipboardTable({
      html:
        "<p>intro</p>" +
        "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>" +
        "<p>outro</p>",
      text: "intro\na\tb\noutro",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value[0]?.type).toBe("paragraph");
    expect(result.value[1]?.type).toBe("table");
    expect(result.value[2]?.type).toBe("paragraph");
  });

  it("표를 감싼 구조적 래퍼(html/head/body/style)만 있으면 표로 판정한다", () => {
    const html =
      "<html><head><style>.x{color:red}</style></head><body>" +
      "<table><tbody><tr><td>a</td></tr></tbody></table></body></html>";

    expectSingleTable(parseClipboardTable({ html }));
  });

  it("줄마다 탭 개수가 다른 텍스트는 NOT_TABULAR로 흘려보낸다", () => {
    const result = parseClipboardTable({ text: "\tif (x) {\n\t\tfoo();" });
    expect(result).toEqual({ ok: false, error: { code: "NOT_TABULAR" } });
  });

  it("중간에 빈 줄이 있는 텍스트는 NOT_TABULAR로 흘려보낸다", () => {
    const result = parseClipboardTable({ text: "a\tb\n\nc\td" });
    expect(result).toEqual({ ok: false, error: { code: "NOT_TABULAR" } });
  });

  it("끝 개행 하나는 행으로 세지 않는다", () => {
    const table = expectSingleTable(
      parseClipboardTable({ text: "a\tb\nc\td\r\n" }),
    );
    expect(table.rows).toHaveLength(2);
  });
});
