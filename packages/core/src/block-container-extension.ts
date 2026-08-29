import { mergeAttributes, Node } from "@tiptap/core";

// PM은 한 노드에서 inline/block 콘텐츠 혼합을 금지해 paragraph/heading에 자식
// 블록을 직접 붙일 수 없다 — blockContainer가 identity(blockId)를 소유하는
// 컨테이너 노드로 강제된다(D19). nestableBlockContent만 선택적 blockGroup을
// 뒤에 가질 수 있고 leafBlockContent는 단독이어야 한다. 이 분기는 CodeBlock이
// own children을 가질 수 없도록 content expression 자체로 강제한다. table은
// 이 컨테이너로 감싸지 않고 group "block"을 유지해 doc/blockGroup의 자식으로
// 직접 들어간다.
//
// defining은 BlockNote v0.54.0 packages/core/src/pm-nodes/BlockContainer.ts의
// 참조 초기값이다(MPL 경계 — 구조만 참조, 코드 미복제).
//
// priority 1000(참조 초기값 50에서 상향): 그룹 "block"의 멤버(blockContainer,
// table)가 "block+" 채움의 ContentMatch.defaultType 경쟁에서 만난다 — 등록
// 순서(=priority 내림차순)가 앞선 쪽이 기본 채움 노드가 된다. 50이면
// table(기본 100)이 이겨, 전체선택 삭제·유일 자식 삭제처럼 PM이 "block+"를
// 새로 채우는 자리에 blockId/rowId 없는 손상된 표가 들어가 model 변환이
// TypeError로 죽는다(트랙-6 발견, block-filler-default.test.ts가 고정).
// BlockNote는 table도 blockContainer 안에 넣어 이 경쟁 자체가 없다 — 표
// 비포장(D19)을 택한 이 저장소가 스스로 만든 경쟁이므로 여기서 명시적으로
// 이긴다. 이후 그룹 "block"에 새 멤버를 추가해도 기본 채움은 항상
// blockContainer다. 이 확장은 keymap·plugin·parseHTML이 없어 priority가
// 스키마 등록 순서 밖에 영향을 주지 않는다.
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
  content: "(nestableBlockContent blockGroup?) | leafBlockContent",
  defining: true,
  priority: 1000,

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
