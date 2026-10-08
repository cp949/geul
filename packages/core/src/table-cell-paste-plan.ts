// 표 셀 붙여넣기의 입력 우선순위와 선택 대체 계획을 소유한다.
// 문서는 바꾸지 않고 ClipboardPasteExtension이 실행할 계획을 반환한다.
// 표 밖 기본 붙여넣기와 drop은 paste-plan.ts가 소유한다.
import { importHtml } from "@cp949/geul-io";
import type { Fragment, Slice } from "@tiptap/pm/model";
import {
  type EditorState,
  NodeSelection,
  type Selection,
  TextSelection,
} from "@tiptap/pm/state";
import { __pastedCells, CellSelection } from "@tiptap/pm/tables";

import { buildCellHtmlInline, cellInlineFromHtml } from "./cell-html-inline.js";
import type { PasteClipboard, PastePlan } from "./paste-plan-types.js";
import {
  linesToHardBreakInline,
  normalizeLineBreaks,
  normalizePasteText,
  sanitizeSliceInlineText,
  splitPlainTextLines,
} from "./plain-text-paste.js";

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
  const inserted = cellInlineFromHtml(state.schema, html);
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
  // (Issue #308). 캐럿 경로는 한 줄이면 clipboardTextParser가 만든 캐럿 마크
  // slice를 PM이 그대로 넣어 결과가 같다(Issue #310). 여러 줄이면 그 slice가 표 밖으로 빠지므로 평문을 직접 넣는다
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
  // html이 없는 유효한 한 줄 평문은 clipboardTextParser slice를 PM이 넣는다. raw 무효
  // 문자는 정리본으로 넣는다. Tab도 셀에서는 무효라 정리본이 raw와 다르다.
  // 정리본이 비면 이벤트만 소비한다. html이 빈 slice이면 유효한 평문도
  // 아래로 내려간다.
  if (html.length === 0 && cleaned === normalizeLineBreaks(rawText)) {
    return noIntervention;
  }
  if (cleaned.length === 0) return { kind: "consume" };
  return { kind: "pasteText", text: cleaned };
};
