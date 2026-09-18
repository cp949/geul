import { isNestableBlockType, type Result } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";

import { findEditableBlockContent } from "./block-position.js";
import type { EditorError } from "./errors.js";

// D2: 신규 EditorError 코드를 만들지 않는다 — 이 파일의 실패는 BLOCK_NOT_FOUND
// 또는 COMMAND_NOT_APPLICABLE로만 수렴한다(indent-commands.ts·
// check-list-item-commands.ts와 동일 원칙).
const blockNotFound = (blockId: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "BLOCK_NOT_FOUND", blockId },
});

const commandNotApplicable = (command: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

// RD-001 대상 8타입만 표현한다 — EditorController.commands.setBlockType의
// SetBlockTypeDescriptor 부분집합이다(codeBlock 제외 — isNestableBlockType
// 가드가 애초에 codeBlock을 이 command 대상에서 걸러낸다).
export type BlockTypeConversionDescriptor =
  | { type: "paragraph" }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: "quote" }
  | { type: "bulletListItem" }
  | { type: "numberedListItem" }
  | { type: "checkListItem" }
  | { type: "toggleListItem" }
  | { type: "callout" };

// blockId가 가리키는 콘텐츠 노드를 descriptor 타입으로 바꾼다.
// generic-block-commands.ts의 setBlockType과 같은 계약을 쓰지만,
// session(ProductionEditorSession) 없이 Editor+blockId만으로 동작한다 —
// Tiptap keyboard-shortcut 확장은 session이 생성되기 전에 등록되므로 그
// 클로저에 닿을 수 없다(RD-001.md "결정" 참고). 대상이 codeBlock으로
// 바뀌지 않으므로 language·clearContent·model 트리 조회(hasChildren) 분기는
// 이 함수에 없다 — 전부 원본에서 도달 불가능한 경로였다.
export const setBlockTypeCommand = (
  editor: Editor,
  blockId: string,
  descriptor: BlockTypeConversionDescriptor,
): Result<void, EditorError> => {
  const target = findEditableBlockContent(editor.state.doc, blockId);
  if (target === null) return blockNotFound(blockId);

  const currentTypeName = target.node.type.name;
  if (!isNestableBlockType(currentTypeName)) {
    return commandNotApplicable("setBlockType");
  }

  const currentLevel =
    typeof target.node.attrs.level === "number"
      ? target.node.attrs.level
      : null;

  const isSameType =
    descriptor.type === "heading"
      ? currentTypeName === "heading" && currentLevel === descriptor.level
      : currentTypeName === descriptor.type;
  if (isSameType) return commandNotApplicable("setBlockType");

  const nodeType = editor.schema.nodes[descriptor.type];
  if (nodeType === undefined) return commandNotApplicable("setBlockType");

  const attrs =
    descriptor.type === "heading" ? { level: descriptor.level } : {};

  const transaction = editor.state.tr.setNodeMarkup(
    target.position,
    nodeType,
    attrs,
  );
  editor.view.dispatch(closeHistory(transaction));
  return { ok: true, value: undefined };
};
