import { MAX_TABLE_COLUMNS } from "@cp949/geul-model";

import { childElements, propertyInteger } from "./hast-properties.js";
import type { HtmlElementContent, HtmlElementNode } from "./inline-content.js";

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
// characterization 테스트: table-layout.test.ts "이슈 114: rowSpan 열/행 수
// 부풀림 대칭성 조사"). colspan이 상한을 둬야 했던 이유는 inferredColumnCount
// (이 파일, 아래)가 "표가 이미 보여준 열 수"를 각 셀의 columnSpan 값 자체로
// 계산하는 자기 강화 구조라, 과대 colspan 셀 자신이 자기를 걸러낼 상한까지
// 함께 부풀렸기 때문이다(Issue #35가 별도 선제 검사
// findOversizedColumnSpanCell을 이 파일에 추가한 이유, 아래). rowSpan에는
// 이 자기 강화 구조가 없다 — 행 수(rowCount)는 실제
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

export type OversizedColumnSpanViolation = {
  cell: CellLayout;
  bound: number;
};

// 단일 셀은 표가 이미 실제로 보여준 열 수보다 넓게 뻗을 수 없다(Issue #35).
// "이미 보여준 열 수"는 호출부가 넘기는 columnFloor(colgroup 선언 등 호출부
// 고유의 열 수 근거)와, 자기 자신을 뺀 다른 모든 셀의 실제 reach(columnIndex
// + colspan) 중 최댓값 중 큰 쪽이다. 자기 자신을 반드시 제외해야 과대
// colspan 셀 자신이 그 상한을 부풀리지 못한다. 다른 셀이 아예 없거나 전부
// 자신보다 reach가 작아도 최소 자기 위치(columnIndex + 1, colspan=1 취급)는
// 상한에 반영한다 — 그래야 유일한 셀이 colspan=500을 주장하는 경우도 여전히
// 거절된다. 과대 colspan을 패딩으로 감추지 않고 여기서 거절한다.
//
// columnFloor는 언제 이 판정을 돌릴지(게이트)까지는 정하지 않는다 — 두
// 호출부가 서로 다른 columnCount 계약을 갖기 때문이다. import-html.ts는
// colgroup이 있으면(cols.length > 0) columnCount를 cols.length로 고정해 이
// 자기 강화 위험 자체가 없다고 보고 cols.length === 0일 때만 이 함수를
// 부르며 그때 columnFloor는 항상 0이다 — colgroup이 있는 경우의 과대
// colspan은 model의 validateGridCoverage(SPAN_OUT_OF_BOUNDS)가 대신 잡는다.
// clipboard-table-parser.ts는 columnCount를 Math.max(cols.length,
// inferredColumnCount(layouts))로 잡아 colgroup이 있어도 span 유래 값이
// 그걸 넘을 수 있으므로(패딩 계약, spec §4.3) 항상 이 함수를 부르고
// columnFloor로 cols.length를 넘긴다.
//
// 표 크기는 아직 MAX_TABLE_LOGICAL_CELLS 체크를 거치지 않았으므로 pairwise
// O(n²) 비교는 피한다. 전체 셀을 한 번 순회해 전역 최댓값(globalMaxReach),
// 그 값을 달성하는 셀들의 가중 합(maxReachCount), 최댓값 미만 값들의
// 최댓값(secondMaxReach)을 구한 뒤, 각 셀은 자신이 전역 최댓값의 유일한
// 소유자일 때만 secondMaxReach를(그 외에는 globalMaxReach를) "다른 셀들의
// reach 최댓값"으로 쓴다.
//
// (Issue #114) rowSpan은 열 쪽과 같은 자기 강화 구조가 없다 — 행 수
// (rowCount)는 실제 <tr> 개수로 고정이라 어떤 셀의 rowSpan도 이 값을 바꾸지
// 않고, model의 validateGridCoverage가 rowEnd(=row+rowSpan) > rowCount를
// 이미 SPAN_OUT_OF_BOUNDS로 거절한다. 하지만 rowSpan은 이 colspan 판정의
// 가중치 입력으로는 쓰인다 — rowSpan으로 여러 행에 걸친 셀이 정당한 근거로
// 최대 reach를 "혼자" 달성하는 경우(예: 2행을 rowSpan=2로 덮는 셀 하나가
// 옆 열의 좁은 셀들보다 넓게 뻗는 완전한 격자)까지 "자기 혼자 주장"으로
// 오인하면 정상 colspan을 거절한다 — Issue #116이 clipboard 쪽에서, #117이
// import-html 쪽에서 각각 발견했다(같은 결함이 두 파일에 따로 있었다,
// 이관 전 이력). 첫 시도는 maxReachCount를 각 셀의 layoutRowSpan(rowSpan)
// 값 자체로 가중했는데 틀렸다 — 가중치가 다른 셀의 독립된 증거가 아니라
// 검사 대상 셀 자기 자신의 rowSpan에서만 나오므로, rowSpan>=2인 셀은
// 뒷받침하는 다른 셀이 아예 없어도(예: rowSpan이 덮는 행이 완전히 빈
// <tr></tr>) 자기 rowSpan 값만으로 maxReachCount를 1 넘겨 "혼자 주장"이
// 아닌 것으로 위장했다 — Issue #35가 막으려던 "뒷받침 없는 홑 셀 과대
// colspan"을 rowSpan 하나만 붙이면 그대로 우회하는 셈이라 원래 결함보다
// 더 나쁜 새 결함이었다(BLOCKER). 올바른 근거는 "rowSpan 값 자체"가 아니라
// "rowSpan이 덮는 다른 행에 자기 자신이 아닌 다른 셀이 실제로 있는가"다 —
// layouts는 행 단위 배열이라 셀은 자신이 시작한 행에만 나타나므로(rowSpan
// 으로 덮는 다른 행에는 같은 셀이 다시 나타나지 않는다), 그 다른 행에
// 원소가 하나라도 있으면 그 행은 후보 셀과 무관한 독립된 근거다. 이 근거가
// 하나라도 있으면 가중치를 1보다 크게(2로 충분 — maxReachCount는 ===1
// 여부만 쓰인다) 주고, 없으면 rowSpan=1과 같은 가중치 1을 준다. rowSpan
// 값의 크기(위조 여부 포함)는 이 함수가 검증하지 않는다 — model의
// validateGridCoverage가 그 안전망이다.
//
// 반환값은 위반 셀과 그 셀의 상한만 담은 순수 데이터다 — throw할지 Result로
// 감쌀지는 호출부의 에러 계약(import-html.ts의 HtmlDocumentInvalidError vs
// clipboard-table-parser.ts의 ClipboardParseError)에 속하는 문제라 이 함수는
// 관여하지 않는다. 사람이 읽을 메시지 텍스트는 반환 방식과 무관한 순수
// 문자열이라 columnSpanViolationMessage로 공유한다(아키텍처 리뷰 4차 카드
// AA) — model의 validateTableSize/tableSizeViolationMessage와 같은 분리다.
export const findOversizedColumnSpanCell = (
  layouts: CellLayout[][],
  columnFloor: number,
): OversizedColumnSpanViolation | undefined => {
  const rowHasOwnCell = layouts.map((row) => row.length > 0);
  const hasIndependentRowBacking = (
    originRowIndex: number,
    span: number,
  ): boolean => {
    const spannedRowEnd = Math.min(originRowIndex + span, rowHasOwnCell.length);
    for (let row = originRowIndex + 1; row < spannedRowEnd; row += 1) {
      if (rowHasOwnCell[row]) return true;
    }
    return false;
  };
  const flatCells = layouts.flat();
  const cellReach = (cell: CellLayout): number =>
    cell.columnIndex + layoutColumnSpan(cell.columnSpan);
  const cellRowWeight = (cell: CellLayout, originRowIndex: number): number => {
    const span = layoutRowSpan(cell.rowSpan);
    return span > 1 && hasIndependentRowBacking(originRowIndex, span) ? 2 : 1;
  };
  let globalMaxReach = 0;
  let maxReachCount = 0;
  let secondMaxReach = 0;
  for (const [rowIndex, row] of layouts.entries()) {
    for (const cell of row) {
      const reach = cellReach(cell);
      const weight = cellRowWeight(cell, rowIndex);
      if (reach > globalMaxReach) {
        secondMaxReach = globalMaxReach;
        globalMaxReach = reach;
        maxReachCount = weight;
      } else if (reach === globalMaxReach) {
        maxReachCount += weight;
      } else if (reach > secondMaxReach) {
        secondMaxReach = reach;
      }
    }
  }
  const columnSpanBoundFor = (cell: CellLayout): number => {
    const reach = cellReach(cell);
    const othersMaxReach =
      reach === globalMaxReach && maxReachCount === 1
        ? secondMaxReach
        : globalMaxReach;
    return Math.max(columnFloor, othersMaxReach, cell.columnIndex + 1);
  };
  const oversizedColumnSpanCell = flatCells.find(
    (cell) => layoutColumnSpan(cell.columnSpan) > columnSpanBoundFor(cell),
  );
  return oversizedColumnSpanCell === undefined
    ? undefined
    : {
        cell: oversizedColumnSpanCell,
        bound: columnSpanBoundFor(oversizedColumnSpanCell),
      };
};

// findOversizedColumnSpanCell이 반환한 위반을 사람이 읽을 메시지로 바꾼다.
// throw할지 Result로 감쌀지는 여전히 호출부의 에러 계약에 속하지만, 메시지
// 텍스트 자체는 import-html.ts·clipboard-table-parser.ts가 리터럴로 각자
// 들고 있던 것과 같은 문자열이라 여기서 공유한다(아키텍처 리뷰 4차 카드 AA).
export const columnSpanViolationMessage = (
  violation: OversizedColumnSpanViolation,
): string =>
  `Table cell colspan exceeds the table's own column bound ${violation.bound}`;
