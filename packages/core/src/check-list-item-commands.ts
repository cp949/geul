import type { Result } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";

import { findEditableBlockContent } from "./block-position.js";
import type { EditorError } from "./errors.js";

// D2: 신규 EditorError 코드를 만들지 않는다 — 이 파일의 실패는 BLOCK_NOT_FOUND
// 또는 COMMAND_NOT_APPLICABLE로만 수렴한다(indent-commands.ts와 동일 원칙).
const blockNotFound = (blockId: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "BLOCK_NOT_FOUND", blockId },
});

const commandNotApplicable = (command: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

// checkListItem의 checked를 반전한다. no-op 분기가 없다 — 토글은 정의상
// 항상 상태를 바꾼다(setText의 "동일 값 재적용" 가드와 다른 지점). checked는
// checkListItem PM 노드의 유일한 attrs라 부분 attrs 전달로 다른 필드가
// schema default로 리셋되는 함정(RD-003 트랙-3 F1)이 적용되지 않지만, 향후
// attrs 확장(슬라이스 8 글자색 등)에 대비해 기존 attrs를 스프레드한다.
export const toggleCheckListItemCheckedCommand = (
  editor: Editor,
  blockId: string,
): Result<void, EditorError> => {
  const target = findEditableBlockContent(editor.state.doc, blockId);
  if (target === null) return blockNotFound(blockId);
  if (target.node.type.name !== "checkListItem") {
    return commandNotApplicable("toggleCheckListItemChecked");
  }

  const transaction = editor.state.tr.setNodeMarkup(
    target.position,
    undefined,
    {
      ...target.node.attrs,
      checked: !target.node.attrs.checked,
    },
  );
  editor.view.dispatch(closeHistory(transaction));
  return { ok: true, value: undefined };
};
