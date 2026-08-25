import {
  type InlineContent,
  isCanonicalCellAlign,
  isCanonicalCellColor,
  MAX_TABLE_LOGICAL_CELLS,
} from "@cp949/geul-model";
import { sanitize } from "hast-util-sanitize";

import type { ClipboardParseError } from "../errors.js";
import {
  childElements,
  propertyString,
  sanitizeLinks,
} from "../html/hast-properties.js";
import {
  type HtmlElementContent,
  type HtmlElementNode,
  type HtmlNode,
  type HtmlRoot,
  htmlElement,
  inlineContentFromNodes,
} from "../html/inline-content.js";
import { asRoot, parseHtmlFragment } from "../html/parse-html.js";
import { clipboardSanitizeSchema } from "../html/sanitize-schema.js";
import {
  type CellLayout,
  columnElements,
  hasSubstantialText,
  inferredColumnCount,
  layoutColumnSpan,
  layoutRowSpan,
  layoutRows,
  MAX_TABLE_COLUMNS,
  tableNonSectionChildren,
  tableRows,
} from "../html/table-layout.js";
import type { Result } from "../result.js";
import {
  collapseHtmlWhitespace,
  normalizeCellContent,
  sanitizeCellText,
} from "./cell-text.js";
import type {
  ClipboardContent,
  ClipboardContentBlock,
} from "./clipboard-content.js";
import { parseStyleDeclarations } from "./style-declarations.js";
import {
  type TabularCell,
  type TabularData,
  validateTabularData,
} from "./tabular-data.js";

// role=presentation/none은 "이건 데이터 표가 아니다"라는 저자의 명시적
// 선언이고, 표를 품은 표는 우리 모델이 중첩 표를 표현하지 못하므로 바깥이
// 래퍼다 — 둘 다 안쪽으로 내려가 실제 데이터 표를 찾는다. 이 판정이 없으면
// Gmail 서명 같은 레이아웃 표가 통째로 표로 붙는다.
const isLayoutTable = (table: HtmlElementNode): boolean => {
  const role = propertyString(table, "role")?.trim().toLowerCase();
  return role === "presentation" || role === "none";
};

// 셀이 하나도 없는 표는 데이터 표가 아니다. Outlook/Gmail HTML 메일은 여백용
// 빈 <table>을 중첩해 심는데, findDataTables가 가장 안쪽 표를 고르므로 이걸
// 데이터 표로 집으면 같은 행에 있는 진짜 셀들이 blockSequenceFromNodes에서
// 표 없는 순수 인라인 콘텐츠로 문단 블록이 된다 — 표 구조 자체가 사라진다.
const hasDataCells = (table: HtmlElementNode): boolean =>
  tableRows(table).some((row) =>
    childElements(row.element).some(
      (cell) => cell.tagName === "td" || cell.tagName === "th",
    ),
  );

// 형제 최상위 데이터 표를 문서 순서(pre-order DFS)대로 모두 찾는다(Issue #73
// — 다중 표 지원). 각 최상위 노드에 대해 먼저 그 자식들을 재귀로 뒤져
// 나온 표가 있으면 그것만 채택하고(innermost wins — 표를 품은 바깥 표
// 자신은 후보에서 제외한다, model이 중첩 표를 표현하지 못하므로), 자식
// 재귀에서 아무것도 못 찾았을 때만 노드 자신을 데이터 표 후보로 본다.
// 별도 정렬은 하지 않는다 — 이 순회 순서 자체가 이미 표 발견 순서다.
const findDataTables = (root: HtmlRoot): HtmlElementNode[] => {
  const tables: HtmlElementNode[] = [];
  for (const node of root.children) {
    if (node.type !== "element") continue;
    const nested = findDataTables({ type: "root", children: node.children });
    if (nested.length > 0) {
      tables.push(...nested);
      continue;
    }
    if (
      node.tagName === "table" &&
      !isLayoutTable(node) &&
      hasDataCells(node)
    ) {
      tables.push(node);
    }
  }
  return tables;
};

// "표 밖 실질 텍스트" 판정(hasSubstantialText/INSUBSTANTIAL_TEXT)은
// table-layout.ts가 소유한다 — import 경로(caption 등 표 직속 비섹션 자식)와
// 이 판정을 공유해야 하기 때문이다.

