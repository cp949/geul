import { detectMarkdownPaste, importHtml } from "@cp949/geul-io";
import {
  type Block,
  type DocumentBlock,
  type IdFactory,
  MAX_NESTING_DEPTH,
} from "@cp949/geul-model";
import {
  type EditorState,
  NodeSelection,
  type Selection,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import { dropPoint } from "@tiptap/pm/transform";
import { Fragment, type ResolvedPos, Slice } from "@tiptap/pm/model";
import { __pastedCells, CellSelection } from "@tiptap/pm/tables";

import { buildCellHtmlInline } from "./cell-html-inline.js";
import {
  selectionIntersectsAnyCodeBlock,
  selectionStartsInCodeBlock,
} from "./code-block-mark-guard-extension.js";
import type { IframeEmbedConfig } from "./iframe-embed-config.js";
import { modelDepthAtPasteTarget } from "./indent-commands.js";
import { modelToTiptap, type TiptapJsonNode } from "./model-to-tiptap.js";
import {
  isRangeEndingAtChildrenBlockEnd,
  type PasteBlockPlacement,
  resolvePasteBlockPlacement,
} from "./paste-block-placement.js";
import {
  buildPlainMultilinePasteTransaction,
  linesToHardBreakInline,
  normalizeKeepingTabs,
  normalizeLineBreaks,
  normalizePasteText,
  sanitizeSliceInlineText,
  splitPlainTextLines,
} from "./plain-text-paste.js";

// 붙여넣기 계획(CONTEXT.md)이다. 선택과 클립보드 값으로 삽입 위치와 형태를
// 정한다. 문서를 바꾸지 않는다. 실행은 ClipboardPasteExtension이 한다
// (Issue #306). core 내부 module이고 index.ts로 내보내지 않는다(ADR 0002).
//
// 판정 순서는 계획 도입 전 handlePaste와 같다. 삽입은 PM 기본에 맡기지
// 않는다. PM 기본과 같은 삽입(insertSlice)도 실행기가 한다(Issue #306). 셀
// 안 판정은 선택 시작($from)으로 한다. 셀 안 여러 줄 평문은 PM 기본에 맡기지
// 않고 줄 사이를 hardBreak로 이어 셀 안에 직접 넣는다(Issue #299). 셀 안
// 여러 블록 html도 블록을 줄로 이어 셀 안에 직접 넣는다(Issue #304).
// CellSelection의 서식 있는 html도 같은 변환으로 첫 셀에 넣는다(Issue #308).

// 클립보드에서 읽은 값이다. plain은 PM이 이번 붙여넣기를 평문 경로로
// 만들었다는 신호다(Issue #303, transformPasted의 3번째 인자).
export type PasteClipboard = {
  html: string;
  text: string;
  plain: boolean;
};

// 블록 삽입 위치다.
// - blockBoundary: 자식 있는 블록의 끝. 블록 경계에 바로 넣는다(Issue #290).
// - afterRangeDelete: 다른 블록에서 시작해 자식 있는 블록의 끝에서 끝나는
//   범위. 먼저 지운 뒤 지운 자리의 캐럿으로 다시 판정한다(Issue #294).
// - caret: 현재 selection 자리에 넣는다. depth는 clampDepth의 시작 깊이다.
export type BlockInsertPlacement =
  | { kind: "blockBoundary"; placement: PasteBlockPlacement }
  | { kind: "afterRangeDelete" }
  | { kind: "caret"; depth: number };

// 계획 결과다. 실행기가 handlePaste·handleDrop 반환값을 정한다.
// - pass: 다른 plugin 소관이다. false. prosemirror-tables가 처리하는
//   셀 조각 slice다. CellSelection은 셋일 때만 여기 온다(Issue #308).
//   클립보드 데이터가 없다. 셀 조각 slice에 html이 없거나 서식 없이
//   붙여넣기다. 평문이 비고 html이 없거나 정리 뒤 빈 slice다.
// - delegate: PM 기본 drop에 맡긴다. false. drop 계획만 쓴다.
// - insertSlice: PM이 파싱한 slice를 PM 기본 붙여넣기와 같은 방식으로
//   넣는다. true. 파싱 결과가 없는 정적 Slice.empty면 false다(PM 기본과 같다).
// - consume: 문서를 바꾸지 않고 이벤트만 소비한다. true.
// - pasteText: 정리한 평문을 PM 평문 경로로 넣는다. true.
// - dispatch: 이미 만든 transaction을 보낸다. true.
// - insertBlocks: 블록 JSON을 넣는다. true.
export type PastePlan =
  | { kind: "pass" }
  | { kind: "delegate" }
  | { kind: "insertSlice"; slice: Slice }
  | { kind: "consume" }
  | { kind: "pasteText"; text: string }
  | { kind: "dispatch"; transaction: Transaction }
  | {
      kind: "insertBlocks";
      nodes: TiptapJsonNode[];
      placement: BlockInsertPlacement;
    };

export type DefaultPastePlanDeps = {
  createId: IdFactory;
  iframeEmbed?: IframeEmbedConfig;
};

// 이미 조립된 blockContainer JSON 배열의 절대 깊이가 MAX_NESTING_DEPTH를
// 넘지 않도록 평탄화한다(초과 지점의 blockGroup을 지우지 않고 그
// children을 부모의 형제로 승격). 옛 list-paste-fallback-extension.ts가
// 같은 정책의 clampDepth를 독립 복제해 썼지만 RD-005가 그 파일을 삭제해
// 이제 이 함수가 유일한 구현이다.
export const clampDepth = (
  nodes: TiptapJsonNode[],
  startDepth: number,
): TiptapJsonNode[] => {
  const result: TiptapJsonNode[] = [];
  for (const node of nodes) {
    if (node.type !== "blockContainer" || node.content === undefined) {
      result.push(node);
      continue;
    }
    const groupIndex = node.content.findIndex(
      (child) => child.type === "blockGroup",
    );
    const group = groupIndex === -1 ? undefined : node.content[groupIndex];
    if (group === undefined || group.content === undefined) {
      result.push(node);
      continue;
    }
    if (startDepth >= MAX_NESTING_DEPTH) {
      result.push({
        ...node,
        content: node.content.filter((child) => child.type !== "blockGroup"),
      });
      result.push(...clampDepth(group.content, startDepth));
      continue;
    }
    const clampedChildren = clampDepth(group.content, startDepth + 1);
    result.push({
      ...node,
      content: node.content.map((child, index) =>
        index === groupIndex ? { ...child, content: clampedChildren } : child,
      ),
    });
  }
  return result;
};

// 비표 블록의 id를 하위 트리 전체에서 전부 새로 발급한다(재귀). own HTML이
// 대상 문서와 같은 data-geul-block-id를 담고 있어도(RD-002가 원본 값을
// 보존한다) 그 값을 대상 문서에 재사용하지 않는다 — 표 열·행·셀 id는 R1
// 표 경로가 소유해 손대지 않는다. 코드베이스의 일반 블록 생성 명령
// (divider-commands.ts 등)과 같은 관례로 createId()를 무조건 새로
// 호출한다 — duplicateBlock류의 세션-Document 충돌 검사 allocator는
// 이 확장이 접근할 수 없는 세션 내부 상태가 필요해 재사용하지 않는다.
const reassignNonTableBlockIds = (
  blocks: readonly DocumentBlock[],
  createId: IdFactory,
): DocumentBlock[] =>
  blocks.map((block): DocumentBlock => {
    if (block.type === "table") return block;
    if (!("children" in block) || block.children === undefined) {
      return { ...block, id: createId() };
    }
    // block.children은 항상 Block[](CustomBlock은 leaf라 children 필드
    // 자체가 없다) — 재귀는 그 children에서만 도니 반환값도 실제로는 항상
    // Block[]이다(block-tree-edit.ts의 동일 근거).
    return {
      ...block,
      id: createId(),
      children: reassignNonTableBlockIds(block.children, createId) as Block[],
    };
  });

// 블록 삽입 계획을 만든다. 블록이 없으면 이벤트만 소비한다.
const planInsertBlocks = (
  state: EditorState,
  nodes: TiptapJsonNode[],
): PastePlan => {
  if (nodes.length === 0) return { kind: "consume" };
  const placement = resolvePasteBlockPlacement(state.selection);
  if (placement !== null) {
    return {
      kind: "insertBlocks",
      nodes,
      placement: { kind: "blockBoundary", placement },
    };
  }
  if (isRangeEndingAtChildrenBlockEnd(state.selection)) {
    return {
      kind: "insertBlocks",
      nodes,
      placement: { kind: "afterRangeDelete" },
    };
  }
  return {
    kind: "insertBlocks",
    nodes,
    placement: {
      kind: "caret",
      depth: modelDepthAtPasteTarget(state.selection.$from),
    },
  };
};

// 선택 시작($from)이 표 행 안인지 판정한다. 표 경계 범위는
// TableBoundaryInputExtension이 이 판정 전에 지운다(Issue #292). 남는
// TextSelection은 한 셀 안이거나 표 밖이라 시작만 봐도 된다.
const selectionStartsInTable = (state: EditorState): boolean => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.spec.tableRole === "row") return true;
  }
  return false;
};

