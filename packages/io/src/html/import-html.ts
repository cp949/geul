import {
  type Block,
  appendOrMergeInlineItem,
  type Document,
  type HeadingBlock,
  type IdFactory,
  type InlineContent,
  MAX_NESTING_DEPTH,
  MAX_TABLE_COLUMNS,
  parseDocument,
  sanitizeInlineText,
  type TableBlock,
  tableSizeViolationMessage,
  validateTableSize,
} from "@cp949/geul-model";
import { sanitize } from "hast-util-sanitize";

import type { ImportError } from "../errors.js";
import type { Result } from "../result.js";
import {
  type BlockSegmentPolicy,
  isParagraphTag,
  isTransparentListTag,
  NESTED_BOUNDARY_TAG_NAMES,
  segmentBlocks,
} from "./block-segmenter.js";
import {
  propertyInteger,
  propertyString,
  sanitizeLinks,
} from "./hast-properties.js";
import {
  codeBlockLanguageMetadataIgnoredWarning,
  collectHtmlImportWarnings,
  deepTreeFlattenedWarning,
  type HtmlImportWarning,
  nestedChildrenFlattenedWarning,
} from "./import-warnings.js";
import {
  type HtmlElementContent,
  type HtmlElementNode,
  type HtmlNode,
  type HtmlRoot,
  inlineContentFromNodes,
} from "./inline-content.js";
import { asRoot, parseHtmlFragment } from "./parse-html.js";
import {
  htmlAllowedAttributes,
  htmlSanitizeSchema,
} from "./sanitize-schema.js";
import {
  type CellLayout,
  columnElements,
  columnSpanViolationMessage,
  findOversizedColumnSpanCell,
  hasSubstantialText,
  inferredColumnCount,
  layoutRows,
  layoutRowSpan,
  malformedColumnSpan,
  type TableRowSource,
  tableRows,
} from "./table-layout.js";

const DEFAULT_COLUMN_WIDTH = 160;

// 목록 import가 의미로 소비하는 속성을 sanitizer의 document-import 전용
// schema에 추가한다. raw HAST를 다시 읽지 않고 li ID와 ol start도 sanitized
// HAST에서만 읽기 위한 경계다. 공유 schema 객체는 clipboard 소비자가 함께
// 쓰므로 변경하지 않고 이 importer에서만 얕은 복사한다.
const htmlImportSanitizeSchema = {
  ...htmlSanitizeSchema,
  attributes: {
    ...htmlAllowedAttributes,
    li: ["dataBeBlockId"],
    ol: ["start"],
  },
};

class HtmlDocumentInvalidError extends Error {}

