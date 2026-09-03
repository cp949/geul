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
  // 이 undo 정보가 속한 실제 isInputRules plugin 참조. Tiptap core는
  // addInputRules를 가진 확장마다 별도 plugin 인스턴스를 하나씩 만든다
  // (extensionManager.ts) — StarterKit의 mark 확장(Bold 등)·
  // ListInputRuleExtension·BlockTypeInputRuleExtension(RD-002) 전부 각자의
  // isInputRules 플러그인을 갖는다. 어느 확장의 규칙이 발동했는지에 따라
  // plugin이 달라지므로 payload 자체에 실어 둔다 — appendTransaction이
  // "누구에게" meta를 되돌려 줄지 알아야 한다(RD-002 실측: 문서 끝 divider
  // 변환처럼 BlockIdExtension의 후속 append가 낀 경우에만 드러나는 문제).
  plugin: Plugin;
  transform: Transaction;
  from: number;
  to: number;
  text: string;
};

const inputRuleUndoBridgeKey = new PluginKey<InputRuleUndoState | null>(
  "listInputRuleUndoBridge",
);

// 이 transaction에 meta를 막 실어 보낸 isInputRules plugin을 찾는다(발동한
// 확장 자신). Tiptap의 run()이 tr.setMeta(plugin, {...})으로 심는 것과 같은
// 식별자(spec.isInputRules)를 재사용하고 undo 동작 자체는 복제하지 않는다.
const firedInputRulesPlugin = (transaction: Transaction, state: EditorState) =>
  state.plugins.find(
    (plugin) =>
      (plugin.spec as { isInputRules?: boolean }).isInputRules === true &&
      transaction.getMeta(plugin) !== undefined,
  );

// Backspace 판정 전용 — "지금 되돌릴 것이 있는가"를 판정할 때는 어느
// 확장이 발동했는지 몰라도 되므로 활성 상태(getState가 null이 아님)인
// 아무 isInputRules plugin이나 찾는다 — bridge가 이미 복원해 둔 상태도
// 여기 포함된다.
const activeInputRulesPlugin = (state: EditorState) =>
  state.plugins.find(
    (plugin) =>
      (plugin.spec as { isInputRules?: boolean }).isInputRules === true &&
      plugin.getState(state) != null,
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
  // BlockJoinExtension(priority 101)의 구조 편집 Backspace(예: divider
  // 인접 시 병합 대신 선택)보다 input-rule 복원을 먼저 판정한다. 이 파일이
  // 소유한 규칙(목록)뿐 아니라 활성 상태인 다른 addInputRules 확장의 규칙
  // (BlockTypeInputRuleExtension 등, RD-002)도 activeInputRulesPlugin으로
  // 함께 찾는다 — Backspace 핸들러는 어느 확장 하나를 편애하지 않는다.
  // undoInputRule 상태가 없으면 false를 반환해 기존 keymap으로 폴스루한다.
  priority: 1_100,

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state } = this.editor;
        const plugin = activeInputRulesPlugin(state);
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
            const plugin = firedInputRulesPlugin(transaction, nextState);
            if (plugin !== undefined) {
              return {
                plugin,
                ...(transaction.getMeta(plugin) as Omit<
                  InputRuleUndoState,
                  "plugin"
                >),
              };
            }
            return transaction.getMeta("appendedTransaction") !== undefined
              ? previous
              : null;
          },
        },
        appendTransaction: (_transactions, _previousState, nextState) => {
          const undoable = inputRuleUndoBridgeKey.getState(nextState);
          if (undoable === null || undoable === undefined) return null;
          const currentInputRuleState = undoable.plugin.getState(nextState);
          if (
            currentInputRuleState !== null &&
            currentInputRuleState !== undefined
          ) {
            return null;
          }
          return nextState.tr.setMeta(undoable.plugin, undoable);
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
