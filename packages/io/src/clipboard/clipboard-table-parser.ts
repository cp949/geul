import {
  type Block,
  canonicalizeCodeBlockLanguage,
  type IdFactory,
  type InlineContent,
  type InlineContentItem,
  isCanonicalCellAlign,
  isCanonicalCellColor,
  parseDocument,
  tableSizeViolationMessage,
  validateTableSize,
} from "@cp949/geul-model";
import { sanitize } from "hast-util-sanitize";

import type { ClipboardParseError } from "../errors.js";
import { clipboardSanitizeSchema } from "../html/clipboard-sanitize-schema.js";
import {
  collapseSourceWhitespace,
  hasGeulIdentityAttribute,
} from "../html/collapse-source-whitespace.js";
import {
  cellPresentation,
  type CellPresentation,
} from "../html/element-presentation.js";
import {
  childElements,
  propertyString,
  sanitizeLinks,
} from "../html/hast-properties.js";
import { createImportContext } from "../html/import-context.js";
import {
  documentFromRoot,
  type HtmlTableSeam,
} from "../html/import-html-blocks.js";
import {
  type HtmlElementContent,
  type HtmlElementNode,
  type HtmlNode,
  type HtmlRoot,
  inlineContentFromNodes,
  unwrapBlockBearingColorTags,
} from "../html/inline-content.js";
import {
  asRoot,
  flattenBlockBoundaryTagNames,
  parseHtmlFragment,
} from "../html/parse-html.js";
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
// 데이터 표로 집으면 같은 행에 있는 진짜 셀들이 표 밖 문단이 된다 — 표 구조
// 자체가 사라진다.
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

const canonicalColor = (value: string | undefined): string | undefined =>
  value !== undefined && isCanonicalCellColor(value) ? value : undefined;

const canonicalAlign = (
  value: string | undefined,
): "left" | "center" | "right" | undefined =>
  value !== undefined && isCanonicalCellAlign(value) ? value : undefined;

