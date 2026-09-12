import type { IdFactory, Result } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

import { findBlockPosition } from "./block-position.js";
import { finalizeAndDispatch } from "./dispatch.js";
import { planTriggerBlockInsert } from "./trigger-block-insert.js";

// insertMediaBlock(media-commands.ts)과 동일 골격이다 — afterBlockId 뒤에
// 삽입, 삽입한 블록 자신을 NodeSelection으로 선택(atom은 캐럿을 둘 안쪽이
// 없다), clearAfterBlockText로 트리거 블록 처리를 같은 트랜잭션에 담는다
// (divider·table·media와 판단 공유, trigger-block-insert.ts) — 중첩 자식이
// 없으면 트리거 컨테이너 자체를 지우고 그 자리에 커스텀 블록을 넣고
// (치환), 있으면 텍스트만 지운다.
//
// insertMediaBlock과 다른 점 하나: 스키마 노드 부재가 도달 불가 방어선이
// 아니라 소비자가 실제로 만날 수 있는 오류다(등록하지 않은 type 이름을
// 실수로 넘길 수 있음) — throw 대신 CUSTOM_BLOCK_TYPE_NOT_REGISTERED로
// 거절한다(RD-002-DELTA-11.md "결정" 5).
export type InsertCustomBlockError =
  | { code: "CUSTOM_BLOCK_TYPE_NOT_REGISTERED"; type: string }
  | { code: "BLOCK_NOT_FOUND"; blockId: string }
  | { code: "TRANSACTION_REJECTED" };

const blockNotFound = (
  blockId: string,
): Result<never, InsertCustomBlockError> => ({
  ok: false,
  error: { code: "BLOCK_NOT_FOUND", blockId },
});

export const insertCustomBlock = (
  editor: Editor,
  afterBlockId: string,
  type: string,
  content: "none" | "inline",
  props: Record<string, string | number | boolean | null> | undefined,
  createId: IdFactory,
  options?: { clearAfterBlockText?: boolean },
): Result<{ blockId: string }, InsertCustomBlockError> => {
  const customType = editor.schema.nodes[type];
  if (customType === undefined) {
    return {
      ok: false,
      error: { code: "CUSTOM_BLOCK_TYPE_NOT_REGISTERED", type },
    };
  }

  const afterPosition = findBlockPosition(editor.state.doc, afterBlockId);
  if (afterPosition === null) return blockNotFound(afterBlockId);
  const afterNode = editor.state.doc.nodeAt(afterPosition);
  if (afterNode === null) return blockNotFound(afterBlockId);

  const blockId = createId();
  const customNode = customType.create({
    blockId,
    contentMode: content,
    props: props ?? null,
  });

  const plan = planTriggerBlockInsert(
    editor.state.tr,
    afterNode,
    afterPosition,
    customNode,
    options?.clearAfterBlockText,
  );
  const transaction = plan.transaction;
  transaction.setSelection(
    NodeSelection.create(transaction.doc, plan.insertPosition),
  );

  const dispatched = finalizeAndDispatch(editor, transaction);
  if (!dispatched.ok) return dispatched;
  return { ok: true, value: { blockId } };
};
