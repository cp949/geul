import {
  isInlineContentBlockType,
  isListItemBlockType,
} from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// 문구는 core가 소유한다(R-4·R-7: 영어 하드코딩, react는 표시 CSS만).
const PARAGRAPH_PLACEHOLDER = "Enter text or type '/' for commands";
// quote placeholder는 heading처럼 캐럿 위치와 무관하게 상시 표시한다 —
// spec §6.4 "빈 블록에 타입별 placeholder"의 확장이고, 구조 블록의 상시
// 표시는 heading이 전례다. 빈 quote는 테두리(blockquote 스타일)만 남아
// 타입 힌트가 없으면 무엇인지 알 수 없다(Issue #38 슬라이스 3).
const QUOTE_PLACEHOLDER = "Quote";
const CODE_PLACEHOLDER = "Code";
const LIST_ITEM_PLACEHOLDER = "List item";

// 빈 paragraph는 캐럿(selection anchor)이 그 블록 안에 있을 때만, 빈
// heading·quote·codeBlock은 상시 data-placeholder 노드 데코레이션을 받는다(R-3). 빈
// textblock의 내부 위치는 position + 1 하나뿐이라 anchor 비교 하나로
// "캐럿이 그 블록 안"이 판정된다.
const placeholderDecorations = (state: EditorState): DecorationSet => {
  const decorations: Decoration[] = [];
  const anchor = state.selection.anchor;

  state.doc.descendants((node, position) => {
    // 표 셀 content는 "inline*"이라(table-extension.ts) 셀 안에 paragraph/
    // heading/quote가 없다 — 셀 제외(R-9)는 스키마가 보장하므로 표
    // 서브트리는 내려가지 않는다. divider는 atom·콘텐츠 없음이라 "빈
    // 블록"이 아니다(대상 아님).
    if (node.type.name === "table") return false;
    const typeName = node.type.name;
    if (!isInlineContentBlockType(typeName)) {
      return true;
    }
    if (node.content.size > 0) return false;

    const text =
      typeName === "heading"
        ? `Heading ${node.attrs.level as number}`
        : typeName === "quote"
          ? QUOTE_PLACEHOLDER
          : typeName === "codeBlock"
            ? CODE_PLACEHOLDER
            : isListItemBlockType(typeName)
              ? LIST_ITEM_PLACEHOLDER
              : anchor === position + 1
                ? PARAGRAPH_PLACEHOLDER
                : null;
    if (text !== null) {
      decorations.push(
        Decoration.node(position, position + node.nodeSize, {
          "data-placeholder": text,
        }),
      );
    }
    return false;
  });

  return DecorationSet.create(state.doc, decorations);
};

// 빈 블록 placeholder(UI-009, spec §6.4). 데코레이션으로만 존재해 저장
// 문서에 흔적이 없다. 표시는 react가 [data-placeholder]::before CSS로
// 그린다(_editor.scss, R-7).
export const PlaceholderExtension = Extension.create({
  name: "placeholder",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: placeholderDecorations,
        },
      }),
    ];
  },
});
