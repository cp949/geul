import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const BULLET_MARKER = "•";

/**
 * doc/blockGroup 직속 blockContainer의 목록 콘텐츠를 읽는다. 다른 깊이의
 * descendant는 해당 부모 scope의 번호 연속성에 관여하지 않는다.
 */
const isSiblingScope = (parent: ProseMirrorNode | null): boolean =>
  parent?.type.name === "doc" || parent?.type.name === "blockGroup";

/** 현재 PM 문서에서 파생 marker를 blockContainer decoration으로 계산한다. */
const listPresentationDecorations = (state: EditorState): DecorationSet => {
  const decorations: Decoration[] = [];
  const previousNumberByScope = new Map<ProseMirrorNode, number>();

  state.doc.descendants((node, position, parent) => {
    if (!isSiblingScope(parent) || parent === null) return true;

    // table도 doc/blockGroup의 직속 형제다. blockContainer가 아니면 번호
    // 연속 경계를 끊고, 표 내부 subtree는 목록 표시 계산에서 제외한다.
    if (node.type.name !== "blockContainer") {
      previousNumberByScope.delete(parent);
      return node.type.name !== "table";
    }

    const content = node.firstChild;
    if (content?.type.name === "bulletListItem") {
      previousNumberByScope.delete(parent);
      decorations.push(
        Decoration.node(position, position + node.nodeSize, {
          "data-be-list-marker": BULLET_MARKER,
        }),
      );
      return true;
    }

    if (content?.type.name === "numberedListItem") {
      const explicit = content.attrs.startNumber;
      const number =
        typeof explicit === "number"
          ? explicit
          : (previousNumberByScope.get(parent) ?? 0) + 1;
      previousNumberByScope.set(parent, number);
      decorations.push(
        Decoration.node(position, position + node.nodeSize, {
          "data-be-list-marker": `${String(number)}.`,
        }),
      );
      return true;
    }

    previousNumberByScope.delete(parent);
    return true;
  });

  return DecorationSet.create(state.doc, decorations);
};

// 목록 marker는 저장 attrs가 아닌 문서 상태의 파생 표시다. decorations prop이
// transaction마다 현재 state를 다시 읽으므로 split/join/indent/outdent 뒤에도
// 별도 저장 transaction 없이 갱신된다(G-EDT-001).
export const ListPresentationExtension = Extension.create({
  name: "listPresentation",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: listPresentationDecorations,
        },
      }),
    ];
  },
});
