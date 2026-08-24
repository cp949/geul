/**
 * `parseClipboardTable`가 HTML 문서 구조를 블록 시퀀스로 옮기는 경로를
 * 검증한다. 기본 표 파싱과 rowSpan/colSpan 읽기, 불량 span 값의 1 보정,
 * 여러 표 중 데이터 표를 고르는 선택 규칙, 표 앞뒤 문단을 문단 블록으로
 * 보존하는 시퀀스 변환을 함께 다룬다.
 */
import { describe, expect, it } from "vitest";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { expectSingleTable } from "./clipboard-table-support.js";

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

  it("thead·tbody·tfoot이 소스 순서대로면 그대로 유지된다", () => {
    const html =
      "<table><thead><tr><td>H</td></tr></thead>" +
      "<tbody><tr><td>B</td></tr></tbody>" +
      "<tfoot><tr><td>F</td></tr></tfoot></table>";

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows.map((row) => row.cells[0]?.content)).toEqual([
      [{ text: "H" }],
      [{ text: "B" }],
      [{ text: "F" }],
    ]);
  });

  it("tfoot이 tbody보다 먼저 와도 head→body→foot 순서로 정렬한다", () => {
    const html =
      "<table><thead><tr><td>H</td></tr></thead>" +
      "<tfoot><tr><td>F</td></tr></tfoot>" +
      "<tbody><tr><td>B</td></tr></tbody></table>";

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows.map((row) => row.cells[0]?.content)).toEqual([
      [{ text: "H" }],
      [{ text: "B" }],
      [{ text: "F" }],
    ]);
  });

  it("여러 tbody/tfoot도 섹션 내부 순서를 지켜 병합된다", () => {
    const html =
      "<table><thead><tr><td>H</td></tr></thead>" +
      "<tbody><tr><td>A</td></tr></tbody>" +
      "<tfoot><tr><td>F</td></tr></tfoot>" +
      "<tbody><tr><td>B</td></tr></tbody></table>";

    const table = expectSingleTable(parseClipboardTable({ html }));
    expect(table.rows.map((row) => row.cells[0]?.content)).toEqual([
      [{ text: "H" }],
      [{ text: "A" }],
      [{ text: "B" }],
      [{ text: "F" }],
    ]);
  });
});
