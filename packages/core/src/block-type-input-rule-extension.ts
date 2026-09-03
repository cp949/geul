import { Extension, InputRule } from "@tiptap/core";
import type { Mark, NodeType } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";

// heading(1~6)·quote·checkListItem 입력 규칙. list-input-rule-extension.ts의
// createListInputRule과 같은 계약이다 — 빈 paragraph 선두에서 marker + 공백
// 정확 일치 시에만 반응하고, 캐럿이 속한 blockContainer의 콘텐츠 노드
// 타입만 바꾼다(blockId 불변). 셋 다 nestableBlockContent라 setBlockType으로
// 표현 가능하다(content 없는 divider만 구조적 예외, 아래 별도 handler).
// 즉시 Backspace 복원은 이 파일에서 별도로 구현하지 않는다 —
// ListInputRuleExtension의 Backspace 단축키와 undo-bridge plugin이 대신
// 처리한다. Tiptap core는 addInputRules를 가진 확장마다 별도 isInputRules
// plugin 인스턴스를 만들어(이 확장도 하나를 갖는다) 단순히 "플래그가 있는
// 첫 plugin"만 찾으면 이 확장이 발동했을 때 못 찾는다 —
// list-input-rule-extension.ts는 활성 상태 판정(Backspace)과 발동 plugin
// 참조 보존(undo-bridge)을 모두 확장 비의존적으로 고쳐 이 확장의 규칙에도
// 그대로 적용된다(RD-002 DELTA-01 구현 중 실측·수정, RD-002.md "결정" 참고).
const createBlockTypeInputRule = (
  find: RegExp,
  type: NodeType,
  attrsFromMatch: (
    match: RegExpMatchArray,
  ) => Record<string, unknown> | undefined,
): InputRule =>
  new InputRule({
    find,
    handler: ({ state, range, match }) => {
      const $from = state.doc.resolve(range.from);
      const container = $from.node(-1);
      // range.to는 아직 트리거 문자(마지막 1글자, 공백)가 실제 삽입되기
      // 전의 캐럿 위치다 — input rule 메커니즘이 그 문자를 가상으로 붙여
      // regex만 매치하고 실제 문서에는 반영하지 않는다(list-input-rule-
      // extension.ts의 marker 파라미터가 항상 find의 트리거 문자를 뺀
      // 이유와 동일). 그래서 현재 paragraph 전체 텍스트는 트리거 문자를
      // 제외한 match[0]와 같아야 exact 일치다.
      const marker = match[0].slice(0, -1);
      // Tiptap matcher는 캐럿 앞 텍스트만 읽는다. 전체 pre-input paragraph와
      // selection을 별도로 확인해야 suffix·선택 대체·simulated input을
      // 막는다(list-input-rule-extension.ts와 동일 근거).
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
        .setBlockType(range.from, range.from, type, attrsFromMatch(match))
        .setStoredMarks(storedMarks);
    },
  });

// divider `---` 입력 규칙. content 없는 비포장 atom(divider-extension.ts)이라
// heading/quote와 달리 setBlockType으로 표현할 수 없다 — 대상 blockContainer
// 전체를 divider 노드로 구조적으로 치환한다(RD-002.md "결정" 근거). 기존
// blockId는 새로 발급하지 않고 치환되는 blockContainer의 blockId를 그대로
// 옮긴다 — heading/quote 등 이 파일의 다른 규칙과 같은 "같은 블록, 다른
// 타입" 계약을 유지하기 위해서다.
//
// 캐럿 배치는 divider-commands.ts의 insertDivider와 같은 규칙이다 — atom
// 안에는 캐럿이 놓일 수 없어 PM 기본 selection 매핑에 맡기면 캐럿이 삽입 앞
// 블록에 남거나 divider에 NodeSelection이 놓인다(G-EDT-001). 다음 형제가
// blockContainer면 그 선두로, 아니면(다음 형제 없음·divider·table 같은
// 비포장 노드) divider 뒤에 맨몸 paragraph를 같은 트랜잭션에 넣고 그 안에
// 캐럿을 둔다. 문서 끝 변환은 TrailingBlockExtension의 판정 술어를 깨뜨리므로
// (마지막 블록이 더 이상 blockContainer(paragraph)가 아니게 된다) 그 확장이
// 별도 append transaction으로 반응할 수도 있었지만, 이 핸들러가 같은
// transaction 안에서 이미 유효한 trailing paragraph를 만들어 두면 그 판정
// 술어가 즉시 참이 되어 추가 append는 no-op이다(insertDivider와 동일 근거).
const createDividerInputRule = (): InputRule =>
  new InputRule({
    find: /^---$/,
    handler: ({ state, range }) => {
      const $from = state.doc.resolve(range.from);
      const container = $from.node(-1);
      // 트리거 문자(세 번째 "-")는 아직 문서에 없다 — 위 heading/quote
      // 규칙과 같은 이유로 기존 텍스트는 "--"(두 글자)여야 exact 일치다.
      if (
        !state.selection.empty ||
        $from.parent.type.name !== "paragraph" ||
        container.type.name !== "blockContainer" ||
        $from.parent.textContent !== "--"
      ) {
        return null;
      }

      const dividerType = state.schema.nodes.divider;
      const paragraphType = state.schema.nodes.paragraph;
      if (dividerType === undefined || paragraphType === undefined) return null;

      const blockId =
        typeof container.attrs.blockId === "string"
          ? container.attrs.blockId
          : null;
      if (blockId === null) return null;

      const containerStart = $from.before(-1);
      const containerEnd = $from.after(-1);

      const transaction = closeHistory(state.tr);
      transaction.replaceWith(
        containerStart,
        containerEnd,
        dividerType.create({ blockId }),
      );

      const afterDivider = transaction.mapping.map(containerEnd);
      const nextSibling = transaction.doc.resolve(afterDivider).nodeAfter;
      if (nextSibling === null || nextSibling.type.name !== "blockContainer") {
        transaction.insert(afterDivider, paragraphType.create());
      }
      transaction.setSelection(
        TextSelection.create(transaction.doc, afterDivider + 2),
      );
    },
  });

export const BlockTypeInputRuleExtension = Extension.create({
  name: "blockTypeInputRule",

  addInputRules() {
    const heading = this.editor.schema.nodes.heading;
    const quote = this.editor.schema.nodes.quote;
    const checkListItem = this.editor.schema.nodes.checkListItem;
    if (
      heading === undefined ||
      quote === undefined ||
      checkListItem === undefined
    ) {
      return [];
    }

    return [
      createBlockTypeInputRule(/^(#{1,6})\s$/, heading, (match) => ({
        level: (match[1] as string).length,
      })),
      createBlockTypeInputRule(/^>\s$/, quote, () => undefined),
      createDividerInputRule(),
      // checkListItem은 heading/quote와 같은 nestableBlockContent라 divider
      // 같은 구조적 예외 없이 setBlockType으로 표현된다(RD-002 DELTA-02).
      createBlockTypeInputRule(/^\[\s*\]\s$/, checkListItem, () => ({
        checked: false,
      })),
      createBlockTypeInputRule(/^\[[Xx]\]\s$/, checkListItem, () => ({
        checked: true,
      })),
    ];
  },
});