// CellSelection 선택을 inline Fragment로 대체하는 계획이다(Issue #300,
// #308). 선택한 모든 셀의 내용을 비우고 문서 순서 첫 셀에 inserted를 넣는다.
// 셀 노드·attrs·cellId는 유지한다. prosemirror-tables 기본 경로는 셀 노드를
// 새로 만들어 cellId와 셀 attrs를 잃고, 되돌림 guard가 붙여넣기를 지운다.
// 비우기와 삽입, selection 설정은 한 transaction이다. 첫 셀의 기존 내용과
// 마크는 대체된다. 삽입 마크는 inserted의 것뿐이다.
const planCellSelectionReplace = (
  state: EditorState,
  selection: CellSelection,
  inserted: Fragment,
): PastePlan => {
  // forEachCell은 병합 셀을 한 번만 방문하고 위치 오름차순이다.
  const cells: { pos: number; size: number }[] = [];
  selection.forEachCell((node, pos) => {
    cells.push({ pos, size: node.content.size });
  });
  const first = cells[0];
  if (first === undefined) return { kind: "consume" };
  const tr = state.tr;
  // 뒤 셀부터 비우면 앞 셀 위치가 밀리지 않는다.
  for (let index = cells.length - 1; index > 0; index -= 1) {
    const { pos, size } = cells[index] ?? first;
    if (size > 0) tr.delete(pos + 1, pos + 1 + size);
  }
  tr.replaceWith(first.pos + 1, first.pos + 1 + first.size, inserted);
  tr.setSelection(TextSelection.create(tr.doc, first.pos + 1 + inserted.size));
  return {
    kind: "dispatch",
    transaction: tr
      .setMeta("paste", true)
      .setMeta("uiEvent", "paste")
      .scrollIntoView(),
  };
};

// CellSelection 평문 붙여넣기 계획이다(Issue #300). 정리본을 hardBreak로 이어
// 선택을 대체한다. 정리본이 비면 이벤트만 소비한다. 줄 경계는 캐럿·범위
// 경로와 같다. 연속 개행은 hardBreak 하나다(Issue #299). 마크는 없다.
const planCellSelectionPlainPaste = (
  state: EditorState,
  selection: CellSelection,
  rawText: string,
): PastePlan => {
  const cleaned = normalizePasteText(rawText);
  if (cleaned.length === 0) return { kind: "consume" };
  return planCellSelectionReplace(
    state,
    selection,
    linesToHardBreakInline(state.schema, splitPlainTextLines(cleaned)),
  );
};