// data-geul-*(자기 복사)가 있으면 우선하고, 없으면 style·bgcolor에서 뽑는다
// (외부 Excel/Google Sheets는 data-geul-*가 없으므로 항상 style로 떨어진다).
// 색은 td·th → tr → table 순으로 읽는다(Issue #334, element-presentation.ts).
// styled는 그 읽기의 결과다. 정렬은 td·th의 style만 읽는다.
const cellStyleFields = (
  element: HtmlElementNode,
  styled: CellPresentation,
): Pick<TabularCell, "textColor" | "backgroundColor" | "align"> => {
  const styleAttribute = propertyString(element, "style");
  const parsedStyle =
    styleAttribute === undefined ? {} : parseStyleDeclarations(styleAttribute);

  // data-geul-*도 style과 똑같이 model의 정규 형식을 통과해야 한다. 그냥
  // 통과시키면 클립보드 HTML이 임의 값을 문서로 밀어넣어 parseDocument가
  // 커밋 시점에 터진다(모델↔에디터 영구 desync).
  const dataTextColor = canonicalColor(
    propertyString(element, "dataGeulTextColor"),
  );
  const dataBackgroundColor = canonicalColor(
    propertyString(element, "dataGeulBackgroundColor"),
  );
  const textColor = dataTextColor ?? styled.textColor;
  const backgroundColor = dataBackgroundColor ?? styled.backgroundColor;
  const align =
    canonicalAlign(propertyString(element, "dataGeulAlign")) ??
    parsedStyle.align;

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
      // layouts는 rows와 같은 순서·길이라 항상 있다. 이 행의 tr이 셀 색의
      // 둘째 단이다.
      const rowElement = rows[rowIndex]?.element ?? table;
      const cells: TabularCell[] = row.map((layout) => {
        // 서식은 data-geul-* 색과 독립이라 항상 읽는다.
        const styled = cellPresentation(layout.element, rowElement, table);
        return {
          columnIndex: layout.columnIndex,
          // coveredCoordinates가 쓰는 보정값과 반드시 같아야 한다 — 어긋나면
          // 커버리지는 채워졌는데 검증기는 UNCOVERED_COORDINATE를 내서
          // 멀쩡한 표 붙여넣기가 통째로 거절된다.
          rowSpan: layoutRowSpan(layout.rowSpan),
          columnSpan: layoutColumnSpan(layout.columnSpan),
          // 셀 안 블록 요소(p, div 등) 경계에 줄바꿈 하나를 넣어 단어가
          // 붙지 않게 한다(Issue #325). importHtml 표 셀과 같은 집합을 쓴다.
          content: normalizeCellContent(
            inlineContentFromNodes(layout.element.children, {
              blockBreakTagNames: flattenBlockBoundaryTagNames,
              baseFormat: styled.format,
            }),
          ),
          ...cellStyleFields(layout.element, styled),
        };
      });

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

type TableRead = Result<TabularData, ClipboardParseError>;

// 표 직속 비섹션 자식(sanitize가 벗긴 caption 글자가 대표다)을 표 앞 문단
// 콘텐츠로 읽는다. 표 셀과 같은 정규화(공백 run 접기, 무효 코드포인트 제거)를
// 거친다. 실질 텍스트가 없으면 문단을 만들지 않는다. importHtml의 caption 문단과
// 다르다 — 표를 어떻게 읽는가의 일부라 클립보드 표 처리기 몫이다(RD-003 seam).
// inlineContentFromNodes는 텍스트 런만 만든다. 커스텀 inline 원소를 만드는
// HTML 문법이 없다(cell-text.ts와 같은 근거).
const captionContent = (
  nodes: HtmlElementContent[],
): InlineContent | undefined => {
  if (nodes.length === 0) return undefined;
  collapseHtmlWhitespace(nodes);
  const content = normalizeCellContent(inlineContentFromNodes(nodes));
  const text = (content as Array<Extract<InlineContentItem, { text: string }>>)
    .map((item) => item.text)
    .join("");
  return hasSubstantialText(text) ? content : undefined;
};

// 표 옆 블록은 importHtml 변환기가 읽고 표는 이 파일의 표 처리기가 읽는다
// (Issue #356 RD-003 seam, RD-005). 변환기는 model Block만 내므로 표 자리에
// 자리표시 블록을 두고 그 객체를 키로 표 읽기 결과를 reads에 담는다.
// - 키는 객체 identity다. id 문자열을 키로 쓰면 html의 data-geul-block-id와
//   겹칠 수 있다. 변환기는 처리기가 낸 블록을 복제하지 않고 그대로 담는다.
// - 표 판정은 findDataTables가 고른 노드 집합의 멤버십이다. 레이아웃 표와 빈
//   표는 표 노드가 아니다. 변환기는 표 노드를 복제하지 않고 넘긴다(블록 분할의
//   leaf 복제도 표 노드는 원본을 돌려준다, block-segmenter.ts).
// - 거절은 던지지 않고 reads에 담는다. 변환기는 끝까지 읽고 호출자가 첫 거절을
//   돌려준다.
// - 자리표시는 divider다. 변환기의 children wrapper 판정이 divider를 자기
//   콘텐츠로 받지 않아 표를 품은 자기 콘텐츠 태그의 처리가 importHtml과 같다.
const clipboardTableSeam = (
  tables: readonly HtmlElementNode[],
  reads: Map<Block, TableRead>,
): HtmlTableSeam => {
  const tableSet = new Set(tables);
  return {
    isTableNode: (node) => tableSet.has(node),
    blocksFromTable: (segment, { createId }) => {
      const blocks: Block[] = [];
      const caption = captionContent(segment.nonSectionChildren);
      if (caption !== undefined) {
        blocks.push({ id: createId(), type: "paragraph", content: caption });
      }
      const slot: Block = { id: "clipboard-table-slot", type: "divider" };
      reads.set(slot, tabularDataFromTable(segment.node));
      blocks.push(slot);
      return blocks;
    },
  };
};

// 표가 아닌 블록의 임시 id를 만든다. 호출마다 1부터 센다 — 모듈 전역으로 두면
// 같은 입력이 호출 순서에 따라 다른 id를 낸다. 변환기는 html의
// data-geul-block-id를 그대로 쓰므로 그 값은 건너뛴다. core가 붙여넣을 때
// 재발급하므로 id는 호출 안에서 유일하기만 하면 된다(RD-004).
const createClipboardIdFactory = (root: HtmlRoot): IdFactory => {
  const usedIds = new Set<string>();
  const collect = (nodes: readonly HtmlNode[]): void => {
    for (const node of nodes) {
      if (node.type !== "element") continue;
      const id = propertyString(node, "dataGeulBlockId");
      if (id !== undefined) usedIds.add(id);
      collect(node.children);
    }
  };
  collect(root.children);
  let sequence = 0;
  return () => {
    let id: string;
    do {
      sequence += 1;
      id = `clipboard-${sequence}`;
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };
};

// model 검증에 실패하면 빼고 다시 판정할 선택 필드다. 표시·메타 속성이라
// 빠져도 블록의 글자와 구조는 남는다. 미디어 url과 필수 필드(content, checked,
// level 등)는 여기 없다 — 그 필드가 무효면 블록을 버린다.
const DROPPABLE_FIELDS: ReadonlySet<string> = new Set([
  "textColor",
  "backgroundColor",
  "textAlignment",
  "icon",
  "collapsed",
  "startNumber",
  "language",
  "wrap",
  "caption",
  "name",
  "showPreview",
  "previewWidth",
  "aspectRatio",
]);

// 프로브 블록의 id다. html의 id 값과 무관하게 판정하려고 고정값을 쓴다.
const PROBE_ID = "clipboard-model-probe";

// 비표 블록 하나를 model 검증을 통과하는 모양으로 줄인다(Issue #356 RD-005
// 결정 Q1). importHtml은 끝의 parseDocument가 무효 값을 문서 전체 거절로
// 막지만 클립보드는 그 거절을 따르지 않는다. 무효 값을 그대로 내면 core가
// 시퀀스 전체를 CLIPBOARD_CONTENT_INVALID로 거절해 표까지 붙지 않는다
// (Word의 file:/// img, Outlook의 cid: img가 대표다).
// - children을 뗀 블록을 parseDocument로 프로브한다(core 검증과 같은 방식).
//   판정 규칙을 io에 복제하지 않는다(G-CNV-001).
// - 실패한 필드가 선택 필드면 그 필드만 빼고 다시 판정한다. 유효한 다른
//   필드는 남는다.
// - 그 밖의 필드가 실패하면 undefined다. 호출자가 블록을 버린다.
const modelSafeBlock = (block: Block): Block | undefined => {
  const own: Record<string, unknown> = { ...block };
  for (let attempt = 0; attempt <= DROPPABLE_FIELDS.size; attempt += 1) {
    const probe: Record<string, unknown> = { ...own, id: PROBE_ID };
    delete probe.children;
    const parsed = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [probe],
    });
    if (parsed.ok) return own as Block;
    // path는 ["blocks", 0, 필드, ...]다.
    const field = parsed.error.path[2];
    if (typeof field !== "string" || !DROPPABLE_FIELDS.has(field)) {
      return undefined;
    }
    if (!(field in own)) return undefined;
    delete own[field];
  }
  return undefined;
};

