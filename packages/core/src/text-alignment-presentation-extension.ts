import { isCanonicalTextBlockAlign } from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * 텍스트 블록의 textAlignment(Issue #424, D1)는 blockContainer attrs에
 * 저장되지만 그 attr은 rendered:false다(block-container-extension.ts).
 * 화면에는 container의 첫 자식인 blockContent 노드에 인라인 `text-align`을
 * 얹는다. container에 주면 자식 블록 group이 정렬을 상속해 의도하지 않은
 * 블록이 정렬된다. 정렬은 파생 표시라 저장 JSON에 흔적이 없다
 * (callout-background-presentation-extension.ts와 같은 패턴).
 */
const textAlignmentDecorations = (state: EditorState): DecorationSet => {
  const decorations: Decoration[] = [];

  state.doc.descendants((node, position) => {
    if (node.type.name !== "blockContainer") return true;

    const textAlignment = node.attrs.textAlignment;
    const content = node.firstChild;
    // 저장값은 model이 검증하지만 CSS에 쓰는 값이라 한 번 더 거른다.
    if (
      content !== null &&
      typeof textAlignment === "string" &&
      isCanonicalTextBlockAlign(textAlignment)
    ) {
      const from = position + 1;
      decorations.push(
        Decoration.node(from, from + content.nodeSize, {
          style: `text-align:${textAlignment}`,
        }),
      );
    }

    return true;
  });

  return DecorationSet.create(state.doc, decorations);
};

export const TextAlignmentPresentationExtension = Extension.create({
  name: "textAlignmentPresentation",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: textAlignmentDecorations,
        },
      }),
    ];
  },
});