// CellSelection 서식 있는 html 붙여넣기 계획이다(Issue #308). importHtml
// 블록을 셀 인라인으로 바꿔 선택을 대체한다. 한 블록 html도 바꾼다(최소
// 블록 수 1). 줄 안 마크는 html의 것이다. importHtml이 실패하거나 줄이
// 0개이면 평문 정책(#300)이다. 평문도 비면 이벤트만 소비한다. pass로 가지
// 않는다. PM이 파싱한 slice는 쓰지 않는다. prosemirror-tables에 맡기면
// 되돌려지고, 목록 html은 셀 조각으로 오인된다.
const planCellSelectionHtmlPaste = (
  state: EditorState,
  selection: CellSelection,
  clipboard: PasteClipboard,
): PastePlan => {
  const imported = importHtml(clipboard.html);
  const inserted = imported.ok
    ? buildCellHtmlInline(state.schema, imported.value.document.blocks, 1)
    : null;
  return inserted === null
    ? planCellSelectionPlainPaste(state, selection, clipboard.text)
    : planCellSelectionReplace(state, selection, inserted);
};

// 셀 안 여러 줄 직접 삽입 대상인지 판정한다(Issue #299). 대상은 시작과 끝이
// 같은 부모(셀의 인라인 컨텐츠)인 TextSelection과 인라인 atom NodeSelection
// 이다. 부모가 다른 범위(표 경계 범위·다른 셀에 걸친 범위)는 대상이 아니다.
// 표 경계 범위는 TableBoundaryInputExtension이 먼저 지운다(Issue #292).
const isCellInlineInsertTarget = (selection: Selection): boolean => {
  const { $from, $to } = selection;
  if (!$from.sameParent($to) || !$from.parent.inlineContent) return false;
  if (selection instanceof TextSelection) return true;
  return selection instanceof NodeSelection && selection.node.isInline;
};

// 셀 안 선택을 inline Fragment로 대체하는 계획이다(Issue #299, #304). 선택
// 대체와 삽입, 캐럿 설정은 한 transaction이다. 캐럿은 삽입 끝에 둔다. 셀
// 노드와 attrs는 건드리지 않는다.
const planCellInlineReplace = (
  state: EditorState,
  inserted: Fragment,
): PastePlan => {
  const { from, to } = state.selection;
  const tr = state.tr.replaceWith(from, to, inserted);
  tr.setSelection(TextSelection.create(tr.doc, from + inserted.size));
  return {
    kind: "dispatch",
    transaction: tr
      .setMeta("paste", true)
      .setMeta("uiEvent", "paste")
      .scrollIntoView(),
  };
};

// 셀 안 캐럿·범위의 여러 줄 평문 직접 삽입 계획이다(Issue #299). 줄 사이를
// hardBreak로 이어 선택을 대체한다. 삽입 텍스트와 hardBreak에 시작 위치
// ($from)의 마크를 입힌다.
const planCellInlineMultilinePaste = (
  state: EditorState,
  lines: readonly string[],
): PastePlan =>
  planCellInlineReplace(
    state,
    linesToHardBreakInline(state.schema, lines, state.selection.$from.marks()),
  );

// 여러 블록 html을 셀 inline Fragment로 바꾼다(Issue #304, #311). importHtml이
// 실패하거나 buildCellHtmlInline이 null이면(표 포함·content 블록 2개 미만·정리
// 뒤 줄 0개) null이다. 붙여넣기와 drop이 같은 변환을 쓴다.
const cellInlineFromHtml = (
  state: EditorState,
  html: string,
): Fragment | null => {
  const imported = importHtml(html);
  if (!imported.ok) return null;
  return buildCellHtmlInline(state.schema, imported.value.document.blocks);
};

// 셀 안 캐럿·범위의 여러 블록 html 직접 삽입 계획이다(Issue #304). 블록을
// 줄로 평탄화해 hardBreak로 이어 선택을 대체한다. 줄 안 마크는 html의 것이고
// 캐럿 마크는 입히지 않는다. 이 분기를 탈 수 없으면 null이다.
// - importHtml이 실패하면 null이다(이전 경로).
// - 표가 있거나 content 블록이 2개 미만이거나 정리 뒤 줄이 0개이면 null이다
//   (buildCellHtmlInline). 줄이 1개만 남아도 블록이 둘 이상이면 그 줄을 넣는다.
// PM이 파싱한 slice는 쓰지 않는다. 목록·`<pre>` 여러 블록은 PM이 셀 조각으로
// 오인해 되돌림 guard가 붙여넣기를 지우고, 문단 여러 개는 첫 문단만 셀에 들어간다.
const planCellHtmlInlinePaste = (
  state: EditorState,
  html: string,
): PastePlan | null => {
  const inserted = cellInlineFromHtml(state, html);
  return inserted === null ? null : planCellInlineReplace(state, inserted);
};

