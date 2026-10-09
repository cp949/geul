import { importHtml } from "@cp949/geul-io";
import {
  type Block,
  type DocumentBlock,
  type InlineContent,
  isKnownBlockType,
  isTextRunItem,
} from "@cp949/geul-model";
import {
  Fragment,
  Mark,
  type Node as PmNode,
  type Schema,
  Slice,
} from "@tiptap/pm/model";

import { inlineContentToTiptap } from "./model-to-tiptap.js";
import { sanitizeSliceInlineText } from "./plain-text-paste.js";

// html을 표 셀 인라인 컨텐츠로 바꾼다(Issue #304, 한 블록은 Issue #316). 표 셀은
// `inline*`이라 블록을 담지 못한다. importHtml이 만든 블록 트리를 줄 목록으로
// 평탄화하고 줄 사이를 hardBreak 하나로 잇는다. core 내부 module이고
// index.ts로 내보내지 않는다(ADR 0002).
//
// 순수 함수다. 문서와 selection을 바꾸지 않고 입력 블록도 바꾸지 않는다.
// 삽입은 호출부가 한다. 선택 종류를 모른다. CellSelection의 서식 있는
// html(Issue #308)도 같은 함수를 부른다.
//
// `cellInlineFromHtml`은 importHtml과 이 변환을 묶는다. 붙여넣기와 drop이
// 함께 쓴다.
//
// 규칙은 다음과 같다.
// - 줄이 되는 블록: paragraph·heading·quote·목록 4종·callout의 content,
//   codeBlock의 텍스트. 서식·들여쓰기·접두어는 남기지 않는다.
// - children은 부모 다음 줄이다. 깊이 우선이다.
// - divider·미디어·custom 블록은 줄을 내지 않는다.
// - codeBlock 텍스트의 개행은 hardBreak이고 code 마크가 없다.
// - 일반 줄은 양끝의 공백과 개행 구간을 자른다(Issue #316). 줄 안쪽 hardBreak와
//   공백은 둔다. 개행 없이 앞뒤에만 있는 공백과 NBSP도 둔다.
// - codeBlock 줄은 앞뒤 hardBreak만 자른다. 첫 줄 들여쓰기는 코드 내용이라
//   둔다(Issue #316 리뷰 02). 표 셀 content는 일반 줄이다.
// - 공백(NBSP 포함)이나 hardBreak뿐인 줄은 빈 줄이라 버린다. 이 판정 말고는
//   개행에 붙지 않은 앞뒤 공백을 자르지 않는다.
// - 줄 사이에 hardBreak 하나를 끼운다.
// - 줄 안 마크는 유지한다. 마크 집합은 스키마 규칙(excludes)으로 다시 쌓는다.
//   bold와 code가 함께면 code만 남는다.
// - text run이 아닌 inline 원소는 모두 버린다. 셀 스키마가 받는 inline atom도
//   포함한다. 셀 스키마에 없는 마크도 버린다. CellSelection 경로(Issue #308)도
//   등록된 custom inline을 버린다. 보존하려면 별도 설계가 필요하다.
// - 무효 문자는 줄에서 지운다. 정리 뒤 비는 줄은 버린다.
//
// 표(Issue #312, #313, drop 전용 flattenTables 옵션): 표의 셀 하나가 줄 원본
// 하나다. 표 안은 행 우선이고 표 사이·표 밖 블록과는 문서 순서다. 표 하나만 든
// 입력도 평탄화한다(Issue #313). PM 기본 drop에 맡기면 셀 안 문단이 표 밖으로
// 새고 목록이 사라졌다. 옵션이 없으면 표가 있을 때 null이다. 붙여넣기 경로
// (#304, #308)는 옵션을 넘기지 않는다.
//
// 발동 조건은 content를 가진 블록이 최소 블록 수 이상이고 정리 뒤 줄이 1개
// 이상일 때다. 최소 블록 수는 기본 1이다(Issue #316). 한 블록 html도 PM 기본에
// 맡기면 색 마크가 빠지고 `<pre>` 개행이 공백이 된다. 기본은 처음에 2였고
// 한 블록은 PM 기본에 맡겼다(Issue #304). CellSelection 경로는 1을 명시해
// 넘긴다(Issue #308). flattenTables가 켜져 있고 표가 있으면 인자와 무관하게
// 1이다(Issue #313). 줄이 1개만 남아도 그 줄을 낸다. 호출부가 이전 경로로
// 내려가면 PM 기본이 남은 빈 문단을 표 뒤에 남기기 때문이다.
//
// importHtml 한계가 한 블록에도 그대로 나온다. 읽지 않는 스타일(`div`의
// `white-space`, `text-transform` 등)과 `<ins>`는 평문이 된다. 소스 개행은
// importHtml이 공백으로 접고 `<br>`만 hardBreak가 된다(Issue #320).