// 찾아낸 표 중 하나라도 이 노드들 안 어딘가에 있는지 재귀로 확인한다.
// walk()가 표를 찾기 위해 더 파고들어야 하는지(descend), 아니면 표 없는
// 순수 인라인/구조 콘텐츠라 통째로 pending에 밀어 넣어도 되는지
// (inlineContentFromNodes가 알아서 재귀하며 마크를 계산한다) 판단하는 데
// 쓴다. 표 집합을 Set으로 받아 `has` 판정한다 — nodes.includes로 배열을
// 매 노드마다 선형 탐색하면 표 개수만큼 비용이 곱해진다.
const containsAnyTable = (
  nodes: readonly HtmlNode[],
  tables: ReadonlySet<HtmlElementNode>,
): boolean => {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    if (tables.has(node)) return true;
    if (containsAnyTable(node.children, tables)) return true;
  }
  return false;
};

// 조상 서식 체인을 노드에 얕은 클론으로 다시 씌운다. `<strong>`이나 `<a>`가
// 표를 감싸고 있으면 walk가 그 요소를 통과해 자식으로 내려가므로, 이 복원이
// 없으면 표 앞뒤 텍스트가 마크(link의 href 포함)를 잃는다 — 같은 서식이 표를
// 감싸지 않고 형제로 있을 때와 결과가 달라지면 안 된다. 클론은 원본 자식을
// 참조로 담으므로 collapseHtmlWhitespace의 제자리 수정이 그대로 원본 텍스트
// 노드에 닿는다. 마크가 없는 조상(레이아웃 표의 table/tbody/tr 등)까지 함께
// 씌우지만 inlineContentFromNodes가 마크 없는 태그를 그냥 재귀 통과하므로
// 결과는 달라지지 않는다.
const wrapInAncestors = (
  node: HtmlElementContent,
  ancestors: readonly HtmlElementNode[],
): HtmlElementContent =>
  ancestors.reduceRight<HtmlElementContent>(
    (child, ancestor) =>
      htmlElement(ancestor.tagName, ancestor.properties, [child]),
    node,
  );

