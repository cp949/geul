import { isListEntryBlockType, isNestableBlockType } from "@cp949/geul-model";
import { Extension, type Editor } from "@tiptap/core";
import {
  Fragment,
  type Node,
  type ResolvedPos,
  type Schema,
} from "@tiptap/pm/model";
import {
  NodeSelection,
  Selection,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

import { resolveSelectionAwareState } from "./selection-aware-state.js";

// blockContainer의 content model은 "blockContent blockGroup?"다(D19,
// block-container-extension.ts). PM joinBackward의 deleteBarrier는 이
// 스키마에서 두 blockContainer를 join하지 못하고(blockContent 둘 연속은
// content expression 위반) findWrapping(blockGroup) 경로로 떨어져 뒤
// 컨테이너를 앞 컨테이너의 blockGroup으로 감싼다 — 평면 문서의 블록 선두
// Backspace가 병합 대신 자식화(들여쓰기)가 되는 회귀(실측). Delete의
// joinForward도 대칭으로 뒤 블록을 자식화한다. cut 앞이 텍스트블록인
// 배치(부모→자식 병합 등)만 deleteBarrier의 마지막 분기가 우연히 맞게
// 처리하고, cut 앞이 blockContainer인 평면 형제 배치가 전부 잘못된다.
// D22(Enter/Backspace 커스텀 split/join 커맨드 도입)의 join 쪽 이행으로,
// split(block-split-extension.ts)처럼 컨테이너를 직접 재구성해 dev
// (StarterKit joinBackward/joinForward) 의미론 — 인라인 병합(대상 타입
// 유지), 자식 승격, 표 인접 시 표 선택 — 을 복원한다(spec §7.1 "빈 블록의
// `Backspace`는 앞 블록과 병합하거나 제목을 문단으로 바꾼다").
//
// Issue #38 슬라이스 3: quote(문단 동형 blockContent)가 같은 병합 규칙에
// 들어오고, divider(비포장 atom)가 인접하면 텍스트를 그 너머로 병합하지
// 않고 divider를 NodeSelection으로 선택한다 — 표 인접과 같은 "선택만"
// 전례다(아래 selectAdjacentAtom).
export const BlockJoinExtension = Extension.create({
  name: "blockJoin",
  // 표 전체 CellSelection의 두 번째 Backspace/Delete를 tableEditing보다 먼저
  // 처리한다. 이 일반 Extension은 스키마 노드가 아니므로 block 그룹의
  // defaultType 등록 순서에는 영향을 주지 않는다(G-EDT-003).
  priority: 101,

  addKeyboardShortcuts() {
    return {
      Backspace: () => joinBackwardAtBlockStart(this.editor),
      Delete: () => joinForwardAtTextEnd(this.editor),
    };
  },
});

// Backspace/Delete 공통 가드. 캐럿(collapsed)이고 $from.parent가
// paragraph/heading/quote/목록 항목(blockContainer의 blockContent 멤버,
// D19)이며 그 부모가 blockContainer일 때만 이 확장이 관여한다.
// 표 셀 배제는 split과 같은 지점이다 — 셀 content는 "inline*"라(D19)
// $from.parent가 애초에 이 다섯 타입이 될 수 없다. 범위 선택은 기본
// 체인의 deleteSelection이 정상 처리하므로 물러난다.
function caretContext(
  state: EditorState,
): { $from: ResolvedPos; containerDepth: number } | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  const parentType = $from.parent.type.name;
  if (!isNestableBlockType(parentType)) {
    return null;
  }
  const containerDepth = $from.depth - 1;
  if (containerDepth < 1) return null;
  if ($from.node(containerDepth).type.name !== "blockContainer") return null;
  return { $from, containerDepth };
}

function isListItemContent(node: Node): boolean {
  return isListEntryBlockType(node.type.name);
}

// DOM-derived selection이 해당 경계 밖이어도 live selection이 병합
// 경계에 stale하면 키를 소비한다. 폴스루하면 기본 keymap이
// live stale selection에 구조 변경을 적용한다(G-EDT-002).
function isJoinBoundary(
  state: EditorState,
  direction: "backward" | "forward",
): boolean {
  const context = caretContext(state);
  if (context === null) return false;
  return direction === "backward"
    ? context.$from.parentOffset === 0
    : context.$from.parentOffset === context.$from.parent.content.size;
}

