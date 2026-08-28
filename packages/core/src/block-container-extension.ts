import { mergeAttributes, Node } from "@tiptap/core";

// PM은 한 노드에서 inline/block 콘텐츠 혼합을 금지해 paragraph/heading에 자식
// 블록을 직접 붙일 수 없다 — blockContainer가 identity(blockId)를 소유하는
// 컨테이너 노드로 강제된다(D19). content "blockContent blockGroup?"는 "표는
// 자식 블록을 가질 수 없다"(spec §2.2, D15)를 content expression 자체가
// 구조적으로 강제한다 — table은 이 컨테이너로 감싸지 않고 group "block"만
// 유지해(table-extension.ts:66, 무변경) doc/blockGroup의 자식으로 직접
// 들어간다. 표는 행만 담을 수 있어 blockGroup(그룹 "block"의 형제 컨텐츠)을
// 자식으로 가질 스키마 경로가 없다.
//
// defining/priority는 BlockNote v0.54.0 packages/core/src/pm-nodes/BlockContainer.ts의
// 참조 초기값이다(MPL 경계 — 구조만 참조, 코드 미복제).
//
// parseHTML(노드 단위 DOM 파싱 규칙)을 선언하지 않는다(D13 계승) — 외부
// HTML의 중첩 div가 중첩 컨테이너로 파싱되지 않는다(table-extension.ts의
// 표 parseHTML 미선언과 동형 근거: 규칙이 있으면 클립보드로 들어온 임의의
// data-be-block-id div가 id 중복/미검증 컨테이너를 만든다). 붙여넣은
// <p>/<hN>은 PM slice-fitting(ContentMatch.findWrapping)이 스키마 group
// 요구에 의해 새 blockContainer로 자동 wrap한다 — 별도 코드 불필요.
export const BlockContainerExtension = Node.create({
  name: "blockContainer",
  group: "block",
  content: "blockContent blockGroup?",
  defining: true,
  priority: 50,

  addAttributes() {
    return {
      blockId: {
        default: null,
        renderHTML: (attributes) => {
          const blockId = attributes.blockId;
          return typeof blockId === "string" && blockId.length > 0
            ? { "data-be-block-id": blockId }
            : {};
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes), 0];
  },
});

// 자식 블록 목록의 wrapper. parseHTML 미선언 근거는 BlockContainerExtension과
// 동일하다. DOM 표현은 data-be-block-group 불리언 속성으로 식별한다(표의
// data-be-* 명명 관례를 따른다) — 렌더 전용이며 이 속성으로 파싱하지 않는다.
export const BlockGroupExtension = Node.create({
  name: "blockGroup",
  content: "block+",

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-be-block-group": "" }),
      0,
    ];
  },
});
