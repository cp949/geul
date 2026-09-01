import type { Result } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";

import { findEditableBlockContent } from "./block-position.js";
import type { EditorError } from "./errors.js";

const blockNotFound = (blockId: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "BLOCK_NOT_FOUND", blockId },
});

const commandNotApplicable = (command: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

/**
 * heading의 `collapsed`(isToggleable 전용)와 toggleListItem의 `collapsed`가
 * 공유하는 반전 로직(RD-004 DELTA-01 착수 전 결정 — 이 DELTA가 동시에 만드는
 * 두 구현체만으로 Rule of Three를 만족해 추출한다, `RD-004.md` 참고). 기존
 * `toggleCheckListItemCheckedCommand`(RD-001 DELTA-03)는 attrs가 하나뿐이고
 * guard가 없어 구조가 더 단순하며 이미 `dev`에 있는 산출물이라 이 헬퍼로
 * 리팩터링하지 않는다.
 *
 * `guard`는 반전을 허용할지 판정한다(heading은 `isToggleable === true`인
 * 경우만 — collapsed는 isToggleable:true인 heading만 가질 수 있다는 model
 * 불변식을 명령 계층에서도 지킨다). `!attrs.collapsed`는 PM 기본값 `null`도
 * falsy로 취급해 최초 호출에서 정확히 `true`로 뒤집는다.
 */
const toggleCollapsedAttrCommand = (
  editor: Editor,
  blockId: string,
  commandName: string,
  target: {
    nodeTypeName: string;
    guard?: (attrs: Record<string, unknown>) => boolean;
  },
): Result<void, EditorError> => {
  const found = findEditableBlockContent(editor.state.doc, blockId);
  if (found === null) return blockNotFound(blockId);
  if (found.node.type.name !== target.nodeTypeName) {
    return commandNotApplicable(commandName);
  }
  if (target.guard !== undefined && !target.guard(found.node.attrs)) {
    return commandNotApplicable(commandName);
  }

  const transaction = editor.state.tr.setNodeMarkup(found.position, undefined, {
    ...found.node.attrs,
    collapsed: !found.node.attrs.collapsed,
  });
  editor.view.dispatch(closeHistory(transaction));
  return { ok: true, value: undefined };
};

export const toggleHeadingCollapseCommand = (
  editor: Editor,
  blockId: string,
): Result<void, EditorError> =>
  toggleCollapsedAttrCommand(editor, blockId, "toggleHeadingCollapse", {
    nodeTypeName: "heading",
    guard: (attrs) => attrs.isToggleable === true,
  });

export const toggleListItemCollapseCommand = (
  editor: Editor,
  blockId: string,
): Result<void, EditorError> =>
  toggleCollapsedAttrCommand(editor, blockId, "toggleListItemCollapse", {
    nodeTypeName: "toggleListItem",
  });
