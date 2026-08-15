import type { JSONContent } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { BlockIdExtension } from "../src/block-id-extension.js";
import {
  TableCellExtension,
  TableExtension,
  TableRowExtension,
} from "../src/table-extension.js";

/**
 * 슬라이스 6 전용 격리 에디터: EditorController(createEditor())와 별개로
 * Table/Row/Cell 확장만 검증하는 독립 fixture. model-to-tiptap.ts/tiptap-to-model.ts의
 * 표 차단 분기를 거치지 않는다.
 */
export const createTableFixtureEditor = (content: JSONContent): Editor => {
  const editor = new Editor({
    element: document.createElement("div"),
    injectCSS: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        hardBreak: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
        heading: false,
        trailingNode: false,
      }),
      BlockIdExtension,
      TableExtension,
      TableRowExtension,
      TableCellExtension,
    ],
    content,
  });
  return editor;
};
