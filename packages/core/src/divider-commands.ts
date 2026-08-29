import type { IdFactory, Result } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

import { findBlockPosition } from "./block-position.js";
import { finalizeAndDispatch } from "./dispatch.js";

// divider 삽입 명령(삽입 전용 — setBlockType 대상이 아니다, spec §4.2·§5.1).
//
// - 비포장 atom: divider는 표와 같이 blockContainer로 감싸지 않고 group
//   "block"의 직접 멤버로 doc 직하 또는 blockGroup 자식 자리에 들어간다
//   (divider-extension.ts). 그래서 BlockIdExtension(blockContainer 전용)의
//   사후 id 배정 대상이 아니며, id는 이 명령이 createId()로 명시 배정해
//   attrs.blockId에 싣는다 — 변환기(tiptap-to-model.ts)가 id 없는 divider에
//   새 id를 발급하면 반환 blockId와 저장 문서 id가 어긋난다.
// - 삽입 위치: afterBlockId 노드(blockContainer/table/divider 어느 것이든)의
//   nodeSize 뒤 — 컨테이너 nodeSize가 자식 blockGroup을 포함하므로 자식
//   딸린 블록이면 하위 트리 전체 뒤가 된다(insertTable·insertParagraphAfter
//   전례).
// - selection 명시 이동(G-EDT-001): atom 안에는 캐럿이 놓일 수 없어 PM 기본
//   selection 매핑에 맡기면 캐럿이 삽입 앞 블록에 남는다. 규칙은 하나다 —
//   같은 부모 안의 다음 형제가 텍스트 블록(blockContainer)이면 그 선두(위치
//   +2 = 콘텐츠 텍스트 시작)로 옮기고, 아니면(다음 형제 없음·divider·table
//   같은 비포장 노드) divider 뒤에 맨몸 paragraph를 같은 트랜잭션에 넣고 그
//   안에 캐럿을 둔다. 비포장 형제에 Selection.near로 캐럿을 맡기면 이웃
//   divider에 NodeSelection이 놓여 다음 타이핑이 그 divider를 치환하고
//   table이면 첫 셀 안으로 들어간다 — 빈 paragraph 동반이 비파괴다. 맨몸
//   노드는 slice-fitting이 blockContainer로 감싸고 BlockIdExtension이 같은
//   dispatch에서 id를 배정한다(insertParagraphAfter 전례). 문서 끝이면
//   TrailingBlockExtension의 판정 술어가 이미 참이라 trailing 확장은
//   no-op이다(spec §6.4).
// - clearAfterBlockText: 슬래시 메뉴 경로의 "/divider" 트리거 문단 비우기를
//   같은 트랜잭션에 담아 undo 1회로 텍스트·divider가 함께 복원되게 한다
//   (insertTable과 동일 규칙 — 대상이 blockContainer면 내부 blockContent의
//   텍스트만 지운다).
// - 마무리는 dispatch.ts의 finalizeAndDispatch를 재사용한다 —
//   closeHistory(scrollIntoView) + "doc 참조 동일성 = 필터 거절" 판정을 한
//   곳에 두기 위해서다. 그 오류(TRANSACTION_REJECTED)는 DividerCommandError의
//   멤버라 그대로 돌려준다.
//
// 참조 구현 출처: BlockNote v0.54.0 packages/core/src/blocks/Divider/block.ts
// (구조만 참조, 코드 미복제).

export type DividerCommandError =
  | { code: "BLOCK_NOT_FOUND"; blockId: string }
  | { code: "TRANSACTION_REJECTED" };

const blockNotFound = (
  blockId: string,
): Result<never, DividerCommandError> => ({
  ok: false,
  error: { code: "BLOCK_NOT_FOUND", blockId },
});

export const insertDivider = (
  editor: Editor,
  afterBlockId: string,
  createId: IdFactory,
  options?: { clearAfterBlockText?: boolean },
): Result<{ blockId: string }, DividerCommandError> => {
  const dividerType = editor.schema.nodes.divider;
  const paragraphType = editor.schema.nodes.paragraph;
  // createTiptapEditor(editor-controller.ts)가 두 확장의 등록을 보장하므로
  // 이 부재는 도달 불가 방어선이다 — 명령 결과로 위장하지 않고 던진다.
  if (dividerType === undefined || paragraphType === undefined) {
    throw new TypeError(
      "divider/paragraph 노드 타입이 스키마에 없다 — createTiptapEditor가 확장 등록을 보장한다",
    );
  }

  const afterPosition = findBlockPosition(editor.state.doc, afterBlockId);
  if (afterPosition === null) return blockNotFound(afterBlockId);
  const afterNode = editor.state.doc.nodeAt(afterPosition);
  if (afterNode === null) return blockNotFound(afterBlockId);
  const insertPosition = afterPosition + afterNode.nodeSize;
  // insertPosition은 afterNode와 같은 부모 안의 경계라 resolve().nodeAfter가 곧
  // 다음 형제(없으면 null)다.
  const nextSibling = editor.state.doc.resolve(insertPosition).nodeAfter;

  const blockId = createId();
  const dividerNode = dividerType.create({ blockId });

  let transaction = editor.state.tr;
  const clearTarget =
    afterNode.type.name === "blockContainer" ? afterNode.firstChild : afterNode;
  const clearPosition =
    afterNode.type.name === "blockContainer"
      ? afterPosition + 1
      : afterPosition;
  if (
    options?.clearAfterBlockText === true &&
    clearTarget !== null &&
    clearTarget.isTextblock &&
    clearTarget.content.size > 0
  ) {
    transaction = transaction.delete(
      clearPosition + 1,
      clearPosition + 1 + clearTarget.content.size,
    );
  }
  const dividerPosition = transaction.mapping.map(insertPosition);
  transaction = transaction.insert(dividerPosition, dividerNode);
  const afterDivider = dividerPosition + dividerNode.nodeSize;

  if (nextSibling === null || nextSibling.type.name !== "blockContainer") {
    transaction = transaction.insert(afterDivider, paragraphType.create());
  }
  // 두 분기 모두 afterDivider에 blockContainer가 놓여 있다 — 기존 형제거나
  // 방금 넣은 맨몸 paragraph(slice-fitting이 감싼다) — 그 +2가 텍스트 시작.
  transaction.setSelection(
    TextSelection.create(transaction.doc, afterDivider + 2),
  );

  const dispatched = finalizeAndDispatch(editor, transaction);
  if (!dispatched.ok) return dispatched;
  return { ok: true, value: { blockId } };
};