// 변환기 출력을 클립보드 블록으로 바꾼다. 자리표시는 표 variant로 되돌린다.
// 나머지 블록은 model 모양 그대로다(RD-004).
// - codeBlock language는 model 정규형으로 바꾼다. importHtml은 끝의
//   parseDocument가 바꾸는데 클립보드 경로는 parseDocument를 거치지 않는다.
// - 블록마다 model 검증을 통과하는 모양으로 줄인다(modelSafeBlock). 버린
//   블록의 children은 같은 자리 형제로 올려 글자와 표를 잃지 않는다. 미디어·
//   codeBlock 같은 리프는 children이 없다.
// - id가 비었거나 이미 나왔으면 새로 발급한다. html이 같은 data-geul-block-id를
//   두 번 써도 호출 안 유일성(RD-004)을 지킨다. 남는 블록에만 발급한다. 문서
//   순서(부모 먼저)로 돈다.
// - reads에 있는 자리표시는 모두 성공 읽기다. 거절은 호출자가 먼저 걸렀다.
const clipboardBlocksFrom = (
  blocks: readonly Block[],
  reads: ReadonlyMap<Block, TableRead>,
  createId: IdFactory,
  seenIds: Set<string>,
  usedSlots: Set<Block>,
): ClipboardContentBlock[] =>
  blocks.flatMap((block): ClipboardContentBlock[] => {
    const read = reads.get(block);
    if (read !== undefined) {
      if (!read.ok) throw new Error("rejected table slot reached conversion");
      usedSlots.add(block);
      return [{ type: "table", data: read.value }];
    }
    if (block.type === "table") {
      // seam이 표 블록을 내지 않으므로 도달하지 않는다.
      throw new Error("unexpected model table block in clipboard conversion");
    }
    const children =
      "children" in block && block.children !== undefined ? block.children : [];
    const own = modelSafeBlock(
      block.type === "codeBlock" && block.language !== undefined
        ? { ...block, language: canonicalizeCodeBlockLanguage(block.language) }
        : block,
    );
    const childBlocks = (): ClipboardContentBlock[] =>
      clipboardBlocksFrom(children, reads, createId, seenIds, usedSlots);
    if (own === undefined) return childBlocks();
    const id = own.id.length === 0 || seenIds.has(own.id) ? createId() : own.id;
    seenIds.add(id);
    const shallow: Record<string, unknown> = { ...own, id };
    delete shallow.children;
    const converted = childBlocks();
    return [
      (converted.length > 0
        ? { ...shallow, children: converted }
        : shallow) as ClipboardContentBlock,
    ];
  });

