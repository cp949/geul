import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";

import { resolveSelectionAwareState } from "./selection-aware-state.js";

// 공개 command와 DOM shortcut이 공유하는 유일한 CodeBlock selection 판정.
// collapsed selection은 조상 CodeBlock을 보고, 범위 selection은 반열린
// [from, to)과 CodeBlock의 실제 문자 구간이 겹치는지 본다. 노드 경계만
// 닿거나 빈 CodeBlock 노드만 덮는 선택은 문자를 교차하지 않는다.
export const selectionIntersectsCodeBlock = (
  doc: ProseMirrorNode,
  selection: Selection,
): boolean => {
  if (selection.empty) {
    for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
      if (selection.$from.node(depth).type.name === "codeBlock") return true;
    }
    return false;
  }

  let intersects = false;
  doc.descendants((node, position) => {
    if (intersects) return false;
    if (node.type.name !== "codeBlock") return true;
    const contentFrom = position + 1;
    const contentTo = contentFrom + node.content.size;
    intersects =
      Math.max(selection.from, contentFrom) < Math.min(selection.to, contentTo);
    return false;
  });
  return intersects;
};

// StarterKit mark keymap보다 먼저 실행한다. CodeBlock에서는 오류를 받을
// command 호출자가 없으므로 keydown만 소비하고 transaction은 만들지 않는다.
// derived/live 양쪽을 검사해 G-EDT-002의 forward·reverse stale을 모두 막는다.
export const CodeBlockMarkGuardExtension = Extension.create({
  name: "codeBlockMarkGuard",
  priority: 1_100,

  addKeyboardShortcuts() {
    const consumeInsideCodeBlock = (): boolean => {
      const derivedState = resolveSelectionAwareState(this.editor);
      const liveState = this.editor.view.state;
      return (
        selectionIntersectsCodeBlock(
          derivedState.doc,
          derivedState.selection,
        ) || selectionIntersectsCodeBlock(liveState.doc, liveState.selection)
      );
    };

    return {
      "Mod-b": consumeInsideCodeBlock,
      "Mod-B": consumeInsideCodeBlock,
      "Mod-i": consumeInsideCodeBlock,
      "Mod-I": consumeInsideCodeBlock,
      "Mod-u": consumeInsideCodeBlock,
      "Mod-U": consumeInsideCodeBlock,
      "Mod-Shift-s": consumeInsideCodeBlock,
      "Mod-e": consumeInsideCodeBlock,
    };
  },
});