// 표 셀 안 붙여넣기 계획이다. 표 안이 아니면 null이다. 표 안은
// pasteHandler를 부르지 않는다(roadmap.md "제외 범위", IO-008은 표·미디어
// 붙여넣기를 대상으로 하지 않는다). 기본은 PM이 파싱한 slice를 그대로
// 넣는다(R1 계약). 넣기 전에 slice의 무효 문자를 지운다(Issue #302). 지우지
// 않으면 되돌림 guard가 붙여넣기를 통째로 지운다. 예외는 PM 파싱이 평문을
// 잃는 두 경우다. 무효 문자가 섞인 평문(Issue #297)과 빈 slice html에 딸린
// 평문(Issue #301)이다. 정리본을 평문으로 넣는다.
// - 여러 블록 html은 셀 조각 판정보다 먼저 본다(Issue #304). 캐럿·같은 셀
//   범위·인라인 atom NodeSelection에서 importHtml 블록이 표 없이 content 블록
//   2개 이상이고 정리 뒤 줄이 1개 이상이면 블록을 hardBreak로 이어 셀 안에
//   직접 넣는다. PM 기본은 문단 여러 개의 나머지를 표 밖으로 빼고, 목록·`<pre>`
//   여러 블록은 셀 조각으로 오인해 되돌려진다. 서식 없이 붙여넣기·CellSelection은
//   이 분기를 타지 않는다. importHtml 실패, content 블록 1개, 줄 0개는 아래
//   이전 경로다.
// - CellSelection의 서식 있는 html도 셀 조각 판정보다 먼저 본다(Issue
//   #308). html이 실제 내용(정리한 slice.size > 0)을 가지면 importHtml 블록을
//   셀 인라인으로 바꿔 선택을 대체한다. 한 블록 html도 포함한다. 바꿀 줄이
//   없으면 평문 정책이다. 서식 없이 붙여넣기는 이 분기를 타지 않는다.
// - 셀 조각 slice(표 안에서 복사한 셀)는 prosemirror-tables가 셀 단위로
//   넣는다.
// - CellSelection은 서식 없이 붙여넣기면 html이 있어도 평문 정리본을 넣는다.
//   html이 없거나 빈 slice이면 평문 정리본이 선택을 대체한다. 유효 평문도
//   포함한다(Issue #300). 아래 두 번째 예외의 판정과 같다.
// - html이 실제 내용(slice.size > 0)을 가지면 html만 쓴다. 평문으로
//   개입하면 셀 서식을 잃는다.
// - html이 있어도 PM 파싱 결과가 빈 slice이면 PM은 평문을 버린다.
//   공백·meta·StartFragment 주석·빈 문단이 해당한다. 평문을 넣는다.
//   무효 문자뿐인 html도 정리 뒤 빈 slice라 여기에 든다.
// - 셀 안 인라인 atom NodeSelection은 정리본이 atom을 대체한다.
// - 정리본이 여러 줄이고 선택이 직접 삽입 대상이면 줄 사이를 hardBreak로
//   이어 셀 안에 넣는다(Issue #299). PM 기본은 줄마다 문단 slice를 만들어
//   첫 줄만 셀에 넣고 나머지를 표 밖으로 빼거나 표를 쪼갠 뒤 되돌려진다.
//   서식 없이 붙여넣기는 html이 있어도 이 삽입을 쓴다. PM이 평문으로 만든
//   여러 문단 slice가 같은 방식으로 표 밖으로 빠지기 때문이다.
// - html은 서식 없이 붙여넣기 신호와 무관하게 클립보드 값을 본다. 단 위의
//   여러 줄 직접 삽입 예외가 있다.
export const planTableCellPaste = (
  state: EditorState,
  clipboard: PasteClipboard | null,
  slice: Slice,
): PastePlan | null => {
  if (!selectionStartsInTable(state)) return null;
  const { selection } = state;
  const cellSelection = selection instanceof CellSelection ? selection : null;
  // 여러 블록 html은 셀 조각 판정보다 먼저 본다(Issue #304). 목록 html이 셀
  // 조각으로 오인되어 아래 pass로 빠지기 때문이다. 서식 없이 붙여넣기는 html을
  // 읽지 않는다. CellSelection은 아래 별도 분기다(Issue #308).
  if (
    clipboard !== null &&
    !clipboard.plain &&
    clipboard.html.length > 0 &&
    cellSelection === null &&
    isCellInlineInsertTarget(selection)
  ) {
    const htmlPlan = planCellHtmlInlinePaste(state, clipboard.html);
    if (htmlPlan !== null) return htmlPlan;
  }
  // CellSelection의 서식 있는 html도 셀 조각 판정보다 먼저 본다(Issue #308).
  // 목록 html은 CellSelection 문맥에서도 셀 조각으로 판정된다. html 내용
  // 유무는 아래와 같이 정리한 slice로 본다. 빈 slice html은 아래 평문 정책
  // (#300)이 이전과 같이 받는다.
  if (
    clipboard !== null &&
    !clipboard.plain &&
    clipboard.html.length > 0 &&
    cellSelection !== null &&
    sanitizeSliceInlineText(slice).size > 0
  ) {
    return planCellSelectionHtmlPaste(state, cellSelection, clipboard);
  }
  if (__pastedCells(slice) !== null) return { kind: "pass" };
  // html 내용 유무는 정리한 slice로 판정한다. 무효 문자뿐인 html은 정리 뒤
  // 빈 slice라 평문 분기로 내려간다.
  const sanitized = sanitizeSliceInlineText(slice);
  // 평문으로 개입하지 않을 때의 계획이다. CellSelection은 prosemirror-tables에
  // 맡기고 나머지는 정리한 slice를 넣는다.
  const noIntervention: PastePlan =
    cellSelection === null
      ? { kind: "insertSlice", slice: sanitized }
      : { kind: "pass" };
  if (clipboard === null) return noIntervention;
  const { html, text: rawText } = clipboard;
  const cleaned = normalizePasteText(rawText);
  const lines = splitPlainTextLines(cleaned);
  // 여러 줄 직접 삽입 대상이다(Issue #299). CellSelection은 아래 별도 분기다.
  const inlineMultiline =
    cellSelection === null &&
    lines.length >= 2 &&
    isCellInlineInsertTarget(selection);
  // 서식 없이 붙여넣기면 PM이 평문으로 slice를 만든다. CellSelection은 그
  // slice도 prosemirror-tables에 맡기면 되돌려지므로 html을 보지 않는다
  // (Issue #300). 서식 있는 CellSelection html은 위 분기가 이미 처리했다
  // (Issue #308). 캐럿 경로는 한 줄이면 PM 평문 slice를 그대로 넣어 결과가
  // 같다. 여러 줄이면 그 slice가 표 밖으로 빠지므로 평문을 직접 넣는다
  // (Issue #299).
  const htmlWins =
    html.length > 0 &&
    sanitized.size > 0 &&
    !(cellSelection !== null && clipboard.plain) &&
    !(inlineMultiline && clipboard.plain);
  if (htmlWins) return noIntervention;
  // 평문이 비면 개입하지 않는다. 빈 slice html이면 범위만 지운다(현행
  // 유지).
  if (rawText.length === 0) return noIntervention;
  // CellSelection은 평문이 유효해도 PM 기본이 선택을 지우지 못하고 되돌려진다
  // (Issue #300). 정리본으로 선택을 대체한다.
  if (cellSelection !== null) {
    return planCellSelectionPlainPaste(state, cellSelection, rawText);
  }
  // 여러 줄은 줄 사이를 hardBreak로 이어 직접 넣는다(Issue #299). 무효 문자는
  // 이미 지운 정리본이라 pasteText를 거치지 않는다.
  if (inlineMultiline) return planCellInlineMultilinePaste(state, lines);
  // html이 없는 유효한 한 줄 평문은 PM이 파싱한 slice를 넣는다. raw 무효
  // 문자는 정리본으로 넣는다. Tab도 셀에서는 무효라 정리본이 raw와 다르다.
  // 정리본이 비면 이벤트만 소비한다. html이 빈 slice이면 유효한 평문도
  // 아래로 내려간다.
  if (html.length === 0 && cleaned === normalizeLineBreaks(rawText)) {
    return noIntervention;
  }
  if (cleaned.length === 0) return { kind: "consume" };
  return { kind: "pasteText", text: cleaned };
};

