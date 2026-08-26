import {
  type InlineContent,
  isCanonicalCellAlign,
  isCanonicalCellColor,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_LOGICAL_CELLS,
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
import { asRoot, parseHtmlFragment } from "../html/parse-html.js";
import { clipboardSanitizeSchema } from "../html/sanitize-schema.js";
import {
  type CellLayout,
  columnElements,
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

// 재귀 경계 판정(문단/헤딩/표 시퀀스로 쪼개기) 자체는 block-segmenter.ts가
// import-html.ts와 공유한다(아키텍처 리뷰 2차 후보 G) — 이 파일의 세 태그
// (div/li/blockquote는 항상 재귀, ul/ol은 flush 없이 재귀, p/heading은 표를
// 품었을 때만 재귀)만 정책으로 넘긴다. h1~h6는 여기서만 인식한다 —
// clipboardAllowedTagNames가 h4~h6까지 sanitize를 통과시키므로(DELTA-03,
// Issue #72) import-html.ts(h1~h3만 인식)와 다르다.
const headingLevelFromTagName = (
  tagName: string,
): 1 | 2 | 3 | 4 | 5 | 6 | undefined =>
  /^h[1-6]$/.test(tagName)
    ? (Number(tagName.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6)
    : undefined;

// 표를 찾은 뒤에는 표 밖 콘텐츠를 거절하지 않고 문단 블록으로 옮겨 담는다
// — 표 앞뒤 문단은 문단으로, 표는 표 노드로, 문서 순서를 지켜 한 시퀀스로
// 만든다(spec §4.1, Issue #71). h1~h3는 heading으로, h4~h6는 model
// HeadingBlock.level(1~3) 제약 때문에 문단으로 다운그레이드한다(DELTA-03,
// Issue #72) — segmentBlocks는 레벨만 실어 보내고 다운그레이드 여부는
// 여기서 정한다. 찾아낸 표가 여럿이면(findDataTables, Issue #73) 문서
// 순서대로 각각 독립된 표 블록이 된다.
//
// 문단/heading 블록의 텍스트는 셀 텍스트와 같은 정규화를 거쳐야 한다 —
// collapseHtmlWhitespace(정규 공백 run 접기)와 normalizeCellContent(C0
// 제어문자/DEL/짝 없는 surrogate 정제) 없으면 model의 isValidInlineText
// 검사가 거절해 readEditorDocument에서 throw된다(editor 영구 desync).
const blockSequenceFromNodes = (
  nodes: readonly HtmlNode[],
  tables: readonly HtmlElementNode[],
): Result<ClipboardContentBlock[], ClipboardParseError> => {
  const tableSet = new Set(tables);
  const policy: BlockSegmentPolicy = {
    isSimpleBoundary: isParagraphTag,
    headingLevelFromTagName,
    isNestedBoundary: (tagName) => NESTED_BOUNDARY_TAG_NAMES.has(tagName),
    isTransparent: isTransparentListTag,
    isTableNode: (node) => tableSet.has(node),
  };

  // 셀 텍스트와 같은 정규화(collapseHtmlWhitespace로 공백 run 접기 →
  // normalizeCellContent로 C0 제어문자/DEL/짝 없는 surrogate 제거)를 거쳐
  // 인라인 콘텐츠로 만든다. 문단 생성과 heading 분기(h1~h3)가 이 정규화를
  // 공유한다 — 누락되면 model의 isValidInlineText가 거절하는 코드포인트가
  // 남아 readEditorDocument에서 throw된다(editor 영구 desync).
  const normalizedInlineContent = (segmentNodes: HtmlNode[]): InlineContent => {
    collapseHtmlWhitespace(segmentNodes);
    return normalizeCellContent(inlineContentFromNodes(segmentNodes));
  };

  const blocks: ClipboardContentBlock[] = [];
  for (const segment of segmentBlocks(nodes, policy)) {
    // paragraph(자연히 쌓인 pending)와 simpleBoundary(p 자신의 본문)를
    // 똑같이 취급한다 — ClipboardContentBlock에는 id가 없어 p의
    // dataBeBlockId를 읽을 이유가 없고(clip에는 그런 속성도 없다),
    // 실질 텍스트 판정도 두 kind가 동일하게 받는다.
    if (segment.kind === "paragraph" || segment.kind === "simpleBoundary") {
      const content = normalizedInlineContent(segment.nodes);
      const text = content.map((item) => item.text).join("");
      if (hasSubstantialText(text)) blocks.push({ type: "paragraph", content });
      continue;
    }
    if (segment.kind === "heading") {
      const content = normalizedInlineContent(segment.nodes);
      const text = content.map((item) => item.text).join("");
      if (!hasSubstantialText(text)) continue;
      if (segment.level === 1 || segment.level === 2 || segment.level === 3) {
        blocks.push({ type: "heading", level: segment.level, content });
      } else {
        blocks.push({ type: "paragraph", content });
      }
      continue;
    }

    // 표. caption(표 직속 비섹션 자식)은 기존 pending 뒤·표 앞이라는
    // 문서 순서를 segmentBlocks가 이미 지킨다 — 여기서는 같은
    // collapseHtmlWhitespace/normalizeCellContent/hasSubstantialText
    // 정규화만 재사용한다.
    if (segment.nonSectionChildren.length > 0) {
      const content = normalizedInlineContent(segment.nonSectionChildren);
      const text = content.map((item) => item.text).join("");
      if (hasSubstantialText(text)) blocks.push({ type: "paragraph", content });
    }
    const parsed = tabularDataFromTable(segment.node);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    blocks.push({ type: "table", data: parsed.value });
  }

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
        message: `Table cell colspan exceeds the table's own column bound ${violation.bound}`,
      },
    };
  }

  // 짧은 행을 빈 셀로 채워 직사각형을 만들려면 colgroup과 실제 셀 중 넓은
  // 쪽을 열 수로 잡아야 한다(TSV 경로의 패딩과 같은 계약, spec §4.3).
  const columnCount = Math.max(cols.length, inferredColumnCount(layouts));

  const sizeViolation = validateTableSize({
    columnCount,
    rowCount: rows.length,
  });
  if (sizeViolation !== undefined) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_TABLE_INVALID",
        message:
          sizeViolation === "TOO_MANY_COLUMNS"
            ? `Table column count exceeds ${MAX_TABLE_COLUMNS}`
            : `Table logical cell count exceeds ${MAX_TABLE_LOGICAL_CELLS}`,
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
  const sizeViolation = validateTableSize({
    columnCount,
    rowCount: rows.length,
  });
  if (sizeViolation !== undefined) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_TABLE_INVALID",
        message:
          sizeViolation === "TOO_MANY_COLUMNS"
            ? `Table column count exceeds ${MAX_TABLE_COLUMNS}`
            : `Table logical cell count exceeds ${MAX_TABLE_LOGICAL_CELLS}`,
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
