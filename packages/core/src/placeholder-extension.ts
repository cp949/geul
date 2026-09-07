import {
  isInlineContentBlockType,
  isListEntryBlockType,
} from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { DEFAULT_DICTIONARY, type Dictionary } from "./dictionary.js";

export type PlaceholderExtensionOptions = {
  // spec §8(EXT-009), RD-001-DELTA-01 — 문구는 core가 소유한다(R-4·R-7:
  // 하드코딩 대신 dictionary 소유, react는 표시 CSS만). 항상 완전한 값이다
  // — production-editor-assembly.ts가 `DEFAULT_DICTIONARY`로 폴백해 넘긴다.
  dictionary: Dictionary;
};

// 빈 paragraph는 캐럿(selection anchor)이 그 블록 안에 있을 때만, 빈
// heading·quote·codeBlock은 상시 data-placeholder 노드 데코레이션을 받는다(R-3). 빈
// textblock의 내부 위치는 position + 1 하나뿐이라 anchor 비교 하나로
// "캐럿이 그 블록 안"이 판정된다.
const placeholderDecorations = (
  state: EditorState,
  placeholder: Dictionary["placeholder"],
): DecorationSet => {
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
        ? // "{level}" 토큰을 실제 레벨 숫자로 치환한다(dictionary.ts).
          placeholder.heading.replace(
            "{level}",
            String(node.attrs.level as number),
          )
        : typeName === "quote"
          ? placeholder.quote
          : typeName === "codeBlock"
            ? placeholder.codeBlock
            : isListEntryBlockType(typeName)
              ? placeholder.listItem
              : anchor === position + 1
                ? placeholder.paragraph
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
export const PlaceholderExtension =
  Extension.create<PlaceholderExtensionOptions>({
    name: "placeholder",

    addOptions() {
      return { dictionary: DEFAULT_DICTIONARY };
    },

    addProseMirrorPlugins() {
      const { placeholder } = this.options.dictionary;
      return [
        new Plugin({
          props: {
            decorations: (state) => placeholderDecorations(state, placeholder),
          },
        }),
      ];
    },
  });