// h1~h6만 heading 태그다. 태그명 마지막 문자에서 level을 뽑는다
// (import-html.ts의 parseBlock과 같은 패턴 — `Number(tagName.slice(1))`).
// clipboardAllowedTagNames가 h4~h6까지 sanitize를 통과시키므로(DELTA-03,
// Issue #72) 여기서 h1~h6를 모두 인식해야 sanitize 확장이 의미가 있다.
const headingLevelFromTagName = (
  tagName: string,
): 1 | 2 | 3 | 4 | 5 | 6 | undefined =>
  /^h[1-6]$/.test(tagName)
    ? (Number(tagName.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6)
    : undefined;

// 표를 찾은 뒤에는 표 밖 콘텐츠를 거절하지 않고 문단 블록으로 옮겨 담는다
// — 표 앞뒤 문단은 문단으로, 표는 표 노드로, 문서 순서를 지켜 한 시퀀스로
// 만든다(spec §4.1, Issue #71). 이 판정은 sanitize를 이미 거친 트리를
// 검사한다: hast-util-sanitize는 스키마 tagNames 허용 목록에도 strip
// 목록에도 없는 태그를 벗겨내(unwrap) 그 자식(텍스트 포함)을 트리 위로
// 그대로 끌어올리므로, <html>/<head>/<body>나 자기 복사가 만드는
// <div data-pm-slice="..."> 같은 래퍼에 있던 콘텐츠도 이 판정에 그대로
// 걸린다 — 구조적 래퍼가 통째로 면제되는 허용 목록이 따로 있는 게 아니다.
//
// `p`/`h1`~`h6` 태그와 찾아낸 데이터 표들이 블록 경계다: `p`나 heading을
// 만나면 지금까지 쌓인 인라인 콘텐츠를 먼저 문단으로 내보내고 그 요소의
// 콘텐츠만 담은 블록을 하나 더 내보낸다 — h1~h3는 `{type:"heading",level}`
// 로, h4~h6는 model HeadingBlock.level(1~3) 제약 때문에 문단으로
// 다운그레이드한다(DELTA-03, Issue #72; clipboardAllowedTagNames가 h4~h6도
// sanitize를 통과시켜야 태그 자체가 여기 도달한다, sanitize-schema.ts).
// 찾아낸 표를 만나면 그 표를 표 블록으로 내보낸다 — 형제 최상위 데이터
// 표가 여럿이면(findDataTables, Issue #73) 문서 순서대로 각각 독립된 표
// 블록이 된다. TBL-012는 "단일 표 10,000 논리 셀 보장" 성능 계약이지
// "클립보드당 표 1개" 제품 계약이 아니므로 다중 표 지원과 충돌하지 않는다.
// 그 외 모든 요소(레이아웃 표 래퍼의 tr/td, 서명 셀, span/strong 등 인라인
// 서식, 그리고 findDataTables가 고르지 않은 다른 <table> — 셀 없는 표나
// role=presentation 래퍼)는 인라인 콘텐츠로 재귀 병합한다 — 레이아웃 표 안
// 형제 셀 텍스트가 데이터 표와 함께 보존되는 것도 이 재귀 덕분이다.
//
// 예외: `p`/heading이 찾아낸 표를 자식으로 품고 있으면 위 "블록 경계"
// 취급을 접고 통과해 내려간다 — heading은 `<table>`이 자동으로 닫지 않아
// (p와 달리) 실제로 표를 자식에 담을 수 있고, 접으면 표가 구분자 없는
// 인라인 텍스트로 뭉개진다. 표 앞뒤 텍스트는 그 heading/p의 문단·heading
// 서식을 잃고 문단으로 남는다 — model이 "표를 품은 heading"을 표현하지
// 못하므로 표 구조 보존을 문단 다운그레이드보다 우선한다.
//
// 문단/heading 블록의 텍스트는 셀 텍스트와 같은 정규화를 거쳐야 한다 —
// collapseHtmlWhitespace(정규 공백 run 접기)와 normalizeCellContent(C0
// 제어문자/DEL/짝 없는 surrogate 정제) 없으면 model의 isValidInlineText
// 검사가 거절해 readEditorDocument에서 throw된다(editor 영구 desync).
//
// 표를 담은 조상 요소는 walk가 통과해 내려가므로 pending에 남지 않는다 —
// 그 요소가 주던 마크는 wrapInAncestors가 노드마다 다시 씌워 살린다.
const blockSequenceFromNodes = (
  nodes: readonly HtmlNode[],
  tables: readonly HtmlElementNode[],
): Result<ClipboardContentBlock[], ClipboardParseError> => {
  const tableSet = new Set(tables);
  const blocks: ClipboardContentBlock[] = [];
  let pending: HtmlNode[] = [];
  let failure: ClipboardParseError | undefined;

  // 셀 텍스트와 같은 정규화(collapseHtmlWhitespace로 공백 run 접기 →
  // normalizeCellContent로 C0 제어문자/DEL/짝 없는 surrogate 제거)를 거쳐
  // 인라인 콘텐츠로 만든다. flush()의 문단 생성과 heading 분기(h1~h3)가 이
  // 정규화를 공유한다 — 누락되면 model의 isValidInlineText가 거절하는
  // 코드포인트가 남아 readEditorDocument에서 throw된다(editor 영구 desync).
  const normalizedInlineContent = (segment: HtmlNode[]): InlineContent => {
    collapseHtmlWhitespace(segment);
    return normalizeCellContent(inlineContentFromNodes(segment));
  };

  const flush = (): void => {
    if (pending.length === 0) return;
    const content = normalizedInlineContent(pending);
    const text = content.map((item) => item.text).join("");
    if (hasSubstantialText(text)) {
      blocks.push({ type: "paragraph", content });
    }
    pending = [];
  };

  const walk = (
    list: readonly HtmlNode[],
    ancestors: readonly HtmlElementNode[],
  ): void => {
    for (const node of list) {
      if (failure !== undefined) return;
      if (node.type === "element" && tableSet.has(node)) {
        // 기존 pending(intro 등)을 먼저 내보낸 뒤에야 caption을 pending에
        // 담는다 — 순서를 바꾸면 pending이 아직 안 비워진 상태라 caption이
        // intro보다 앞서 나온다(문서 순서 역전). caption(표 직속 비섹션
        // 자식, 대표 사례가 sanitize가 unwrap한 caption 텍스트)은 이 두
        // 번째 flush()가 기존 collapseHtmlWhitespace/normalizeCellContent/
        // hasSubstantialText 판정을 그대로 재사용하게 한다 — 셀 텍스트와
        // 같은 정규화를 거치지 않으면 model의 isValidInlineText 검사가
        // 거절해 readEditorDocument에서 throw된다.
        flush();
        pending = tableNonSectionChildren(node).map((child) =>
          wrapInAncestors(child, ancestors),
        );
        flush();
        const parsed = tabularDataFromTable(node);
        if (!parsed.ok) {
          failure = parsed.error;
          return;
        }
        blocks.push({ type: "table", data: parsed.value });
        continue;
      }
      if (node.type === "text") {
        pending.push(wrapInAncestors(node, ancestors));
        continue;
      }
      if (node.type !== "element") continue;
      const headingLevel = headingLevelFromTagName(node.tagName);
      // p/heading이 표를 품고 있으면(HTML5 파싱 규칙상 table 시작 태그는
      // p만 자동으로 닫고 h1~h6는 닫지 않으므로 heading은 실제로 표를
      // 자식으로 담을 수 있다) 블록 경계로 접어 인라인 텍스트로 흡수하지
      // 않는다 — 통과해 내려가 표를 표 블록으로 보존한다(아래 일반
      // containsAnyTable fallback과 같은 재귀 패턴). p 쪽은 이 경로를 타는
      // 입력이 실제로 없다(table이 p를 항상 먼저 닫는다)는 것을 parse5로
      // 확인했지만, 같은 위험을 원천 차단하려고 p도 함께 검사한다.
      if (
        (node.tagName === "p" || headingLevel !== undefined) &&
        containsAnyTable(node.children, tableSet)
      ) {
        walk(node.children, [...ancestors, node]);
        continue;
      }
      if (node.tagName === "p") {
        flush();
        pending = node.children.map((child) =>
          wrapInAncestors(child, ancestors),
        );
        flush();
        continue;
      }
      if (headingLevel !== undefined) {
        // h1~h3는 heading으로, h4~h6는 문단으로 다운그레이드한다(model
        // HeadingBlock.level이 1~3만 허용 — DELTA-03, Issue #72). 둘 다
        // 먼저 pending을 flush()해 순서를 지키고, 그 heading/h4~h6의
        // 콘텐츠만 별도로 담아 인접 블록과 병합되지 않게 한다.
        flush();
        const wrapped = node.children.map((child) =>
          wrapInAncestors(child, ancestors),
        );
        if (headingLevel === 1 || headingLevel === 2 || headingLevel === 3) {
          const content = normalizedInlineContent(wrapped);
          const text = content.map((item) => item.text).join("");
          if (hasSubstantialText(text)) {
            blocks.push({ type: "heading", level: headingLevel, content });
          }
        } else {
          pending = wrapped;
          flush();
        }
        continue;
      }
      if (containsAnyTable(node.children, tableSet)) {
        walk(node.children, [...ancestors, node]);
        continue;
      }
      pending.push(wrapInAncestors(node, ancestors));
    }
  };

  walk(nodes, []);
  flush();
  if (failure !== undefined) return { ok: false, error: failure };
  return { ok: true, value: blocks };
};

const canonicalColor = (value: string | undefined): string | undefined =>
  value !== undefined && isCanonicalCellColor(value) ? value : undefined;

const canonicalAlign = (
  value: string | undefined,
): "left" | "center" | "right" | undefined =>
  value !== undefined && isCanonicalCellAlign(value) ? value : undefined;

// data-be-*(자기 복사)가 있으면 우선하고, 없으면 style에서 뽑는다(외부
// Excel/Google Sheets는 data-be-*가 없으므로 항상 style로 떨어진다).
const cellStyleFields = (
  element: HtmlElementNode,
): Pick<TabularCell, "textColor" | "backgroundColor" | "align"> => {
  const styleAttribute = propertyString(element, "style");
  const parsedStyle =
    styleAttribute === undefined ? {} : parseStyleDeclarations(styleAttribute);

  // data-be-*도 style과 똑같이 model의 정규 형식을 통과해야 한다. 그냥
  // 통과시키면 클립보드 HTML이 임의 값을 문서로 밀어넣어 parseDocument가
  // 커밋 시점에 터진다(모델↔에디터 영구 desync).
  const textColor =
    canonicalColor(propertyString(element, "dataBeTextColor")) ??
    parsedStyle.color;
  const backgroundColor =
    canonicalColor(propertyString(element, "dataBeBackgroundColor")) ??
    parsedStyle.backgroundColor;
  const align =
    canonicalAlign(propertyString(element, "dataBeAlign")) ?? parsedStyle.align;

  return {
    ...(textColor === undefined ? {} : { textColor }),
    ...(backgroundColor === undefined ? {} : { backgroundColor }),
    ...(align === undefined ? {} : { align }),
  };
};

// 각 행에서 어떤 셀도 덮지 않는 논리 좌표를 표시한다. 겹치는 좌표는 한 번만
// 표시되므로 패딩이 겹침을 감추지 않는다 — OVERLAPPING_CELL은 그대로
// validateTabularData가 잡는다.
const coveredCoordinates = (
  layouts: CellLayout[][],
  columnCount: number,
): boolean[][] => {
  const covered = layouts.map(() =>
    new Array<boolean>(columnCount).fill(false),
  );

  for (const [rowIndex, row] of layouts.entries()) {
    for (const layout of row) {
      const rowSpan = layoutRowSpan(layout.rowSpan);
      const columnSpan = layoutColumnSpan(layout.columnSpan);
      const rowEnd = Math.min(rowIndex + rowSpan, layouts.length);
      const columnEnd = Math.min(layout.columnIndex + columnSpan, columnCount);

      for (let covering = rowIndex; covering < rowEnd; covering += 1) {
        const rowCover = covered[covering];
        if (rowCover === undefined) continue;
        for (let column = layout.columnIndex; column < columnEnd; column += 1) {
          rowCover[column] = true;
        }
      }
    }
  }

  return covered;
};

const tabularDataFromTable = (
  table: HtmlElementNode,
): Result<TabularData, ClipboardParseError> => {
  // 셀 콘텐츠를 만들기 전에 접어야 br이 만든 LF와 원본 마크업 들여쓰기가
  // 만든 개행이 구분된다.
  collapseHtmlWhitespace(table.children);

  const cols = columnElements(table);
  const rows = tableRows(table);
  const layouts = layoutRows(rows);

  // 단일 셀은 표 자신이 이미 보여준 열 수보다 넓게 뻗을 수 없다(Issue #35).
  // "표가 이미 보여준 열 수"는 colgroup 선언(cols.length)과, 자기 자신을 뺀
  // 다른 모든 셀의 실제 reach(columnIndex + colspan) 중 최댓값 중 큰 쪽이다.
  // (트랙-6) 예전에는 "distinct 시작 columnIndex 개수"를 썼는데, rowSpan 때문에
  // 서로 다른 행의 셀이 같은 columnIndex에서 반복 시작하면(병합 셀 옆에 세로로
  // 나열된 좁은 컬럼처럼 흔한 패턴) 개수가 실제 뒷받침 열 수보다 작게 잡혀
  // 정당한 colspan을 오탐 거절했다. reach 최댓값은 이 상호작용에서도 정확하다.
  // 자기 자신을 반드시 제외해야 과대 colspan 셀 자신이 그 상한을 부풀리지
  // 못한다. 다른 셀이 아예 없거나 전부 자신보다 reach가 작아도 최소 자기 위치
  // (columnIndex + 1, colspan=1 취급)는 상한에 반영한다 — 그래야 유일한 셀이
  // colspan=500을 주장하는 경우도 여전히 거절된다. 과대 colspan을 패딩으로
  // 감추지 않고 여기서 거절한다.
  //
  // 표 크기는 아직 MAX_TABLE_LOGICAL_CELLS 체크를 거치지 않았으므로 pairwise
  // O(n²) 비교는 피한다. 전체 셀을 한 번 순회해 전역 최댓값(globalMaxReach),
  // 그 값을 달성하는 셀들의 가중 합(maxReachCount), 최댓값 미만 값들의
  // 최댓값(secondMaxReach)을 구한 뒤, 각 셀은 자신이 전역 최댓값의 유일한
  // 소유자일 때만 secondMaxReach를(그 외에는 globalMaxReach를) "다른 셀들의
  // reach 최댓값"으로 쓴다.
  //
  // (Issue #116) 원본은 maxReachCount를 "그 reach를 달성한 셀 개수"로 셌는데,
  // rowSpan으로 여러 행에 걸친 셀이 정당한 근거로 최대 reach를 "혼자"
  // 달성하는 경우(예: 2행을 rowSpan=2로 덮는 셀 하나가 옆 열의 좁은 셀들보다
  // 넓게 뻗는 완전한 격자)까지 "자기 혼자 주장"으로 오인해 정상 colspan을
  // 거절했다(import-html.ts에서 Issue #115 "단계-3 결함 탐지"로 이미 발견한
  // 것과 같은 결함).
  //
  // (Issue #116 단계-3 결함 탐지, BLOCKER) 첫 시도는 import-html.ts를 그대로
  // 따라 maxReachCount를 셀 개수 대신 각 셀의 layoutRowSpan(rowSpan) 값
  // 자체로 가중했다. 이건 틀렸다 — 가중치가 다른 셀의 독립된 증거가 아니라
  // 검사 대상 셀 **자기 자신**의 rowSpan에서만 나오므로, rowSpan>=2인 셀은
  // 뒷받침하는 다른 셀이 아예 없어도(예: rowSpan이 덮는 행이 완전히 빈
  // <tr></tr>) 자기 rowSpan만으로 maxReachCount를 1 넘겨 "혼자 주장"이
  // 아닌 것으로 위장했다. 그러면 othersMaxReach가 진짜 다른 근거인
  // secondMaxReach 대신 자기 자신의 reach인 globalMaxReach로 쓰이고,
  // reach(=columnIndex+colspan) >= colspan은 항상 참이므로 이 셀에 대해서는
  // 검사가 자기 자신과 비교하는 항등식이 되어 어떤 colspan도 통과했다 —
  // Issue #35가 막으려던 "뒷받침 없는 홑 셀 과대 colspan"을 rowSpan 하나만
  // 붙이면 그대로 우회하는 셈이라 원래 결함보다 더 나쁜 새 결함이었다.
  //
  // 올바른 근거는 "rowSpan 값 자체"가 아니라 "rowSpan이 덮는 다른 행에 자기
  // 자신이 아닌 다른 셀이 실제로 있는가"다. layouts는 행 단위 배열이라 셀은
  // 자신이 시작한 행에만 나타나므로(rowSpan으로 덮는 다른 행에는 같은 셀이
  // 다시 나타나지 않는다), 그 다른 행에 원소가 하나라도 있으면 그 행은
  // 후보 셀과 무관한 독립된 근거다. 이 근거가 하나라도 있으면 가중치를
  // 1보다 크게(2로 충분 — maxReachCount는 ===1 여부만 쓰인다) 주고, 없으면
  // (모든 spanned row가 비어 있거나 표 범위를 벗어남) rowSpan=1과 똑같이
  // 가중치 1을 준다. rowSpan 값의 크기(위조 여부 포함)는 이 선제 검사가
  // 검증하지 않는다 — model의 validateGridCoverage(SPAN_OUT_OF_BOUNDS)가
  // rowEnd(=row+rowSpan)가 실제 rowCount를 넘는 rowSpan 주장을 이 검사와
  // 무관하게 항상 거절하는 별도 안전망이다(Issue #114 조사 결론과 같은
  // 근거) — 다른 행의 진짜 뒷받침으로 이 선제 검사를 통과해도 rowSpan 값
  // 자체가 위조됐으면 그 안전망이 최종적으로 거절한다.
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
  // 위반 셀의 상한은 셀마다 다르므로(globalMaxReach는 전역 값일 뿐, 위반한
  // 그 셀 자신의 상한과 다를 수 있다 — 트랙-6에서 메시지가 위반 셀 자신의
  // reach를 그대로 상한인 것처럼 보고하는 결함으로 발견) 위반 셀을 찾아
  // 그 셀의 상한을 메시지에 그대로 쓴다.
  const columnSpanBoundFor = (cell: CellLayout): number => {
    const reach = cellReach(cell);
    const othersMaxReach =
      reach === globalMaxReach && maxReachCount === 1
        ? secondMaxReach
        : globalMaxReach;
    return Math.max(cols.length, othersMaxReach, cell.columnIndex + 1);
  };
  const oversizedColumnSpanCell = flatCells.find(
    (cell) => layoutColumnSpan(cell.columnSpan) > columnSpanBoundFor(cell),
  );
  if (oversizedColumnSpanCell !== undefined) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_TABLE_INVALID",
        message: `Table cell colspan exceeds the table's own column bound ${columnSpanBoundFor(oversizedColumnSpanCell)}`,
      },
    };
  }

  // 짧은 행을 빈 셀로 채워 직사각형을 만들려면 colgroup과 실제 셀 중 넓은
  // 쪽을 열 수로 잡아야 한다(TSV 경로의 패딩과 같은 계약, spec §4.3).
  const columnCount = Math.max(cols.length, inferredColumnCount(layouts));

  if (columnCount > MAX_TABLE_COLUMNS) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_TABLE_INVALID",
        message: `Table column count exceeds ${MAX_TABLE_COLUMNS}`,
      },
    };
  }
  if (rows.length * columnCount > MAX_TABLE_LOGICAL_CELLS) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_TABLE_INVALID",
        message: `Table logical cell count exceeds ${MAX_TABLE_LOGICAL_CELLS}`,
      },
    };
  }

  const covered = coveredCoordinates(layouts, columnCount);
  const data: TabularData = {
    columnCount,
    rows: layouts.map((row, rowIndex) => {
      const cells: TabularCell[] = row.map((layout) => ({
        columnIndex: layout.columnIndex,
        // coveredCoordinates가 쓰는 보정값과 반드시 같아야 한다 — 어긋나면
        // 커버리지는 채워졌는데 검증기는 UNCOVERED_COORDINATE를 내서
        // 멀쩡한 표 붙여넣기가 통째로 거절된다.
        rowSpan: layoutRowSpan(layout.rowSpan),
        columnSpan: layoutColumnSpan(layout.columnSpan),
        content: normalizeCellContent(
          inlineContentFromNodes(layout.element.children),
        ),
        ...cellStyleFields(layout.element),
      }));

      for (let column = 0; column < columnCount; column += 1) {
        if (covered[rowIndex]?.[column] === true) continue;
        cells.push({
          columnIndex: column,
          rowSpan: 1,
          columnSpan: 1,
          content: [],
        });
      }
      cells.sort((left, right) => left.columnIndex - right.columnIndex);

      return { cells };
    }),
  };

  const validated = validateTabularData(data);
  return validated.ok ? { ok: true, value: data } : validated;
};

