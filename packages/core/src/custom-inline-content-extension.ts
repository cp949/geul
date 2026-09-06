import type { InlineContentItem } from "@cp949/geul-model";
import { mergeAttributes, Node } from "@tiptap/core";

import type {
  CustomInlineContentDefinition,
  EditorController,
} from "./editor-controller.js";

// EditorController를 import type으로 참조한다(런타임 순환 의존 없음,
// custom-block-extension.ts와 동일 근거 — RD-002-DELTA-11 "결정" 4). 이
// 파일도 그 값을 들여다보지 않고 NodeView 콜백에 그대로 전달만 한다.

// 등록된 커스텀 inline 원소(spec §4.4, EXT-002)마다 PM inline atom
// 노드를 하나 만든다(RD-002-DELTA-18). custom-block-extension.ts와 같은
// "addNodeView가 render() element를 그대로 dom으로 쓴다" 구조이지만,
// block과 달리 identity(blockId)가 없다 — InlineContentItem의 커스텀
// 변형은 spec §4.2상 `type`/`customType`/`props`뿐이다. `group: "inline"`
// 하나만으로 paragraph/heading/quote/table cell 등 기존 `"inline*"`
// content expression(table-extension.ts/quote-extension.ts/
// list-item-extension.ts/production-editor-assembly.ts)에 자동 참여한다
// — content expression 자체를 바꿀 필요가 없다(착수 전 실측).
//
// priority를 지정하지 않는다 — customBlocks의 priority 100은 blockGroup
// "block+" 채움에서 ContentMatch.defaultType 경쟁을 피하기 위한 것이었다
// (G-EDT-003, block 전용 문제). inline 노드는 "inline*" 그룹의 기본
// defaultType이 항상 text이고 이 atom이 그 자리를 놓고 경쟁할 일이 없다.
//
// parseHTML을 선언하지 않는다(customBlocks와 동일 근거) — 외부 HTML
// 붙여넣기가 이 노드를 만들 경로가 없다(io HTML/GFM 연결은 범위 밖,
// RD-002-DELTA-18.md "범위 밖").
export const createCustomInlineContentExtension = (
  type: string,
  definition: CustomInlineContentDefinition,
  editor: EditorController,
) =>
  Node.create({
    name: type,
    group: "inline",
    inline: true,
    atom: true,

    addAttributes() {
      return {
        props: { default: null, renderHTML: () => ({}) },
      };
    },

    renderHTML({ HTMLAttributes }) {
      return ["span", mergeAttributes(HTMLAttributes)];
    },

    // render()가 만든 element를 NodeView dom으로 그대로 쓴다(customBlocks와
    // 동일 계약) — CustomInlineContentDefinition.render는 spec §4.4상
    // HTMLElement를 직접 반환한다({element} 래핑 없음, CustomBlockDefinition과
    // 다른 시그니처).
    addNodeView() {
      return ({ node }) => {
        const item: Extract<InlineContentItem, { type: "custom" }> = {
          type: "custom",
          customType: type,
          ...(node.attrs.props === null || node.attrs.props === undefined
            ? {}
            : {
                props: node.attrs.props as NonNullable<
                  Extract<InlineContentItem, { type: "custom" }>["props"]
                >,
              }),
        };
        const element = definition.render({ item, editor });
        return { dom: element };
      };
    },
  });
