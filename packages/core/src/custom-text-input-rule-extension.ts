import {
  CommandManager,
  Extension,
  createChainableState,
  getTextContentFromNodes,
  type Editor,
  type InputRule,
} from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";

import { createBlockTypeInputRules } from "./block-type-input-rule-extension.js";
import { createListInputRules } from "./list-input-rule-extension.js";

// 목록·블록 타입 단축 입력(list-/block-type-input-rule-extension.ts)의
// 텍스트 입력(handleTextInput) 경로를 이 어댑터가 직접 처리한다.
//
// 이유: Tiptap 3.31.4부터 InputRule plugin은 트리거 문자를 먼저 별도
// 트랜잭션으로 dispatch하고 history에 남긴 뒤 변환을 다시 dispatch한다
// (Collaboration undo 대응). 그러면 단축 입력 1회가 view.dispatch 2회,
// revision +2, change event 2건이 되고, undo 1회가 marker가 아니라
// marker + 트리거 문자를 복원한다. 이 저장소의 계약은 3.31.3 동작(트리거
// 문자는 문서에 넣지 않고 변환만 1회 dispatch)이라 그 runner를 여기서
// 재구현한다.
//
// 범위: 텍스트 입력 경로만 가져온다. Enter·compositionend·simulated
// (applyInputRules) 경로는 두 확장의 addInputRules로 Tiptap plugin이 그대로
// 처리한다. StarterKit mark 규칙 등 다른 확장의 규칙도 Tiptap이 처리한다.
//
// 이중 처리 방지: 이 plugin이 입력을 처리하면 true를 돌려 ProseMirror
// someProp이 뒤 plugin(Tiptap InputRule plugin)을 부르지 않는다. 이 plugin이
// 거부해 Tiptap 3.31.4+ 경로가 같은 규칙을 다시 평가할 때는 트리거 문자가
// 이미 문서에 들어간 상태라, 각 handler의 "입력 직전 문단 텍스트 === marker"
// 정확 일치 판정이 항상 거부한다. Tiptap이 이 경로를 다시 바꾸면
// custom-text-input-rule-extension.test.ts의 이중 처리 테스트가 깨진다.

// Tiptap 내부 계약 의존 1: undoInputRule 커맨드와 list-input-rule-
// extension.ts의 Backspace·undo-bridge는 spec.isInputRules가 true인 plugin의
// state에서 { transform, from, to, text }를 읽는다. 이 plugin도 같은 표식과
// 같은 state 형태를 써서 변환 직후 Backspace 복원에 참여한다. 깨질 때의
// 신호: list-input-rule-extension.test.ts의 "변환 직후 Backspace는 literal
// 입력을 복원" 계열 테스트가 실패한다.
type TextInputRuleUndoState = {
  transform: Transaction;
  from: number;
  to: number;
  text: string;
};

export const customTextInputRuleKey =
  new PluginKey<TextInputRuleUndoState | null>("customTextInputRule");

// Tiptap 3.31.3 InputRule.ts의 matchesDocument 판정과 같다. leaf 노드는
// 텍스트 길이와 문서 길이가 달라, 매치 중 문서에 이미 있는 부분이 실제
// 위치와 맞지 않으면 건너뛴다.
const matchesDocument = (
  $from: ResolvedPos,
  match: RegExpExecArray,
  text: string,
): boolean => {
  const matchedDocLength = match[0].length - text.length;
  if (matchedDocLength <= 0) return true;
  const matchStartOffset = $from.parentOffset - matchedDocLength;
  return (
    matchStartOffset >= 0 &&
    $from.parent.textBetween(matchStartOffset, $from.parentOffset) ===
      match[0].slice(0, matchedDocLength)
  );
};

const createTextInputRulePlugin = (
  editor: Editor,
  rules: readonly InputRule[],
): Plugin<TextInputRuleUndoState | null> => {
  const plugin: Plugin<TextInputRuleUndoState | null> =
    new Plugin<TextInputRuleUndoState | null>({
      key: customTextInputRuleKey,
      state: {
        init: () => null,
        // Tiptap inputRulesPlugin의 state와 같은 규칙이다. 변환 트랜잭션의
        // meta를 보관하고, 이후 문서·선택이 바뀌면 비운다.
        apply: (transaction, previous) => {
          const stored = transaction.getMeta(plugin) as
            | TextInputRuleUndoState
            | undefined;
          if (stored !== undefined) return stored;
          return transaction.selectionSet || transaction.docChanged
            ? null
            : previous;
        },
      },
      props: {
        handleTextInput: (view, from, to, text) => {
          if (view.composing) return false;

          const $from = view.state.doc.resolve(from);
          // 코드 노드·code mark 안에서는 단축 입력을 쓰지 않는다(Tiptap 동일).
          if (
            $from.parent.type.spec.code === true ||
            ($from.nodeBefore ?? $from.nodeAfter)?.marks.some(
              (mark) => mark.type.spec.code === true,
            ) === true
          ) {
            return false;
          }

          const textBefore = getTextContentFromNodes($from) + text;
          for (const rule of rules) {
            // 이 runner가 받는 규칙은 전부 RegExp find다(두 규칙 파일 참고).
            if (!(rule.find instanceof RegExp)) continue;
            const match = rule.find.exec(textBefore);
            if (match === null || !matchesDocument($from, match, text))
              continue;

            // Tiptap 내부 계약 의존 2: handler 인자(state, range, match,
            // commands, chain, can)와 "state.tr에 step을 쌓으면 적용" 규약은
            // InputRule 공개 API이고, createChainableState·CommandManager·
            // getTextContentFromNodes는 @tiptap/core 공개 export다. 깨질 때의
            // 신호: 타입 검사 실패 또는 단축 입력 변환 테스트 실패.
            const transaction = view.state.tr;
            const state = createChainableState({
              state: view.state,
              transaction,
            });
            const { commands, chain, can } = new CommandManager({
              editor,
              state,
            });
            const result = rule.handler({
              state,
              // 트리거 문자는 문서에 넣지 않는다. range.to는 입력 직전 캐럿이다.
              range: { from: from - (match[0].length - text.length), to },
              match,
              commands,
              chain,
              can,
            });
            if (result === null || transaction.steps.length === 0) continue;

            if (rule.undoable) {
              transaction.setMeta(plugin, {
                transform: transaction,
                from,
                to,
                text,
              });
            }
            view.dispatch(transaction);
            return true;
          }
          return false;
        },
      },
      // Tiptap 내부 계약 의존 1의 표식(위 TextInputRuleUndoState 주석 참고).
      isInputRules: true,
    });
  return plugin;
};

export const CustomTextInputRuleExtension = Extension.create({
  name: "customTextInputRule",
  // TableBoundaryInputExtension(1_200)의 표 경계 입력 처리 뒤, 규칙을 가진
  // ListInputRuleExtension(1_100)의 Tiptap InputRule plugin보다 앞이다.
  // Tiptap은 우선순위 내림차순으로 확장별 [keymap, InputRule plugin, ...,
  // addProseMirrorPlugins] 순서로 plugin을 놓으므로, 같은 확장의
  // addProseMirrorPlugins로는 자기 InputRule plugin보다 앞설 수 없다.
  priority: 1_150,

  addProseMirrorPlugins() {
    const { schema } = this.editor;
    return [
      createTextInputRulePlugin(this.editor, [
        ...createListInputRules(schema),
        ...createBlockTypeInputRules(schema),
      ]),
    ];
  },
});