// parseHtmlTable의 실패는 두 가지로 갈린다 — 거절할 데이터 표를 애초에 찾지
// 못했는지(sawTable: false, TSV 폴백을 시도해도 안전하다), 표는 찾았고 그
// 내용을 보고 거절했는지(sawTable: true, CLIPBOARD_TABLE_INVALID —
// TSV로 새면 이미 내린 거절 판정이 무력화된다). 공개 ClipboardParseError는
// 이 구분을 담지 않으므로(항상 NOT_TABULAR | CLIPBOARD_TABLE_INVALID)
// 모듈 내부 전용 타입으로만 구분하고, parseClipboardTable이 반환하기
// 직전에 sawTable을 벗겨낸다.
type HtmlTableOutcome =
  | { ok: true; value: ClipboardContentBlock[] }
  | { ok: false; error: ClipboardParseError; sawTable: boolean };

const parseHtmlTable = (html: string): HtmlTableOutcome => {
  const unsafeRoot = parseHtmlFragment(html);
  if (unsafeRoot === undefined)
    return { ok: false, error: { code: "NOT_TABULAR" }, sawTable: false };

  const safeRoot = asRoot(sanitize(unsafeRoot, clipboardSanitizeSchema));
  if (safeRoot === undefined)
    return { ok: false, error: { code: "NOT_TABULAR" }, sawTable: false };

  // importHtml과 같은 링크 정책을 적용한다 — 살려두면 core의
  // LinkPolicyExtension.filterTransaction이 붙여넣기 트랜잭션을 통째로 버린다.
  sanitizeLinks(safeRoot.children);

  const tables = findDataTables(safeRoot);
  if (tables.length === 0)
    return { ok: false, error: { code: "NOT_TABULAR" }, sawTable: false };

  const sequence = blockSequenceFromNodes(safeRoot.children, tables);
  if (!sequence.ok) {
    return { ok: false, error: sequence.error, sawTable: true };
  }
  return { ok: true, value: sequence.value };
};