const parseHtmlTable = (html: string): HtmlTableOutcome => {
  // 깊이-캡 절단 사실(truncated)은 경고로 내지 않는다 — clipboard 경로에는 경고
  // 채널이 없다(ClipboardParseError는 NOT_TABULAR | CLIPBOARD_TABLE_INVALID
  // 뿐). importHtml처럼 소스 공백 접기 여부에만 쓴다. 캡 너머로 절단된 표는 표로
  // 인식되지 않아 NOT_TABULAR(기본 붙여넣기 폴백)로 떨어진다.
  const parsed = parseHtmlFragment(html);
  if (parsed === undefined)
    return { ok: false, error: { code: "NOT_TABULAR" }, sawTable: false };
  const { root: unsafeRoot, truncated } = parsed;

  const safeRoot = asRoot(sanitize(unsafeRoot, clipboardSanitizeSchema));
  if (safeRoot === undefined)
    return { ok: false, error: { code: "NOT_TABULAR" }, sawTable: false };

  // importHtml과 같은 링크 정책을 적용한다 — 살려두면 core의
  // LinkPolicyExtension.filterTransaction이 붙여넣기 트랜잭션을 통째로 버린다.
  sanitizeLinks(safeRoot.children);
  unwrapBlockBearingColorTags(safeRoot.children);
  // 소스 공백 접기는 importHtml과 같은 조건이다(Issue #320, #356 Q9). 표 셀은
  // tabularDataFromTable이 자기 접기를 한 번 더 한다. 접힌 공백은 다시 접어도
  // 같다. 표 판정 전에 접는다 — 접기는 노드를 바꾸지 않지만 표 노드 집합을
  // 확정한 뒤에는 트리를 고치지 않는다.
  if (!truncated && !hasGeulIdentityAttribute(safeRoot)) {
    collapseSourceWhitespace(safeRoot);
  }

  const tables = findDataTables(safeRoot);
  if (tables.length === 0)
    return { ok: false, error: { code: "NOT_TABULAR" }, sawTable: false };

  // 경고는 버린다(Issue #356 Q14). 경고 수집기와 보존 속성 감사는 부르지
  // 않는다. iframe 설정은 빈 값이다 — importHtml의 options 생략과 같은 가장
  // 보수적인 판정이다. 공개 API를 늘리지 않는다.
  const reads = new Map<Block, TableRead>();
  const createId = createClipboardIdFactory(safeRoot);
  const document = documentFromRoot(
    safeRoot,
    createId,
    createImportContext(safeRoot, []),
    {},
    clipboardTableSeam(tables, reads),
  );

  // 데이터 표를 찾았어도 변환기가 표 자리로 읽지 않을 수 있다. pre·미디어
  // figure·summary 안 표는 importHtml처럼 글자로 읽힌다. 표 자리가 하나도 없으면
  // 표 붙여넣기가 아니다.
  if (reads.size === 0)
    return { ok: false, error: { code: "NOT_TABULAR" }, sawTable: false };
  // 문서 순서상 첫 거절만 낸다.
  for (const read of reads.values()) {
    if (!read.ok) return { ok: false, error: read.error, sawTable: true };
  }

  const usedSlots = new Set<Block>();
  const value = clipboardBlocksFrom(
    // 변환기는 CustomBlock을 만들지 않는다. Document 타입이 최상위 CustomBlock을
    // 허용해 넓을 뿐이다.
    document.blocks as Block[],
    reads,
    createId,
    new Set<string>(),
    usedSlots,
  );
  // 자리표시를 잃으면 표가 divider로 붙는다. 그럴 바에는 최후 방어선
  // (NOT_TABULAR)으로 보낸다.
  if (usedSlots.size !== reads.size) {
    throw new Error("clipboard table slot was lost during conversion");
  }
  return { ok: true, value };
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
