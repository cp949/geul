import { childElements, propertyInteger } from "./hast-properties.js";
import type { HtmlElementContent, HtmlElementNode } from "./inline-content.js";

export const MAX_TABLE_COLUMNS = 10_000;

export type TableRowSource = {
  element: HtmlElementNode;
  section: "head" | "body" | "foot";
};

export type CellLayout = {
  element: HtmlElementNode;
  columnIndex: number;
  rowSpan: number;
  columnSpan: number;
};

export const layoutColumnSpan = (columnSpan: number): number =>
  Number.isInteger(columnSpan) &&
  columnSpan >= 1 &&
  columnSpan <= MAX_TABLE_COLUMNS
    ? columnSpan
    : 1;

// rowSpan도 columnSpan과 같은 규칙으로 보정한다. rowspan="0"(HTML에서
// "섹션 끝까지"), 음수, 소수는 우리 격자 모델에 대응이 없으므로 1로 본다.
// 커버리지 계산과 방출되는 셀이 같은 값을 써야 검증기가 어긋나지 않는다.
//
// layoutColumnSpan과 달리 여기엔 MAX_TABLE_COLUMNS류 상한이 없다 — 값을
// 그대로 통과시켜도 구조적으로 안전하기 때문이다(Issue #114 조사 결론,
// characterization 테스트: clipboard-table-normalization.test.ts "이슈 114:
// rowSpan 열/행 수 부풀림 대칭성 조사"). colspan이 상한을 둬야 했던 이유는
// inferredColumnCount(이 파일, 161-173행)가 "표가 이미 보여준 열 수"를 각
// 셀의 columnSpan 값 자체로 계산하는 자기 강화 구조라, 과대 colspan 셀
// 자신이 자기를 걸러낼 상한까지 함께 부풀렸기 때문이다(Issue #35가 별도
// 선제 검사 oversizedColumnSpanCell을 clipboard-table-parser.ts에 추가한
// 이유). rowSpan에는 이 자기 강화 구조가 없다 — 행 수(rowCount)는 실제
// <tr> 개수로 고정이고(layoutRows, 85-118행이 rows.length만큼만 순회한다),
// 어떤 셀의 rowSpan 값도 이 rowCount 자체를 바꾸지 않는다. 그래서 과대
// rowSpan은 파생되지 않은 고정 rowCount를 넘어서기만 할 뿐이고, model의
// validateGridCoverage(packages/model/src/table-grid-validation.ts:82-84)가
// rowEnd(=row+rowSpan) > rowCount를 이미 SPAN_OUT_OF_BOUNDS로 거절한다 —
// rowSpan 쪽에는 colspan과 같은 선제 검사가 필요 없다.
export const layoutRowSpan = (rowSpan: number): number =>
  Number.isInteger(rowSpan) && rowSpan >= 1 ? rowSpan : 1;

// 소스 문서에서 thead/tbody/tfoot의 등장 순서는 브라우저 렌더링 순서와
// 무관하다(예: tfoot이 tbody보다 앞에 올 수 있다). head/body/foot 세 버킷에
// 먼저 모으고 논리 순서(head → body → foot)로 이어붙여야, 저자가 어떤 순서로
// 섹션을 배치했든 표가 항상 같은 행 순서로 파싱된다. 같은 버킷 안에서는
// 여러 tbody/tfoot이 있어도 만난 순서 그대로 append해 문서 순서를 지킨다.
export const tableRows = (table: HtmlElementNode): TableRowSource[] => {
  const headRows: TableRowSource[] = [];
  const bodyRows: TableRowSource[] = [];
  const footRows: TableRowSource[] = [];
  const bucketFor = (section: TableRowSource["section"]): TableRowSource[] =>
    section === "head" ? headRows : section === "foot" ? footRows : bodyRows;

  for (const child of childElements(table)) {
    if (
      child.tagName === "thead" ||
      child.tagName === "tbody" ||
      child.tagName === "tfoot"
    ) {
      const section: TableRowSource["section"] =
        child.tagName === "thead"
          ? "head"
          : child.tagName === "tfoot"
            ? "foot"
            : "body";
      const bucket = bucketFor(section);
      for (const row of childElements(child, "tr")) {
        bucket.push({ element: row, section });
      }
      continue;
    }
    if (child.tagName === "tr") {
      bodyRows.push({ element: child, section: "body" });
    }
  }

  return [...headRows, ...bodyRows, ...footRows];
};

