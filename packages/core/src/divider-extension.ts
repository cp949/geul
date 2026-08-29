import { mergeAttributes, Node } from "@tiptap/core";

// divider는 group "block"의 직접 멤버 atom이며 blockContainer로 감싸지
// 않는다 — 표(table-extension.ts)와 동형이다. content expression을 아예
// 선언하지 않으면(atom·leaf) "divider는 자식(blockGroup)을 가질 수 없다"
// (spec §4.2 리프 블록)가 스키마 자체로 강제된다 — 별도 검증 코드가
// 필요 없다.
//
// parseHTML(노드 단위 DOM 파싱 규칙)을 선언하지 않는다: BlockIdExtension은
// blockContainer에만 id를 사후 배정하므로(block-id-extension.ts) hr parse
// 규칙이 있으면 외부 HTML 붙여넣기가 id 없는/중복 id divider를 만들고,
// model 변환 검증 실패로 에디터가 영구 desync된다(표가 parseHTML을
// 미선언한 것과 같은 근거, table-extension.ts 참조). 붙여넣은 <hr>은
// 무시된다(클립보드 hr 정규화는 후속 슬라이스). id는 명령·변환기가 명시
// 배정한다.
//
// priority 100(Node.create 기본값, 명시 유지): blockContainer(1000)보다
// 낮아야 doc·blockGroup의 "block+" 채움에서 ContentMatch.defaultType 경쟁에
// 지지 않는다(block-container-extension.ts 참조, G-EDT-003) — 채움 기본
// 노드는 항상 blockContainer여야 한다.
//
// 참조 구현 출처: BlockNote v0.54.0 packages/core/src/blocks/Divider/block.ts
// (구조만 참조, 코드 미복제).
export const DividerExtension = Node.create({
  name: "divider",
  group: "block",
  atom: true,
  priority: 100,

  addAttributes() {
    return {
      blockId: {
        default: null,
        renderHTML: (attributes) =>
          typeof attributes.blockId === "string" &&
          attributes.blockId.length > 0
            ? { "data-be-block-id": attributes.blockId }
            : {},
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["hr", mergeAttributes(HTMLAttributes)];
  },
});
