/**
 * `parseClipboardTable`가 들어온 클립보드를 표로 볼지 말지 판정하는 경계를
 * 검증한다. HTML에 표가 없을 때의 text/plain TSV 폴백, 구조적 래퍼에 싸인
 * 표의 판정, 표로 보기 어려운 텍스트를 NOT_TABULAR로 흘려보내는 조건, 셀
 * 한도 초과 거절, 그리고 표를 찾아 거절한 뒤에는 TSV로 다시 새지 않는다는
 * 보호를 함께 다룬다.
 */
import { describe, expect, it } from "vitest";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { expectSingleTable } from "./clipboard-table-support.js";

describe("parseClipboardTable", () => {
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