// CodeBlock 선두 Backspace와 끝 Delete는 브라우저/StarterKit의 일반
// textblock join으로 흘려보내지 않는다. 그 경로는 인접 문단과 source를
// 병합해 CodeBlock을 강등하거나 문단을 제거한다. 여기서는 캐럿이 그
// 경계에 있는지만 판정한다 — backward는 호출부가 그대로 no-op으로 키만
// 소비한다(#202 스펙 표 "항상 무동작", 변경 없음). forward는 호출부
// (`handleCodeBlockBoundary`)가 이 판정이 true일 때 `mergeNextBlockIntoCodeBlock`로
// 다음 블록 흡수를 시도한다(#202 스펙 표 행3, RD-001-DELTA-02) — 흡수할
// 대상이 없으면 그 함수 안에서 기존과 같은 no-op으로 물러난다.
function isCodeBlockOwnBoundary(
  state: EditorState,
  direction: "backward" | "forward",
): boolean {
  const { selection } = state;
  if (!selection.empty || selection.$from.parent.type.name !== "codeBlock") {
    return false;
  }
  return direction === "backward"
    ? selection.$from.parentOffset === 0
    : selection.$from.parentOffset === selection.$from.parent.content.size;
}

// $pos 자신의 textblock부터 조상까지에 tableCell이 있는지 — 셀 content가
// "inline*"라 셀 안 커서는 $pos.parent 자체가 tableCell이다(depth 자신부터
// 검사하는 이유).
function hasTableCellAncestor($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "tableCell") return true;
  }
  return false;
}

// 표 셀 안의 커서 위치에서 table 조상 시작 위치를 구해 그 표를 직접
// NodeSelection으로 선택한다. selectNodeBackward/selectNodeForward는 캐럿
// 컨테이너의 형제를 선택하므로 중첩 표에서는 조상 blockContainer를 잘못
// 선택한다. tableEditing의 normalizeSelection이 이 dispatch를 표 전체
// CellSelection으로 정규화한다.
function selectTableAncestor(
  view: EditorView,
  state: EditorState,
  $insideTable: ResolvedPos,
): boolean {
  for (let depth = $insideTable.depth; depth > 0; depth -= 1) {
    if ($insideTable.node(depth).type.name !== "table") continue;
    view.dispatch(
      state.tr
        .setSelection(
          NodeSelection.create(state.doc, $insideTable.before(depth)),
        )
        .scrollIntoView(),
    );
    return true;
  }
  return false;
}

// 첫 인접 키가 만든 표 전체 CellSelection에서 같은 키가 다시 들어오면 표
// 노드 범위만 삭제한다. 부분 행·열·셀 선택은 tableEditing의 기존 삭제
// 계약에 맡긴다. 삭제는 단일 transaction이라 undo 한 번으로 직전 표 선택과
// 문서를 함께 복원한다(G-EDT-001).
function deleteSelectedTable(editor: Editor): boolean {
  const { state, view } = editor;
  const { selection } = state;
  if (
    !(selection instanceof CellSelection) ||
    !selection.isColSelection() ||
    !selection.isRowSelection()
  ) {
    return false;
  }
  const tableDepth = selection.$anchorCell.depth - 1;
  const table = selection.$anchorCell.node(tableDepth);
  if (table.type.name !== "table") return false;
  const tableStart = selection.$anchorCell.before(tableDepth);
  const $table = state.doc.resolve(tableStart);
  const removesWholeGroup =
    $table.parent.type.name === "blockGroup" && $table.parent.childCount === 1;
  const deleteFrom = removesWholeGroup ? $table.before() : tableStart;
  const deleteTo = removesWholeGroup
    ? $table.after()
    : tableStart + table.nodeSize;
  view.dispatch(state.tr.delete(deleteFrom, deleteTo).scrollIntoView());
  return true;
}

// 문서 순서상 pos 바로 앞에서 "시각적으로 인접한" 리프 블록 노드와 그 시작
// 위치. pos 앞에 형제가 없으면 조상으로 올라가 앞 노드를 찾고(blockGroup 첫
// 자식의 앞은 부모 컨테이너의 콘텐츠 노드), 찾은 노드가 컨테이너
// (blockContainer → blockGroup → 마지막 자식 → …)면 마지막 자손으로 내려가
// textblock이나 atom에 닿는다. 문서 최선두면 null. Selection.findFrom과
// 달리 커서 위치가 아니라 노드를 찾으므로 atom(divider)을 건너뛰지 않는다.
function leafBefore(
  doc: Node,
  pos: number,
): { node: Node; pos: number } | null {
  let $pos = doc.resolve(pos);
  while ($pos.nodeBefore === null) {
    if ($pos.depth === 0) return null;
    $pos = doc.resolve($pos.before());
  }
  let node = $pos.nodeBefore;
  let nodePos = $pos.pos - node.nodeSize;
  while (!node.isAtom && !node.isTextblock && node.lastChild !== null) {
    const last = node.lastChild;
    nodePos += node.nodeSize - 1 - last.nodeSize;
    node = last;
  }
  return { node, pos: nodePos };
}

