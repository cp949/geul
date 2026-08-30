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
