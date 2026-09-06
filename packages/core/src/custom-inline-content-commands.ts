import type { Result } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";

// insertCustomBlock(custom-block-commands.ts)과 다른 점: 삽입 위치가
// afterBlockId가 아니라 현재 selection(caret)이다 — inline 원소는 model에
// id가 없어(spec §4.2) block처럼 위치를 식별할 identity가 없다(RD-002-DELTA-18.md
// "결정" 5). Tiptap 코어 `insertContent`가 트랜잭션 구성·dispatch를 이미
// 처리해 insertCustomBlock처럼 수동 트랜잭션·finalizeAndDispatch가 필요
// 없다.
//
// 스키마 노드 부재는 insertCustomBlock과 동일하게 도달 불가 방어선이
// 아니라 소비자가 실제로 만날 수 있는 오류다(등록하지 않은 type 이름을
// 실수로 넘길 수 있음) — throw 대신 CUSTOM_INLINE_CONTENT_TYPE_NOT_REGISTERED로
// 거절한다.
export type InsertCustomInlineContentError =
  | { code: "CUSTOM_INLINE_CONTENT_TYPE_NOT_REGISTERED"; type: string }
  | { code: "TRANSACTION_REJECTED" };

export const insertCustomInlineContent = (
  editor: Editor,
  type: string,
  props: Record<string, string | number | boolean | null> | undefined,
): Result<void, InsertCustomInlineContentError> => {
  const customType = editor.schema.nodes[type];
  if (customType === undefined) {
    return {
      ok: false,
      error: { code: "CUSTOM_INLINE_CONTENT_TYPE_NOT_REGISTERED", type },
    };
  }

  const applied = editor
    .chain()
    .insertContent({ type, attrs: { props: props ?? null } })
    .run();

  return applied
    ? { ok: true, value: undefined }
    : { ok: false, error: { code: "TRANSACTION_REJECTED" } };
};