const parseTsv = (text: string): Result<TabularData, ClipboardParseError> => {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  // 끝 개행 하나가 만든 빈 줄만 버린다. 중간 빈 줄까지 걸러내면 행 인덱스가
  // 조용히 밀려 원본과 다른 표가 붙는다 — 중간 빈 줄은 아래 직사각형 검사가
  // 걸러 기본 붙여넣기로 흘려보낸다.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return { ok: false, error: { code: "NOT_TABULAR" } };

  // 탭이 하나라도 있으면 표로 보던 판정은 너무 넓다 — 탭 들여쓰기 코드나
  // 탭이 섞인 로그가 전부 표가 됐고, 확장이 이벤트를 소비하므로 사용자는
  // 기본 붙여넣기를 되찾을 수 없었다. 스프레드시트 클립보드는 항상 모든
  // 줄의 탭 개수가 같은 직사각형이므로 그 조건만 표로 인정한다.
  const rows = lines.map((line) => line.split("\t"));
  const columnCount = rows[0]?.length ?? 0;
  if (columnCount < 2) return { ok: false, error: { code: "NOT_TABULAR" } };
  if (rows.some((row) => row.length !== columnCount)) {
    return { ok: false, error: { code: "NOT_TABULAR" } };
  }
  if (rows.length * columnCount > MAX_TABLE_LOGICAL_CELLS) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_TABLE_INVALID",
        message: `Table logical cell count exceeds ${MAX_TABLE_LOGICAL_CELLS}`,
      },
    };
  }

  const data: TabularData = {
    columnCount,
    rows: rows.map((cells) => ({
      cells: Array.from({ length: columnCount }, (_, columnIndex) => {
        // TSV 셀에 LF는 있을 수 없다(개행이 행 구분자다) — 단독 CR과 나머지
        // C0 제어문자, DEL만 제거하면 model 인라인 텍스트 계약을 만족한다.
        const text = sanitizeCellText(cells[columnIndex] ?? "");
        return {
          columnIndex,
          rowSpan: 1,
          columnSpan: 1,
          content: text.length === 0 ? [] : [{ text }],
        };
      }),
    })),
  };

  const validated = validateTabularData(data);
  return validated.ok ? { ok: true, value: data } : validated;
};