// leafBefore의 정방향 대칭 — pos 바로 뒤의 시각적으로 인접한 리프 블록
// 노드. 캐럿 컨테이너에 blockGroup이 있으면 그 첫 자식으로, 없으면 조상으로
// 올라가 다음 형제로 가고 컨테이너면 첫 자손으로 내려간다. 문서 끝이면 null.
function leafAfter(doc: Node, pos: number): { node: Node; pos: number } | null {
  let $pos = doc.resolve(pos);
  while ($pos.nodeAfter === null) {
    if ($pos.depth === 0) return null;
    $pos = doc.resolve($pos.after());
  }
  let node = $pos.nodeAfter;
  let nodePos = $pos.pos;
  while (!node.isAtom && !node.isTextblock && node.firstChild !== null) {
    nodePos += 1;
    node = node.firstChild;
  }
  return { node, pos: nodePos };
}

// 인접 리프가 atom(divider — 이름 열거 없이 node.isAtom으로 판정)이면
// 텍스트를 그 너머로 병합하지 않고 그 노드를 NodeSelection으로 선택하는
// selection-only 트랜잭션을 dispatch하고 true를 돌려준다(doc 무변경 —
// G-EDT-001의 tr.docChanged 기준, 히스토리 항목 없음). 이어지는
// Backspace/Delete는 PM 기본 deleteSelection이 divider를 지우고 그 삭제만이
// undo 1회 단위다. 표(atom 아님)는 이 판정에 걸리지 않고 기존
// hasTableCellAncestor 경로가 그대로 맡는다.
//
// 표 전례의 selectNodeBackward/selectNodeForward(prosemirror-commands)를
// divider에 쓰지 않는 이유: 그 커맨드는 캐럿 컨테이너의 바로 앞/뒤 **형제**
// 노드를 선택하므로 divider가 앞 형제 컨테이너의 blockGroup 마지막 자식인
// 중첩 위치에서는 divider가 아니라 앞 형제 컨테이너 전체(자식 포함)가
// 선택되고, 두 번째 키가 그 컨테이너를 통째로 지우는 파괴 경로가 된다.
// 형제 인접·중첩 인접 모두 시각적으로 인접한 리프 위치에 직접
// NodeSelection을 두는 이 한 경로로 처리한다.
function selectAdjacentAtom(
  view: EditorView,
  state: EditorState,
  adjacent: { node: Node; pos: number } | null,
): boolean {
  if (adjacent === null || !adjacent.node.isAtom) return false;
  // 표 전례(selectNodeBackward·table-keyboard-extension.ts)와 일관되게
  // selection-only tr도 scrollIntoView한다.
  view.dispatch(
    state.tr
      .setSelection(NodeSelection.create(state.doc, adjacent.pos))
      .scrollIntoView(),
  );
  return true;
}

// leafBefore/leafAfter가 돌려주는 adjacent.pos는 그 leaf 노드 자신의 시작
// 위치다. blockContainer는 한 단계 바깥이다 — leafBlockContent(CodeBlock
// 등)는 blockGroup을 가질 수 없고 nestableBlockContent(paragraph 등)도
// caretContext와 같은 depth 관계라(block-container-extension.ts content
// expression, D19) 언제나 이 한 단계로 충분하다. 다만 leafAfter가 표
// 내부까지 드릴다운했을 때는(표 셀 content가 "inline*"라 tableCell
// 자체가 textblock) 이 한 단계가 blockContainer가 아니라 tableCell 등을
// 가리킬 수 있다 — 호출부가 `container.type.name`을 확인해야 한다.
function leafBlockContainerAt(
  doc: Node,
  adjacent: { node: Node; pos: number },
): { container: Node; containerStart: number } {
  const $inside = doc.resolve(adjacent.pos + 1);
  const containerDepth = $inside.depth - 1;
  return {
    container: $inside.node(containerDepth),
    containerStart: $inside.before(containerDepth),
  };
}

