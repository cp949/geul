import { Node } from "@tiptap/core";

// 목록 항목은 paragraph·heading·quote와 같은 blockContainer 내용 노드다.
// 안정 ID와 optional children은 각각 blockContainer·blockGroup이 소유하므로
// 이 노드는 inline content만 가진다. production extension assembly와 DOM
// 표현은 DELTA-03이 소유한다.
const listItemContentNode = {
  group: "nestableBlockContent",
  content: "inline*",
} as const;

export const BulletListItemExtension = Node.create({
  name: "bulletListItem",
  priority: 99,
  ...listItemContentNode,
});

// checked 기본값은 numberedListItem.startNumber·toggleListItem.collapsed의
// null(=model 필드 부재 표현)과 다르다 — model CheckListItemBlock.checked는
// 필수 boolean이라 부재를 표현할 필요가 없다. false를 기본값으로 써서
// PM 노드 생성 시 항상 유효한 boolean을 갖게 한다(RD-001 DELTA-02).
export const CheckListItemExtension = Node.create({
  name: "checkListItem",
  priority: 99,
  ...listItemContentNode,

  addAttributes() {
    return {
      checked: { default: false, rendered: false },
    };
  },
});

export const NumberedListItemExtension = Node.create({
  name: "numberedListItem",
  priority: 99,
  ...listItemContentNode,

  addAttributes() {
    return {
      // null은 model의 startNumber 필드 부재와 직대응한다. 범위 검증은
      // model parseDocument가 단독 소유하므로 PM attr validator를 복제하지 않는다.
      startNumber: { default: null, rendered: false },
    };
  },
});

// toggleListItem은 bulletListItem/numberedListItem과 같은 nestableBlockContent
// content node다(RD-003, 로드맵 D2 정정 — ListItemBlockType이 아닌
// NestableBlockType에 직접 추가). collapsed 기본값 null은 model의 collapsed
// 필드 부재와 직대응한다 — heading의 isToggleable/collapsed와 같은 표현
// 패턴이다. 접힘 자식 숨김은 core 전용 decoration
// (toggle-collapse-visibility-extension.ts)이 attrs.collapsed를 직접 읽어
// 처리하고, 사용자 커맨드(toggleListItemCollapse 등)는 RD-004 범위다.
export const ToggleListItemExtension = Node.create({
  name: "toggleListItem",
  priority: 99,
  ...listItemContentNode,

  addAttributes() {
    return {
      collapsed: { default: null, rendered: false },
    };
  },
});