// inlineContentFromNodes가 만든 각 텍스트 조각에서 model이 거절하는
// 코드포인트(LF 제외 C0 제어문자, DEL, 짝 없는 surrogate)를 제거한다.
// 정책은 model의 sanitizeInlineText가 단독 소유하고(G-CNV-001) 여기서는
// 문단/헤딩/표 직속 비섹션 자식 문단/표 셀 생성 지점 네 곳이 재사용만 한다.
// whitespace collapsing은 도입하지 않는다(범위 밖) — 코드포인트 제거만
// 한다. 코드포인트 제거로 조각이 통째로 비면 버리고, 그 결과 같은 mark
// 조합을 가진 이웃 조각이 생기면 병합한다(빈 조각 제거만 하고 병합을
// 생략하면 같은 mark가 쪼개진 채 남아 export가 불필요하게 태그를 나눈다) —
// 이 스킵/병합 제어 흐름은 model의 appendOrMergeInlineItem이 소유하고
// inline-content.ts·cell-text.ts·import-markdown.ts·core의
// table-commands.ts도 같은 계약을 쓴다.
const sanitizeInlineContentText = (content: InlineContent): InlineContent => {
  const sanitized: InlineContent = [];
  for (const item of content) {
    appendOrMergeInlineItem(
      sanitized,
      sanitizeInlineText(item.text),
      item.marks,
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

// hast className은 parse5 변환에서 token 배열이지만 수동 생성 HAST와
// sanitizer 표면을 모두 받기 위해 문자열도 방어적으로 처리한다. 한
// 위치의 첫 language-* suffix만 선택 우선순위에 쓰지만, 나머지 suffix도
// exact metadata conflict 판정에 필요하므로 순서대로 모두 반환한다.
const classLanguages = (element: HtmlElementNode): string[] => {
  const className = element.properties.className;
  const tokens = Array.isArray(className)
    ? className.filter((value): value is string => typeof value === "string")
    : typeof className === "string"
      ? className.split(/\s+/)
      : [];
  return tokens.flatMap((token) =>
    token.startsWith("language-") && token.length > "language-".length
      ? [token.slice("language-".length)]
      : [],
  );
};

// language metadata에 참여하는 code는 pre의 첫 direct child뿐이다.
// descendant code를 찾으면 wrapper 안 metadata가 우선순위를 탈취한다.
const firstDirectCode = (
  element: HtmlElementNode,
): HtmlElementNode | undefined =>
  element.children.find(
    (child): child is HtmlElementNode =>
      child.type === "element" && child.tagName === "code",
  );

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
      tableSizeViolationMessage("TOO_MANY_COLUMNS"),
    );
  }
  const rows = tableRows(element);
  const layouts = layoutRows(rows);

  // colgroup이 없으면(cols.length === 0) columnCount는 아래에서
  // inferredColumnCount로 정한다 — 각 셀의 reach(columnIndex + colspan)
  // 중 최댓값이다. 이 계산은 자기 강화 구조라 과대 colspan 셀 자신이
  // 자기를 걸러낼 상한까지 함께 부풀린다. colgroup이 있으면 columnCount가
  // cols.length로 고정돼 셀 span에서 파생되지 않으므로 이 위험이 없고,
  // 과대 colspan은 model의 validateGridCoverage가 SPAN_OUT_OF_BOUNDS로
  // 이미 막는다 — 그래서 이 선제 검사는 colgroup이 없을 때만 돈다
  // (Issue #115). 판정 자체(자기 강화를 막는 방법, rowSpan 가중치 계약,
  // Issue #35/#114/#116/#117 이력)는 findOversizedColumnSpanCell
  // (table-layout.ts)이 소유한다 — clipboard-table-parser.ts와 이 판정을
  // 공유한다.
  if (cols.length === 0) {
    const violation = findOversizedColumnSpanCell(layouts, cols.length);
    if (violation !== undefined) {
      throw new HtmlDocumentInvalidError(columnSpanViolationMessage(violation));
    }
  }

  const columnCount =
    cols.length > 0 ? cols.length : inferredColumnCount(layouts);
  const sizeViolation = validateTableSize({
    columnCount,
    rowCount: rows.length,
  });
  if (sizeViolation !== undefined) {
    throw new HtmlDocumentInvalidError(
      tableSizeViolationMessage(sizeViolation),
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
        TableBlock["rows"][number]["cells"][number]["align"] | undefined;

      return {
        id: propertyString(layout.element, "dataBeCellId") ?? createId(),
        columnId,
        // rowSpan은 clipboard-table-parser.ts와 같은 seam(layoutRowSpan)으로
        // 보정한다 — 여기서 raw 값을 그대로 담으면 rowspan="0"·비정수
        // rowspan처럼 흔한 malformed 마크업이 model의 validateGridCoverage에서
        // INVALID_COORDINATE로 거절돼 문서 전체가 HTML_DOCUMENT_INVALID로
        // 실패한다(clipboard 경로는 이미 보정해 통과한다). columnSpan은
        // layoutColumnSpan이 아니라 malformedColumnSpan을 쓴다 — 이유는
        // 그 함수의 선언부 주석 참조(오버사이즈 colspan 보안 거절을
        // 우회하지 않아야 한다).
        rowSpan: layoutRowSpan(layout.rowSpan),
        columnSpan: malformedColumnSpan(layout.columnSpan),
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

// heading 태그명 → model HeadingBlock["level"]. h1~h6 전부가 heading이다
// (DELTA-06, Issue #38 — model이 level 1~6을 허용하고 sanitize도 h4~h6를
// 살린다). 정규식 + Number() + 캐스트 대신 표를 쓰는 이유: 표의 값 타입이
// 곧 model 계약이라 세그먼트의 level이 캐스트 없이 HeadingBlock["level"]로
// 좁혀지고(segmentBlocks<Level>), 범위 검증을 io에 중복하지 않는다
// (G-CNV-001 — 최종 검증은 parseDocument). Record 대신 Map인 이유는
// "constructor" 같은 프로토타입 키가 태그명으로 들어와도 값을 돌려주지
// 않게 하기 위해서다. findChildrenWrapper의 자기 콘텐츠 판정도 이 표를
// 공유해 두 자리의 heading 태그 집합이 어긋나지 않는다.
const headingLevelByTagName = new Map<string, HeadingBlock["level"]>([
  ["h1", 1],
  ["h2", 2],
  ["h3", 3],
  ["h4", 4],
  ["h5", 5],
  ["h6", 6],
]);

// documentFromRoot의 재귀 경계 판정(문단/헤딩/구분선/표 시퀀스로 쪼개기)은
// clipboard-table-parser.ts의 blockSequenceFromNodes와 block-segmenter.ts를
// 공유한다(아키텍처 리뷰 2차 후보 G) — p/h1~h3/table만 보던 예전 documentFromRoot
// 는 최상위 노드만 훑는 평면 루프라 div/li/blockquote/ul/ol처럼 중첩 가능한
// 경계를 인식하지 못했다(Issue #113과 같은 종류의 병합). heading 다운그레이드
// 정책은 이제 없다 — import·clipboard 둘 다 h1~h6 전부 heading으로 쓴다
// (DELTA-08, Issue #38 슬라이스 3). 공유는 문단 경계 태그 집합만이다(그릴링 결정).
// hr은 콘텐츠 없는 세그먼트로 받아 divider 블록으로 옮긴다(spec §7.1) —
// clipboard 정책은 isDividerTag를 넘기지 않아 hr 처리가 갈라진다.
// blockquote도 같은 방식으로 세그먼트로 받아 quote 블록으로 옮긴다
// (DELTA-06a, D6 분할 규칙은 splitQuoteChildren) — clipboard 정책은
// isQuoteTag를 넘기지 않아 blockquote가 문단 경계로 남는다.
const importBlockSegmentPolicy: BlockSegmentPolicy<
  HeadingBlock["level"],
  true
> = {
  isSimpleBoundary: isParagraphTag,
  headingLevelFromTagName: (tagName) => headingLevelByTagName.get(tagName),
  isNestedBoundary: (tagName) => NESTED_BOUNDARY_TAG_NAMES.has(tagName),
  isTransparent: isTransparentListTag,
  isTableNode: (node) => node.tagName === "table",
  isDividerTag: (tagName) => tagName === "hr",
  isQuoteTag: (tagName) => tagName === "blockquote",
  isCodeBlockTag: (tagName) => tagName === "pre",
};

const paragraphContentFromNodes = (nodes: HtmlNode[]): InlineContent =>
  sanitizeInlineContentText(inlineContentFromNodes(nodes));

const isElementNode = (node: HtmlNode): node is HtmlElementNode =>
  node.type === "element";

const isListElement = (
  node: HtmlNode,
): node is HtmlElementNode & { tagName: "ul" | "ol" } =>
  node.type === "element" && (node.tagName === "ul" || node.tagName === "ol");

// blockquote 직속 자식 중 "블록 자리를 차지하는" 요소 판정 — segmentBlocks가
// importBlockSegmentPolicy로 경계·컨테이너·표로 인식하는 태그와 정확히 같은
// 집합이다(그 외 요소와 텍스트는 인라인이라 pending으로 쌓인다). D6의 "첫
// 자식이 문단인가/비문단인가"는 이 판정 위에서만 뜻이 있다 — strong 같은
// 인라인 요소를 블록으로 세면 인라인만 든 인용문이 빈 content가 된다.
const isBlockLevelElement = (node: HtmlElementNode): boolean =>
  importBlockSegmentPolicy.isSimpleBoundary(node.tagName) ||
  importBlockSegmentPolicy.headingLevelFromTagName(node.tagName) !==
    undefined ||
  importBlockSegmentPolicy.isDividerTag?.(node.tagName) === true ||
  importBlockSegmentPolicy.isQuoteTag?.(node.tagName) === true ||
  importBlockSegmentPolicy.isCodeBlockTag?.(node.tagName) === true ||
  importBlockSegmentPolicy.isNestedBoundary(node.tagName) ||
  importBlockSegmentPolicy.isTransparent(node.tagName) ||
  importBlockSegmentPolicy.isTableNode(node);

// li가 목록 블록의 안정 ID와 content를 직접 소유한다(RD-003 HTML 정규형).
// 첫 실질 자식이 p면 그 p는 content wrapper일 뿐 별도 paragraph/ID가 아니다.
// direct inline run으로 시작하면 첫 block boundary 전까지가 content이고,
// 이후 flow content는 종류와 무관하게 children 변환 경계로 넘긴다.
const splitListItemChildren = (
  node: HtmlElementNode,
): { contentNodes: HtmlNode[]; childrenNodes: HtmlNode[] } => {
  const firstSubstantialIndex = node.children.findIndex(
    (child) => isElementNode(child) || hasSubstantialText(textValue([child])),
  );
  if (firstSubstantialIndex < 0) {
    return { contentNodes: [], childrenNodes: [] };
  }

  const first = node.children[firstSubstantialIndex];
  if (first === undefined) {
    return { contentNodes: [], childrenNodes: [] };
  }
  if (isElementNode(first) && isParagraphTag(first.tagName)) {
    return {
      contentNodes: first.children,
      childrenNodes: node.children.filter((child) => child !== first),
    };
  }
  if (isElementNode(first) && isBlockLevelElement(first)) {
    return { contentNodes: [], childrenNodes: node.children };
  }

  const firstBoundaryIndex = node.children.findIndex(
    (child, index) =>
      index >= firstSubstantialIndex &&
      isElementNode(child) &&
      isBlockLevelElement(child),
  );
  if (firstBoundaryIndex < 0) {
    return { contentNodes: node.children, childrenNodes: [] };
  }
  return {
    contentNodes: node.children.slice(0, firstBoundaryIndex),
    childrenNodes: node.children.slice(firstBoundaryIndex),
  };
};

// D6(blockquote 분할 규칙, spec §7.1): blockquote의 자식을 quote content와
// children으로 나눈다. 머리(공백뿐인 텍스트를 건너뛴 첫 실질 노드)가
// <p>면 그 인라인이 content이고 나머지 자식이 children이다(export-html.ts가
// 내는 <blockquote><p>content</p>[<div data-be-children>]> 형상의 역변환).
// 머리가 h2·ul·중첩 blockquote처럼 비문단 블록이면 content는 비고 전부
// children이다. 머리가 텍스트나 인라인 요소면 두 갈래다 — 블록 자식이
// 하나도 없으면(손으로 쓴 <blockquote>인용</blockquote>) 인라인 전체가
// content이고, 블록 자식이 섞여 있으면 문서 순서를 지키려 content를 비우고
// 전부 children으로 넘긴다(앞선 인라인 run은 segmentBlocks가 문단으로
// 낸다 — 승격하면 content가 뒤의 블록보다 앞서 원래 순서와 어긋난다).
// children 자리가 export가 낸 단일 data-be-children 컨테이너뿐이면 그 안의
// 노드를 꺼낸다 — 컨테이너 div를 그대로 넘기면 segmentBlocks가 div를 문단
// 경계로 걸어 들어가 그 안의 children wrapper를 평면 처리해 버린다.
const splitQuoteChildren = (
  node: HtmlElementNode,
): { contentNodes: HtmlNode[]; childrenNodes: HtmlNode[] } => {
  const head = node.children.find(
    (child) => isElementNode(child) || hasSubstantialText(textValue([child])),
  );
  if (head === undefined) return { contentNodes: [], childrenNodes: [] };

  if (!isElementNode(head) || !isBlockLevelElement(head)) {
    const hasBlockChild = node.children.some(
      (child) => isElementNode(child) && isBlockLevelElement(child),
    );
    return hasBlockChild
      ? { contentNodes: [], childrenNodes: node.children }
      : { contentNodes: node.children, childrenNodes: [] };
  }

  const rest = isParagraphTag(head.tagName)
    ? node.children.filter((child) => child !== head)
    : node.children;
  const contentNodes = isParagraphTag(head.tagName) ? head.children : [];

  const restElements = rest.filter(isElementNode);
  const container = restElements[0];
  const isSingleChildrenContainer =
    restElements.length === 1 &&
    container !== undefined &&
    container.tagName === "div" &&
    propertyString(container, "dataBeChildren") !== undefined &&
    !rest.some(
      (child) =>
        !isElementNode(child) && hasSubstantialText(textValue([child])),
    );
  return {
    contentNodes,
    childrenNodes:
      isSingleChildrenContainer && container !== undefined
        ? container.children
        : rest,
  };
};

// segmentBlocks의 경계 판정을 실제 Block으로 옮기는 변환 하나만 한다(재귀
// unwrap은 다루지 않는다 — blocksFromNodes가 감싼다). documentFromRoot의
// 기존 루프 그대로이고, DELTA-04는 이 함수를 두 자리에서 재사용한다: (1)
// 최상위 nodes 중 children wrapper가 아닌 나머지("평면" 구간), (2) wrapper
// 안의 <p>/<hN> 자기 콘텐츠 하나(blocksFromNodes 참고). depth·warnings는
// blockquote 세그먼트의 children 재귀(blocksFromNodes로 되돌아감)가 wrapper
// 재귀와 같은 깊이 가드를 받기 위해서만 받는다(DELTA-06a).
const blocksFromSegments = (
  nodes: readonly HtmlNode[],
  createId: IdFactory,
  depth: number,
  warnings: HtmlImportWarning[],
): Document["blocks"] => {
  const blocks: Document["blocks"] = [];

  for (const segment of segmentBlocks(nodes, importBlockSegmentPolicy)) {
    if (segment.kind === "paragraph") {
      // 경계 태그 없이 자연히 쌓인 pending(예: div/li 재귀 안 텍스트,
      // 인식하지 않는 태그 통과분)이라 originating 요소가 없다 — 기존
      // flushInlineNodes 관례를 그대로 따른다: collapse/normalize 없이
      // textValue(...).trim()으로만 실질 텍스트를 거르고, id는 항상
      // 새로 발급한다(이 gap은 이번 변경의 범위 밖이다).
      if (textValue(segment.nodes).trim().length > 0) {
        blocks.push({
          id: createId(),
          type: "paragraph",
          content: paragraphContentFromNodes(segment.nodes),
        });
      }
      continue;
    }
    if (segment.kind === "simpleBoundary") {
      // p 자신의 본문 — 기존 parseBlock 관례대로 실질 텍스트 여부와
      // 무관하게 항상 블록 하나를 낸다(빈 <p>도 빈 문단으로 보존).
      // dataBeBlockId는 p 요소 자신의 속성이라 segment.node에서 읽는다.
      blocks.push({
        id: propertyString(segment.node, "dataBeBlockId") ?? createId(),
        type: "paragraph",
        content: paragraphContentFromNodes(segment.nodes),
      });
      continue;
    }
    if (segment.kind === "heading") {
      // level은 headingLevelByTagName의 값 타입(HeadingBlock["level"])을
      // 세그먼트가 그대로 실어 온다 — 캐스트도 재검증도 없다. dataBeBlockId는
      // heading 요소 자신의 속성이라 segment.node에서 읽는다(기존 parseBlock
      // 관례).
      blocks.push({
        id: propertyString(segment.node, "dataBeBlockId") ?? createId(),
        type: "heading",
        level: segment.level,
        content: paragraphContentFromNodes(segment.nodes),
      });
      continue;
    }
    if (segment.kind === "hr") {
      // divider는 콘텐츠·children 없는 리프다(spec §4.2). 빈 <p>를 빈 문단으로
      // 보존하는 관례처럼 hr 하나당 divider 하나를 항상 낸다.
      blocks.push({
        id: propertyString(segment.node, "dataBeBlockId") ?? createId(),
        type: "divider",
      });
      continue;
    }
    if (segment.kind === "blockquote") {
      // quote(D6 — splitQuoteChildren). blockquote 하나당 quote 하나를 항상
      // 낸다(빈 <blockquote>도 빈 quote — 빈 <p> 관례와 같다). id는 children
      // 재귀보다 먼저 발급해 문서 순서(부모 → 자식)대로 html-N이 붙게 한다.
      // children은 blocksFromNodes로 되돌아가 wrapper·중첩 blockquote를 다시
      // 인식하며, wrapper와 같은 깊이 가드를 받는다: depth >= MAX_NESTING_DEPTH
      // 면 children 배열을 만들 수 없으므로 quote는 content만 지키고 children
      // 자리의 노드는 같은 depth의 형제 블록으로 평탄화한다 — 실제로 블록이
      // 나왔을 때만(공백뿐이면 잃는 구조가 없다) NESTED_CHILDREN_FLATTENED를
      // 경고한다(Issue #132, G-CNV-002). 같은 depth 재귀는 HTML 트리 한 단계를
      // 소비하므로 MAX_HTML_TREE_DEPTH로 유계다.
      const id = propertyString(segment.node, "dataBeBlockId") ?? createId();
      const { contentNodes, childrenNodes } = splitQuoteChildren(segment.node);
      const content = paragraphContentFromNodes(contentNodes);
      if (depth >= MAX_NESTING_DEPTH) {
        const flattened = blocksFromNodes(
          childrenNodes,
          createId,
          depth,
          warnings,
        );
        if (flattened.length > 0)
          warnings.push(nestedChildrenFlattenedWarning());
        blocks.push({ id, type: "quote", content }, ...flattened);
        continue;
      }
      const children = blocksFromNodes(
        childrenNodes,
        createId,
        depth + 1,
        warnings,
      );
      blocks.push(
        children.length > 0
          ? { id, type: "quote", content, children }
          : { id, type: "quote", content },
      );
      continue;
    }
    if (segment.kind === "codeBlock") {
      const source = textValue(segment.node.children);
      const id = propertyString(segment.node, "dataBeBlockId") ?? createId();
      const directCode = firstDirectCode(segment.node);
      const directCodeDataLanguage =
        directCode === undefined
          ? undefined
          : propertyString(directCode, "dataLanguage");
      const preDataLanguage = propertyString(segment.node, "dataLanguage");
      const directCodeClassLanguages =
        directCode === undefined ? [] : classLanguages(directCode);
      const preClassLanguages = classLanguages(segment.node);
      const selectionCandidates = [
        directCodeDataLanguage,
        preDataLanguage,
        directCodeClassLanguages[0],
        preClassLanguages[0],
      ].filter((value): value is string => value !== undefined);
      const language = selectionCandidates[0];
      const exactMetadataCandidates = [
        directCodeDataLanguage,
        preDataLanguage,
        ...directCodeClassLanguages,
        ...preClassLanguages,
      ].filter((value): value is string => value !== undefined);
      if (
        language !== undefined &&
        exactMetadataCandidates.some((candidate) => candidate !== language)
      ) {
        warnings.push(codeBlockLanguageMetadataIgnoredWarning(id));
      }
      blocks.push({
        id,
        type: "codeBlock",
        content: source.length === 0 ? [] : [{ text: source }],
        ...(language === undefined ? {} : { language }),
      });
      continue;
    }

    // caption 등 표 직속 비섹션 자식(thead/tbody/tfoot/tr/colgroup이 아닌
    // 나머지)은 sanitize가 unwrap한 caption 텍스트가 대표 사례다(caption은
    // htmlAllowedTagNames에 없다). parseTable은 이 노드들을 읽지 않으므로
    // 표 블록 앞에 문단으로 옮겨 담지 않으면 조용히 사라진다(이슈 #70).
    // 표 직속 비섹션 자식 사이에는 HTML5 tree construction 규칙상
    // foster-parenting되지 않는 구조적 공백(들여쓰기·개행) 텍스트 노드가
    // 그대로 남는다. 노드 단위로 "통째로 공백뿐인가"만 걸러내고, 실질
    // 텍스트가 있는 노드(caption 자체의 앞뒤 공백 포함)는 내부를 손대지
    // 않는다 — 일반 문단 생성 경로의 collapse-없음 관례를 그대로 따른다.
    const nonSectionChildren = segment.nonSectionChildren.filter((child) =>
      hasSubstantialText(textValue([child])),
    );
    if (nonSectionChildren.length > 0) {
      blocks.push({
        id: createId(),
        type: "paragraph",
        content: paragraphContentFromNodes(nonSectionChildren),
      });
    }
    blocks.push(parseTable(segment.node, createId));
  }

  return blocks;
};

// exportHtml(blockNode)이 낸 children wrapper를 구조로만 인식한다: div
// 자식이 정확히 2개(실질 텍스트가 섞이지 않은 순수 2-element), 첫째는
// p/h1~h6(그 블록 자신의 본문 — hr은 children을 가질 수 없는 divider라
// export가 이 자리에 절대 내지 않으므로 보지 않는다), 둘째는 dataBeChildren이
// 있는 div(children 목록)다. 이 두 자리 중 하나라도 어긋나면 wrapper로 보지
// 않고 undefined를 반환한다 — 호출자(blocksFromNodes)는 그 경우 원본 노드를 그대로
// 평면 처리(segmentBlocks)로 넘긴다. 부분 일치를 관대하게 봐주지 않는 이유:
// export가 절대 내지 않는 애매한 구조까지 wrapper로 오인하면 사용자가 직접
// 쓴 임의의 div(예: <div>STRAY<p>a</p><div data-be-children>b</div></div>)가
// 뜻하지 않게 중첩 구조로 해석되고, 그 사이·앞뒤에 낀 실질 텍스트("STRAY")가
// 결과 어디에도 담기지 못한 채 조용히 사라진다(G-CNV-002 위반 — 트랙-2
// 라운드5 리뷰가 실측한 결함, 즉시 정정). 그래서 두 element 자리를 확인하기
// 전에 먼저 element가 아닌 형제(text·comment 등)에 실질 텍스트가 있는지부터
// 걸러 wrapper 인식 자체를 취소한다(공백만 있는 텍스트는 원래 export가 내는
// 형태에도 나올 수 있어 통과시킨다 — 기존 caption 처리(`hasSubstantialText`)
// 와 같은 판정 기준). 반대로 못 알아보면 기존 NESTED_BOUNDARY_TAG_NAMES
// 평면 처리로 안전하게 떨어지므로(완료 조건 1의 변이 시나리오와 동일한
// 경로) 실패 방향이 항상 더 보수적이다.
const findChildrenWrapper = (
  node: HtmlNode,
):
  | { ownNode: HtmlElementNode; childrenNodes: HtmlElementContent[] }
  | undefined => {
  if (node.type !== "element" || node.tagName !== "div") return undefined;

  const hasStrayText = node.children.some(
    (child) => !isElementNode(child) && hasSubstantialText(textValue([child])),
  );
  if (hasStrayText) return undefined;

  const elementChildren = node.children.filter(isElementNode);
  if (elementChildren.length !== 2) return undefined;

  const ownNode = elementChildren[0];
  const containerNode = elementChildren[1];
  if (ownNode === undefined || containerNode === undefined) return undefined;
  const isOwnBoundaryTag =
    isParagraphTag(ownNode.tagName) ||
    headingLevelByTagName.has(ownNode.tagName);
  if (!isOwnBoundaryTag) return undefined;
  if (
    containerNode.tagName !== "div" ||
    propertyString(containerNode, "dataBeChildren") === undefined
  ) {
    return undefined;
  }

  return { ownNode, childrenNodes: containerNode.children };
};

type ListItemBlock = Extract<
  Block,
  { type: "bulletListItem" | "numberedListItem" }
>;

// raw warning fact 중 sanitized 목록 변환이 실제로 소비해 보존한 속성 하나만
// 제거한다. 전역 필터와 달리 blocksFromListElement에 도달하지 않은 standalone
// li, 비-li ol, 표 셀 내부 목록의 속성 손실 warning은 그대로 남는다.
const consumePreservedListAttributeWarning = (
  warnings: HtmlImportWarning[],
  element: "li" | "ol",
  attribute: "dataBeBlockId" | "start",
): void => {
  const index = warnings.findIndex(
    (warning) =>
      warning.kind === "UNSAFE_ATTRIBUTE_REMOVED" &&
      warning.element === element &&
      warning.attribute === attribute,
  );
  if (index >= 0) warnings.splice(index, 1);
};

// sanitized li 하나를 목록 블록으로 만든다. children depth가 model 상한에
// 닿으면 부모 항목은 유지하고 초과 블록을 같은 배열의 뒤쪽 형제로 내보낸다.
// quote/wrapper 경계와 같은 NESTED_CHILDREN_FLATTENED 계약이다.
const blocksFromListItem = (
  node: HtmlElementNode,
  listType: ListItemBlock["type"],
  startNumber: number | undefined,
  createId: IdFactory,
  depth: number,
  warnings: HtmlImportWarning[],
): Document["blocks"] => {
  const id = propertyString(node, "dataBeBlockId") ?? createId();
  const { contentNodes, childrenNodes } = splitListItemChildren(node);
  const content = paragraphContentFromNodes(contentNodes);
  const ownBlock: ListItemBlock =
    listType === "numberedListItem"
      ? {
          id,
          type: "numberedListItem",
          content,
          ...(startNumber === undefined ? {} : { startNumber }),
        }
      : { id, type: "bulletListItem", content };

  if (depth >= MAX_NESTING_DEPTH) {
    const flattened = blocksFromNodes(childrenNodes, createId, depth, warnings);
    if (flattened.length > 0) {
      warnings.push(nestedChildrenFlattenedWarning());
    }
    return [ownBlock, ...flattened];
  }

  const children = blocksFromNodes(
    childrenNodes,
    createId,
    depth + 1,
    warnings,
  );
  return children.length > 0 ? [{ ...ownBlock, children }] : [ownBlock];
};

// ul/ol 직속 li를 문서 순서대로 목록 항목으로 해석한다. ol[start]는 HTML
// 컨테이너의 첫 li에만 명시 startNumber로 붙는다. 별도 default ol이 같은
// model sibling scope의 번호 항목 바로 뒤에 오면 HTML의 새 컨테이너가 뜻하는
// 1 재시작을 첫 항목에 명시한다. 같은 ol의 후속 li에는 복제하지 않는다.
// malformed 비-li flow content도 버리지 않고 기존 blocksFromNodes 경계로
// 형제 블록화한다.
const blocksFromListElement = (
  node: HtmlElementNode & { tagName: "ul" | "ol" },
  createId: IdFactory,
  depth: number,
  warnings: HtmlImportWarning[],
  restartDefaultOrderedList: boolean,
): Document["blocks"] => {
  const blocks: Document["blocks"] = [];
  let nonItemRun: HtmlNode[] = [];
  let itemIndex = 0;
  let flowInterruptedSinceItem = false;
  const explicitStart =
    node.tagName === "ol" ? propertyInteger(node, "start", Number.NaN) : NaN;

  const flushNonItemRun = (): void => {
    if (nonItemRun.length === 0) return;
    const previousLength = blocks.length;
    blocks.push(...blocksFromNodes(nonItemRun, createId, depth, warnings));
    if (itemIndex > 0 && blocks.length > previousLength) {
      flowInterruptedSinceItem = true;
    }
    nonItemRun = [];
  };

  for (const child of node.children) {
    if (!isElementNode(child) || child.tagName !== "li") {
      nonItemRun.push(child);
      continue;
    }
    flushNonItemRun();
    if (propertyString(child, "dataBeBlockId") !== undefined) {
      consumePreservedListAttributeWarning(warnings, "li", "dataBeBlockId");
    }
    if (
      node.tagName === "ol" &&
      itemIndex === 0 &&
      Number.isInteger(explicitStart)
    ) {
      consumePreservedListAttributeWarning(warnings, "ol", "start");
    }
    const startNumber =
      itemIndex === 0 && Number.isInteger(explicitStart)
        ? explicitStart
        : itemIndex === 0 &&
            blocks.length === 0 &&
            restartDefaultOrderedList &&
            !Number.isInteger(explicitStart)
          ? 1
          : itemIndex > 0 && flowInterruptedSinceItem
            ? (Number.isInteger(explicitStart) ? explicitStart : 1) + itemIndex
            : undefined;
    blocks.push(
      ...blocksFromListItem(
        child,
        node.tagName === "ul" ? "bulletListItem" : "numberedListItem",
        startNumber,
        createId,
        depth,
        warnings,
      ),
    );
    itemIndex += 1;
    flowInterruptedSinceItem = false;
  }
  flushNonItemRun();
  return blocks;
};

// wrapper 재귀 해제 안전장치(G-CNV-001, PIT-0034) — model의
// findNestingDepthViolation(schema.ts)과 같은 모양의 가드다: depth <
// MAX_NESTING_DEPTH(64, blocks 배열 자체가 depth 1)일 때만 wrapper를
// 인식해 한 단계 더 내려가므로, 이 함수의 재귀 프레임과 만들어지는
// Document의 children 깊이가 모두 정확히 MAX_NESTING_DEPTH 안에서 끝난다 —
// 뒤이은 parseDocument의 DOCUMENT_LIMIT_EXCEEDED 거절에 기대지 않는다.
// 상한에 걸린 wrapper(depth >= MAX_NESTING_DEPTH에서 인식된 것)는 전면
// 거절하는 대신 그 자리 노드를 plainRun으로 넘겨 segmentBlocks 평면
// 처리로 평탄화하고, 실제로 잃는 구조(비어 있지 않은 children 컨테이너)가
// 있을 때만 NESTED_CHILDREN_FLATTENED를 경고한다(Issue #132, G-CNV-002 —
// 보이는 텍스트는 형제 문단으로 보존된다).
//
// plainRun으로 넘어간 노드가 들어가는 segmentBlocks(block-segmenter.ts의
// walk) 재귀와 이 파일의 textValue·createDefaultIdFactory 재귀는 깊이
// 제한이 없지만, parseHtmlFragment의 깊이-캡(MAX_HTML_TREE_DEPTH, Issue
// #130)이 HTML 트리 자체를 parse 직후에 절단하므로 전부 그 상수로 유계다.
// 캡 "이전"인 파서 라이브러리 내부 재귀(parse5의 EOF template 정리 —
// 닫히지 않은 중첩 template)만은 캡이 못 막는데, 그 구간은 우연한 최외곽
// catch가 아니라 parseHtmlFragment 자신의 설계된 경계 catch가 받아
// undefined → HTML_PARSE_FAILED로 흡수된다(PIT-0034가 경계하는 "우연한
// catch 의존"은 결정 6 + 그 경계 catch로 제거됐다).
const blocksFromNodes = (
  nodes: readonly HtmlNode[],
  createId: IdFactory,
  depth: number,
  warnings: HtmlImportWarning[],
): Document["blocks"] => {
  const blocks: Document["blocks"] = [];
  let plainRun: HtmlNode[] = [];

  const flushPlainRun = (): void => {
    if (plainRun.length === 0) return;
    blocks.push(...blocksFromSegments(plainRun, createId, depth, warnings));
    plainRun = [];
  };

  for (const node of nodes) {
    if (isListElement(node)) {
      flushPlainRun();
      const previousBlock = blocks[blocks.length - 1];
      blocks.push(
        ...blocksFromListElement(
          node,
          createId,
          depth,
          warnings,
          node.tagName === "ol" && previousBlock?.type === "numberedListItem",
        ),
      );
      continue;
    }
    const wrapper = findChildrenWrapper(node);
    if (wrapper === undefined) {
      plainRun.push(node);
      continue;
    }
    if (depth >= MAX_NESTING_DEPTH) {
      // children 컨테이너가 비어 있으면(정확히 상한 깊이로 끝나는 체인)
      // 평탄화 결과가 wrapper를 인식했을 때와 동일하므로 경고하지 않는다 —
      // 64단 입력의 기존 산출·경고를 그대로 유지한다.
      if (wrapper.childrenNodes.length > 0) {
        warnings.push(nestedChildrenFlattenedWarning());
      }
      plainRun.push(node);
      continue;
    }

    flushPlainRun();
    const ownBlocks = blocksFromSegments(
      [wrapper.ownNode],
      createId,
      depth,
      warnings,
    );
    const ownBlock = ownBlocks[0];
    if (
      ownBlocks.length !== 1 ||
      ownBlock === undefined ||
      (ownBlock.type !== "paragraph" && ownBlock.type !== "heading")
    ) {
      // findChildrenWrapper가 ownNode를 p/h1~h6로만 걸렀으므로 정상 입력에서
      // 이 분기는 도달하지 않는다 — p/heading이 (HTML5 파싱상 가능한) 표를
      // 품고 있어 segmentBlocks가 블록 하나 대신 여러/다른(paragraph·heading
      // 이외 — children을 가질 수 없는 divider 포함) 세그먼트를 냈을 때만
      // 방어적으로 wrapper 인식을 취소하고 원본 노드를 평면 처리로 되돌린다.
      plainRun.push(node);
      continue;
    }

    const children = blocksFromNodes(
      wrapper.childrenNodes,
      createId,
      depth + 1,
      warnings,
    );
    blocks.push(children.length > 0 ? { ...ownBlock, children } : ownBlock);
  }
  flushPlainRun();

  return blocks;
};

const documentFromRoot = (
  root: HtmlRoot,
  createId: IdFactory,
  warnings: HtmlImportWarning[],
): Document => {
  const blocks = blocksFromNodes(root.children, createId, 1, warnings);
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
    // parse5는 U+0000을 AST 생성 전에 제거한다. 같은 길이의 다른 금지 C0로
    // 치환해 raw warning과 CodeBlock strict validation이 원문 위반을 본다.
    const parsedFragment = parseHtmlFragment(source.replace(/\0/g, "\u0001"));
    if (parsedFragment === undefined) {
      return {
        ok: false,
        error: {
          code: "HTML_PARSE_FAILED",
          message: "HTML parser did not produce a root node",
        },
      };
    }
    // 깊이-캡 절단(Issue #130)은 sanitize·경고 수집 이전(parseHtmlFragment
    // 내부)에 일어나므로 raw 경고 수집과 sanitize 의미 변환이 같은(절단된)
    // 트리를 본다 — 절단 사실 자체는 캡 패스 반환값으로만 알 수 있어
    // 여기서 경고로 바꾼다. 절단이 시간상 가장 먼저 일어난 사건이라 경고
    // 목록 맨 앞에 둔다.
    const { root: unsafeRoot, truncated } = parsedFragment;
    const warnings = collectHtmlImportWarnings(unsafeRoot);
    if (truncated) warnings.unshift(deepTreeFlattenedWarning());
    const safeRoot = asRoot(sanitize(unsafeRoot, htmlImportSanitizeSchema));
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
      warnings,
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