// Text 블록 경계에 인접한 CodeBlock을 Text에 흡수한다(#202 스펙 표
// 행1·2, RD-001-DELTA-01) — CodeBlock이 항상 소멸하는 쪽이고 Text가
// 살아남는다. CodeBlock은 marks:""라(code-block-extension.ts) 옮기는
// 인라인 콘텐츠에 애초 서식이 없어 별도 stripMarks가 필요 없다.
//
// backward(행1, Backspace)는 mergeContainers의 기존 호출부와 순서가
// 반대다 — 제거 대상(CodeBlock)이 대상(Text)보다 문서 앞이라 mergePos가
// 제거 범위보다 뒤에 있다. CodeBlock 콘텐츠는 Text 앞에 prepend되므로
// caret은 삽입된 콘텐츠 뒤(경계)에 둔다("after"). forward(행2, Delete)는
// 기존 append 방향과 같아 기본값("before")을 그대로 쓴다.
//
// adjacent(및 caret 위치 계산에 쓰는 $from)는 selection-aware derived
// state에서 구하고 dispatch는 항상 live state에서 한다(G-EDT-002) — 두
// state는 selection만 다를 뿐 같은 doc을 공유해(resolveSelectionAwareState,
// selection-only apply) 위치 숫자를 그대로 섞어 써도 안전하다.
function mergeCodeBlockIntoText(
  view: EditorView,
  liveState: EditorState,
  selectionState: EditorState,
  adjacent: { node: Node; pos: number },
  direction: "backward" | "forward",
): boolean {
  const context = caretContext(selectionState);
  if (context === null) return false;
  const { container, containerStart } = leafBlockContainerAt(
    liveState.doc,
    adjacent,
  );
  mergeContainers(view, liveState, {
    removed: container,
    removedStart: containerStart,
    mergePos: context.$from.pos,
    inline: adjacent.node.content,
    caretAt: direction === "backward" ? "after" : "before",
  });
  return true;
}

// 다음 블록의 inline 콘텐츠를 CodeBlock이 받을 수 있는 순수 텍스트로
// 평탄화한다(#202 스펙 표 행3, RD-001-DELTA-02 — mergeCodeBlockIntoText의
// 반대 방향). CodeBlock은 marks: ""라(code-block-extension.ts) 모든 mark를
// 잃고, hardBreak(inline 그룹, CodeBlock의 content: "text*"에 담길 수 없는
// 노드)는 model-to-tiptap.ts의 "\n"↔hardBreak 관례를 역으로 적용해 리터럴
// "\n" 문자로 치환한다. 그 외 inline 원소(예: 미등록 커스텀 inline)는
// 텍스트 표현이 없어 빈 문자열로 건너뛴다.
function toCodeBlockInline(schema: Schema, content: Fragment): Fragment {
  const text = content.textBetween(0, content.size, "", (leaf: Node) =>
    leaf.type.name === "hardBreak" ? "\n" : "",
  );
  return text.length > 0 ? Fragment.from(schema.text(text)) : Fragment.empty;
}

