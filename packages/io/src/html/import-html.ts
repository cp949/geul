import {
  appendOrMergeInlineItem,
  type Document,
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
import { htmlSanitizeSchema } from "./sanitize-schema.js";
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

// documentFromRoot의 재귀 경계 판정(문단/헤딩/표 시퀀스로 쪼개기)은
// clipboard-table-parser.ts의 blockSequenceFromNodes와 block-segmenter.ts를
// 공유한다(아키텍처 리뷰 2차 후보 G) — p/h1~h3/table만 보던 예전 documentFromRoot
// 는 최상위 노드만 훑는 평면 루프라 div/li/blockquote/ul/ol처럼 중첩 가능한
// 경계를 인식하지 못했다(Issue #113과 같은 종류의 병합). h4~h6는 여기 포함하지
// 않는다 — model HeadingBlock.level이 1~3만 허용해 sanitize가 애초에
// h4~h6를 unwrap하므로 headingLevelFromTagName이 h1~h3만 인식해도 충분하다
// (그릴링 결정: 문단 경계 태그 집합만 공유, heading 다운그레이드는 clipboard
// 고유 정책으로 남긴다).
const importBlockSegmentPolicy: BlockSegmentPolicy = {
  isSimpleBoundary: isParagraphTag,
  headingLevelFromTagName: (tagName) =>
    /^h[1-3]$/.test(tagName) ? Number(tagName[1]) : undefined,
  isNestedBoundary: (tagName) => NESTED_BOUNDARY_TAG_NAMES.has(tagName),
  isTransparent: isTransparentListTag,
  isTableNode: (node) => node.tagName === "table",
};

const paragraphContentFromNodes = (nodes: HtmlNode[]): InlineContent =>
  sanitizeInlineContentText(inlineContentFromNodes(nodes));

// segmentBlocks의 경계 판정을 실제 Block으로 옮기는 변환 하나만 한다(재귀
// unwrap은 다루지 않는다 — blocksFromNodes가 감싼다). documentFromRoot의
// 기존 루프 그대로이고, DELTA-04는 이 함수를 두 자리에서 재사용한다: (1)
// 최상위 nodes 중 children wrapper가 아닌 나머지("평면" 구간), (2) wrapper
// 안의 <p>/<hN> 자기 콘텐츠 하나(blocksFromNodes 참고).
const blocksFromSegments = (
  nodes: readonly HtmlNode[],
  createId: IdFactory,
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
      // importBlockSegmentPolicy가 h1~h3만 heading으로 인식하므로 이
      // 분기의 level은 항상 1~3이다. dataBeBlockId는 heading 요소 자신의
      // 속성이라 segment.node에서 읽는다(기존 parseBlock 관례).
      blocks.push({
        id: propertyString(segment.node, "dataBeBlockId") ?? createId(),
        type: "heading",
        level: segment.level as 1 | 2 | 3,
        content: paragraphContentFromNodes(segment.nodes),
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

const isElementNode = (node: HtmlNode): node is HtmlElementNode =>
  node.type === "element";

// exportHtml(blockNode)이 낸 children wrapper를 구조로만 인식한다: div
// 자식이 정확히 2개(실질 텍스트가 섞이지 않은 순수 2-element), 첫째는
// p/h1~h3(그 블록 자신의 본문), 둘째는 dataBeChildren이 있는 div(children
// 목록)다. 이 두 자리 중 하나라도 어긋나면 wrapper로 보지 않고 undefined를
// 반환한다 — 호출자(blocksFromNodes)는 그 경우 원본 노드를 그대로 평면
// 처리(segmentBlocks)로 넘긴다. 부분 일치를 관대하게 봐주지 않는 이유:
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
    ownNode.tagName === "p" || /^h[1-3]$/.test(ownNode.tagName);
  if (!isOwnBoundaryTag) return undefined;
  if (
    containerNode.tagName !== "div" ||
    propertyString(containerNode, "dataBeChildren") === undefined
  ) {
    return undefined;
  }

  return { ownNode, childrenNodes: containerNode.children };
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
    blocks.push(...blocksFromSegments(plainRun, createId));
    plainRun = [];
  };

  for (const node of nodes) {
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
    const ownBlocks = blocksFromSegments([wrapper.ownNode], createId);
    const ownBlock = ownBlocks[0];
    if (
      ownBlocks.length !== 1 ||
      ownBlock === undefined ||
      (ownBlock.type !== "paragraph" && ownBlock.type !== "heading")
    ) {
      // findChildrenWrapper가 ownNode를 p/h1~h3로만 걸렀으므로 정상 입력에서
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
    const parsedFragment = parseHtmlFragment(source);
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