// 줄 원본이다. code는 codeBlock에서 온 줄이라는 표시다.
type LineSource = { content: InlineContent; code: boolean };

// collectLines가 센 값이다. 평탄화한 표의 수다. 표가 있으면 최소 블록 수를 1로 쓴다.
type LineStats = { tables: number };

// 블록 트리를 깊이 우선으로 훑어 줄 원본을 out에 모은다. flattenTables가
// 꺼져 있고 표가 있으면 false다. 켜져 있으면 표의 셀 content를 행 우선으로
// 모은다. content를 가진 블록은 비어 있어도 모은다. 호출부가 블록 수를 센다.
const collectLines = (
  blocks: readonly DocumentBlock[],
  out: LineSource[],
  flattenTables: boolean,
  stats: LineStats,
): boolean => {
  for (const candidate of blocks) {
    // custom 블록은 content가 문자열이라 줄을 내지 않는다.
    if (!isKnownBlockType(candidate.type)) continue;
    const block = candidate as Block;
    if (block.type === "table") {
      if (!flattenTables) return false;
      stats.tables += 1;
      // 병합 셀 때문에 행의 셀 수는 열 수와 다를 수 있다. 존재하는 셀만 읽는다.
      for (const row of block.rows) {
        for (const cell of row.cells) {
          out.push({ content: cell.content, code: false });
        }
      }
      continue;
    }
    if ("content" in block) {
      out.push({ content: block.content, code: block.type === "codeBlock" });
    }
    if ("children" in block && block.children !== undefined) {
      if (!collectLines(block.children, out, flattenTables, stats)) {
        return false;
      }
    }
  }
  return true;
};

// 마크 집합을 스키마 규칙으로 다시 쌓는다. nodeFromJSON은 마크 집합을 검사하지
// 않아 bold와 code가 함께인 무효 집합이 그대로 남는다(check 단계에서 던진다).
// Mark.addToSet이 excludes를 적용해 code만 남긴다.
const normalizeMarks = (node: PmNode): PmNode =>
  node.marks.length < 2
    ? node
    : node.mark(
        node.marks.reduce((set, mark) => mark.addToSet(set), Mark.none),
      );

// 빈 줄 후보인지 본다. hardBreak와 공백뿐인 텍스트만 있으면 빈 줄이다.
const isBlankLine = (nodes: readonly PmNode[]): boolean =>
  nodes.every(
    (node) =>
      node.type.name === "hardBreak" ||
      (node.isText && (node.text ?? "").trim() === ""),
  );

const isHardBreak = (node: PmNode): boolean => node.type.name === "hardBreak";

// 스페이스·탭뿐인 텍스트 노드인지 본다. NBSP는 아니다. lineToNodes가 먼저
// sanitizeSliceInlineText로 Tab을 지워서 실제로 오는 값은 스페이스뿐이다. 탭 분기는
// 정리 단계가 바뀔 때를 대비한 방어다.
const isIndentText = (node: PmNode): boolean =>
  node.isText && /^[ \t]*$/.test(node.text ?? "");

// 줄 양끝의 "공백과 개행" 구간을 자른다(Issue #316). 줄 시작의
// `^[ \t]*(\n[ \t]*)+`와 끝의 `(\n[ \t]*)+$`다. HTML 소스의 들여쓰기가
// `<p>⏎      text⏎    </p>`처럼 줄 양끝에 남기 때문이다. 개행은 hardBreak 노드이고
// text run 경계를 가로질러도 같은 규칙이다. 개행이 없는 앞뒤 공백, 줄 안쪽의
// 개행·공백, NBSP는 건드리지 않는다. 빈 줄이 아닌 줄만 받는다.
const trimLineEdges = (nodes: readonly PmNode[]): PmNode[] => {
  let start = 0;
  let sawBreak = false;
  while (start < nodes.length) {
    const node = nodes[start];
    if (node === undefined) break;
    if (isHardBreak(node)) sawBreak = true;
    else if (!isIndentText(node)) break;
    start += 1;
  }
  if (!sawBreak) start = 0;

  let end = nodes.length;
  let firstBreak = -1;
  for (let index = nodes.length - 1; index >= start; index -= 1) {
    const node = nodes[index];
    if (node === undefined) break;
    if (isHardBreak(node)) firstBreak = index;
    else if (!isIndentText(node)) break;
  }
  if (firstBreak >= 0) end = firstBreak;

  const kept = nodes.slice(start, end);
  const first = kept[0];
  if (sawBreak && first?.isText === true) {
    const text = (first.text ?? "").replace(/^[ \t]+/, "");
    kept[0] = first.type.schema.text(text, first.marks);
  }
  return kept;
};