// CodeBlock 끝 Delete가 인접한 다음 블록을 CodeBlock에 흡수한다(#202 스펙
// 표 행3, RD-001-DELTA-02) — mergeCodeBlockIntoText와 반대로 CodeBlock이
// 항상 살아남는 쪽이고 다음 블록이 소멸한다. 병합 대상은 codeBlock 또는
// isNestableBlockType(paragraph/heading/quote/리스트 항목 4종)뿐이다 —
// atom(image/video/audio/file/divider)과 표는 이 판정에 걸리지 않아
// 자동으로 제외된다(atom skip-and-merge는 RD-002/003 소관, roadmap.md).
// leafAfter가 표 내부까지 드릴다운했을 때(표 셀 content가 "inline*"라
// tableCell 자체가 textblock) container가 blockContainer가 아닐 수 있어
// 그 경우도 병합하지 않는다. 두 경우 모두 false를 돌려줘 호출부가 기존
// no-op 계약(#202 "코드블록 첫 위치 Backspace는 항상 무동작"의 forward
// 대응, 변경 없음)을 그대로 유지하게 한다.
//
// 리스트 항목은 DELTA-01의 backward 2단계 규칙과 달리 특별 취급하지
// 않는다 — forward는 이미 "현재 블록(여기서는 CodeBlock)이 살아남는 쪽이라
// 타입을 유지한 채 바로 병합한다"로 결정돼 있고(RD-001.md "결정"), 그
// 대칭을 그대로 쓴다. 기존 joinForwardAtTextEnd(일반 forward join)도 다음이
// 리스트 항목이어도 특별 취급 없이 바로 병합해 온 선례와 일치한다.
//
// mergePos는 CodeBlock 자신의 끝 위치이고 삽입 방향은 기존 3개 호출부와
// 같은 "append"라 caretAt 기본값("before")을 그대로 쓴다 — 새 파라미터가
// 필요 없다.
function mergeNextBlockIntoCodeBlock(
  view: EditorView,
  liveState: EditorState,
  codeBlockFrom: ResolvedPos,
): boolean {
  const adjacent = leafAfter(codeBlockFrom.doc, codeBlockFrom.after());
  if (adjacent === null) return false;
  const isMergeable =
    adjacent.node.type.name === "codeBlock" ||
    isNestableBlockType(adjacent.node.type.name);
  if (!isMergeable) return false;

  const { container, containerStart } = leafBlockContainerAt(
    codeBlockFrom.doc,
    adjacent,
  );
  if (container.type.name !== "blockContainer") return false;

  const inline = toCodeBlockInline(
    codeBlockFrom.parent.type.schema,
    adjacent.node.content,
  );
  mergeContainers(view, liveState, {
    removed: container,
    removedStart: containerStart,
    mergePos: codeBlockFrom.pos,
    inline,
  });
  return true;
}

// 일반 text block의 해당 방향 경계가 CodeBlock과 맞닿는지 판정한다.
// selection-aware derived state와 역방향 stale live state가 같은 구조 판정을
// 공유하되, 이 함수 자체는 transaction을 만들지 않는다.
function adjacentCodeBlockAtTextBoundary(
  state: EditorState,
  direction: "backward" | "forward",
): { node: Node; pos: number } | null {
  const context = caretContext(state);
  if (context === null) return null;
  const { $from, containerDepth } = context;
  if (
    direction === "backward"
      ? $from.parentOffset !== 0
      : $from.parentOffset !== $from.parent.content.size
  ) {
    return null;
  }
  const adjacent =
    direction === "backward"
      ? leafBefore(state.doc, $from.before(containerDepth))
      : leafAfter(state.doc, $from.after());
  return adjacent?.node.type.name === "codeBlock" ? adjacent : null;
}

// native-derived selection과 다른 live selection이 Code 관련 위치라면 live
// stale fallback 자체를 막아야 한다(G-EDT-002 역방향 stale 소비 규칙).
// CodeBlock 내부 위치는 경계뿐 아니라 중간 caret도 포함한다 — 기본 keymap에
// 넘기면 native 위치가 아니라 stale source를 삭제한다.
function isLiveCodeRelatedBoundary(
  state: EditorState,
  direction: "backward" | "forward",
): boolean {
  const { selection } = state;
  if (selection.empty && selection.$from.parent.type.name === "codeBlock") {
    return true;
  }
  return adjacentCodeBlockAtTextBoundary(state, direction) !== null;
}

// DOM 기준 파생 state에서는 Code 관련 경계만 판정한다. CodeBlock 자신의
// 경계는 backward가 완전한 no-op, forward가 mergeNextBlockIntoCodeBlock
// 시도(대상이 없으면 그 안에서 다시 no-op)이고, 일반 text block→CodeBlock은
// 실제 병합을 live state의 transaction으로 적용한다. 파생 state로 document
// transaction을 만들지 않는다(G-EDT-002) — forward merge도 위치 판정은
// selectionState에서, dispatch는 항상 liveState에서 한다.
//
// 리스트 항목(backward만, 사용자 결정 2026-09-15)은 예외다 — 내용이 있어도
// CodeBlock과 바로 병합하지 않고 먼저 paragraph로 전환한다. 이어지는
// Backspace가 그 paragraph에서 다시 이 함수를 만나 이번에는 병합한다(2단계
// — divider·표의 "선택 먼저, 삭제는 다음 키" 전례와 같은 결의 안전장치).
// forward(Delete)는 대상 없이 대칭을 맞출 이유가 없다 — 현재 블록은
// 살아남는 쪽이라 리스트 항목이어도 heading·quote처럼 타입을 유지한 채
// 바로 병합한다.
function handleCodeBlockBoundary(
  editor: Editor,
  direction: "backward" | "forward",
  selectionState = resolveSelectionAwareState(editor),
): boolean {
  if (isCodeBlockOwnBoundary(selectionState, direction)) {
    if (direction === "forward") {
      mergeNextBlockIntoCodeBlock(
        editor.view,
        editor.state,
        selectionState.selection.$from,
      );
    }
    return true;
  }

  const liveState = editor.state;
  const selectionIsStale = !selectionState.selection.eq(liveState.selection);
  if (
    selectionIsStale &&
    selectionState.selection.empty &&
    selectionState.selection.$from.parent.type.name === "codeBlock"
  ) {
    return true;
  }

  const adjacent = adjacentCodeBlockAtTextBoundary(selectionState, direction);
  if (adjacent !== null) {
    if (direction === "backward") {
      const context = caretContext(selectionState);
      if (context !== null && isListItemContent(context.$from.parent)) {
        return exitListItem(editor.view, liveState, {
          contentPosition: context.$from.before(context.$from.depth),
        });
      }
    }
    return mergeCodeBlockIntoText(
      editor.view,
      editor.state,
      selectionState,
      adjacent,
      direction,
    );
  }

  return selectionIsStale && isLiveCodeRelatedBoundary(liveState, direction);
}

