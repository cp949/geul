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
// 가드가 애초에 codeBlock을 이 command 대상에서 걸러낸다). isToggleable을
// 입력 필드로 두지 않는다 — 키보드 단축키는 항상 "현재 heading이면 그 값을
// 그대로 유지"만 하고 명시적으로 켜거나 끄지 않는다(RD-001.md "포함 범위").
export type BlockTypeConversionDescriptor =
  | { type: "paragraph" }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: "quote" }
  | { type: "bulletListItem" }
  | { type: "numberedListItem" }
  | { type: "checkListItem" }
  | { type: "toggleListItem" };

// blockId가 가리키는 콘텐츠 노드를 descriptor 타입으로 바꾼다.
// generic-block-commands.ts의 setBlockType과 같은 heading isToggleable/
// collapsed 캐리포워드 계약을 쓰지만, session(ProductionEditorSession) 없이
// Editor+blockId만으로 동작한다 — Tiptap keyboard-shortcut 확장은 session이
// 생성되기 전에 등록되므로 그 클로저에 닿을 수 없다(RD-001.md "결정" 참고).
// 대상이 codeBlock으로 바뀌지 않으므로 language·clearContent·model 트리
// 조회(hasChildren) 분기는 이 함수에 없다 — 전부 원본에서 도달 불가능한
// 경로였다.
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

  // heading→heading 재호출(level만 변경)일 때만 현재 isToggleable/collapsed를
  // 읽어 그대로 유지한다. 부분 attrs만 setNodeMarkup에 넘기면 PM이 나머지를
  // schema default(null)로 채워 기존 값을 지운다 — generic-block-commands.ts와
  // 동일 함정(RD-003 트랙-3 결함 탐지 F1 계보). collapsed는 isToggleable이
  // true인 heading만 가질 수 있는 model 불변식(model/schema.ts
  // validateBlocksAt)이라 isToggleable이 꺼지면 collapsed도 함께 null로
  // 되돌린다.
  const currentIsToggleable =
    currentTypeName === "heading"
      ? ((target.node.attrs.isToggleable as boolean | null | undefined) ?? null)
      : null;
  const currentCollapsed =
    currentTypeName === "heading"
      ? ((target.node.attrs.collapsed as boolean | null | undefined) ?? null)
      : null;
  const headingIsToggleable = currentIsToggleable ?? false;
  const headingCollapsed = headingIsToggleable ? currentCollapsed : null;

  const isSameType =
    descriptor.type === "heading"
      ? currentTypeName === "heading" && currentLevel === descriptor.level
      : currentTypeName === descriptor.type;
  if (isSameType) return commandNotApplicable("setBlockType");

  const nodeType = editor.schema.nodes[descriptor.type];
  if (nodeType === undefined) return commandNotApplicable("setBlockType");

  const attrs =
    descriptor.type === "heading"
      ? {
          level: descriptor.level,
          isToggleable: headingIsToggleable ? true : null,
          collapsed: headingCollapsed,
        }
      : {};

  const transaction = editor.state.tr.setNodeMarkup(
    target.position,
    nodeType,
    attrs,
  );
  editor.view.dispatch(closeHistory(transaction));
  return { ok: true, value: undefined };
};