// 표 밖 붙여넣기 계획이다. pasteHandler의 defaultPasteHandler가 이 계획을
// 실행한다. host가 먼저 문서를 바꿨을 수 있어 호출 시점의 state로 만든다.
export const planDefaultPaste = (
  state: EditorState,
  clipboard: PasteClipboard | null,
  slice: Slice,
  deps: DefaultPastePlanDeps,
): PastePlan => {
  // PM이 파싱한 slice를 PM 기본 붙여넣기와 같은 방식으로 넣는다.
  const insertPmSlice: PastePlan = { kind: "insertSlice", slice };
  // 코드블록 안에서는 이 기본 처리만 손대지 않는다(Issue #198)
  // — 표·미디어와 달리 codeBlock은 pasteHandler 범위 밖이
  // 아니다(roadmap.md "제외 범위" — pasteHandler는 표·미디어만
  // 제외하고 ClipboardPasteExtension이 처리하는 own HTML/
  // Markdown/plain text 전부를 감싼다). 그래서 이 판정을
  // 표 셀처럼 pasteHandler 호출 앞에 두지 않고 이 계획에 둔다
  // — pasteHandler는 항상 정상 호출되고, pasteHandler가 없거나
  // defaultPasteHandler()로 위임할 때만 이 판정이 적용된다.
  //
  // 이 판정이 없으면 아래 html-import 분기가 clipboardData의
  // text/html을 codeBlock 렌더 구조(<pre data-geul-code-block>
  // <code>)로 오인해 importHtml로 새 codeBlock을 만들어 기존
  // codeBlock 한복판에 구조적으로 삽입해버린다. codeBlock spec의
  // code: true 덕분에 PM의 parseFromClipboard(prosemirror-view)가
  // caret이 code 안에 있으면 이미 text/html을 무시하고 text/plain
  // 만으로 순수 텍스트 slice를 만들어두므로, 여기서 그 slice를 그대로
  // 넣는다 — 별도로 "text/plain 우선" 로직을 새로
  // 만들 필요가 없다. 접힌 toggle의 숨은 codeBlock도 범위 안이면
  // 같은 분기다. 붙여넣기는 범위 전체를 바꾼다(Issue #264). 무효
  // 문자가 섞인 평문만 예외다. 아래에서 정리본을 넣는다(Issue #296).
  if (clipboard === null) return insertPmSlice;

  // 서식 없이 붙여넣기(Ctrl+Shift+V)면 text/html을 읽지 않는다(Issue
  // #303). html.length가 아래 모든 html 분기(범위 합류·html import·
  // 폴백)를 지배해 비우면 평문 경로로 내려간다. PM은 평문 텍스트가
  // 있을 때만 요청을 켠다. 평문 없는 html 단독 클립보드는 영향이
  // 없다. PM의 평문 판정은 text/plain이 비면 Text·text/uri-list를
  // 대신 쓴다. 그 값이 html과 함께 오면 이 경로도 html을 건너뛰고
  // PM 기본이 그 값을 넣는다.
  const html = clipboard.plain ? "" : clipboard.html;
  // rawText는 클립보드 값 그대로다. text는 삽입용 정규화본이다
  // (Issue #291). CR을 LF로 바꾼 뒤 무효 문자를 지운다. 감지만
  // Tab을 지우지 않는 별도 정규화본을 쓴다.
  const rawText = clipboard.text;
  const text = normalizePasteText(rawText);
  // 위임 가능 여부다(Issue #295). CR→LF 변환만 다른 유효 입력이면
  // 참이다. 무효 문자가 있으면 거짓이라 PM 기본에 맡기지 않는다.
  // PM 기본이 raw 무효 문자를 넣으면 되돌림 guard가 붙여넣기를
  // 통째로 지운다.
  const delegable = text === normalizeLineBreaks(rawText);

  // 예외 1(Issue #286): text/html이 있고 선택이 비어 있지 않고
  // 시작($from)이 codeBlock 밖이면 조기 반환하지 않고 아래
  // html-import 분기로 합류한다.
  // - insertContent는 범위를 replaceWith로 대체한다(단일
  //   transaction, 별도 삭제 단계 없음).
  // - 삽입 지점은 범위 시작($from)이다. 시작이 codeBlock 밖이라
  //   새 codeBlock을 codeBlock 한복판에 넣지 않는다.
  // - PM 기본 처리는 둘째 블록 이후를 앞 블록의 자식으로 넣고
  //   서식을 잃는다.
  // 예외 2(Issue #285): 같은 조건(범위, 시작이 codeBlock 밖)에서
  // 정규화한 평문이 여러 줄이면 아래 직접 삽입으로 합류한다.
  // PM 기본 처리는 범위 끝 뒤의 자식을 마지막 줄 블록으로 넘긴다.
  // 캐럿·시작이 codeBlock 안인 범위는 아래 분기가 먼저 거른다
  // (Issue #296). 유효한 평문은 PM 기본 처리를 유지하고 무효 문자가
  // 섞이면 정리본을 평문으로 넣는다. 시작이 밖인 범위의 유효한 한
  // 줄 평문은 위 설명 그대로 PM 기본 처리를 유지한다. 무효 문자가
  // 섞인 한 줄 평문은 위임하지 않고 아래로 내려간다(Issue #295).
  // Markdown 감지는 이 예외 대상이 아니다. html이 블록을 못 만들면
  // 아래에서 평문으로 폴백한다(Issue #287). 그때도 Markdown 감지는
  // 하지 않는다.
  // 시작이 codeBlock 안이면 문자 구간이 겹치지 않아도 이 분기로
  // 온다(Issue #298). 코드 내용 끝이나 빈 codeBlock에서 시작하는
  // 범위가 해당한다. TablePasteExtension의 물러남 판정과 같다.
  const intersectsCodeBlock =
    selectionIntersectsAnyCodeBlock(state.doc, state.selection) ||
    selectionStartsInCodeBlock(state.selection);
  if (intersectsCodeBlock) {
    // 선택이 비어 있지 않고 시작($from)의 조상에 codeBlock이 없으면 범위가
    // codeBlock 밖에서 시작한다(Issue #286). 삽입 지점이 시작 블록 쪽이라
    // HTML 삽입이 안전하다.
    const rangeStartsOutsideCodeBlock =
      !state.selection.empty && !selectionStartsInCodeBlock(state.selection);
    if (!rangeStartsOutsideCodeBlock) {
      // 캐럿·시작이 codeBlock 안이다(Issue #296). 유효한 평문은
      // PM 파싱 slice를 넣는다. PM이 codeBlock 안에서 html을 무시하고
      // 평문만 파싱한다. 무효 문자가 섞였으면 정리본을 평문으로
      // 넣는다. Tab·LF는 codeBlock 내용이라 지우지 않는다. 정리본이
      // 비면 이벤트만 소비한다. raw 무효 문자를 넣으면 되돌림 guard가
      // 붙여넣기를 통째로 지운다.
      const codeText = normalizeKeepingTabs(rawText);
      if (codeText === normalizeLineBreaks(rawText)) {
        return insertPmSlice;
      }
      if (codeText.length === 0) return { kind: "consume" };
      return { kind: "pasteText", text: codeText };
    }
    const multilinePlain = splitPlainTextLines(text).length >= 2;
    if (html.length === 0 && !multilinePlain && delegable) {
      return insertPmSlice;
    }
  }

  // html이 블록을 만들지 못했는지(Issue #287). 만들지 못하면
  // 아래 평문 분기로 낙하한다. 낙하 전에 문서를 바꾸지 않는다.
  let htmlFellBack = false;
  if (html.length > 0) {
    // TablePasteExtension이 이 확장보다 먼저 등록돼 있어(
    // production-editor-assembly.ts) 표 형태 HTML은 여기
    // 도달하지 않는다 — 이 확장 안에서 표 여부를 다시
    // 판정하지 않는다.
    // createId를 넘기지 않는다 — 이 결과의 모든 비표 블록 id는
    // 어차피 아래에서 전부 재발급되므로, importHtml 내부가 임시로
    // 발급하는 기본 id(own 마커가 없는 블록에만 해당)까지 editor의
    // createId로 낭비하지 않는다.
    const imported = importHtml(
      html,
      deps.iframeEmbed === undefined
        ? undefined
        : { iframeEmbed: deps.iframeEmbed },
    );
    if (imported.ok) {
      const document = {
        ...imported.value.document,
        blocks: reassignNonTableBlockIds(
          imported.value.document.blocks,
          deps.createId,
        ),
      };
      // 블록이 0개면 modelToTiptap이 DOCUMENT_INVALID로 거절한다.
      const encoded = modelToTiptap(document);
      if (encoded.ok) {
        return planInsertBlocks(state, encoded.value.content ?? []);
      }
    }
    // import 실패와 빈 결과는 같은 클립보드의 text/plain으로
    // 폴백한다. 위험 URL·제어문자 html은 여전히 import하지
    // 않는다. 사용자 눈에는 붙여넣기가 사라진 것이라 평문을 쓴다.
    htmlFellBack = true;
  }

  // 평문도 비면 html 분기에서 온 경우만 이벤트를 소비한다(문서
  // 불변). html이 없던 경우는 PM 파싱 slice를 넣는다. 빈 판정은
  // rawText로 한다. 제어문자만 있는 입력은 text가 비어도 아래에서
  // 이벤트를 소비한다. PM 파싱 slice에는 raw 제어문자가 남는다.
  if (rawText.length === 0) {
    return htmlFellBack ? { kind: "consume" } : insertPmSlice;
  }

  // codeBlock에 걸친 범위가 여기 닿는 경우는 html 폴백과 여러 줄
  // 평문(Issue #285)이다. Markdown 감지를 건너뛴다(spec 7.3
  // 한계 유지, #286). 여러 줄이면 직접 삽입한다. 직접 삽입을 못
  // 하면 유효한 평문 단독은 PM 파싱 slice를 넣는다. html 폴백과 무효
  // 문자가 섞인 평문은 정리본을 PM 평문 경로로 보낸다. 한 줄 html
  // 폴백은 PM 평문 경로 그대로다. 제어문자만 있으면 이벤트만
  // 소비한다(Issue #295).
  if (intersectsCodeBlock) {
    const inlineLines = splitPlainTextLines(text);
    if (inlineLines.length >= 2) {
      const transaction = buildPlainMultilinePasteTransaction(
        state,
        inlineLines,
      );
      if (transaction !== null) return { kind: "dispatch", transaction };
    }
    if (!htmlFellBack && delegable) return insertPmSlice;
    if (text.length === 0) return { kind: "consume" };
    return { kind: "pasteText", text };
  }

  // 감지 입력은 Tab을 지우지 않는다(Issue #291). Tab 외 무효 문자만
  // 지운다. 삽입 입력과 이 지점만 다르다.
  const detection = detectMarkdownPaste(normalizeKeepingTabs(rawText), {
    createId: deps.createId,
  });
  if (detection.detected) {
    const encoded = modelToTiptap(detection.document);
    if (!encoded.ok) return { kind: "consume" };
    return planInsertBlocks(state, encoded.value.content ?? []);
  }

  // 여러 줄 plain text는 Enter 분할과 같은 규칙으로 직접 배치한다
  // (Issue #284). PM 기본 처리는 줄마다 문단 slice를 만들어 캐럿
  // 블록의 기존 자식을 마지막 줄 블록으로 넘긴다. 입력은 위에서
  // 정규화한 text다 — 무효 문자 처리는 아래 분기와 같은 결과다.
  // 직접 배치할 수 없으면(NodeSelection 등) tr을 버리고 아래
  // 기존 분기로 내려간다. 코드블록에 걸친 범위는
  // 위 분기가 이미 처리했다.
  const lines = splitPlainTextLines(text);
  if (lines.length >= 2) {
    const transaction = buildPlainMultilinePasteTransaction(state, lines);
    if (transaction !== null) return { kind: "dispatch", transaction };
  }

  // 감지되지 않은 단순 plain text는 PM 파싱 slice(paragraph 분리
  // 등)를 넣는다. 하지만 model은 inline text에서 LF를 제외한 C0
  // 제어문자·DEL·짝 없는 surrogate를 금지하는데
  // (document-structure-validation.ts), PM 파싱은 그 불변식을 모르고
  // 원본 그대로 slice에 넣는다 — 문서 검증이 실패해 되돌림
  // guard(revision-guard-extension.ts)가 붙여넣기를 통째로 지운다
  // (Issue #295). guard가 없던 때는 model 검증이 뒤늦게 던지는
  // TypeError가 uncaught exception이 됐다(QA-078 회귀 발견). 원본이
  // 이미 유효하면(가장 흔한 경우) PM 파싱 slice를 그대로 넣어 기존
  // 단락 분리 동작을 안 건드리고, 무효 문자가 있을 때만 정규화한
  // 텍스트로 PM 자신의 view.pasteText를 호출한다 — 네이티브와 같은
  // 단락 분리를 유지하면서 무효 문자만 뺀다.
  //
  // html에서 폴백한 경우는 원본이 유효해도 PM 파싱 slice를 쓰지 않는다.
  // PM은 비어 있지 않은 text/html이 있으면 text/plain을 버려 평문이
  // 사라진다(Issue #287). pasteText는 html 없이 평문만 쓴다.
  //
  // CR은 무효 문자로 세지 않는다(Issue #291). CR을 LF로 바꾼 것만
  // 다르면(delegable) PM 파싱 slice를 넣는다. PM 파싱과
  // clipboardTextParser가 CR을 줄 경계로 나눈다.
  if (delegable && !htmlFellBack) return insertPmSlice;
  if (text.length === 0) return { kind: "consume" };
  return { kind: "pasteText", text };
};

