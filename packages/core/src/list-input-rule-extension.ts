import { Extension, InputRule } from "@tiptap/core";
import type { Mark, NodeType } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";

type InputRuleUndoState = {
  transform: Transaction;
  from: number;
  to: number;
  text: string;
};

const inputRuleUndoBridgeKey = new PluginKey<InputRuleUndoState | null>(
  "listInputRuleUndoBridge",
);

// Tiptap inputRulesPlugin은 공개 key를 export하지 않고 spec.isInputRules만
// undoInputRule 탐색 표면으로 쓴다. 같은 식별자를 사용해 실제 plugin과 meta를
// 재사용하고 undo 동작 자체는 복제하지 않는다.
const inputRulesPlugin = (state: EditorState) =>
  state.plugins.find(
    (plugin) =>
      (plugin.spec as { isInputRules?: boolean }).isInputRules === true,
  );

const createListInputRule = (
  marker: "-" | "1.",
  find: RegExp,
  type: NodeType,
): InputRule =>
  new InputRule({
    find,
    handler: ({ state, range }) => {
      const $from = state.doc.resolve(range.from);
      const container = $from.node(-1);
      // Tiptap matcher는 캐럿 앞 텍스트만 읽는다. 전체 pre-input paragraph와
      // selection을 별도로 확인해야 suffix·선택 대체·simulated input을 막는다.
      if (
        !state.selection.empty ||
        $from.parent.type.name !== "paragraph" ||
        container.type.name !== "blockContainer" ||
        $from.parent.textContent !== marker
      ) {
        return null;
      }

      const storedMarks: readonly Mark[] | null =
        state.storedMarks ?? $from.marks();
      const transaction = closeHistory(state.tr);
      transaction
        .delete(range.from, range.to)
        .setBlockType(range.from, range.from, type)
        .setStoredMarks(storedMarks);
    },
  });

export const ListInputRuleExtension = Extension.create({
  name: "listInputRule",
  // 빈 목록의 구조 편집 Backspace보다 input-rule 복원을 먼저 판정한다.
  // undoInputRule 상태가 없으면 false를 반환해 기존 목록 keymap으로 폴스루한다.
  priority: 1_100,

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state } = this.editor;
        const plugin = inputRulesPlugin(state);
        const undoable = plugin?.getState(state);
        const hasUndoableInputRule =
          undoable !== null && undoable !== undefined;
        if (!hasUndoableInputRule) return false;

        const preTransformDoc = (undoable as InputRuleUndoState).transform
          .docs[0];
        if (preTransformDoc === undefined) {
          return this.editor.commands.undoInputRule();
        }

        return this.editor
          .chain()
          .undoInputRule()
          .command(({ tr }) => {
            const lastBlock = tr.doc.lastChild;
            const isConversionCreatedTrailingParagraph =
              tr.doc.childCount === preTransformDoc.childCount + 1 &&
              lastBlock?.type.name === "blockContainer" &&
              lastBlock.childCount === 1 &&
              lastBlock.firstChild?.type.name === "paragraph" &&
              lastBlock.firstChild.content.size === 0;
            if (!isConversionCreatedTrailingParagraph) return true;

            tr.delete(
              tr.doc.content.size - lastBlock.nodeSize,
              tr.doc.content.size,
            );
            return true;
          })
          .run();
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      // Tiptap inputRulesPlugin은 docChanged appended transaction에서 undo
      // state를 null로 만든다. root input-rule payload만 캡처해 append 동안
      // 유지하고, 마지막 append 뒤 실제 plugin meta로 한 번 복원한다.
      new Plugin<InputRuleUndoState | null>({
        key: inputRuleUndoBridgeKey,
        state: {
          init: () => null,
          apply: (transaction, previous, _oldState, nextState) => {
            const plugin = inputRulesPlugin(nextState);
            if (plugin === undefined) return null;
            const undoable = transaction.getMeta(plugin) as
              InputRuleUndoState | undefined;
            if (undoable !== undefined) return undoable;
            return transaction.getMeta("appendedTransaction") !== undefined
              ? previous
              : null;
          },
        },
        appendTransaction: (_transactions, _previousState, nextState) => {
          const undoable = inputRuleUndoBridgeKey.getState(nextState);
          const plugin = inputRulesPlugin(nextState);
          const currentInputRuleState = plugin?.getState(nextState);
          if (
            undoable === null ||
            undoable === undefined ||
            plugin === undefined ||
            (currentInputRuleState !== null &&
              currentInputRuleState !== undefined)
          ) {
            return null;
          }
          return nextState.tr.setMeta(plugin, undoable);
        },
      }),
    ];
  },

  addInputRules() {
    const bullet = this.editor.schema.nodes.bulletListItem;
    const numbered = this.editor.schema.nodes.numberedListItem;
    if (bullet === undefined || numbered === undefined) return [];

    return [
      createListInputRule("-", /^- $/, bullet),
      createListInputRule("1.", /^1\. $/, numbered),
    ];
  },
});
