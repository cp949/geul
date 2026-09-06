import type { CustomBlock } from "@cp949/geul-model";
import { mergeAttributes, Node } from "@tiptap/core";

import type { CustomBlockDefinition } from "./custom-extension-definitions.js";
import type { EditorController } from "./editor-controller-types.js";

// EditorController를 import type으로 참조한다(런타임 순환 의존 없음 —
// TypeScript type-only import는 컴파일 시 완전히 지워진다, RD-002-DELTA-11
// "결정" 4). 이 파일은 그 값을 들여다보지 않고 NodeView 콜백에 그대로
// 전달만 한다.

// 등록된 커스텀 block(spec §4.4, RD-002 "포함 범위")마다 divider·media와
// 동일한 "group: block 직접 멤버, atom, blockId 자체 소유" PM 노드를 하나
// 만든다(G-EDT-003). content expression을 선언하지 않는다 — model의
// `content: "none"|"inline"`(DELTA-11.md "결정" 1)은 attrs(contentMode)에만
// 보존하고 실제 PM 콘텐츠 표현은 만들지 않는다(인라인 텍스트 편집은
// model에 저장 필드가 없어 이번 범위 밖).
//
// priority 100(divider·media와 동일 근거, G-EDT-003): blockContainer(1000)
// 보다 낮아야 doc·blockGroup의 "block+" 채움에서 ContentMatch.defaultType
// 경쟁에 지지 않는다.
//
// parseHTML을 선언하지 않는다(divider·media와 동일 근거) — 외부 HTML
// 붙여넣기가 이 노드를 만들 경로가 없다(io HTML/GFM 연결은 범위 밖,
// DELTA-11.md "범위 밖").
const blockIdAttribute = () => ({
  blockId: {
    default: null,
    renderHTML: (attributes: Record<string, unknown>) =>
      typeof attributes.blockId === "string" && attributes.blockId.length > 0
        ? { "data-be-block-id": attributes.blockId }
        : {},
  },
});

export const createCustomBlockExtension = (
  type: string,
  definition: CustomBlockDefinition,
  editor: EditorController,
) =>
  Node.create({
    name: type,
    group: "block",
    atom: true,
    priority: 100,

    addAttributes() {
      return {
        ...blockIdAttribute(),
        contentMode: { default: "none", renderHTML: () => ({}) },
        props: { default: null, renderHTML: () => ({}) },
      };
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes)];
    },

    // render()가 만든 element를 NodeView dom으로 그대로 쓴다. contentRef는
    // 이번 DELTA에서 PM contentDOM으로 연결하지 않는다 — content
    // expression 없는 atom 노드에 contentDOM을 주면 PM이 즉시 예외를
    // 던진다(DELTA-11.md "결정" 1, 예약 필드).
    addNodeView() {
      return ({ node }) => {
        const blockId =
          typeof node.attrs.blockId === "string" ? node.attrs.blockId : "";
        const block: CustomBlock = {
          id: blockId,
          type,
          content: node.attrs.contentMode === "inline" ? "inline" : "none",
          ...(node.attrs.props === null || node.attrs.props === undefined
            ? {}
            : { props: node.attrs.props as NonNullable<CustomBlock["props"]> }),
        };
        const { element } = definition.render({ block, editor });
        // identity 속성은 항상 컨테이너(여기서는 이 atom 노드 자신)가
        // 소유한다(G-EDT-003) — 소비자 render()가 직접 채우지 않아도
        // block-side-menu 등 기존 [data-be-block-id] 조회 관례가 이
        // 노드도 찾을 수 있어야 한다.
        if (blockId.length > 0) {
          element.setAttribute("data-be-block-id", blockId);
        }
        return { dom: element };
      };
    },
  });
