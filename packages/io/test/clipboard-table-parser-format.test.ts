/**
 * `parseClipboardTable`가 셀의 서식 정보를 읽는 경로를 검증한다. style
 * 색상·정렬, Excel 대표 클립보드 구조, style보다 우선하는 data-geul-* 자기복사
 * 속성, 정규 형식이 아닌 data-geul-* 값의 무시, 링크 mark 보존과 미지원 href
 * 처리, script·이벤트 핸들러 제거를 함께 다룬다.
 */
import { describe, expect, it } from "vitest";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { expectSingleTable } from "./clipboard-table-support.js";

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
  it("style 색상·정렬을 읽는다", () => {
    const html =
      '<table><tbody><tr><td style="background-color:#FF0000;text-align:right;">1</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]).toMatchObject({
      backgroundColor: "#FF0000",
      align: "right",
    });
  });

  // Word·Outlook·Excel HTML은 색 이름을 쓴다(Issue #333).
  it("셀 style의 색 이름을 글자색·배경색으로 읽는다", () => {
    const html =
      '<table><tbody><tr><td style="background:yellow;color:red">1</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]).toMatchObject({
      backgroundColor: "#FFFF00",
      textColor: "#FF0000",
    });
  });

  it("셀 style의 짧은 hex·rgb 공백 문법·hsl을 읽는다", () => {
    const html =
      '<table><tbody><tr><td style="background-color:#ff0;color:rgb(255 0 0)">1</td><td style="color:hsl(120,100%,50%)">2</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]).toMatchObject({
      backgroundColor: "#FFFF00",
      textColor: "#FF0000",
    });
    expect(table.rows[0]?.cells[1]?.textColor).toBe("#00FF00");
  });

  it("셀 style의 반투명·투명 색은 색을 정하지 않는다", () => {
    const html =
      '<table><tbody><tr><td style="background:rgba(255,255,0,0.5);color:rgba(255,0,0,0.5)">1</td><td style="background-color:transparent">2</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.backgroundColor).toBeUndefined();
    expect(table.rows[0]?.cells[0]?.textColor).toBeUndefined();
    expect(table.rows[0]?.cells[1]?.backgroundColor).toBeUndefined();
  });

  it("셀 style의 !important가 뒤 선언을 이긴다", () => {
    const html =
      '<table><tbody><tr><td style="background-color:#FF0000 !important;background:#00FF00">1</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.backgroundColor).toBe("#FF0000");
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

  it("data-geul-* 자기복사 속성을 style보다 우선한다", () => {
    const html =
      '<table><tbody><tr><td data-geul-background-color="#00FF00" style="background-color:#FF0000;">1</td></tr></tbody></table>';

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

  // 문서 import(inline-content.ts의 marksForElement)와 같은 마크 함수·허용
  // 태그를 쓰므로 셀 안 span 스타일과 del·strike도 마크로 읽힌다(Issue #320).
  it("셀 안 span의 font-weight 스타일을 bold mark로 읽는다", () => {
    const html =
      '<table><tbody><tr><td><span style="font-weight:700">x</span></td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.content).toEqual([
      { text: "x", marks: [{ type: "bold" }] },
    ]);
  });

  it("셀 안 span의 font-style·text-decoration 스타일을 mark로 읽는다", () => {
    const html =
      '<table><tbody><tr><td><span style="font-style:italic;text-decoration:underline">x</span></td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.content).toEqual([
      { text: "x", marks: [{ type: "italic" }, { type: "underline" }] },
    ]);
  });

  it("셀 안 del·strike를 strike mark로 읽는다", () => {
    const html =
      "<table><tbody><tr><td><del>x</del></td><td><strike>y</strike></td></tr></tbody></table>";

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.content).toEqual([
      { text: "x", marks: [{ type: "strike" }] },
    ]);
    expect(table.rows[0]?.cells[1]?.content).toEqual([
      { text: "y", marks: [{ type: "strike" }] },
    ]);
  });

  it("정규 형식이 아닌 data-geul-text-color는 무시한다", () => {
    const html =
      '<table><tbody><tr><td data-geul-text-color="red">1</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.textColor).toBeUndefined();
  });

  it("정규 형식이 아닌 data-geul-background-color는 무시한다", () => {
    const html =
      '<table><tbody><tr><td data-geul-background-color="#ff0000">1</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.backgroundColor).toBeUndefined();
  });

  it("정규 형식이 아닌 data-geul-align은 무시한다", () => {
    const html =
      '<table><tbody><tr><td data-geul-align="justify">1</td></tr></tbody></table>';

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows[0]?.cells[0]?.align).toBeUndefined();
  });
});
