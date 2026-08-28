import { Extension, type Editor } from "@tiptap/core";
import { selectNodeBackward, selectNodeForward } from "@tiptap/pm/commands";
import { Fragment, type Node, type ResolvedPos } from "@tiptap/pm/model";
import { Selection, TextSelection, type EditorState } from "@tiptap/pm/state";
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
export const BlockJoinExtension = Extension.create({
  name: "blockJoin",

  addKeyboardShortcuts() {
    return {
      Backspace: () => joinBackwardAtBlockStart(this.editor),
      Delete: () => joinForwardAtTextEnd(this.editor),
    };
  },
});

// Backspace/Delete 공통 가드. 캐럿(collapsed)이고 $from.parent가
// paragraph/heading이며 그 부모가 blockContainer일 때만 이 확장이 관여한다.
// 표 셀 배제는 split과 같은 지점이다 — 셀 content는 "inline*"라(D19)
// $from.parent가 애초에 paragraph/heading이 될 수 없다. 범위 선택은 기본
// 체인의 deleteSelection이 정상 처리하므로 물러난다.
function caretContext(
  editor: Editor,
): { $from: ResolvedPos; containerDepth: number } | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const { $from } = selection;
  const parentType = $from.parent.type.name;
  if (parentType !== "paragraph" && parentType !== "heading") return null;
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

// 블록 선두 Backspace: 시각적으로 이전인 텍스트블록에 병합한다. 블록
// 중간(parentOffset > 0)은 기본 문자 삭제 몫이라 관여하지 않는다.
function joinBackwardAtBlockStart(editor: Editor): boolean {
  const context = caretContext(editor);
  if (context === null) return false;
  const { $from, containerDepth } = context;
  if ($from.parentOffset !== 0) return false;

  const { state, view } = editor;
  const containerStart = $from.before(containerDepth);

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
    // 표 안으로는 병합하지 않는다 — dev(joinBackward 실패 후
    // selectNodeBackward)처럼 표를 NodeSelection으로 선택하고 그 반환값을
    // 반환한다. view를 넘기지 않아 관여 판정이 endOfTextblock(DOM 측정)
    // 대신 순수 parentOffset 검사로 떨어진다 — 위에서 이미
    // parentOffset === 0을 확인했다. (이 NodeSelection은 tableEditing의
    // normalizeSelection이 같은 dispatch에서 표 전체 CellSelection으로
    // 정규화한다 — table-extension.ts의 allowTableNodeSelection: false.)
    return selectNodeBackward(state, view.dispatch);
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
  const context = caretContext(editor);
  if (context === null) return false;
  const { $from } = context;
  if ($from.parentOffset !== $from.parent.content.size) return false;

  const { state, view } = editor;

  // 자기 콘텐츠 노드 끝 뒤에서 정방향으로 첫 커서 위치를 찾는다 — 자기
  // 컨테이너에 자식이 있으면 첫 자식의 텍스트블록, 없으면 다음
  // 형제/조상의 다음에 닿는다. 없으면 문서 끝이다.
  const next = Selection.findFrom(state.doc.resolve($from.after()), 1, true);
  if (next === null) return false;

  const $next = next.$head;
  if (hasTableCellAncestor($next)) {
    // Backspace 쪽과 대칭 — 표 콘텐츠를 끌어오지 않고 표를
    // NodeSelection으로 선택한다(view 생략 이유도 동일: 위에서 텍스트 끝을
    // 이미 확인했다).
    return selectNodeForward(state, view.dispatch);
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
