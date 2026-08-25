import {
  type Document,
  type IdFactory,
  type InlineContent,
  MAX_TABLE_LOGICAL_CELLS,
  parseDocument,
  sanitizeInlineText,
  type TableBlock,
} from "@cp949/geul-model";
import { sanitize } from "hast-util-sanitize";

import type { ImportError } from "../errors.js";
import type { Result } from "../result.js";
import {
  propertyInteger,
  propertyString,
  sanitizeLinks,
} from "./hast-properties.js";
import {
  collectHtmlImportWarnings,
  type HtmlImportWarning,
} from "./import-warnings.js";
import {
  type HtmlElementNode,
  type HtmlNode,
  type HtmlRoot,
  inlineContentFromNodes,
} from "./inline-content.js";
import { asRoot, parseHtmlFragment } from "./parse-html.js";
import { htmlSanitizeSchema } from "./sanitize-schema.js";
import {
  type CellLayout,
  columnElements,
  hasSubstantialText,
  inferredColumnCount,
  layoutColumnSpan,
  layoutRowSpan,
  layoutRows,
  MAX_TABLE_COLUMNS,
  type TableRowSource,
  tableNonSectionChildren,
  tableRows,
} from "./table-layout.js";

const DEFAULT_COLUMN_WIDTH = 160;

class HtmlDocumentInvalidError extends Error {}

const marksKey = (marks: InlineContent[number]["marks"]): string =>
  JSON.stringify(marks ?? []);

// inlineContentFromNodes가 만든 각 텍스트 조각에서 model이 거절하는
// 코드포인트(LF 제외 C0 제어문자, DEL, 짝 없는 surrogate)를 제거한다.
// 정책은 model의 sanitizeInlineText가 단독 소유하고(G-CNV-001) 여기서는
// 문단/헤딩/표 직속 비섹션 자식 문단/표 셀 생성 지점 네 곳이 재사용만 한다.
// whitespace collapsing은 도입하지 않는다(범위 밖) — 코드포인트 제거만
// 한다. 코드포인트 제거로 조각이 통째로 비면 버리고, 그 결과 같은 mark
// 조합을 가진 이웃 조각이 생기면 병합한다 — appendText(inline-content.ts)와
// normalizeCellContent(clipboard/cell-text.ts)가 지키는 "인접 동일 mark는
// 항상 병합" 불변식을 여기서도 유지한다(빈 조각 제거만 하고 병합을 생략하면
// 같은 mark가 쪼개진 채 남아 export가 불필요하게 태그를 나눈다).
const sanitizeInlineContentText = (content: InlineContent): InlineContent => {
  const sanitized: InlineContent = [];
  for (const item of content) {
    const text = sanitizeInlineText(item.text);
    if (text.length === 0) continue;

    const previous = sanitized.at(-1);
    if (
      previous !== undefined &&
      marksKey(previous.marks) === marksKey(item.marks)
    ) {
      previous.text += text;
      continue;
    }
    sanitized.push(
      item.marks === undefined ? { text } : { text, marks: item.marks },
    );
  }
  return sanitized;
};

const propertyHeaderFlag = (
  element: HtmlElementNode,
  name: string,
): 0 | 1 | undefined => {
  const value = propertyInteger(element, name, Number.NaN);
  return value === 0 || value === 1 ? value : undefined;
};

