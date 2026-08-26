/**
 * table-layout.ts가 소유하는 표 구조 판정을 직접 검증한다. 특히
 * findOversizedColumnSpanCell은 import-html.ts와 clipboard-table-parser.ts가
 * 공유하는 오버사이즈 colspan/rowSpan 판정이라, 두 소비자의 통합 테스트
 * (html-round-trip.test.ts, clipboard-table-normalization.test.ts)와 별개로
 * 판정 함수 자체를 이 파일에서 직접 검증한다.
 */
import { describe, expect, it } from "vitest";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import type { HtmlElementNode, HtmlNode } from "../src/html/inline-content.js";
import { parseHtmlFragment } from "../src/html/parse-html.js";
import {
  findOversizedColumnSpanCell,
  inferredColumnCount,
  layoutRows,
  tableRows,
} from "../src/html/table-layout.js";

/**
 * parseHtmlFragment 결과(HtmlRoot)에서 첫 <table> 요소를 찾는다. 이 파일의
 * 테스트는 import-html.ts/clipboard-table-parser.ts를 거치지 않고
 * table-layout.ts의 헬퍼를 직접 검증하므로 HTML 문자열에서 표 요소만
 * 추출하는 최소 파싱이 필요하다.
 */
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

/**
 * HTML 표 문자열을 두 소비자가 findOversizedColumnSpanCell을 부르기 전에
 * 만드는 것과 같은 조합(tableRows → layoutRows)으로 CellLayout[][]로
 * 바꾼다.
 */
const layoutsFromHtml = (html: string) => {
  const root = parseHtmlFragment(html);
  if (root === undefined) throw new Error("표 fixture 파싱 실패");
  const table = findTableElement(root.children);
  if (table === undefined) throw new Error("표 fixture에 <table>이 없다");
  return layoutRows(tableRows(table));
};

describe("findOversizedColumnSpanCell", () => {
  it("정상 격자에서는 위반 셀을 찾지 못한다", () => {
    const layouts = layoutsFromHtml(
      "<table><tbody>" +
        "<tr><td>a</td><td>b</td><td>c</td></tr>" +
        '<tr><td colspan="2">d</td><td>e</td></tr>' +
        "</tbody></table>",
    );

    expect(findOversizedColumnSpanCell(layouts, 0)).toBeUndefined();
  });

  it("뒷받침 없는 홑 셀의 과대 colspan은 자기 위치+1을 상한으로 거절한다", () => {
    const layouts = layoutsFromHtml(
      '<table><tbody><tr><td colspan="500">a</td></tr></tbody></table>',
    );

    expect(findOversizedColumnSpanCell(layouts, 0)).toMatchObject({
      cell: { columnIndex: 0 },
      bound: 1,
    });
  });

  it("rowSpan이 다른 행의 실제 셀로 뒷받침되면 그 reach만큼 colspan을 허용한다", () => {
    // A(1열)와 rowSpan=2·colspan=3인 B가 1행을 이루고, 2행은 B가 rowSpan으로
    // 이미 덮은 열들만 남아 C 하나로 완전한 격자가 된다(Issue #116 재현 입력).
    const layouts = layoutsFromHtml(
      "<table><tbody><tr><td>A</td>" +
        '<td colspan="3" rowspan="2">B</td></tr>' +
        "<tr><td>C</td></tr></tbody></table>",
    );

    expect(findOversizedColumnSpanCell(layouts, 0)).toBeUndefined();
  });

  it("rowSpan이 덮는 행이 완전히 비어 있으면 뒷받침으로 인정하지 않고 여전히 거절한다", () => {
    // Issue #116 단계-3: rowSpan 값 자체가 아니라 "덮는 행에 다른 셀이
    // 실제로 있는가"가 근거여야 한다 — 두 번째 행이 완전히 비어 있으므로
    // rowSpan=2를 걸어도 rowSpan=1 홑 셀과 같은 상한(1)을 적용받는다.
    const layouts = layoutsFromHtml(
      '<table><tbody><tr><td rowspan="2" colspan="3">X</td></tr><tr></tr></tbody></table>',
    );

    expect(findOversizedColumnSpanCell(layouts, 0)).toMatchObject({
      cell: { columnIndex: 0 },
      bound: 1,
    });
  });

  it("columnFloor가 span 유래 상한보다 크면 그 floor까지 colspan을 허용한다", () => {
    // clipboard-table-parser.ts가 colgroup 있는 표에도 이 함수를 항상 부르는
    // 이유와 같은 계약이다 — columnFloor(colgroup 선언)가 span 유래 reach보다
    // 크면 그만큼 colspan을 허용해야 정상적인 colgroup 선언을 오탐 거절하지
    // 않는다.
    const layouts = layoutsFromHtml(
      '<table><tbody><tr><td colspan="4">a</td></tr></tbody></table>',
    );

    expect(findOversizedColumnSpanCell(layouts, 0)).toMatchObject({
      bound: 1,
    });
    expect(findOversizedColumnSpanCell(layouts, 5)).toBeUndefined();
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
// 선제 검사 findOversizedColumnSpanCell을 추가한 이유). rowSpan은 다르다 —
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

    // clipboard-table-parser.ts의 tabularDataFromTable이 columnCount를
    // 만드는 것과 같은 조합(tableRows → layoutRows → inferredColumnCount)을
    // 그대로 재현한다.
    const layouts = layoutsFromHtml(html);
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