export const layoutRows = (rows: TableRowSource[]): CellLayout[][] => {
  const occupiedUntilRow: number[] = [];

  return rows.map((row, rowIndex) => {
    const layouts: CellLayout[] = [];
    let columnIndex = 0;

    for (const cell of childElements(row.element).filter(
      (element) => element.tagName === "td" || element.tagName === "th",
    )) {
      while ((occupiedUntilRow[columnIndex] ?? 0) > rowIndex) {
        columnIndex += 1;
      }

      const rowSpan = propertyInteger(cell, "rowSpan", 1);
      const columnSpan = propertyInteger(cell, "colSpan", 1);
      layouts.push({ element: cell, columnIndex, rowSpan, columnSpan });

      const boundedColumnSpan = layoutColumnSpan(columnSpan);
      if (Number.isInteger(rowSpan) && rowSpan >= 1) {
        for (
          let coveredColumn = columnIndex;
          coveredColumn < columnIndex + boundedColumnSpan;
          coveredColumn += 1
        ) {
          occupiedUntilRow[coveredColumn] = rowIndex + rowSpan;
        }
      }
      columnIndex += boundedColumnSpan;
    }

    return layouts;
  });
};

// caption 등 표 직속 텍스트를 문단으로 옮길지 판정하는 데 쓴다. 이 판정이
// 묻는 것은 "사용자가 표 말고 다른 것도 골랐나"다 — 그래서 눈에 보이지 않는
// 문자는 실질 텍스트가 아니다. \s가 이미 지우는 공백류(NBSP U+00A0 포함)에
// 더해 제로폭 문자와 soft hyphen도 지운다: Slack/Notion/Docs가 블록 경계에
// 심는 U+200B 한 글자 때문에 빈 문단이 생기면 사용자는 원인도 모르고
// 되돌릴 방법도 없다. cell-text.ts의 HTML_WHITESPACE_RUN이 NBSP를 공백에서
// 제외하는 것과 어긋나 보이지만 질문이 다르다 — 거기서는 "셀 안 이 문자를
// 접을까"를 묻고(접으면 서식이 뭉개진다), 여기서는 "이게 사용자가 고른
// 콘텐츠인가"를 묻는다(빈칸용 &nbsp; 문단은 아니다). clipboard·import 양쪽이
// 이 판정을 공유해야 하므로 두 소비자의 공통 의존인 이 파일에 둔다.
const INSUBSTANTIAL_TEXT = /[\s\u00AD\u200B-\u200D\u2060\uFEFF]/gu;

export const hasSubstantialText = (value: string): boolean =>
  value.replace(INSUBSTANTIAL_TEXT, "").length > 0;

// 표 직속 자식 중 thead/tbody/tfoot/tr/colgroup(=표 격자 구조)이 아닌
// 나머지를 순서대로 돌려준다. 대표 사례는 sanitize가 unwrap한 caption의
// 텍스트다 — caption은 htmlAllowedTagNames에 없어 hast-util-sanitize가
// 태그만 벗기고 그 자식(텍스트 노드)을 table의 직속 자식 자리로 끌어올린다
// (sanitize-schema.ts). 그래서 이 헬퍼는 `childElements`(요소만 통과, 텍스트
// 노드는 걸러짐)를 쓰지 않고 `table.children` 원본을 필터 없이 순회한다 —
// 요소만 거르면 unwrap된 caption 텍스트 노드가 조용히 사라져 이슈 #70이
// 지목한 결함이 그대로 재현된다.
export const tableNonSectionChildren = (
  table: HtmlElementNode,
): HtmlElementContent[] =>
  table.children.filter(
    (child) =>
      child.type !== "element" ||
      (child.tagName !== "thead" &&
        child.tagName !== "tbody" &&
        child.tagName !== "tfoot" &&
        child.tagName !== "tr" &&
        child.tagName !== "colgroup"),
  );

export const columnElements = (table: HtmlElementNode): HtmlElementNode[] => {
  const colgroup = childElements(table, "colgroup")[0];
  return colgroup === undefined ? [] : childElements(colgroup, "col");
};

export const inferredColumnCount = (layouts: CellLayout[][]): number =>
  layouts.reduce(
    (maximum, row) =>
      row.reduce(
        (rowMaximum, cell) =>
          Math.max(
            rowMaximum,
            cell.columnIndex + layoutColumnSpan(cell.columnSpan),
          ),
        maximum,
      ),
    0,
  );