const createDefaultIdFactory = (root: HtmlRoot): IdFactory => {
  const usedIds = new Set<string>();
  const idProperties = new Set([
    "dataBeBlockId",
    "dataBeColumnId",
    "dataBeRowId",
    "dataBeCellId",
  ]);

  const collectIds = (nodes: HtmlNode[]): void => {
    for (const node of nodes) {
      if (node.type !== "element") continue;
      for (const [name, value] of Object.entries(node.properties)) {
        if (idProperties.has(name) && typeof value === "string") {
          usedIds.add(value);
        }
      }
      collectIds(node.children);
    }
  };
  collectIds(root.children);

  let sequence = 0;
  return () => {
    let id: string;
    do {
      sequence += 1;
      id = `html-${sequence}`;
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };
};

const textValue = (nodes: HtmlNode[]): string =>
  nodes
    .map((node) =>
      node.type === "text"
        ? node.value
        : node.type === "element"
          ? node.tagName === "br"
            ? "\n"
            : textValue(node.children)
          : "",
    )
    .join("");

const inferHeaderRows = (
  rows: TableRowSource[],
  layouts: CellLayout[][],
): 0 | 1 => {
  if (rows[0]?.section === "head") return 1;
  const firstRow = layouts[0];
  if (firstRow === undefined || firstRow.length === 0) return 0;

  return firstRow.every(
    ({ element }) =>
      element.tagName === "th" && element.properties.scope !== "row",
  )
    ? 1
    : 0;
};

const inferHeaderColumns = (
  layouts: CellLayout[][],
  headerRows: 0 | 1,
  columns: TableBlock["columns"],
): 0 | 1 => {
  const firstColumnId = columns[0]?.id;
  for (const row of layouts.slice(headerRows)) {
    const hasCanonicalColumnIds = row.some(
      ({ element }) => propertyString(element, "dataBeColumnId") !== undefined,
    );
    const firstColumnCell = hasCanonicalColumnIds
      ? row.find(
          ({ element }) =>
            propertyString(element, "dataBeColumnId") === firstColumnId,
        )
      : row.find(({ columnIndex }) => columnIndex === 0);
    if (
      firstColumnCell?.element.tagName === "th" &&
      (firstColumnCell.element.properties.scope === "row" ||
        firstColumnCell.element.properties.scope === undefined)
    ) {
      return 1;
    }
  }
  return 0;
};

const parseTable = (
  element: HtmlElementNode,
  createId: IdFactory,
): TableBlock => {
  const tableId = propertyString(element, "dataBeBlockId") ?? createId();
  const cols = columnElements(element);
  if (cols.length > MAX_TABLE_COLUMNS) {
    throw new HtmlDocumentInvalidError(
      `Table column count exceeds ${MAX_TABLE_COLUMNS}`,
    );
  }
  const rows = tableRows(element);
  const layouts = layoutRows(rows);

  // colgroup이 없으면(cols.length === 0) columnCount는 아래에서
  // inferredColumnCount로 정한다 — 각 셀의 reach(columnIndex + colspan)
  // 중 최댓값이다. 이 계산은 자기 강화 구조라 과대 colspan 셀 자신이
  // 자기를 걸러낼 상한까지 함께 부풀린다(clipboard-table-parser.ts가
  // Issue #35에서 이미 거절한 것과 같은 구조). colgroup이 있으면
  // columnCount가 cols.length로 고정돼 셀 span에서 파생되지 않으므로 이
  // 위험이 없고, 과대 colspan은 model의 validateGridCoverage가
  // SPAN_OUT_OF_BOUNDS로 이미 막는다 — 그래서 이 선제 검사는 colgroup이
  // 없을 때만 돈다(Issue #115).
  //
  // 판별식은 clipboard-table-parser.ts의 oversizedColumnSpanCell과 같다:
  // 어떤 셀의 colspan이 "표가 이미 실제로 보여준 열 수"(자기 자신을 뺀 다른
  // 모든 셀의 reach 최댓값과 자기 위치 중 큰 쪽)를 넘으면 패딩으로 감추지
  // 않고 거절한다. 자기 자신을 반드시 제외해야 과대 colspan 셀 자신이 그
  // 상한을 부풀리지 못한다. 표 크기가 아직 MAX_TABLE_LOGICAL_CELLS 체크를
  // 거치지 않았으므로 pairwise O(n²) 비교 대신 전체를 한 번만 순회해
  // 전역 최댓값(globalMaxReach)과 그 다음 최댓값(secondMaxReach)만
  // 구해 O(n)을 유지한다.
  //
  // (단계-3 결함 탐지) 원본 그대로 이식하면 rowSpan이 걸린 셀이 정당한
  // 근거로 최대 reach를 "혼자" 달성하는 경우(예: 2행을 rowSpan=2로 덮는
  // 셀 하나가 옆 열의 좁은 셀들보다 훨씬 넓게 뻗는, 완전한 격자)까지
  // "자기 혼자 주장"으로 오인해 정상 colspan을 거절했다. rowSpan으로 여러
  // 행에 걸친 셀은 물리적으로 그 행 수만큼 반복 등장하는 것과 같은 근거를
  // 표에 남긴다 — 그래서 maxReachCount를 셀 개수가 아니라 각 셀의
  // rowSpan(행 등장 횟수)으로 가중 합산한다. rowSpan=1인 셀은 가중치 1이라
  // 기존 "홑 셀 colspan=500만 있으면 거절" 보장은 그대로 유지된다. 이
  // 가중치가 위조된 rowSpan(실제 <tr> 수를 넘는 값)에 악용되지 않는 이유는
  // model의 validateGridCoverage(SPAN_OUT_OF_BOUNDS)가 rowEnd(=row+rowSpan)가
  // 실제 rowCount를 넘는 rowSpan 주장을 이 검사와 무관하게 항상 거절하기
  // 때문이다(Issue #114 조사 결론과 같은 근거) — 이 선제 검사를 통과해도
  // 위조 rowSpan은 뒤이은 그리드 검증에서 막힌다.
  if (cols.length === 0) {
    const flatCells = layouts.flat();
    const cellReach = (cell: CellLayout): number =>
      cell.columnIndex + layoutColumnSpan(cell.columnSpan);
    const cellRowWeight = (cell: CellLayout): number =>
      layoutRowSpan(cell.rowSpan);
    let globalMaxReach = 0;
    let maxReachCount = 0;
    let secondMaxReach = 0;
    for (const cell of flatCells) {
      const reach = cellReach(cell);
      const weight = cellRowWeight(cell);
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
    const columnSpanBoundFor = (cell: CellLayout): number => {
      const reach = cellReach(cell);
      const othersMaxReach =
        reach === globalMaxReach && maxReachCount === 1
          ? secondMaxReach
          : globalMaxReach;
      return Math.max(othersMaxReach, cell.columnIndex + 1);
    };
    const oversizedColumnSpanCell = flatCells.find(
      (cell) => layoutColumnSpan(cell.columnSpan) > columnSpanBoundFor(cell),
    );
    if (oversizedColumnSpanCell !== undefined) {
      throw new HtmlDocumentInvalidError(
        `Table cell colspan exceeds the table's own column bound ${columnSpanBoundFor(oversizedColumnSpanCell)}`,
      );
    }
  }

  const columnCount =
    cols.length > 0 ? cols.length : inferredColumnCount(layouts);
  if (columnCount > MAX_TABLE_COLUMNS) {
    throw new HtmlDocumentInvalidError(
      `Table column count exceeds ${MAX_TABLE_COLUMNS}`,
    );
  }
  if (rows.length * columnCount > MAX_TABLE_LOGICAL_CELLS) {
    throw new HtmlDocumentInvalidError(
      `Table logical cell count exceeds ${MAX_TABLE_LOGICAL_CELLS}`,
    );
  }

  const firstLayoutByColumn = new Map<number, CellLayout>();
  for (const row of layouts) {
    for (const layout of row) {
      if (!firstLayoutByColumn.has(layout.columnIndex)) {
        firstLayoutByColumn.set(layout.columnIndex, layout);
      }
    }
  }

  const columns: TableBlock["columns"] = Array.from(
    { length: columnCount },
    (_, columnIndex) => {
      const col = cols[columnIndex];
      const cellColumnId = firstLayoutByColumn.get(columnIndex);
      const id =
        col === undefined
          ? (propertyString(
              cellColumnId?.element ?? element,
              "dataBeColumnId",
            ) ?? createId())
          : (propertyString(col, "dataBeColumnId") ?? createId());
      const width =
        col === undefined
          ? DEFAULT_COLUMN_WIDTH
          : propertyInteger(
              col,
              "dataBeWidth",
              propertyInteger(col, "width", DEFAULT_COLUMN_WIDTH),
            );
      return { id, width };
    },
  );

  const modelRows: TableBlock["rows"] = rows.map((row, rowIndex) => ({
    id: propertyString(row.element, "dataBeRowId") ?? createId(),
    cells: (layouts[rowIndex] ?? []).map((layout) => {
      const column = columns[layout.columnIndex];
      const columnId =
        propertyString(layout.element, "dataBeColumnId") ??
        column?.id ??
        createId();
      const textColor = propertyString(layout.element, "dataBeTextColor");
      const backgroundColor = propertyString(
        layout.element,
        "dataBeBackgroundColor",
      );
      const align = propertyString(layout.element, "dataBeAlign") as
        | TableBlock["rows"][number]["cells"][number]["align"]
        | undefined;

      return {
        id: propertyString(layout.element, "dataBeCellId") ?? createId(),
        columnId,
        rowSpan: layout.rowSpan,
        columnSpan: layout.columnSpan,
        content: sanitizeInlineContentText(
          inlineContentFromNodes(layout.element.children),
        ),
        ...(textColor === undefined ? {} : { textColor }),
        ...(backgroundColor === undefined ? {} : { backgroundColor }),
        ...(align === undefined ? {} : { align }),
      };
    }),
  }));
  const headerRows =
    propertyHeaderFlag(element, "dataBeHeaderRows") ??
    inferHeaderRows(rows, layouts);
  const headerColumns =
    propertyHeaderFlag(element, "dataBeHeaderColumns") ??
    inferHeaderColumns(layouts, headerRows, columns);

  return {
    id: tableId,
    type: "table",
    columns,
    rows: modelRows,
    headerRows,
    headerColumns,
  };
};

const parseBlock = (
  element: HtmlElementNode,
  createId: IdFactory,
): Document["blocks"][number] => {
  if (element.tagName === "table") return parseTable(element, createId);

  const id = propertyString(element, "dataBeBlockId") ?? createId();
  const content = sanitizeInlineContentText(
    inlineContentFromNodes(element.children),
  );
  if (element.tagName === "p") return { id, type: "paragraph", content };

  const level = Number(element.tagName.slice(1)) as 1 | 2 | 3;
  return { id, type: "heading", level, content };
};

const documentFromRoot = (root: HtmlRoot, createId: IdFactory): Document => {
  const blocks: Document["blocks"] = [];
  let inlineNodes: HtmlNode[] = [];

  const flushInlineNodes = (): void => {
    if (inlineNodes.length === 0) return;
    if (textValue(inlineNodes).trim().length > 0) {
      blocks.push({
        id: createId(),
        type: "paragraph",
        content: sanitizeInlineContentText(inlineContentFromNodes(inlineNodes)),
      });
    }
    inlineNodes = [];
  };

  for (const node of root.children) {
    if (
      node.type === "element" &&
      ["p", "h1", "h2", "h3", "table"].includes(node.tagName)
    ) {
      flushInlineNodes();
      // caption 등 표 직속 비섹션 자식(thead/tbody/tfoot/tr/colgroup이
      // 아닌 나머지)은 sanitize가 unwrap한 caption 텍스트가 대표 사례다
      // (caption은 htmlAllowedTagNames에 없다). parseTable은 이 노드들을
      // 읽지 않으므로 표 블록 앞에 문단으로 옮겨 담지 않으면 조용히
      // 사라진다(이슈 #70) — clipboard 경로(clipboard-table-parser.ts의
      // walk())와 같은 정책이다. import 쪽 문단 생성은 기존 관례대로
      // inlineContentFromNodes만 쓴다(collapse/normalize 없음 — caption만
      // 예외로 만들지 않는다, 기존 import 문단 생성 경로 전체의 gap이라
      // 이 변경의 범위 밖이다).
      if (node.tagName === "table") {
        // 표 직속 비섹션 자식 사이에는 HTML5 tree construction 규칙상
        // foster-parenting되지 않는 구조적 공백(들여쓰기·개행) 텍스트
        // 노드가 그대로 남는다. 노드 단위로 "통째로 공백뿐인가"만 걸러내고,
        // 실질 텍스트가 있는 노드(caption 자체의 앞뒤 공백 포함)는 내부를
        // 손대지 않는다 — 일반 문단 생성 경로의 collapse-없음 관례를 그대로
        // 따른다.
        const nonSectionChildren = tableNonSectionChildren(node).filter(
          (child) => hasSubstantialText(textValue([child])),
        );
        if (nonSectionChildren.length > 0) {
          blocks.push({
            id: createId(),
            type: "paragraph",
            content: sanitizeInlineContentText(
              inlineContentFromNodes(nonSectionChildren),
            ),
          });
        }
      }
      blocks.push(parseBlock(node, createId));
      continue;
    }
    inlineNodes.push(node);
  }
  flushInlineNodes();

  return { formatVersion: 1, revision: 0, blocks };
};

export const importHtml = (
  source: string,
  options?: { createId?: IdFactory },
): Result<
  { document: Document; warnings: HtmlImportWarning[] },
  ImportError
> => {
  try {
    const unsafeRoot = parseHtmlFragment(source);
    if (unsafeRoot === undefined) {
      return {
        ok: false,
        error: {
          code: "HTML_PARSE_FAILED",
          message: "HTML parser did not produce a root node",
        },
      };
    }
    const warnings = collectHtmlImportWarnings(unsafeRoot);
    const safeRoot = asRoot(sanitize(unsafeRoot, htmlSanitizeSchema));
    if (safeRoot === undefined) {
      return {
        ok: false,
        error: {
          code: "HTML_PARSE_FAILED",
          message: "HTML parser did not produce a root node",
        },
      };
    }

    sanitizeLinks(safeRoot.children);
    const document = documentFromRoot(
      safeRoot,
      options?.createId ?? createDefaultIdFactory(safeRoot),
    );
    const parsed = parseDocument(document);
    if (!parsed.ok) {
      return {
        ok: false,
        error: {
          code: "HTML_DOCUMENT_INVALID",
          message: `Imported HTML produced an invalid document: ${parsed.error.message}`,
        },
      };
    }

    return {
      ok: true,
      value: { document: parsed.value, warnings },
    };
  } catch (error) {
    if (error instanceof HtmlDocumentInvalidError) {
      return {
        ok: false,
        error: {
          code: "HTML_DOCUMENT_INVALID",
          message: `Imported HTML produced an invalid document: ${error.message}`,
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "HTML_PARSE_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to parse HTML",
      },
    };
  }
};
