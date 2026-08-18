import { parseClipboardTable } from "@cp949/geul-io";
import type { IdFactory } from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import { pasteTabularData } from "./table-commands.js";

export type TablePasteOptions = {
  createId: IdFactory;
};

// 실제 ClipboardEvent를 가로채 표/TSV로 파싱되면 pasteTabularData로
// 처리하고 이벤트를 소비한다. 파싱 대상이 아니면(NOT_TABULAR) false를
// 반환해 Tiptap 기본 붙여넣기로 넘긴다(spec 9.3).
export const TablePasteExtension = Extension.create<TablePasteOptions>({
  name: "tablePaste",

  addOptions() {
    return {
      createId: () => {
        throw new Error("TablePasteExtension requires a createId option");
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const createId = this.options.createId;

    return [
      new Plugin({
        props: {
          handlePaste: (_view, event) => {
            const clipboardData = event.clipboardData;
            if (clipboardData === null) return false;

            const html = clipboardData.getData("text/html");
            const text = clipboardData.getData("text/plain");
            const clipboardInput: { html?: string; text?: string } = {};
            if (html.length > 0) clipboardInput.html = html;
            if (text.length > 0) clipboardInput.text = text;
            const parsed = parseClipboardTable(clipboardInput);
            if (!parsed.ok) return false;

            const result = pasteTabularData(editor, parsed.value, createId);
            return result.ok;
          },
        },
      }),
    ];
  },
});
