import { parseClipboardTable } from "@cp949/geul-io";
import type { IdFactory } from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import { pasteClipboardContent } from "./table-paste-commands.js";

export type TablePasteOptions = {
  createId: IdFactory;
};

// 실제 ClipboardEvent를 가로채 표/TSV/혼합 시퀀스로 파싱되면
// pasteClipboardContent로 처리하고 이벤트를 소비한다. 파싱 대상이
// 아니면(NOT_TABULAR) false를 반환해 Tiptap 기본 붙여넣기로 넘긴다(spec 9.3).
//
// 클립보드가 표로 인식된 뒤에는 어떤 경로로 거절되든 이벤트를 소비한다 —
// 파서 거절(CLIPBOARD_TABLE_INVALID)이든 명령 거절(PASTE_MERGE_CONFLICT,
// CELL_LIMIT_EXCEEDED, CLIPBOARD_CONTENT_INVALID, PASTE_TARGET_NOT_FOUND
// 등)이든 마찬가지다. 기본 붙여넣기로 넘기면 TSV는 preserveWhitespace
// 파싱을 타서 탭이 그대로 문서에 들어가고(readEditorDocument가 TypeError로
// 터져 모델↔에디터 영구 desync), HTML은 표 구조가 소실된 텍스트로 뭉개진다
// — 둘 다 "전체 거부" 계약 위반이다. 거절된 명령은 아무것도 dispatch하지
// 않으므로 문서·selection·stored mark가 그대로 보존된다(G-EDT-001).
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
            if (!parsed.ok) return parsed.error.code !== "NOT_TABULAR";

            pasteClipboardContent(editor, parsed.value, createId);
            return true;
          },
        },
      }),
    ];
  },
});
