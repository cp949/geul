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
const modelDepthAt = ($pos: ResolvedPos): number => {
  let depth = 1;
  for (let d = 0; d <= $pos.depth; d += 1) {
    if ($pos.node(d).type.name === "blockContainer") depth += 1;
  }
  return depth;
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

// 이동 직후 캐럿을 이동한 블록(blockId는 이동 전과 동일하게 유지된다) 콘텐츠
// 안으로 옮긴다(G-EDT-001 안정 ID selection 복원 — applyTableGridOperation의
// cellId 복원 전례 준용). 표처럼 콘텐츠 시작이 텍스트가 아니어도
// TextSelection.near가 가장 가까운 유효 위치(첫 셀 문단 등)를 찾는다.
const placeCaretInMovedBlock = (
  tr: Transaction,
  blockId: string,
): Transaction => {
  const position = findBlockPosition(tr.doc, blockId);
  if (position === null) return tr;
  const resolved = tr.doc.resolve(Math.min(position + 1, tr.doc.content.size));
  return tr.setSelection(TextSelection.near(resolved));
};

// 형제 → 자식(들여쓰기). 대상의 바로 앞 형제가 blockContainer면 그 형제의
// blockGroup 마지막 자식으로 대상(하위 트리째)을 옮긴다 — blockGroup이
// 없으면 새로 만든다. 바로 앞 형제가 없거나(첫 자식) blockContainer가
// 아니면(표) COMMAND_NOT_APPLICABLE이다(D9 — 표를 건너뛰고 이전 후보를
// 찾지 않는다). 결과 최대 깊이가 MAX_NESTING_DEPTH를 넘으면 거절한다(D14).
export const indentBlockCommand = (
  editor: Editor,
  blockId: string,
): Result<void, EditorError> => {
  const { doc } = editor.state;
  const targetPosition = findBlockPosition(doc, blockId);
  if (targetPosition === null) return blockNotFound(blockId);
  const targetNode = doc.nodeAt(targetPosition);
  if (targetNode === null) return blockNotFound(blockId);

  const $target = doc.resolve(targetPosition);
  const previousSibling = $target.nodeBefore;
  if (
    previousSibling === null ||
    previousSibling.type.name !== "blockContainer"
  ) {
    return commandNotApplicable("indentBlock");
  }
  const previousSiblingId = previousSibling.attrs.blockId;
  if (typeof previousSiblingId !== "string" || previousSiblingId.length === 0) {
    return commandNotApplicable("indentBlock");
  }

  const newDepth = modelDepthAt($target) + 1 + subtreeHeight(targetNode);
  if (newDepth > MAX_NESTING_DEPTH) {
    return commandNotApplicable("indentBlock");
  }

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

  tr = placeCaretInMovedBlock(tr, blockId);

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

  const $target = doc.resolve(targetPosition);
  if ($target.depth === 0) {
    // 최상위 블록 — 부모 컨테이너가 없다.
    return commandNotApplicable("outdentBlock");
  }

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

  tr = placeCaretInMovedBlock(tr, blockId);

  editor.view.dispatch(closeHistory(tr));
  return { ok: true, value: undefined };
};