const TABLE_TAG_PATTERN = /<table[\s>]/i;

export const parseClipboardTable = (input: {
  html?: string;
  text?: string;
}): Result<ClipboardContent, ClipboardParseError> => {
  // <table>이 없는 HTML은 파싱조차 하지 않는다. 표 없는 붙여넣기도 rehype
  // 파싱 + sanitize를 전부 돌린 뒤 NOT_TABULAR를 내고, 그다음 ProseMirror가
  // 같은 HTML을 다시 파싱했다 — 긴 웹 문서 붙여넣기가 파싱 비용을 두 번 낸다.
  if (
    input.html !== undefined &&
    input.html.length > 0 &&
    TABLE_TAG_PATTERN.test(input.html)
  ) {
    const htmlResult = parseHtmlTable(input.html);
    if (htmlResult.ok) return { ok: true, value: htmlResult.value };
    if (htmlResult.sawTable) {
      // 표를 찾았지만 거절했다(CLIPBOARD_TABLE_INVALID) — text/plain 짝이
      // 우연히 표와 같은 탭 구조를 가져도 TSV로 다시 새서 이 거절을
      // 무력화하면 안 된다.
      return { ok: false, error: htmlResult.error };
    }
    // sawTable: false(html에 표 후보 자체가 없음) -> TSV로 폴백.
  }
  if (input.text !== undefined && input.text.length > 0) {
    const tsv = parseTsv(input.text);
    return tsv.ok
      ? { ok: true, value: [{ type: "table", data: tsv.value }] }
      : tsv;
  }
  return { ok: false, error: { code: "NOT_TABULAR" } };
};
