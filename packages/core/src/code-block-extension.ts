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
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { "data-be-code-block": "" }),
      ["code", 0],
    ];
  },
});
