import {
  type InlineContent,
  isCanonicalCellAlign,
  isCanonicalCellColor,
  tableSizeViolationMessage,
  validateTableSize,
} from "@cp949/geul-model";
import { sanitize } from "hast-util-sanitize";

import type { ClipboardParseError } from "../errors.js";
import {
  type BlockSegmentPolicy,
  isParagraphTag,
  isTransparentListTag,
  NESTED_BOUNDARY_TAG_NAMES,
  segmentBlocks,
} from "../html/block-segmenter.js";
import {
  childElements,
  propertyString,
  sanitizeLinks,
} from "../html/hast-properties.js";
import {
  type HtmlElementNode,
  type HtmlNode,
  type HtmlRoot,
  inlineContentFromNodes,
} from "../html/inline-content.js";
import {
  markerTypeFromTag,
  parseExplicitStartNumber,
  splitListItemChildren,
} from "../html/list-block-builder.js";
import { asRoot, parseHtmlFragment } from "../html/parse-html.js";
import {
  clipboardAllowedAttributes,
  clipboardSanitizeSchema,
} from "../html/sanitize-schema.js";
import {
  type CellLayout,
  columnElements,
  columnSpanViolationMessage,
  findOversizedColumnSpanCell,
  hasSubstantialText,
  inferredColumnCount,
  layoutColumnSpan,
  layoutRowSpan,
  layoutRows,
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

// 재귀 경계 판정(문단/헤딩/표/목록 시퀀스로 쪼개기) 자체는 block-segmenter.ts가
// import-html.ts와 공유한다(아키텍처 리뷰 2차 후보 G) — 이 파일의 네 태그
// (div/li/blockquote는 항상 재귀, ul/ol은 리프로 접기, p/heading은 표를
// 품었을 때만 재귀)만 정책으로 넘긴다. h1~h6는 여기서 인식한다 —
// import-html.ts도 이제 h1~h6를 heading으로 인식하므로(별개 DELTA에서 정정)
// 이 파일과 다르지 않다.
const headingLevelFromTagName = (
  tagName: string,
): 1 | 2 | 3 | 4 | 5 | 6 | undefined =>
  /^h[1-6]$/.test(tagName)
    ? (Number(tagName.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6)
    : undefined;

// 표를 찾은 뒤에는 표 밖 콘텐츠를 거절하지 않고 문단 블록으로 옮겨 담는다
// — 표 앞뒤 문단은 문단으로, 표는 표 노드로, 문서 순서를 지켜 한 시퀀스로
// 만든다(spec §4.1, Issue #71). h1~h6는 모두 heading으로 유지한다 — model
// HeadingBlock.level이 1~6으로 확장돼(DELTA-04, Issue #38) 이제 h4~h6를
// 문단으로 다운그레이드할 이유가 없다(Issue #38 슬라이스 3). 찾아낸 표가
// 여럿이면(findDataTables, Issue #73) 문서 순서대로 각각 독립된 표 블록이
// 된다. ul/ol은 kind: "list" 세그먼트로 나와 li마다 마커 타입·중첩 계층·
// 명시적 startNumber를 보존한다(DELTA-01, Issue #143 (b)).
//
// 문단/heading/목록 항목 블록의 텍스트는 셀 텍스트와 같은 정규화를 거쳐야
// 한다 — collapseHtmlWhitespace(정규 공백 run 접기)와
// normalizeCellContent(C0 제어문자/DEL/짝 없는 surrogate 정제) 없으면
// model의 isValidInlineText 검사가 거절해 readEditorDocument에서
// throw된다(editor 영구 desync).
const blockSequenceFromNodes = (
  nodes: readonly HtmlNode[],
  tables: readonly HtmlElementNode[],
): Result<ClipboardContentBlock[], ClipboardParseError> => {
  const tableSet = new Set(tables);
  // headingLevelFromTagName의 반환 타입(1~6)을 그대로 실어 segment.level이
  // number가 아닌 좁혀진 리터럴 유니언으로 나오게 한다(import-html.ts의
  // importBlockSegmentPolicy와 같은 패턴) — heading 분기에서 캐스트 없이
  // ClipboardContentBlock의 heading level에 대입하기 위해서다.
  const policy: BlockSegmentPolicy<1 | 2 | 3 | 4 | 5 | 6> = {
    isSimpleBoundary: isParagraphTag,
    headingLevelFromTagName,
    isNestedBoundary: (tagName) => NESTED_BOUNDARY_TAG_NAMES.has(tagName),
    isTransparent: isTransparentListTag,
    // ul/ol 자신을 kind: "list" 리프로 접는다 — isTransparentListTag를
    // 그대로 재사용한다(block-segmenter.ts의 isTransparentListTag 주석
    // 참고, 두 정책 필드에 같은 태그 판정을 서로 다른 소비자가 꽂아 쓴다).
    isListTag: isTransparentListTag,
    isTableNode: (node) => tableSet.has(node),
  };

  // 셀 텍스트와 같은 정규화(collapseHtmlWhitespace로 공백 run 접기 →
  // normalizeCellContent로 C0 제어문자/DEL/짝 없는 surrogate 제거)를 거쳐
  // 인라인 콘텐츠로 만든다. 문단 생성과 heading 분기(h1~h6)가 이 정규화를
  // 공유한다 — 누락되면 model의 isValidInlineText가 거절하는 코드포인트가
  // 남아 readEditorDocument에서 throw된다(editor 영구 desync).
  const normalizedInlineContent = (segmentNodes: HtmlNode[]): InlineContent => {
    collapseHtmlWhitespace(segmentNodes);
    return normalizeCellContent(inlineContentFromNodes(segmentNodes));
  };

  // li 안 "block-level" 판정 — splitListItemChildren이 content/children을
  // 나눌 때 쓴다. 새 태그 분류를 만들지 않고 이 파일이 이미 정책으로
  // 넘기는 표·목록·문단 경계 집합을 그대로 조립한다(트랙-4 확인,
  // import-html.ts의 isBlockLevelElement와 같은 원칙 — 단 표 판정은
  // 이 파일의 tableSet 멤버십을 쓴다).
  const isBlockLevelNode = (node: HtmlElementNode): boolean =>
    policy.isTableNode(node) ||
    isTransparentListTag(node.tagName) ||
    NESTED_BOUNDARY_TAG_NAMES.has(node.tagName);

  // ul/ol 세그먼트 하나(kind: "list"의 node)를 li마다
  // bulletListItem/numberedListItem으로 바꾼다. explicit start는
  // import-html.ts의 blocksFromListElement와 같은 원칙으로 그 ol의 첫
  // li에만 붙인다(형제 scope 재시작 로직은 범위 밖) — li의 children은
  // blocksFromNodeList를 재귀 호출해 표·중첩 목록·문단을 그대로 처리한다.
  const blocksFromListNode = (
    listNode: HtmlElementNode,
  ): Result<ClipboardContentBlock[], ClipboardParseError> => {
    const markerType = markerTypeFromTag(listNode.tagName);
    const explicitStart = parseExplicitStartNumber(listNode);
    const blocks: ClipboardContentBlock[] = [];
    let itemIndex = 0;
    for (const child of listNode.children) {
      if (child.type !== "element" || child.tagName !== "li") continue;
      const { contentNodes, childrenNodes } = splitListItemChildren(
        child,
        isBlockLevelNode,
      );
      const content = normalizedInlineContent(contentNodes);
      const childrenResult = blocksFromNodeList(childrenNodes);
      if (!childrenResult.ok) return childrenResult;
      const children = childrenResult.value;
      const startNumber = itemIndex === 0 ? explicitStart : undefined;
      blocks.push(
        markerType === "numberedListItem"
          ? {
              type: "numberedListItem",
              content,
              ...(startNumber === undefined ? {} : { startNumber }),
              ...(children.length > 0 ? { children } : {}),
            }
          : {
              type: "bulletListItem",
              content,
              ...(children.length > 0 ? { children } : {}),
            },
      );
      itemIndex += 1;
    }
    return { ok: true, value: blocks };
  };

  // 세그먼트 하나를 ClipboardContentBlock[]로 바꾸는 루프 — 최상위 nodes와
  // 목록 항목의 childrenNodes가 모두 이 함수를 통과한다(blocksFromNodes가
  // blocksFromListItem을 재귀 호출하는 import-html.ts와 같은 구조, 코드는
  // 공유하지 않는다).
  const blocksFromNodeList = (
    nodeList: readonly HtmlNode[],
  ): Result<ClipboardContentBlock[], ClipboardParseError> => {
    const blocks: ClipboardContentBlock[] = [];
    for (const segment of segmentBlocks(nodeList, policy)) {
      // paragraph(자연히 쌓인 pending)와 simpleBoundary(p 자신의 본문)를
      // 똑같이 취급한다 — ClipboardContentBlock에는 id가 없어 p의
      // dataBeBlockId를 읽을 이유가 없고(clip에는 그런 속성도 없다),
      // 실질 텍스트 판정도 두 kind가 동일하게 받는다.
      if (segment.kind === "paragraph" || segment.kind === "simpleBoundary") {
        const content = normalizedInlineContent(segment.nodes);
        const text = content.map((item) => item.text).join("");
        if (hasSubstantialText(text)) {
          blocks.push({ type: "paragraph", content });
        }
        continue;
      }
      if (segment.kind === "heading") {
        const content = normalizedInlineContent(segment.nodes);
        const text = content.map((item) => item.text).join("");
        if (!hasSubstantialText(text)) continue;
        blocks.push({ type: "heading", level: segment.level, content });
        continue;
      }
      // 클립보드 정책은 isDividerTag를 넘기지 않아 도달하지 않는다 — 공유
      // union의 exhaustiveness 반영, hr 처리는 슬라이스 10 소관.
      if (segment.kind === "hr") continue;
      // 클립보드 정책은 isQuoteTag를 넘기지 않아 도달하지 않는다 — 공유
      // union의 exhaustiveness 반영, blockquote 매핑은 슬라이스 10 소관.
      if (segment.kind === "blockquote") continue;
      if (segment.kind === "list") {
        const listResult = blocksFromListNode(segment.node);
        if (!listResult.ok) return listResult;
        blocks.push(...listResult.value);
        continue;
      }

      // 표. caption(표 직속 비섹션 자식)은 기존 pending 뒤·표 앞이라는
      // 문서 순서를 segmentBlocks가 이미 지킨다 — 여기서는 같은
      // collapseHtmlWhitespace/normalizeCellContent/hasSubstantialText
      // 정규화만 재사용한다.
      if (segment.nonSectionChildren.length > 0) {
        const content = normalizedInlineContent(segment.nonSectionChildren);
        const text = content.map((item) => item.text).join("");
        if (hasSubstantialText(text)) {
          blocks.push({ type: "paragraph", content });
        }
      }
      const parsed = tabularDataFromTable(segment.node);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      blocks.push({ type: "table", data: parsed.value });
    }

    return { ok: true, value: blocks };
  };

  return blocksFromNodeList(nodes);
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

// validateTableSize 호출→분기→CLIPBOARD_TABLE_INVALID wrap 3단계가
// tabularDataFromTable(HTML 표 경로)과 parseTsv(TSV 경로)에 그대로
// 반복됐다(아키텍처 리뷰 4차 카드 AA) — 이 파일 안에서만 재사용하므로
// export하지 않는다.
const rejectIfTableOversized = (size: {
  columnCount: number;
  rowCount: number;
}): { ok: false; error: ClipboardParseError } | undefined => {
  const sizeViolation = validateTableSize(size);
  if (sizeViolation === undefined) return undefined;
  return {
    ok: false,
    error: {
      code: "CLIPBOARD_TABLE_INVALID",
      message: tableSizeViolationMessage(sizeViolation),
    },
  };
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
  // "표가 이미 보여준 열 수"는 colgroup 선언(cols.length)과 span 유래 값 중
  // 큰 쪽이다 — import-html.ts와 달리 이 파일은 colgroup이 있어도(spec §4.3
  // 패딩 계약상 columnCount가 cols.length와 inferredColumnCount 중 큰 쪽이라)
  // 자기 강화 위험이 남으므로 게이트 없이 항상 판정한다. 판정 자체(자기
  // 강화를 막는 방법, rowSpan 가중치 계약, Issue #35/#114/#116/#117 이력)는
  // findOversizedColumnSpanCell(table-layout.ts)이 소유한다 — import-html.ts와
  // 이 판정을 공유한다.
  const violation = findOversizedColumnSpanCell(layouts, cols.length);
  if (violation !== undefined) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_TABLE_INVALID",
        message: columnSpanViolationMessage(violation),
      },
    };
  }

  // 짧은 행을 빈 셀로 채워 직사각형을 만들려면 colgroup과 실제 셀 중 넓은
  // 쪽을 열 수로 잡아야 한다(TSV 경로의 패딩과 같은 계약, spec §4.3).
  const columnCount = Math.max(cols.length, inferredColumnCount(layouts));

  const sizeViolation = rejectIfTableOversized({
    columnCount,
    rowCount: rows.length,
  });
  if (sizeViolation !== undefined) return sizeViolation;

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

// 목록 파싱이 소비하는 ol[start]를 clipboard sanitize 단계에 추가한다.
// clipboardAllowedAttributes에는 ol 항목이 없어(sanitize-schema.ts) start가
// 그대로 두면 제거되고 parseExplicitStartNumber가 항상 undefined를 받는다.
// import-html.ts:71-78의 htmlImportSanitizeSchema와 완전히 같은 패턴으로
// (공유 schema 객체는 바꾸지 않고) 이 파일에서만 얕은 복사한다 — raw HAST가
// 아니라 sanitized HAST에서만 start를 읽기 위한 경계다(G-CNV-002).
const clipboardListSanitizeSchema = {
  ...clipboardSanitizeSchema,
  attributes: { ...clipboardAllowedAttributes, ol: ["start"] },
};

const parseHtmlTable = (html: string): HtmlTableOutcome => {
  // 깊이-캡 절단 사실(truncated)은 버린다 — clipboard 경로에는 경고 채널이
  // 없다(ClipboardParseError는 NOT_TABULAR | CLIPBOARD_TABLE_INVALID 뿐).
  // 캡 너머로 절단된 표는 표로 인식되지 않아 NOT_TABULAR(기본 붙여넣기
  // 폴백)로 떨어진다.
  const parsed = parseHtmlFragment(html);
  if (parsed === undefined)
    return { ok: false, error: { code: "NOT_TABULAR" }, sawTable: false };
  const unsafeRoot = parsed.root;

  const safeRoot = asRoot(sanitize(unsafeRoot, clipboardListSanitizeSchema));
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
  const sizeViolation = rejectIfTableOversized({
    columnCount,
    rowCount: rows.length,
  });
  if (sizeViolation !== undefined) return sizeViolation;

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

// 의도된 최후 방어선(Issue #130, 결정 5) — clipboard 경로는 DOM paste
// 이벤트 핸들러(core의 table-paste-extension)에서 직접 불리는데, 이
// 파이프라인에는 달리 catch가 없어 예상 밖 예외가 그대로 이벤트 밖으로
// 샌다. 파이프라인 어디서든(파서 내부 라이브러리 재귀 포함) 예외가 나면
// 구조화된 NOT_TABULAR로 바꿔 ProseMirror 기본 붙여넣기로 폴백시킨다.
// 우연히 걸리는 범용 예외 처리가 아니라 이 목적으로 설계된 경계다 —
// 정상 거절 경로는 전부 위의 구조화된 Result로 이미 표현되므로 이 catch에
// 도달하는 것은 버그성 예외뿐이고, 그때 잃는 것은 표 파싱 시도 하나다.
export const parseClipboardTable = (input: {
  html?: string;
  text?: string;
}): Result<ClipboardContent, ClipboardParseError> => {
  try {
    return parseClipboardTableUnguarded(input);
  } catch {
    return { ok: false, error: { code: "NOT_TABULAR" } };
  }
};

const parseClipboardTableUnguarded = (input: {
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