// drop에서 읽은 값이다. dataTransfer가 없으면 계획에 null을 넘긴다.
export type DropInput = {
  dragging: boolean;
  hasFiles: boolean;
  html: string;
  text: string;
};

// drop slice를 정리한다. 정리할 것이 없으면 null이다. drop 위치 부모가
// codeBlock이면 PM은 평문 텍스트 노드 하나로 slice를 만든다. Tab·LF는 코드
// 내용이라 남긴다(Issue #296과 같은 규칙).
const sanitizeDropSlice = (slice: Slice, inCode: boolean): Slice | null => {
  if (!inCode) {
    const sanitized = sanitizeSliceInlineText(slice);
    return sanitized === slice ? null : sanitized;
  }
  const text = slice.content.textBetween(0, slice.content.size);
  const cleaned = normalizeKeepingTabs(text);
  if (cleaned === text) return null;
  if (cleaned.length === 0) return Slice.empty;
  const textNode = slice.content.firstChild;
  if (textNode === null) return null;
  return new Slice(Fragment.from(textNode.type.schema.text(cleaned)), 0, 0);
};

// PM 기본 drop의 이동 없는 삽입(prosemirror-view 1.42.3 handleDrop)과 같은
// transaction을 만든다. 문서가 바뀌지 않으면 null이다. selection은 단일
// 선택 가능 노드면 NodeSelection, 아니면 삽입 범위다.
const buildDropSliceTransaction = (
  state: EditorState,
  position: number,
  slice: Slice,
): Transaction | null => {
  const insertAt = dropPoint(state.doc, position, slice) ?? position;
  const tr = state.tr;
  const node =
    slice.openStart === 0 &&
    slice.openEnd === 0 &&
    slice.content.childCount === 1
      ? slice.content.firstChild
      : null;
  const before = tr.doc;
  if (node === null) tr.replaceRange(insertAt, insertAt, slice);
  else tr.replaceRangeWith(insertAt, insertAt, node);
  if (tr.doc.eq(before)) return null;
  const $insert = tr.doc.resolve(insertAt);
  if (
    node !== null &&
    NodeSelection.isSelectable(node) &&
    $insert.nodeAfter?.sameMarkup(node) === true
  ) {
    return tr
      .setSelection(new NodeSelection($insert))
      .setMeta("uiEvent", "drop");
  }
  let end = tr.mapping.map(insertAt);
  tr.mapping.maps[tr.mapping.maps.length - 1]?.forEach(
    (_from, _to, _newFrom, newTo) => {
      end = newTo;
    },
  );
  return tr
    .setSelection(TextSelection.between($insert, tr.doc.resolve(end)))
    .setMeta("uiEvent", "drop");
};

