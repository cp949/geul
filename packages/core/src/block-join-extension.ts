import { Extension, type Editor } from "@tiptap/core";
import { Fragment, type Node, type ResolvedPos } from "@tiptap/pm/model";
import {
  NodeSelection,
  Selection,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

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
// paragraph/heading/quote(blockContainer의 blockContent 멤버, D19)이며 그
// 부모가 blockContainer일 때만 이 확장이 관여한다. 표 셀 배제는 split과
// 같은 지점이다 — 셀 content는 "inline*"라(D19) $from.parent가 애초에
// 이 셋이 될 수 없다. 범위 선택은 기본 체인의 deleteSelection이 정상
// 처리하므로 물러난다.
function caretContext(
  editor: Editor,
): { $from: ResolvedPos; containerDepth: number } | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const { $from } = selection;
  const parentType = $from.parent.type.name;
  if (
    parentType !== "paragraph" &&
    parentType !== "heading" &&
    parentType !== "quote"
  ) {
    return null;
  }
  const containerDepth = $from.depth - 1;
  if (containerDepth < 1) return null;
  if ($from.node(containerDepth).type.name !== "blockContainer") return null;
  return { $from, containerDepth };
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

// 블록 선두 Backspace: 시각적으로 이전인 텍스트블록에 병합한다. 블록
// 중간(parentOffset > 0)은 기본 문자 삭제 몫이라 관여하지 않는다.
function joinBackwardAtBlockStart(editor: Editor): boolean {
  if (deleteSelectedTable(editor)) return true;
  const context = caretContext(editor);
  if (context === null) return false;
  const { $from, containerDepth } = context;
  if ($from.parentOffset !== 0) return false;

  const { state, view } = editor;
  const containerStart = $from.before(containerDepth);

  // 시각적으로 바로 앞 노드가 atom(divider)이면 병합 대신 선택으로 끝난다
  // — 아래 findFrom은 커서 위치만 찾아 atom을 건너뛰므로 먼저 판정한다.
  if (selectAdjacentAtom(view, state, leafBefore(state.doc, containerStart))) {
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
  if (previous === null) return false;

  const $target = previous.$head;
  if (hasTableCellAncestor($target)) {
    // 표 안으로는 병합하지 않는다. 시각적으로 인접한 표 시작 위치에 직접
    // NodeSelection을 두면 tableEditing의 normalizeSelection이 같은 dispatch
    // 안에서 표 전체 CellSelection으로 정규화한다.
    return selectTableAncestor(view, state, $target);
  }

  mergeContainers(view, state, {
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
  if (deleteSelectedTable(editor)) return true;
  const context = caretContext(editor);
  if (context === null) return false;
  const { $from } = context;
  if ($from.parentOffset !== $from.parent.content.size) return false;

  const { state, view } = editor;

  // Backspace 쪽과 대칭 — 시각적으로 바로 다음 노드(자기 blockGroup의 첫
  // 자식 또는 다음 형제)가 atom이면 선택으로 끝난다.
  if (selectAdjacentAtom(view, state, leafAfter(state.doc, $from.after()))) {
    return true;
  }

  // 자기 콘텐츠 노드 끝 뒤에서 정방향으로 첫 커서 위치를 찾는다 — 자기
  // 컨테이너에 자식이 있으면 첫 자식의 텍스트블록, 없으면 다음
  // 형제/조상의 다음에 닿는다. 없으면 문서 끝이다.
  const next = Selection.findFrom(state.doc.resolve($from.after()), 1, true);
  if (next === null) return false;

  const $next = next.$head;
  if (hasTableCellAncestor($next)) {
    // Backspace 쪽과 대칭 — 표 콘텐츠를 끌어오지 않고 시각적으로 인접한
    // 표 조상 시작 위치를 직접 선택한다.
    return selectTableAncestor(view, state, $next);
  }

  const nextContainerDepth = $next.depth - 1;
  if (nextContainerDepth < 1) return false;
  const nextContainer = $next.node(nextContainerDepth);
  if (nextContainer.type.name !== "blockContainer") return false;

  mergeContainers(view, state, {
    removed: nextContainer,
    removedStart: $next.before(nextContainerDepth),
    mergePos: $from.pos,
    inline: $next.parent.content,
  });
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
// 모든 위치는 원본 doc 기준이다 — mergePos는 항상 제거 범위보다 앞이라
// (Backspace의 대상은 자기보다 앞, Delete의 제거 대상은 자기 텍스트 끝보다
// 뒤) 첫 replace의 영향을 받지 않는다. replace·insert·selection을 단일
// tr·단일 dispatch로 쌓아 undo 1회 단위를 만든다(G-EDT-001).
function mergeContainers(
  view: EditorView,
  state: EditorState,
  join: {
    removed: Node;
    removedStart: number;
    mergePos: number;
    inline: Fragment;
  },
): void {
  const { removed, removedStart, mergePos, inline } = join;
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
  if (inline.size > 0) {
    tr.insert(mergePos, inline);
  }
  tr.setSelection(TextSelection.create(tr.doc, mergePos));
  view.dispatch(tr);
}
