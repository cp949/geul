import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * callout(Issue #209, BLK-020)의 backgroundColor는 blockContainer attrs에
 * 저장되지만 그 attr은 rendered:false다(block-container-extension.ts, RD-003
 * D5 — 일반 텍스트 블록 7종 전체는 배경색이 편집 화면에 시각 렌더되지
 * 않는다, 저장 값만 정확하면 된다). callout은 색상 프리셋(Info/Warning/
 * Error/Success, block-side-menu-menu.tsx)이 기능 자체라 이 예외가
 * 필요하다 — 저장 attrs와 D5는 그대로 두고(다른 6개 nestable 타입은
 * 영향 없음) decoration으로 [data-geul-callout] DOM에 시각 표시만 얹는다
 * (list-presentation-extension.ts와 같은 패턴 — 파생 표시라 저장 JSON에
 * 흔적이 없다).
 */
const calloutBackgroundDecorations = (state: EditorState): DecorationSet => {
  const decorations: Decoration[] = [];

  state.doc.descendants((node, position) => {
    if (node.type.name !== "blockContainer") return true;

    const backgroundColor = node.attrs.backgroundColor;
    const content = node.firstChild;
    if (
      content?.type.name === "callout" &&
      typeof backgroundColor === "string" &&
      backgroundColor.length > 0
    ) {
      const from = position + 1;
      decorations.push(
        Decoration.node(from, from + content.nodeSize, {
          style: `background-color:${backgroundColor}`,
        }),
      );
    }

    return true;
  });

  return DecorationSet.create(state.doc, decorations);
};

export const CalloutBackgroundPresentationExtension = Extension.create({
  name: "calloutBackgroundPresentation",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: calloutBackgroundDecorations,
        },
      }),
    ];
  },
});