// 블록 선두 Backspace: 시각적으로 이전인 텍스트블록에 병합한다. 블록
// 중간(parentOffset > 0)은 기본 문자 삭제 몫이라 관여하지 않는다.
function joinBackwardAtBlockStart(editor: Editor): boolean {
  const state = resolveSelectionAwareState(editor, {
    allowNativeTextSelectionFromCellSelection: true,
  });
  const liveState = editor.state;
  const selectionIsStale = !state.selection.eq(liveState.selection);
  // 유효한 DOM-derived 일반 join이면 live stale CellSelection·CodeBlock
  // 보호보다 우선한다. 단, DOM caret의 실제 인접 대상이
  // CodeBlock이면 기존 selection-only 이동 계약을 계속 우선한다.
  const nativeJoinOverridesLive =
    selectionIsStale &&
    isJoinBoundary(state, "backward") &&
    adjacentCodeBlockAtTextBoundary(state, "backward") === null;
  // derived 위치에 일반 join이 없으면 derived CodeBlock 경계 동작만
  // 먼저 시도한 뒤 키를 소비한다. false로 폴스루하면 기본
  // keymap이 live stale CellSelection·NodeSelection을 삭제한다.
  if (selectionIsStale) {
    if (!nativeJoinOverridesLive) {
      if (handleCodeBlockBoundary(editor, "backward", state)) return true;
      return true;
    }
  } else {
    if (handleCodeBlockBoundary(editor, "backward", state)) return true;
    if (deleteSelectedTable(editor)) return true;
  }
  const context = caretContext(state);
  if (context === null) {
    return selectionIsStale && isJoinBoundary(liveState, "backward");
  }
  const { $from, containerDepth } = context;
  if ($from.parentOffset !== 0) {
    return selectionIsStale && isJoinBoundary(liveState, "backward");
  }

  const { view } = editor;
  const containerStart = $from.before(containerDepth);

  // 시각적으로 바로 앞 노드가 atom(divider)이면 병합 대신 선택으로 끝난다
  // — 아래 findFrom은 커서 위치만 찾아 atom을 건너뛰므로 먼저 판정한다.
  const adjacent = leafBefore(state.doc, containerStart);
  // 병합 대상이 없는(adjacent===null) 목록 항목은 내용 유무와 무관하게
  // 종료한다 — 병합할 데가 없어서다. 병합 대상이 있어도 항목이
  // 비어 있으면(content.size===0) 병합 대신 종료를 우선한다 — Enter의
  // "빈 목록 항목은 위치와 무관하게 paragraph로 전환한다" 규칙
  // (block-split-extension.ts splitAtCaret의 동일 분기)과 대칭을 맞춘다
  // (사용자 결정). 앞에 병합할 형제가 있다는 사실이 "보여줄 내용이
  // 없다"는 사실을 바꾸지 않는다.
  const isEmptyListItem =
    isListItemContent($from.parent) && $from.parent.content.size === 0;
  if (
    isListItemContent($from.parent) &&
    (adjacent === null || isEmptyListItem)
  ) {
    return exitListItem(view, liveState, {
      contentPosition: $from.before($from.depth),
    });
  }
  if (selectAdjacentAtom(view, liveState, adjacent)) {
    return true;
  }
  // 자기 컨테이너 시작 앞에서 역방향으로 첫 커서 위치를 찾는다 — 앞
  // 형제의 마지막 자손 텍스트블록 끝, 자식 없는 앞 형제나 부모의
  // 콘텐츠 노드 끝에 닿는다. 없으면 문서 최선두다.
  const previous = Selection.findFrom(
    state.doc.resolve(containerStart),
    -1,
    true,
  );
  if (previous === null) {
    return selectionIsStale && isJoinBoundary(liveState, "backward");
  }

  const $target = previous.$head;
  if (hasTableCellAncestor($target)) {
    // 표 안으로는 병합하지 않는다. 시각적으로 인접한 표 시작 위치에 직접
    // NodeSelection을 두면 tableEditing의 normalizeSelection이 같은 dispatch
    // 안에서 표 전체 CellSelection으로 정규화한다.
    return selectTableAncestor(view, liveState, $target);
  }

  mergeContainers(view, liveState, {
    removed: $from.node(containerDepth),
    removedStart: containerStart,
    mergePos: $target.pos,
    inline: $from.parent.content,
  });
  return true;
}

