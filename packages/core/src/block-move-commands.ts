import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

import { findBlockPosition } from "./block-position.js";

export type MoveDirection = "up" | "down";

// moveBlockBefore(generic-block-commands.ts)는 임의 부모 사이 이동을
// 지원하려고 자기 자손 이동 거절(D2)·깊이 사전 판정(D3, MAX_NESTING_DEPTH)을
// 갖는다 — 같은 형제 배열 안 한 칸 이동은 부모·깊이가 항상 그대로라 두
// 가드 모두 구조적으로 성립하지 않는다(형제는 정의상 서로의 자손이 될 수
// 없고, 같은 부모 안 재배치는 깊이를 바꾸지 않는다). 그래서 그 커맨드를
// 재사용하지 않고 순수 PM 위치 계산만으로 인접 형제 교환을 구현한다
// (RD-004.md "결정" (b)). moveBlockBefore·deleteBlock과 달리 session이
// 아니라 editor만 받는다 — 키보드 shortcut 확장은 session에 접근할 수
// 없다(RD-001이 setBlockType에서 겪은 것과 같은 제약, block-type-commands.ts
// 선례).
export const moveBlockAdjacent = (
  editor: Editor,
  blockId: string,
  direction: MoveDirection,
): boolean => {
  const { state } = editor;
  const sourceStart = findBlockPosition(state.doc, blockId);
  if (sourceStart === null) return false;
  const sourceNode = state.doc.nodeAt(sourceStart);
  if (sourceNode === null) return false;

  const $source = state.doc.resolve(sourceStart);
  const parent = $source.parent;
  const index = $source.index();
  const siblingIndex = direction === "up" ? index - 1 : index + 1;
  if (siblingIndex < 0 || siblingIndex >= parent.childCount) return false;

  const siblingNode = parent.child(siblingIndex);
  const siblingStart =
    direction === "up"
      ? sourceStart - siblingNode.nodeSize
      : sourceStart + sourceNode.nodeSize;

  const rangeStart = direction === "up" ? siblingStart : sourceStart;
  const rangeEnd =
    direction === "up"
      ? sourceStart + sourceNode.nodeSize
      : siblingStart + siblingNode.nodeSize;
  const replacement =
    direction === "up"
      ? Fragment.from([sourceNode, siblingNode])
      : Fragment.from([siblingNode, sourceNode]);

  // 캐럿을 이동한 블록 안 같은 상대 위치로 유지한다. tr.mapping.map은 여기
  // 안 맞다 — replaceWith가 [rangeStart, rangeEnd) 전체(두 블록 다)를
  // 지우고 다시 넣는 step 하나라 원래 캐럿이 그 삭제 범위 안이었으므로
  // 매핑이 "어느 새 위치로 옮겨간 콘텐츠인지" 추적하지 못하고 경계로
  // 스냅한다(실측). source 노드는 통째로 재배치됐을 뿐 내부는 안 바뀌므로
  // sourceStart 기준 상대 오프셋을 새 sourceStart(direction에 따라
  // rangeStart 또는 rangeStart + siblingNode.nodeSize)에 그대로 더한다.
  const caretOffset = state.selection.from - sourceStart;
  const newSourceStart =
    direction === "up" ? rangeStart : rangeStart + siblingNode.nodeSize;

  const tr = closeHistory(state.tr).replaceWith(
    rangeStart,
    rangeEnd,
    replacement,
  );
  tr.setSelection(
    TextSelection.near(tr.doc.resolve(newSourceStart + caretOffset)),
  );

  editor.view.dispatch(tr.scrollIntoView());
  return true;
};

// moveSelectedBlocksBefore(generic-block-commands.ts)도 session bound
// (model tree resolveBlockSelectionRange·findBlockInTree)라 재사용하지
// 않는다 — 위 moveBlockAdjacent와 같은 이유(RD-004.md "결정" (b)). 그
// 커맨드의 계약(같은 형제 배열이 아니면 거절, startIndex/endIndex는
// from·to 인덱스의 min/max)을 PM ResolvedPos.index()로 재현한다. 범위는
// blockId를 안 바꾸므로(moveSelectedBlocksBefore 자신의 계약과 동일)
// session.setBlockSelection을 다시 부를 필요가 없다 — 이 함수는 PM
// selection도 건드리지 않는다(block 선택은 PM Selection과 독립된 별도
// 상태라 여기서 다룰 것이 없다).
export const moveBlockRangeAdjacent = (
  editor: Editor,
  fromBlockId: string,
  toBlockId: string,
  direction: MoveDirection,
): boolean => {
  const { state } = editor;
  const fromStart = findBlockPosition(state.doc, fromBlockId);
  const toStart = findBlockPosition(state.doc, toBlockId);
  if (fromStart === null || toStart === null) return false;

  const $from = state.doc.resolve(fromStart);
  const $to = state.doc.resolve(toStart);
  if ($from.parent !== $to.parent) return false;
  const parent = $from.parent;

  const fromIndex = $from.index();
  const toIndex = $to.index();
  const startIndex = Math.min(fromIndex, toIndex);
  const endIndex = Math.max(fromIndex, toIndex);

  const siblingIndex = direction === "up" ? startIndex - 1 : endIndex + 1;
  if (siblingIndex < 0 || siblingIndex >= parent.childCount) return false;

  const rangeStart = fromIndex <= toIndex ? fromStart : toStart;
  const lastNodeStart = fromIndex >= toIndex ? fromStart : toStart;
  const lastNode = state.doc.nodeAt(lastNodeStart);
  if (lastNode === null) return false;
  const rangeEnd = lastNodeStart + lastNode.nodeSize;
  // moveSelectedBlocksBefore의 sourceSlice와 같은 패턴 — 범위 경계가 항상
  // 형제 노드 경계와 정확히 맞아 openStart/openEnd 0인 완전한 Fragment다.
  const rangeFragment = state.doc.slice(rangeStart, rangeEnd).content;

  const siblingNode = parent.child(siblingIndex);
  const replaceFrom =
    direction === "up" ? rangeStart - siblingNode.nodeSize : rangeStart;
  const replaceTo =
    direction === "up" ? rangeEnd : rangeEnd + siblingNode.nodeSize;
  const replacement =
    direction === "up"
      ? rangeFragment.append(Fragment.from(siblingNode))
      : Fragment.from(siblingNode).append(rangeFragment);

  const tr = closeHistory(state.tr).replaceWith(
    replaceFrom,
    replaceTo,
    replacement,
  );
  editor.view.dispatch(tr.scrollIntoView());
  return true;
};
