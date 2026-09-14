import { mergeAttributes, Node } from "@tiptap/core";

// codeBlock은 blockContainer가 identity와 자식 구조를 소유하는 내용 노드다.
// source에는 text만 허용하고 모든 mark를 금지한다. language는 PM attrs에만
// 보존하며 편집기 내부 DOM에는 노출하지 않는다. 외부 HTML 변환은 io가
// 소유하므로 parseHTML 규칙을 선언하지 않는다.
export const CodeBlockExtension = Node.create({
  name: "codeBlock",
  group: "leafBlockContent",
  content: "text*",
  marks: "",
  code: true,
  defining: true,

  addAttributes() {
    return {
      language: {
        default: null,
        renderHTML: () => ({}),
      },
      // wrap은 language와 달리 내부 DOM에 직접 투영한다(spec — 줄바꿈 여부는
      // 순수 CSS 관심사, react가 `white-space: pre-wrap`을 이 attribute로
      // 스코프한다). null(미설정)과 명시적 false는 attribute 자체를
      // 생략한다(media textAlignment/showPreview와 동일 관례,
      // media-block-extension.ts — "null은 attribute 자체를 생략한다") —
      // `default: false`를 쓰면 미설정 문서도 항상 PM attrs에서 `false`가
      // 돼 model의 optional `wrap?: boolean`과 "미설정"/"명시적 off"를
      // 구분할 수 없어진다.
      wrap: {
        default: null,
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.wrap === true ? { "data-geul-code-wrap": "" } : {},
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { "data-geul-code-block": "" }),
      ["code", 0],
    ];
  },
});