// 텍스트 끝 Delete: 시각적으로 다음인 텍스트블록을 자기 끝으로 끌어와
// 병합한다. 텍스트 중간은 기본 문자 삭제 몫이라 관여하지 않는다.
function joinForwardAtTextEnd(editor: Editor): boolean {
  const state = resolveSelectionAwareState(editor, {
    allowNativeTextSelectionFromCellSelection: true,
  });
  const liveState = editor.state;
  const selectionIsStale = !state.selection.eq(liveState.selection);
  // Backspace와 같은 우선순위 계약의 정방향 대칭이다.
  const nativeJoinOverridesLive =
    selectionIsStale &&
    isJoinBoundary(state, "forward") &&
    adjacentCodeBlockAtTextBoundary(state, "forward") === null;
  // Backspace와 같게 derived 무동작을 live stale 삭제로 폴백하지 않는다.
  if (selectionIsStale) {
    if (!nativeJoinOverridesLive) {
      if (handleCodeBlockBoundary(editor, "forward", state)) return true;
      return true;
    }
  } else {
    if (handleCodeBlockBoundary(editor, "forward", state)) return true;
    if (deleteSelectedTable(editor)) return true;
  }
  const context = caretContext(state);
  if (context === null) {
    return selectionIsStale && isJoinBoundary(liveState, "forward");
  }
  const { $from } = context;
  if ($from.parentOffset !== $from.parent.content.size) {
    return selectionIsStale && isJoinBoundary(liveState, "forward");
  }

  const { view } = editor;

  // Backspace 쪽과 대칭 — 시각적으로 바로 다음 노드(자기 blockGroup의 첫
  // 자식 또는 다음 형제)가 atom이면 선택으로 끝난다.
  const adjacent = leafAfter(state.doc, $from.after());
  if (selectAdjacentAtom(view, liveState, adjacent)) {
    return true;
  }
  // 자기 콘텐츠 노드 끝 뒤에서 정방향으로 첫 커서 위치를 찾는다 — 자기
  // 컨테이너에 자식이 있으면 첫 자식의 텍스트블록, 없으면 다음
  // 형제/조상의 다음에 닿는다. 없으면 문서 끝이다.
  const next = Selection.findFrom(state.doc.resolve($from.after()), 1, true);
  if (next === null) {
    return selectionIsStale && isJoinBoundary(liveState, "forward");
  }

  const $next = next.$head;
  if (hasTableCellAncestor($next)) {
    // Backspace 쪽과 대칭 — 표 콘텐츠를 끌어오지 않고 시각적으로 인접한
    // 표 조상 시작 위치를 직접 선택한다.
    return selectTableAncestor(view, liveState, $next);
  }

  const nextContainerDepth = $next.depth - 1;
  if (nextContainerDepth < 1) {
    return selectionIsStale && isJoinBoundary(liveState, "forward");
  }
  const nextContainer = $next.node(nextContainerDepth);
  if (nextContainer.type.name !== "blockContainer") {
    return selectionIsStale && isJoinBoundary(liveState, "forward");
  }

  mergeContainers(view, liveState, {
    removed: nextContainer,
    removedStart: $next.before(nextContainerDepth),
    mergePos: $from.pos,
    inline: $next.parent.content,
  });
  return true;
}

