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
import type { HtmlElementNode, HtmlNode } from "../src/html/inline-content.js";
import { parseHtmlFragment } from "../src/html/parse-html.js";
import {
  inferredColumnCount,
  layoutRows,
  tableRows,
} from "../src/html/table-layout.js";
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

// parseHtmlFragment 결과(HtmlRoot)에서 첫 <table> 요소를 찾는다. 이슈 114
// 조사 테스트가 tabularDataFromTable(비공개)을 거치지 않고 table-layout.ts의
// layoutRows/inferredColumnCount를 직접 검증하려고 이 최소 헬퍼를 쓴다 —
// clipboard-table-parser.ts의 tabularDataFromTable이 columnCount를 만드는
// 것과 같은 조합(tableRows → layoutRows → inferredColumnCount)이다.
const findTableElement = (
  nodes: readonly HtmlNode[],
): HtmlElementNode | undefined => {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    if (node.tagName === "table") return node;
    const found = findTableElement(node.children);
    if (found !== undefined) return found;
  }
  return undefined;
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

  it("colgroup 있음: 실제 셀의 colspan이 colgroup 열 수를 초과하면 거절한다", () => {
    const html =
      "<table><colgroup><col/><col/><col/></colgroup><tbody>" +
      '<tr><td colspan="500">a</td></tr></tbody></table>';

    expect(parseClipboardTable({ html })).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("colgroup 없음: 단일 셀의 colspan이 다른 셀들이 차지하는 열 수를 초과하면 거절한다", () => {
    const html =
      '<table><tbody><tr><td colspan="500">a</td></tr></tbody></table>';

    expect(parseClipboardTable({ html })).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("정상 범위 colspan(3열 표에서 colspan=2)은 계속 성공한다", () => {
    const html =
      "<table><tbody>" +
      "<tr><td>a</td><td>b</td><td>c</td></tr>" +
      '<tr><td colspan="2">d</td><td>e</td></tr>' +
      "</tbody></table>";

    const result = parseClipboardTable({ html });
    const table = getTableFromResult(result);
    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.columnCount).toBe(3);
  });

  // 트랙-6 발견: rowSpan 때문에 서로 다른 행의 셀이 같은 columnIndex에서
  // 시작하면 "distinct 시작 columnIndex 개수"가 실제 뒷받침 열 수보다 작게
  // 잡혀 정상 colspan을 오탐 거절했다(Issue #35 후속).
  it("rowSpan과 colspan이 상호작용해도 정당한 colspan은 오탐 거절하지 않는다", () => {
    const html =
      '<table><tbody><tr><td colspan="5" rowspan="2">A</td><td>F</td></tr>' +
      "<tr><td>B</td></tr></tbody></table>";

    const result = parseClipboardTable({ html });
    const table = getTableFromResult(result);
    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.columnCount).toBe(6);
    expect(table.rows[0]?.cells[0]).toMatchObject({
      columnIndex: 0,
      columnSpan: 5,
      rowSpan: 2,
    });
    expect(table.rows[0]?.cells[1]).toMatchObject({
      columnIndex: 5,
      columnSpan: 1,
    });
    expect(table.rows[1]?.cells[0]).toMatchObject({
      columnIndex: 5,
      columnSpan: 1,
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

// Issue #114: layoutRowSpan(table-layout.ts)이 colspan과 대칭인 구조적 위험
// (상한 없이 값을 그대로 통과시켜 행/열 수를 부풀리는 위험)을 갖는지 조사한
// 결과를 고정하는 characterization 테스트다 — 추가 시점에 이미 통과해야
// 정상이다(실패하면 조사 결론이 틀렸다는 뜻).
//
// 결론: 대칭이 아니다. colspan은 inferredColumnCount(아래 두 번째 테스트가
// 직접 확인)가 각 셀의 columnSpan 값 자체로 열 수를 계산하는 자기 강화
// 구조라 과대 colspan이 자기 자신의 상한 판정을 부풀렸다(Issue #35가 별도
// 선제 검사 oversizedColumnSpanCell을 추가한 이유). rowSpan은 다르다 —
// 행 수(rowCount)는 실제 <tr> 개수로 고정이고(table-layout.ts의 layoutRows
// 호출부, rows.length) 어떤 셀의 rowSpan도 이 값을 바꾸지 않는다. 따라서
// model의 validateGridCoverage(table-grid-validation.ts:82-84)가 파생되지
// 않은 고정 rowCount를 기준으로 rowEnd(=row+rowSpan) > rowCount를 이미
// SPAN_OUT_OF_BOUNDS로 거절하며, rowSpan 쪽에는 별도 선제 검사가 필요 없다.
describe("이슈 114: rowSpan 열/행 수 부풀림 대칭성 조사", () => {
  it("[Issue #114] 과대 rowSpan(500, 실제 행 수 2 초과)을 준 표에서도 열 수는 실제 셀 구조(columnIndex+columnSpan)로만 결정된다 — inferredColumnCount는 rowSpan을 읽지 않는다", () => {
    const html =
      '<table><tbody><tr><td rowspan="500">a</td><td>b</td></tr>' +
      "<tr><td>c</td></tr></tbody></table>";

    const root = parseHtmlFragment(html);
    expect(root).not.toBeUndefined();
    if (root === undefined) return;
    const table = findTableElement(root.children);
    expect(table).not.toBeUndefined();
    if (table === undefined) return;

    // clipboard-table-parser.ts의 tabularDataFromTable이 columnCount를
    // 만드는 것과 같은 조합(tableRows → layoutRows → inferredColumnCount)을
    // 그대로 재현한다.
    const layouts = layoutRows(tableRows(table));
    // 실제로 등장하는 열은 (a/b) 두 열뿐이다 — rowSpan="500"이 아무리
    // 커져도 이 값은 바뀌지 않아야 한다(colspan이었다면 부풀었을 값).
    expect(inferredColumnCount(layouts)).toBe(2);
  });

  it("[Issue #114] 과대 rowSpan(행 끝이 실제 행 수를 초과)은 CLIPBOARD_TABLE_INVALID(SPAN_OUT_OF_BOUNDS)로 거절된다 — rowCount가 tr 개수로 고정돼 있어 colspan과 달리 별도 선제 검사 없이도 model의 validateGridCoverage가 이미 막는다", () => {
    const html =
      '<table><tbody><tr><td rowspan="500">a</td><td>b</td></tr>' +
      "<tr><td>c</td></tr></tbody></table>";

    expect(parseClipboardTable({ html })).toMatchObject({
      ok: false,
      error: {
        code: "CLIPBOARD_TABLE_INVALID",
        message: expect.stringContaining("SPAN_OUT_OF_BOUNDS"),
      },
    });
  });
});