// codeBlock 줄의 앞뒤 hardBreak만 자른다. 들여쓰기와 줄 안쪽은 건드리지 않는다.
// 빈 줄이 아닌 줄만 받는다.
const trimHardBreaks = (nodes: readonly PmNode[]): PmNode[] => {
  let start = 0;
  let end = nodes.length;
  while (start < end && nodes[start]?.type.name === "hardBreak") start += 1;
  while (end > start && nodes[end - 1]?.type.name === "hardBreak") end -= 1;
  return nodes.slice(start, end);
};

// 줄 원본을 셀 inline 노드 배열로 만든다. 빈 줄이면 빈 배열이다.
// text run이 아닌 inline 원소와 셀 스키마에 없는 마크를 버려 nodeFromJSON이
// 던지지 않게 한다. 무효 문자를 지운 뒤 판정한다. codeBlock의 개행도
// inlineContentToTiptap이 hardBreak로 나눈다.
const lineToNodes = (schema: Schema, source: LineSource): PmNode[] => {
  const runs: InlineContent = [];
  for (const item of source.content) {
    if (!isTextRunItem(item)) continue;
    const marks = item.marks?.filter(
      (mark) => schema.marks[mark.type] !== undefined,
    );
    runs.push(
      marks === undefined || marks.length === 0
        ? { text: item.text }
        : { text: item.text, marks },
    );
  }
  const created: PmNode[] = inlineContentToTiptap(runs).map((json) =>
    normalizeMarks(schema.nodeFromJSON(json)),
  );
  const nodes: PmNode[] = [];
  sanitizeSliceInlineText(
    new Slice(Fragment.fromArray(created), 0, 0),
  ).content.forEach((node) => {
    nodes.push(node);
  });
  if (isBlankLine(nodes)) return [];
  return source.code ? trimHardBreaks(nodes) : trimLineEdges(nodes);
};

/** buildCellHtmlInline의 선택 옵션이다. */
export type CellHtmlInlineOptions = {
  /**
   * 켜면 표의 셀 content를 행 우선 줄로 모은다(Issue #312, drop 전용). 표가
   * 하나 이상이면 최소 블록 수를 1로 쓴다(Issue #313). 기본은 꺼짐이고, 표가
   * 있으면 null이다.
   */
  flattenTables?: boolean;
};

/**
 * 블록 트리를 셀 인라인 Fragment로 바꾼다. 표가 있거나(flattenTables 꺼짐),
 * content 블록이 minBlocks(기본 1) 미만이거나, 정리 뒤 줄이 0개이면 null이다.
 * flattenTables가 켜져 있고 표가 있으면 minBlocks는 1이다. 이때 셀 하나가 줄
 * 원본 하나다. null이면 호출부는 이전 경로를 쓴다.
 */
export const buildCellHtmlInline = (
  schema: Schema,
  blocks: readonly DocumentBlock[],
  minBlocks = 1,
  options: CellHtmlInlineOptions = {},
): Fragment | null => {
  const flattenTables = options.flattenTables === true;
  const sources: LineSource[] = [];
  const stats: LineStats = { tables: 0 };
  if (!collectLines(blocks, sources, flattenTables, stats)) return null;
  if (sources.length < (stats.tables > 0 ? 1 : minBlocks)) return null;
  const hardBreak = schema.nodes.hardBreak?.create();
  if (hardBreak === undefined) return null;
  // 노드를 한 배열에 모아 Fragment를 한 번만 만든다. 줄마다 Fragment를
  // 복사하면 이차 복잡도가 된다.
  const nodes: PmNode[] = [];
  let lineCount = 0;
  for (const source of sources) {
    const line = lineToNodes(schema, source);
    if (line.length === 0) continue;
    if (lineCount > 0) nodes.push(hardBreak);
    for (const node of line) nodes.push(node);
    lineCount += 1;
  }
  return lineCount === 0 ? null : Fragment.fromArray(nodes);
};

// html을 셀 inline Fragment로 바꾼다(Issue #304, #311, #312, #316).
// importHtml이 실패하거나 buildCellHtmlInline이 null이면 null이다. 붙여넣기와
// drop이 같은 변환을 쓴다. null 조건은 content 블록 0개, 정리 뒤 줄 0개,
// 표 포함이다. 표 포함은 flattenTables가 꺼진 붙여넣기에만 해당한다.
// flattenTables는 drop만 켠다. 붙여넣기는 표를 TablePasteExtension이 먼저
// 소비한다.
export const cellInlineFromHtml = (
  schema: Schema,
  html: string,
  options?: CellHtmlInlineOptions,
): Fragment | null => {
  const imported = importHtml(html);
  if (!imported.ok) return null;
  return buildCellHtmlInline(
    schema,
    imported.value.document.blocks,
    undefined,
    options,
  );
};
