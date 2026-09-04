import { MAX_NESTING_DEPTH, type Result } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import {
  Fragment,
  type Node as ProseMirrorNode,
  type ResolvedPos,
} from "@tiptap/pm/model";
import { TextSelection, type Transaction } from "@tiptap/pm/state";

import { findBlockPosition } from "./block-position.js";
import type { EditorError } from "./errors.js";

// D2: 신규 EditorError 코드를 만들지 않는다 — 이 파일의 모든 실패는
// BLOCK_NOT_FOUND 또는 COMMAND_NOT_APPLICABLE로만 수렴한다.
const blockNotFound = (blockId: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "BLOCK_NOT_FOUND", blockId },
});

const commandNotApplicable = (command: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

// $pos(대상 노드 바로 앞 경계)를 담은 조상 체인에서 blockContainer 개수를
// 세어 모델 깊이(top-level=1, model/schema.ts의 정의와 동일)를 구한다.
// PM depth가 레벨마다 2씩(컨테이너+blockGroup) 증가하는 패턴에 기대는 대신
// 조상 각각의 타입을 직접 확인한다 — 스키마가 바뀌어도 이 계산은 깨지지
// 않는다.
export const modelDepthAt = ($pos: ResolvedPos): number => {
  let depth = 1;
  for (let d = 0; d <= $pos.depth; d += 1) {
    if ($pos.node(d).type.name === "blockContainer") depth += 1;
  }
  return depth;
};

// ClipboardPasteExtension의 handlePaste가 넘기는
// view.state.selection.$from은 두 가지 서로 다른 위치 종류일 수 있다 —
// modelDepthAt에 그대로 넘기면 그중 하나에서만 맞는 값이 나온다(qq-workflow
// 단계-3 결함 탐지 F1). 이 함수가 위치 종류를 스스로 판별해 맞는 계산을
// 고른다:
//
// (1) 콘텐츠 노드 내부(캐럿, TextSelection.$from) — $pos.parent가
// paragraph·heading·quote·listItem·codeBlock 등 blockContainer의 content
// 자식이다. 이 조상 체인은 캐럿이 속한 blockContainer 자신도 포함한다 —
// 모든 텍스트/캐럿 보유 콘텐츠 노드는 정확히 하나의 blockContainer 직계
// 자식이라는 현재 스키마 불변식 때문이다(isNestableBlockContainer가
// 기대는 것과 같은 "content node는 blockContainer의 child(0)" 구조).
// modelDepthAt을 그대로 쓰면 이 blockContainer 1개가 이중으로 잡혀
// 실제보다 1 크게 나온다 — 그 초과분 1만 제외한다.
//
// (2) block-level 형제 사이 경계(NodeSelection.$anchor·GapCursor 등) —
// $pos.parent.type.name이 "blockGroup"이거나 $pos.depth === 0(부모가
// doc)이다. divider(divider-extension.ts)·table(table-extension.ts)은
// "표(table-extension.ts)와 동형"이라는 divider-extension.ts 상단 주석대로
// blockContainer로 감싸이지 않는 atom/노드이고, blockGroup 또는 doc의
// "block+" content에 blockContainer와 나란히 직계 자식으로 들어간다.
// BlockJoinExtension.selectAdjacentAtom(block-join-extension.ts)이
// divider 인접 Backspace/Delete에서 만드는 NodeSelection이 정확히 이
// 위치를 $anchor로 쓴다 — 이 위치는 modelDepthAt이 원래 전제하는 "대상
// 노드 바로 앞 경계" 계약과 정확히 일치하므로 보정 없이 modelDepthAt을
// 그대로 쓴다.
//
// 이름을 "Caret"이 아니라 "PasteTarget"으로 둔 이유: 이 함수는 이제
// TextSelection의 캐럿뿐 아니라 NodeSelection·GapCursor 같은 경계 위치도
// 올바르게 처리해야 한다 — "Caret"만으로는 그 두 번째 경로를 부정확하게
// 암시한다. 실제 소비자(clipboard-paste-extension.ts의 handlePaste)가 이
// 함수를 붙여넣기 대상 위치 계산에만 쓴다는 사실을 그대로 반영한다.
export const modelDepthAtPasteTarget = ($pos: ResolvedPos): number => {
  const isBlockLevelBoundary =
    $pos.depth === 0 || $pos.parent.type.name === "blockGroup";
  return isBlockLevelBoundary ? modelDepthAt($pos) : modelDepthAt($pos) - 1;
};

// target 노드 자신의 하위 트리 높이(자식이 없으면 0). blockContainer가
// 아니면(table) 애초에 blockGroup 자식을 가질 스키마 경로가 없어 항상 0이다
// (D19 — 표는 children 불가).
const subtreeHeight = (node: ProseMirrorNode): number => {
  if (node.type.name !== "blockContainer" || node.childCount < 2) return 0;
  const group = node.child(1);
  let max = 0;
  group.forEach((child) => {
    const height = 1 + subtreeHeight(child);
    if (height > max) max = height;
  });
  return max;
};

type BlockNestingActionState = {
  canIndent: boolean;
  canOutdent: boolean;
};

// blockContainer의 첫 content node가 schema의 nestable group에 속할 때만
// 자식 부모로 쓸 수 있다. container 이름만 보면 leafBlockContent인
// CodeBlock도 부모 후보가 되어 거절 transaction이 dispatch된다(G-EDT-003).
const isNestableBlockContainer = (node: ProseMirrorNode): boolean =>
  node.type.name === "blockContainer" &&
  node.childCount > 0 &&
  node.child(0).type.isInGroup("nestableBlockContent");

// 명령 실행 없이 blockId의 중첩 action 가능 여부를 판정한다. 실제 명령과
// EditorController 공개 query가 이 함수 하나를 공유해 Tab·버튼의 구조 조건이
// 갈리지 않게 한다.
export const getBlockNestingActionState = (
  doc: ProseMirrorNode,
  blockId: string,
): BlockNestingActionState => {
  const targetPosition = findBlockPosition(doc, blockId);
  if (targetPosition === null) {
    return { canIndent: false, canOutdent: false };
  }
  const targetNode = doc.nodeAt(targetPosition);
  if (targetNode === null) {
    return { canIndent: false, canOutdent: false };
  }

  const $target = doc.resolve(targetPosition);
  const previousSibling = $target.nodeBefore;
  const canIndent =
    previousSibling !== null &&
    isNestableBlockContainer(previousSibling) &&
    typeof previousSibling.attrs.blockId === "string" &&
    previousSibling.attrs.blockId.length > 0 &&
    modelDepthAt($target) + 1 + subtreeHeight(targetNode) <= MAX_NESTING_DEPTH;

  return { canIndent, canOutdent: $target.depth > 0 };
};

type TextSelectionBookmark = {
  anchorOffset: number;
  headOffset: number;
};

// 이동 대상 내부의 비축약 텍스트 선택만 상대 오프셋과 방향을 보존한다.
// collapsed selection·NodeSelection·대상 밖 선택은 기존 캐럿 배치 계약을 쓴다.
const captureTextSelection = (
  editor: Editor,
  targetPosition: number,
  targetNode: ProseMirrorNode,
): TextSelectionBookmark | null => {
  const { selection } = editor.state;
  if (!(selection instanceof TextSelection) || selection.empty) return null;
  const targetStart = targetPosition + 1;
  const targetEnd = targetPosition + targetNode.nodeSize - 1;
  if (
    selection.anchor < targetStart ||
    selection.anchor > targetEnd ||
    selection.head < targetStart ||
    selection.head > targetEnd
  ) {
    return null;
  }
  return {
    anchorOffset: selection.anchor - targetPosition,
    headOffset: selection.head - targetPosition,
  };
};

// 안정 ID로 이동 후 위치를 다시 찾는다. 비축약 TextSelection bookmark가 있으면
// anchor/head를 그대로 복원하고, 없으면 기존 TextSelection.near 캐럿 경로를
// 유지한다(G-EDT-001).
const placeSelectionInMovedBlock = (
  tr: Transaction,
  blockId: string,
  bookmark: TextSelectionBookmark | null,
): Transaction => {
  const position = findBlockPosition(tr.doc, blockId);
  if (position === null) return tr;
  if (bookmark !== null) {
    return tr.setSelection(
      TextSelection.create(
        tr.doc,
        position + bookmark.anchorOffset,
        position + bookmark.headOffset,
      ),
    );
  }
  const resolved = tr.doc.resolve(Math.min(position + 1, tr.doc.content.size));
  return tr.setSelection(TextSelection.near(resolved));
};

// 형제 → 자식(들여쓰기). 대상의 바로 앞 형제가 nestableBlockContent를 가진
// blockContainer면 그 형제의 blockGroup 마지막 자식으로 대상(하위 트리째)을
// 옮긴다 — blockGroup이 없으면 새로 만든다. 바로 앞 형제가 없거나(첫 자식),
// container가 아니거나(표), leafBlockContent container면(CodeBlock)
// COMMAND_NOT_APPLICABLE이다(D9 — 적용 불가 형제를 건너뛰고 이전 후보를 찾지
// 않는다). 결과 최대 깊이가 MAX_NESTING_DEPTH를 넘으면 거절한다(D14).
export const indentBlockCommand = (
  editor: Editor,
  blockId: string,
): Result<void, EditorError> => {
  const { doc } = editor.state;
  const targetPosition = findBlockPosition(doc, blockId);
  if (targetPosition === null) return blockNotFound(blockId);
  const targetNode = doc.nodeAt(targetPosition);
  if (targetNode === null) return blockNotFound(blockId);

  const actionState = getBlockNestingActionState(doc, blockId);
  if (!actionState.canIndent) return commandNotApplicable("indentBlock");

  const $target = doc.resolve(targetPosition);
  const previousSibling = $target.nodeBefore;
  if (previousSibling === null) return commandNotApplicable("indentBlock");
  const previousSiblingId = previousSibling.attrs.blockId;
  if (typeof previousSiblingId !== "string" || previousSiblingId.length === 0) {
    return commandNotApplicable("indentBlock");
  }

  const selectionBookmark = captureTextSelection(
    editor,
    targetPosition,
    targetNode,
  );

  let tr = editor.state.tr.delete(
    targetPosition,
    targetPosition + targetNode.nodeSize,
  );

  const mappedPreviousPosition = findBlockPosition(tr.doc, previousSiblingId);
  if (mappedPreviousPosition === null) {
    return commandNotApplicable("indentBlock");
  }
  const mappedPreviousNode = tr.doc.nodeAt(mappedPreviousPosition);
  if (mappedPreviousNode === null) {
    return commandNotApplicable("indentBlock");
  }

  const firstChild = mappedPreviousNode.child(0);
  const groupSlotStart = mappedPreviousPosition + 1 + firstChild.nodeSize;

  if (mappedPreviousNode.childCount > 1) {
    // 앞 형제에 이미 blockGroup이 있다 — 그 마지막 자식으로 끼운다.
    const group = mappedPreviousNode.child(1);
    const insertPosition = groupSlotStart + group.nodeSize - 1;
    tr = tr.insert(insertPosition, targetNode);
  } else {
    // 앞 형제에 blockGroup이 없다 — 새로 만들어 두 번째 자식으로 붙인다.
    const newGroupNode = editor.schema.nodes.blockGroup!.create(
      null,
      Fragment.from(targetNode),
    );
    tr = tr.insert(groupSlotStart, newGroupNode);
  }

  tr = placeSelectionInMovedBlock(tr, blockId, selectionBookmark);

  editor.view.dispatch(closeHistory(tr));
  return { ok: true, value: undefined };
};

// 자식 → 형제(내어쓰기). 대상의 부모 컨테이너가 없으면(최상위)
// COMMAND_NOT_APPLICABLE이다. 있으면 대상(하위 트리째)을 부모 컨테이너의
// 다음 형제로 lift한다 — 후행 형제는 입양하지 않고 원 부모의 blockGroup에
// 남는다(PM lift 계열·아웃라이너 표준). outdent로 그 blockGroup이 비면
// (대상이 유일한 자식이었으면) 그룹 노드 자체를 제거한다("block+"는 빈
// 그룹을 금지한다).
export const outdentBlockCommand = (
  editor: Editor,
  blockId: string,
): Result<void, EditorError> => {
  const { doc } = editor.state;
  const targetPosition = findBlockPosition(doc, blockId);
  if (targetPosition === null) return blockNotFound(blockId);
  const targetNode = doc.nodeAt(targetPosition);
  if (targetNode === null) return blockNotFound(blockId);

  const actionState = getBlockNestingActionState(doc, blockId);
  if (!actionState.canOutdent) return commandNotApplicable("outdentBlock");

  const $target = doc.resolve(targetPosition);
  const selectionBookmark = captureTextSelection(
    editor,
    targetPosition,
    targetNode,
  );

  const groupDepth = $target.depth;
  const groupNode = $target.node(groupDepth);
  const parentContainer = $target.node(groupDepth - 1);
  const parentBlockId = parentContainer.attrs.blockId;
  if (typeof parentBlockId !== "string" || parentBlockId.length === 0) {
    return commandNotApplicable("outdentBlock");
  }

  let tr = editor.state.tr;
  if (groupNode.childCount === 1) {
    // 대상이 그룹의 유일한 자식 — 대상만 지우면 "block+"를 위반하는 빈
    // 그룹이 남는다. 그룹 노드 자체를 제거한다.
    const groupStart = $target.before(groupDepth);
    const groupEnd = $target.after(groupDepth);
    tr = tr.delete(groupStart, groupEnd);
  } else {
    tr = tr.delete(targetPosition, targetPosition + targetNode.nodeSize);
  }

  const mappedParentPosition = findBlockPosition(tr.doc, parentBlockId);
  if (mappedParentPosition === null) {
    return commandNotApplicable("outdentBlock");
  }
  const mappedParentNode = tr.doc.nodeAt(mappedParentPosition);
  if (mappedParentNode === null) {
    return commandNotApplicable("outdentBlock");
  }

  const insertPosition = mappedParentPosition + mappedParentNode.nodeSize;
  tr = tr.insert(insertPosition, targetNode);

  tr = placeSelectionInMovedBlock(tr, blockId, selectionBookmark);

  editor.view.dispatch(closeHistory(tr));
  return { ok: true, value: undefined };
};
