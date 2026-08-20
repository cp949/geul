import {
  isCanonicalCellAlign,
  isCanonicalCellColor,
  MAX_TABLE_LOGICAL_CELLS,
} from "@cp949/geul-model";
import { sanitize } from "hast-util-sanitize";

import type { ClipboardParseError } from "../errors.js";
import { propertyString, sanitizeLinks } from "../html/hast-properties.js";
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
  inferredColumnCount,
  layoutColumnSpan,
  layoutRowSpan,
  layoutRows,
  MAX_TABLE_COLUMNS,
  tableRows,
} from "../html/table-layout.js";
import type { Result } from "../result.js";
import {
  collapseHtmlWhitespace,
  normalizeCellContent,
  sanitizeCellText,
} from "./cell-text.js";
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

const findDataTable = (root: HtmlRoot): HtmlElementNode | undefined => {
  for (const node of root.children) {
    if (node.type !== "element") continue;
    const nested = findDataTable({ type: "root", children: node.children });
    if (nested !== undefined) return nested;
    if (node.tagName === "table" && !isLayoutTable(node)) return node;
  }
  return undefined;
};

// 클립보드 HTML이 표와 다른 실질 콘텐츠(문단 등)를 함께 담고 있으면 표만
// 골라 붙이지 않는다 — 표를 제외한 트리에 공백이 아닌 텍스트가 하나라도
// 남아 있으면 표가 fragment의 유일한 실질 콘텐츠가 아니라는 뜻이므로
// NOT_TABULAR로 판정해 Tiptap 기본 붙여넣기에 전체를 맡긴다(spec §4.1,
// Issue #37). 이 판정은 sanitize를 이미 거친 트리를 검사한다: hast-util-
// sanitize는 스키마 tagNames 허용 목록에 없고 strip 목록에도 없는 태그를
// 벗겨내고(unwrap) 그 자식(텍스트 포함)을 트리 위로 그대로 끌어올린다 —
// 그래서 <html>/<head>/<body>/<title> 등 어떤 래퍼에 텍스트가 들어있었든,
// 살아남기만 하면 이 판정에 걸린다(구조적 래퍼가 통째로 면제되는 허용
// 목록이 따로 있는 게 아니다). strip 목록에 있는 태그(<style>/<script>
// 등)만 태그와 텍스트가 함께 통째로 제거되고, 주석은 allowComments: false로
// 별도 제거된다.
const hasContentOutsideTable = (
  nodes: readonly HtmlNode[],
  table: HtmlElementNode,
): boolean => {
  for (const node of nodes) {
    if (node === table) continue;
    if (node.type === "text" && node.value.trim().length > 0) return true;
    if (
      node.type === "element" &&
      hasContentOutsideTable(node.children, table)
    ) {
      return true;
    }
  }
  return false;
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
  // 짧은 행을 빈 셀로 채워 직사각형을 만들려면 colgroup과 실제 셀 중 넓은
  // 쪽을 열 수로 잡아야 한다(TSV 경로의 패딩과 같은 계약, spec §4.3).
  const columnCount = Math.max(cols.length, inferredColumnCount(layouts));

  if (columnCount === 0) {
    return { ok: false, error: { code: "NOT_TABULAR" } };
  }
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

// parseHtmlTable의 실패는 두 가지로 갈린다 — html에 데이터 표 후보 자체가
// 없었는지(sawTable: false, TSV 폴백을 시도해도 안전하다), 표는 찾았지만
// 거절했는지(sawTable: true, 혼합 콘텐츠거나 CLIPBOARD_TABLE_INVALID —
// TSV로 새면 이미 내린 거절 판정이 무력화된다). 공개 ClipboardParseError는
// 이 구분을 담지 않으므로(항상 NOT_TABULAR | CLIPBOARD_TABLE_INVALID) 모듈
// 내부 전용 타입으로만 구분하고, parseClipboardTable이 반환하기 직전에
// sawTable을 벗겨낸다.
type HtmlTableOutcome =
  | { ok: true; value: TabularData }
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

  const table = findDataTable(safeRoot);
  if (table === undefined)
    return { ok: false, error: { code: "NOT_TABULAR" }, sawTable: false };
  if (hasContentOutsideTable(safeRoot.children, table)) {
    return { ok: false, error: { code: "NOT_TABULAR" }, sawTable: true };
  }

  const result = tabularDataFromTable(table);
  return result.ok
    ? result
    : { ok: false, error: result.error, sawTable: true };
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
}): Result<TabularData, ClipboardParseError> => {
  // <table>이 없는 HTML은 파싱조차 하지 않는다. 표 없는 붙여넣기도 rehype
  // 파싱 + sanitize를 전부 돌린 뒤 NOT_TABULAR를 내고, 그다음 ProseMirror가
  // 같은 HTML을 다시 파싱했다 — 긴 웹 문서 붙여넣기가 파싱 비용을 두 번 낸다.
  if (
    input.html !== undefined &&
    input.html.length > 0 &&
    TABLE_TAG_PATTERN.test(input.html)
  ) {
    const htmlResult = parseHtmlTable(input.html);
    if (htmlResult.ok) return htmlResult;
    if (htmlResult.sawTable) {
      // 표를 찾았지만 거절했다(혼합 콘텐츠 또는 CLIPBOARD_TABLE_INVALID) —
      // text/plain 짝이 우연히 표와 같은 탭 구조를 가져도 TSV로 다시
      // 새서 이 거절을 무력화하면 안 된다.
      return { ok: false, error: htmlResult.error };
    }
    // sawTable: false(html에 표 후보 자체가 없음) -> TSV로 폴백.
  }
  if (input.text !== undefined && input.text.length > 0) {
    return parseTsv(input.text);
  }
  return { ok: false, error: { code: "NOT_TABULAR" } };
};
