/**
 * 클립보드 표 파서가 model 인라인 텍스트 계약에 맞는 셀 콘텐츠만 내보내는지,
 * 그리고 들쭉날쭉한 HTML 표를 빈 셀로 패딩해 직사각형으로 만드는지 검증한다.
 */
import { isValidInlineText } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import type { ClipboardContent } from "../src/clipboard/clipboard-content.js";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import type { TabularData } from "../src/clipboard/tabular-data.js";
import type { ClipboardParseError } from "../src/errors.js";
import type { Result } from "../src/result.js";

// 테이블만 있는 경우 결과에서 TabularData만 추출한다.
const getTableFromResult = (
  result: Result<ClipboardContent, ClipboardParseError>,
): TabularData | null => {
  if (!result.ok) return null;
  const [block] = result.value;
  if (block?.type !== "table") return null;
  return block.data;
};

describe("클립보드 표 셀 텍스트 정규화", () => {
  it("셀 텍스트의 탭·개행 whitespace를 공백 하나로 접고 앞뒤를 자른다", () => {
    const html =
      "<table>\n\t<tbody>\n\t\t<tr>\n" +
      "\t\t\t<td>\n\t\t\t\tAlice\tSmith\n\t\t\t</td>\n" +
      "\t\t\t<td>  </td>\n" +
      "\t\t</tr>\n\t</tbody>\n</table>";

    const result = parseClipboardTable({ html });
    const table = getTableFromResult(result);
    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "Alice Smith" }]);
    expect(table.rows[0]?.cells[1]?.content).toEqual([]);
  });

  it("마크 경계를 넘는 whitespace도 공백 하나로 접는다", () => {
    const html =
      "<table><tbody><tr><td>a <strong> b </strong> c</td></tr></tbody></table>";

    const result = parseClipboardTable({ html });
    const table = getTableFromResult(result);
    expect(table).not.toBeNull();
    if (!table) return;
    const content = table.rows[0]?.cells[0]?.content ?? [];
    expect(content.map((item) => item.text).join("")).toBe("a b c");
    expect(
      content.some((item) =>
        (item.marks ?? []).some((mark) => mark.type === "bold"),
      ),
    ).toBe(true);
  });

  it("br가 만든 줄바꿈은 보존하고 주변 whitespace만 버린다", () => {
    const html = "<table><tbody><tr><td>a<br>\n\tb</td></tr></tbody></table>";

    const result = parseClipboardTable({ html });
    const table = getTableFromResult(result);
    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "a\nb" }]);
  });

  it("HTML 셀에서 LF 외 C0 제어문자와 DEL을 제거한다", () => {
    const html =
      "<table><tbody><tr><td>a\u0000b\u007Fc</td></tr></tbody></table>";

    const result = parseClipboardTable({ html });
    const table = getTableFromResult(result);
    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "abc" }]);
  });

  it("TSV 셀에서 단독 CR과 C0 제어문자를 제거한다", () => {
    const result = parseClipboardTable({ text: "a\rb\tc\u000Bd" });
    const table = getTableFromResult(result);
    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "ab" }]);
    expect(table.rows[0]?.cells[1]?.content).toEqual([{ text: "cd" }]);
  });

  it("caption 텍스트가 기존 셀 텍스트와 같은 정규화를 거친다", () => {
    const html =
      "<table><caption>a\u0000b\u007Fc</caption>" +
      "<tbody><tr><td>x</td></tr></tbody></table>";

    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [paragraph] = result.value;
    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type !== "paragraph") return;
    const text = paragraph.content.map((item) => item.text).join("");
    expect(text).toBe("abc");
    expect(isValidInlineText(text)).toBe(true);
  });
});

describe("들쭉날쭉한 HTML 표 패딩", () => {
  it("셀이 부족한 행은 빈 셀로 패딩한다", () => {
    const html =
      "<table><tbody><tr><td>a</td><td>b</td></tr>" +
      "<tr><td>c</td></tr></tbody></table>";

    const result = parseClipboardTable({ html });
    const table = getTableFromResult(result);
    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.columnCount).toBe(2);
    expect(table.rows[1]?.cells).toHaveLength(2);
    expect(table.rows[1]?.cells[1]).toEqual({
      columnIndex: 1,
      rowSpan: 1,
      columnSpan: 1,
      content: [],
    });
  });

  it("rowSpan이 덮는 좌표는 패딩하지 않는다", () => {
    const html =
      '<table><tbody><tr><td rowspan="2">a</td><td>b</td></tr>' +
      "<tr></tr></tbody></table>";

    const result = parseClipboardTable({ html });
    const table = getTableFromResult(result);
    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.rows[0]?.cells).toHaveLength(2);
    expect(table.rows[1]?.cells).toEqual([
      { columnIndex: 1, rowSpan: 1, columnSpan: 1, content: [] },
    ]);
  });

  it("colgroup보다 실제 셀이 많으면 넓은 쪽을 열 수로 잡는다", () => {
    const html =
      "<table><colgroup><col/></colgroup><tbody>" +
      "<tr><td>a</td><td>b</td></tr></tbody></table>";

    const result = parseClipboardTable({ html });
    const table = getTableFromResult(result);
    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.columnCount).toBe(2);
  });

  it("격자를 벗어나는 span은 패딩으로 감추지 않고 CLIPBOARD_TABLE_INVALID로 거절한다", () => {
    const html =
      '<table><tbody><tr><td rowspan="5">a</td><td>b</td></tr>' +
      "<tr><td>c</td></tr></tbody></table>";

    expect(parseClipboardTable({ html })).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("긴 공백 run도 공백 한 칸으로 접는다", () => {
    const spaces = " ".repeat(5_000);
    const html = `<table><tbody><tr><td>a${spaces}b</td></tr></tbody></table>`;

    const result = parseClipboardTable({ html });
    const table = getTableFromResult(result);
    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "a b" }]);
  });

  it("셀 앞뒤의 긴 공백 run은 통째로 버린다", () => {
    const spaces = " ".repeat(5_000);
    const html = `<table><tbody><tr><td>${spaces}a${spaces}</td></tr></tbody></table>`;

    const result = parseClipboardTable({ html });
    const table = getTableFromResult(result);
    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "a" }]);
  });

  it("표가 없는 HTML은 파싱하지 않고 NOT_TABULAR로 흘려보낸다", () => {
    const result = parseClipboardTable({
      html: "<p>표 없는 긴 문서</p>".repeat(100),
    });
    expect(result).toEqual({ ok: false, error: { code: "NOT_TABULAR" } });
  });
});