// 목록 항목을 그 자리에서 paragraph로 바꿔 목록을 종료한다 — 병합 대상이
// 없거나(문서 최선두) 항목이 비어 있을 때 호출부가 고른다. 컨테이너를
// 재구성하지 않아 blockId·blockGroup(children)·깊이를 그대로 보존한다.
// DOM-derived state는 판정·위치 계산에만 쓰고 문서 transaction은 유효한
// live state에서 만든다(G-EDT-002).
function exitListItem(
  view: EditorView,
  state: EditorState,
  exit: { contentPosition: number },
): boolean {
  const paragraph = state.schema.nodes.paragraph;
  if (paragraph === undefined) return false;
  const tr = state.tr;
  tr.setNodeMarkup(exit.contentPosition, paragraph);
  tr.setSelection(TextSelection.create(tr.doc, exit.contentPosition + 1));
  view.dispatch(tr);
  return true;
}

// 병합의 공통 골격. (높은 위치 먼저) 제거 대상 컨테이너 범위를 그 자식
// 컨테이너들(blockGroup content, 없으면 빈 Fragment)로 replace해 자식을 그
// 자리로 승격시키고, (낮은 위치) 제거되는 콘텐츠 노드의 인라인 content를
// 마크 보존한 채 대상 텍스트블록 끝(mergePos)에 넣는다 — 대상 노드는
// 건드리지 않으므로 heading에 병합하면 heading이 유지된다(dev joinBackward
// parity). 캐럿은 병합 접점(대상의 종전 텍스트 끝)에 둔다.
//
// 제거 대상이 blockGroup의 유일한 자식이고 승격할 자식도 없으면 그룹째
// 지운다 — 컨테이너만 지우면 빈 그룹의 "block+"를 PM이 기본 노드로 다시
// 채워 유령 빈 블록이 새 id로 나타난다(editor-controller.ts deleteBlock의
// removesWholeGroup과 같은 규칙).
//
// 대부분의 호출부에서 mergePos는 제거 범위보다 앞이다(Backspace의 대상은
// 자기보다 앞, Delete의 제거 대상은 자기 텍스트 끝보다 뒤) — 이때는 첫
// replace가 mergePos를 옮기지 않는다. CodeBlock→Text 흡수(행1,
// mergeCodeBlockIntoText backward)처럼 제거 대상이 mergePos보다 앞인
// 호출부도 있어 `tr.mapping`으로 항상 현재 tr.doc 기준 위치를 다시 구한다
// — 순서가 기존과 같으면 mapping이 항등이라 회귀가 없다.
//
// caretAt은 삽입된 inline 콘텐츠에 대해 caret을 어디에 두는지를 고른다.
// "before"(append, 기본값)는 대상 콘텐츠 끝에 붙일 때 — 재계산한 mergePos
// 자체가 이미 경계다. "after"(prepend)는 대상 콘텐츠 시작에 붙일 때 —
// 삽입한 콘텐츠 뒤가 경계라 mergePos + inline.size를 쓴다.
// replace·insert·selection을 단일 tr·단일 dispatch로 쌓아 undo 1회
// 단위를 만든다(G-EDT-001).
function mergeContainers(
  view: EditorView,
  state: EditorState,
  join: {
    removed: Node;
    removedStart: number;
    mergePos: number;
    inline: Fragment;
    caretAt?: "before" | "after";
  },
): void {
  const { removed, removedStart, mergePos, inline, caretAt = "before" } = join;
  const removedEnd = removedStart + removed.nodeSize;
  const promoted =
    removed.childCount > 1 ? removed.child(1).content : Fragment.empty;

  const $removed = state.doc.resolve(removedStart);
  const removesWholeGroup =
    promoted.size === 0 &&
    $removed.parent.type.name === "blockGroup" &&
    $removed.parent.childCount === 1;

  const tr = state.tr;
  if (removesWholeGroup) {
    tr.delete($removed.before(), $removed.after());
  } else {
    tr.replaceWith(removedStart, removedEnd, promoted);
  }
  const mappedMergePos = tr.mapping.map(mergePos);
  if (inline.size > 0) {
    tr.insert(mappedMergePos, inline);
  }
  const caretPos =
    caretAt === "after" ? mappedMergePos + inline.size : mappedMergePos;
  tr.setSelection(TextSelection.create(tr.doc, caretPos));
  view.dispatch(tr);
}