// 위치의 부모가 셀의 인라인 컨텐츠인지 본다. 표 경계(부모가 행)·셀 밖·atom·블록
// 사이는 아니다.
const isCellInlinePosition = ($position: ResolvedPos): boolean =>
  $position.parent.type.name === "tableCell" && $position.parent.inlineContent;

// 셀 위 위치에 inline Fragment를 넣는 drop transaction이다(Issue #309, #311).
// 호출부가 위치의 부모가 셀의 인라인 컨텐츠임을 확인한다(isCellInlinePosition).
// Fragment를 위치에 넣고 삽입 범위를 선택한다. 줄 변환과 마크는 호출부 몫이다.
// drop은 현재 selection을 지우지 않는다. 삽입 위치는 선택과 무관하다.
const buildCellInlineDropTransaction = (
  state: EditorState,
  inserted: Fragment,
  position: number,
): Transaction => {
  const tr = state.tr.insert(position, inserted);
  return tr
    .setSelection(
      TextSelection.create(tr.doc, position, position + inserted.size),
    )
    .setMeta("uiEvent", "drop");
};

// drop 계획이다(Issue #285, #306, #309, #311). PM이 drop 위치 기준으로 파싱한
// slice를 받는다. 아래 입력은 PM 기본(또는 미디어 확장)에 맡긴다.
// - 내부 드래그(view.dragging). 이동은 PM 비공개 드래그 상태에 기댄다.
// - 파일 동반
// - 정리할 무효 문자가 없는 slice. 유효한 외부 drop은 PM 기본 drop 그대로다.
// - 좌표를 못 푸는 위치
// 여러 줄 text/plain(html 없음)은 drop 위치에 Enter 분할과 같은 규칙으로 직접
// 삽입한다(Issue #285). PM 기본 drop은 줄마다 문단 slice를 만들어 drop 위치
// 블록의 기존 자식을 마지막 줄 블록으로 넘긴다. 표 셀 위 위치는 블록을 나눌
// 수 없어 줄 사이를 hardBreak로 이어 셀 안에 넣는다(Issue #309). 줄을 놓을 수
// 없는 위치(표 경계·atom·블록 사이)는 아래 정리 분기로 내려간다.
// 셀 위 위치의 여러 블록 text/html도 블록 사이를 hardBreak로 이어 셀 안에
// 넣는다(Issue #311). 같은 위치 캐럿 붙여넣기(#304)와 문서가 같다. PM 기본
// drop은 문단 여러 개의 나머지를 표 뒤로 빼고, 목록 여러 항목은 셀 조각으로
// 오인해 되돌림 guard가 drop을 지웠다. 위치가 셀의 인라인 컨텐츠일 때만
// importHtml을 부른다. 줄 안 마크는 html의 것이고 위치의 마크는 입히지 않는다.
// 한 블록 html, 표 포함 html, importHtml 실패와 셀이 아닌 위치는 아래 정리
// 분기로 내려간다.
// 무효 문자가 든 slice는 정리본을 PM 기본 drop과 같은 방식으로 넣는다(Issue
// #306). PM 기본 drop은 원문 그대로 넣어 되돌림 guard가 drop을 통째로 지웠다.
// 판정은 live state로 한다(G-EDT-002). drop은 현재 selection을 지우지
// 않는다. 삽입 범위를 선택한다. paste meta는 달지 않고 uiEvent만 단다.
// resolvePosition은 필요할 때만 한 번 부른다. 좌표 해석(posAtCoords)은
// 레이아웃이 필요하다. 여러 줄 평문과 text/html drop은 위치가 필요해 항상
// 부른다(Issue #311). 그 밖의 입력은 정리 후보가 있을 때만 부른다.
export const planDrop = (
  state: EditorState,
  drop: DropInput | null,
  slice: Slice,
  resolvePosition: () => number | null,
): PastePlan => {
  if (drop === null || drop.dragging || drop.hasFiles) {
    return { kind: "delegate" };
  }
  let resolved: { position: number | null } | null = null;
  const position = (): number | null => {
    resolved ??= { position: resolvePosition() };
    return resolved.position;
  };

  if (drop.html.length > 0) {
    const at = position();
    if (at !== null && isCellInlinePosition(state.doc.resolve(at))) {
      // 셀 위 위치만 importHtml을 부른다. null이면 아래 정리 분기로 내려간다.
      const inserted = cellInlineFromHtml(state, drop.html);
      if (inserted !== null) {
        return {
          kind: "dispatch",
          transaction: buildCellInlineDropTransaction(state, inserted, at),
        };
      }
    }
  } else {
    const lines = splitPlainTextLines(normalizePasteText(drop.text));
    if (lines.length >= 2) {
      const at = position();
      if (at === null) return { kind: "delegate" };
      // 셀 위 위치는 블록을 나눌 수 없다. 줄 사이를 hardBreak로 이어 셀 안에
      // 넣는다(Issue #309). 같은 위치 캐럿 붙여넣기(#299)와 문서가 같다. 마크는
      // 위치의 $pos.marks()다.
      const $at = state.doc.resolve(at);
      if (isCellInlinePosition($at)) {
        return {
          kind: "dispatch",
          transaction: buildCellInlineDropTransaction(
            state,
            linesToHardBreakInline(state.schema, lines, $at.marks()),
            at,
          ),
        };
      }
      const transaction = buildPlainMultilinePasteTransaction(state, lines, {
        position: at,
      });
      if (transaction !== null) {
        transaction
          .setSelection(
            TextSelection.create(
              transaction.doc,
              at,
              transaction.selection.from,
            ),
          )
          .setMeta("uiEvent", "drop");
        return { kind: "dispatch", transaction };
      }
    }
  }

  // 정리 후보가 없으면 좌표를 더 풀지 않는다(html drop은 위에서 이미 풀었다).
  // codeBlock 안 Tab은 후보지만 아래에서 유효로 판정된다.
  if (slice.size === 0 || sanitizeSliceInlineText(slice) === slice) {
    return { kind: "delegate" };
  }
  const at = position();
  if (at === null) return { kind: "delegate" };
  const inCode = state.doc.resolve(at).parent.type.spec.code === true;
  const sanitized = sanitizeDropSlice(slice, inCode);
  if (sanitized === null) return { kind: "delegate" };
  if (sanitized.size === 0) return { kind: "consume" };
  const transaction = buildDropSliceTransaction(state, at, sanitized);
  return transaction === null
    ? { kind: "consume" }
    : { kind: "dispatch", transaction };
};
