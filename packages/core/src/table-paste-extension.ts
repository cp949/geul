import {
  type ClipboardContentBlock,
  parseClipboardTable,
} from "@cp949/geul-io";
import type { IdFactory, IframeEmbedConfig } from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { isInTable } from "@tiptap/pm/tables";

import { selectionStartsInCodeBlock } from "./code-block-mark-guard-extension.js";
import {
  type EnabledBlockTypes,
  isBlockTypeEnabled,
} from "./model-to-tiptap.js";
import type { PasteRejectedReason } from "./table-command-error.js";
import { pasteClipboardContent } from "./table-paste-commands.js";

export type TablePasteOptions = {
  createId: IdFactory;
  onPasteRejected?: (reason: PasteRejectedReason) => void;
  enabledBlockTypes?: EnabledBlockTypes;
  // 호스트의 iframe URL 허용 설정이다(Issue #359). ClipboardPasteExtension과 같은
  // 소스를 받아 표 옆 iframe 블록의 url 판정을 표 없는 붙여넣기와 맞춘다.
  iframeEmbed?: IframeEmbedConfig;
};

// 파싱된 시퀀스에 막은 타입이 하나라도 있는지 본다. model의 모든 비표
// 블록(quote·callout·미디어 등, Issue #356 RD-005)을 보고 children이 있는 블록은
// 재귀로 훑는다. 표 data 안은 셀 내용뿐이라 훑지 않는다.
const containsBlockedType = (
  blocks: readonly ClipboardContentBlock[],
  enabledBlockTypes: EnabledBlockTypes,
): boolean =>
  blocks.some(
    (block) =>
      !isBlockTypeEnabled(block.type, enabledBlockTypes) ||
      ("children" in block &&
        block.children !== undefined &&
        containsBlockedType(block.children, enabledBlockTypes)),
  );

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
//
// 캐럿이나 범위 시작이 codeBlock 안이면 파싱 전에 false로 물러난다
// (Issue #298). Tab이 든 평문과 html 표가 코드 텍스트가 아니라 표 블록이
// 되던 문제다. 표 판정 전이라 위 "표로 인식된 뒤 소비" 계약을 깨지 않는다.
// 물러남은 거절이 아니라 onPasteRejected를 부르지 않는다. 그 뒤 처리는
// ClipboardPasteExtension의 codeBlock 분기가 맡는다(Issue #296).
//
// 파싱은 성공했어도 최상위에 table 블록이 없으면 false로 물러난다
// (Issue #315). 목록 항목 children 안에만 표가 있는 html이다. 표 밖 시퀀스는
// 첫 최상위 표 안으로 캐럿을 옮기는데, 옮길 표가 없어 PASTE_TARGET_NOT_FOUND로
// 거절돼 붙여넣기가 사라졌다. 물러남은 거절이 아니라 onPasteRejected를 부르지
// 않는다. 그 뒤 처리는 ClipboardPasteExtension의 importHtml 경로가 맡는다.
//
// enabledBlockTypes가 table을 막았으면 파싱 전에 false로 물러난다
// (Issue #328). 표 블록을 못 넣는 편집기라 이 확장이 할 일이 없다. 파서 거절
// (CLIPBOARD_TABLE_INVALID)이 붙여넣기를 소비하는 일도 막는다.
//
// 표가 허용이어도 파싱된 시퀀스에 막은 타입이 하나라도 있으면 false로
// 물러난다. 블록 children 안까지 훑는다. 스키마에 없는 노드 타입이
// pasteClipboardContent에 닿아 TypeError·RangeError를 던지던 경로를 막는다.
//
// 캐럿이나 선택이 표 안이면 이 검사를 하지 않는다. 표 안은 격자 연산만 해서
// 비표 블록 PM 노드를 만들지 않으므로 예외가 없다. 물러나면 표 셀 경로가 표
// 포함 html을 받지 않아 붙여넣기가 조용히 사라진다.
//
// 이 물러남도 거절이 아니라 onPasteRejected를 부르지 않는다. 그 뒤 처리는
// ClipboardPasteExtension의 text/plain 폴백(Issue #318)이 맡는다.
//
// onPasteRejected는 두 거절 경로(파서·명령) 모두에서 호출되는 읽기 전용
// 알림이다 — 어떤 transaction도 dispatch하지 않아 위 원자성 계약과
// 충돌하지 않는다. NOT_TABULAR(기본 붙여넣기 폴백)에서는 호출하지 않는다
// — 거절이 아니라 애초에 표 붙여넣기 대상이 아니었던 경우다(Issue #36).
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
    const onPasteRejected = this.options.onPasteRejected;
    const enabledBlockTypes = this.options.enabledBlockTypes;
    const iframeEmbed = this.options.iframeEmbed;

    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            if (selectionStartsInCodeBlock(view.state.selection)) return false;
            if (!isBlockTypeEnabled("table", enabledBlockTypes)) return false;

            const clipboardData = event.clipboardData;
            if (clipboardData === null) return false;

            const html = clipboardData.getData("text/html");
            const text = clipboardData.getData("text/plain");
            const clipboardInput: Parameters<typeof parseClipboardTable>[0] =
              {};
            if (html.length > 0) clipboardInput.html = html;
            if (text.length > 0) clipboardInput.text = text;
            if (iframeEmbed !== undefined) {
              clipboardInput.iframeEmbed = iframeEmbed;
            }
            const parsed = parseClipboardTable(clipboardInput);
            if (!parsed.ok) {
              if (parsed.error.code === "NOT_TABULAR") return false;
              onPasteRejected?.(parsed.error);
              return true;
            }

            if (!parsed.value.some((block) => block.type === "table")) {
              return false;
            }
            if (
              enabledBlockTypes !== undefined &&
              !isInTable(view.state) &&
              containsBlockedType(parsed.value, enabledBlockTypes)
            ) {
              return false;
            }

            const result = pasteClipboardContent(
              editor,
              parsed.value,
              createId,
            );
            if (!result.ok) onPasteRejected?.(result.error);
            return true;
          },
        },
      }),
    ];
  },
});
