/**
 * enabledBlockTypes가 막은 타입에 대한 `editor.commands`의 거절 매트릭스를
 * 고정한다(Issue #370). `Object.keys(editor.commands)` 전체를 "막은 타입을
 * 거절한다" 또는 "블록 타입과 무관하다"로 분류한 표가 정본이다. 명령을
 * 추가하면 이 표에도 분류를 추가해야 하고, 표에 없는 키나 키에 없는 표 항목은
 * 실패한다. 분류 기준은 소스(packages/core/src)에서 읽은 입력·결과다.
 *
 * - 거절 분류: 막은 타입을 입력(변환 대상, 삽입 종류)으로 받거나 새 노드로
 *   만드는 명령.
 * - 무관 분류: 문서에 이미 있는 블록의 attrs·마크·위치·선택만 바꾸는 명령.
 *   막은 타입은 문서에 존재할 수 없으므로 이 명령들은 타입을 판정하지 않는다.
 *
 * 거절 분류 명령은 막은 타입 설정에서 실제로 호출해 거절 코드를 확인한다.
 * 변환 계열은 COMMAND_NOT_APPLICABLE, 삽입·조작 계열은
 * EDITOR_FEATURE_UNAVAILABLE이다. 거절은 문서와 undo 스택을 바꾸지 않는다.
 * 이 파일은 현재 동작을 기록하므로 거절 코드를 통일하는 변경은 표를 함께
 * 바꿔야 한다.
 */
import type { TabularData } from "@cp949/geul-io";
import type { Block } from "@cp949/geul-model";
import { undoDepth } from "@tiptap/pm/history";
import { describe, expect, it } from "vitest";

import {
  type CreateEditorOptions,
  createEditor,
  type EditorController,
} from "../src/index.js";
import type { MediaBlockKind } from "../src/media-block-kind.js";
import {
  documentOf,
  listItemBlock,
  mountTiptapEditor,
  sequentialIds,
} from "./editor-controller-support.js";

type EnabledBlockTypes = NonNullable<CreateEditorOptions["enabledBlockTypes"]>;
type CommandName = keyof EditorController["commands"];
type RejectionCode = "COMMAND_NOT_APPLICABLE" | "EDITOR_FEATURE_UNAVAILABLE";

// 거절 분류 명령 하나의 호출 시나리오. 막은 타입 설정과 호출, 기대 코드를 묶는다.
type RejectionCase = {
  title: string;
  enabledBlockTypes: EnabledBlockTypes;
  run: (editor: EditorController) => unknown;
  code: RejectionCode;
};

// 기준 문서: 글머리 목록 블록 둘. paragraph·heading 등을 막은 설정에서도
// 문서 로드가 거절되지 않는다.
const baseBlocks = (): Block[] => [
  listItemBlock("a", "bulletListItem", "first"),
  listItemBlock("b", "bulletListItem", "second"),
];

// 막은 타입 설정(미지정이면 대조군)으로 기준 문서를 마운트한다. 캐럿은 첫
// 블록 텍스트 안(표 밖)에 둔다.
const setup = (enabledBlockTypes?: EnabledBlockTypes) => {
  const editor = createEditor({
    initialDocument: documentOf(...baseBlocks()),
    createId: sequentialIds("new"),
    ...(enabledBlockTypes === undefined ? {} : { enabledBlockTypes }),
  });
  const { tiptap } = mountTiptapEditor(editor);
  tiptap.commands.setTextSelection(1);
  return { editor, tiptap };
};

/**
 * 명령 객체의 키 목록을 구한다. 표의 정본이 되는 열거라 마운트 없이 만든
 * 편집기에서 읽고 바로 해제한다(G-TST-003).
 */
const listCommandKeys = (): string[] => {
  const editor = createEditor({
    initialDocument: documentOf(...baseBlocks()),
    createId: sequentialIds("new"),
  });
  try {
    return Object.keys(editor.commands);
  } finally {
    editor.destroy();
  }
};

const deny = (...types: Block["type"][]): EnabledBlockTypes => ({
  mode: "deny",
  types,
});

const TABULAR_DATA: TabularData = {
  columnCount: 1,
  rows: [
    {
      cells: [
        { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [{ text: "A" }] },
      ],
    },
  ],
};

const MEDIA_KINDS: readonly MediaBlockKind[] = [
  "file",
  "image",
  "video",
  "audio",
  "iframe",
];

// 질의 계약(block-type-blocker-enabled-block-types.test.ts)과 같은 재현 설정.
const DENY_TEXT_TYPES = deny("quote", "heading", "paragraph", "callout");

/**
 * 막은 타입을 거절하는 명령과 시나리오 표. 변환 계열(setBlockType 등)은
 * 대상 타입 노드가 스키마에 없어 COMMAND_NOT_APPLICABLE로 수렴하고, 삽입·조작
 * 계열은 래퍼나 명령 모듈이 EDITOR_FEATURE_UNAVAILABLE로 거절한다.
 * insertParagraphAfter는 삽입 계열이지만 현재 코드가
 * COMMAND_NOT_APPLICABLE을 낸다(paragraph 노드 부재를 false로 수렴).
 */
const REJECTING_COMMANDS: Partial<Record<CommandName, RejectionCase[]>> = {
  // 변환 대상 타입을 입력으로 받는다. 막은 타입이면 노드 타입이 없어 거절한다.
  setBlockType: [
    {
      title: "quote 대상 변환",
      enabledBlockTypes: DENY_TEXT_TYPES,
      run: (editor) => editor.commands.setBlockType("a", { type: "quote" }),
      code: "COMMAND_NOT_APPLICABLE",
    },
    {
      title: "heading 대상 변환",
      enabledBlockTypes: DENY_TEXT_TYPES,
      run: (editor) =>
        editor.commands.setBlockType("a", { type: "heading", level: 2 }),
      code: "COMMAND_NOT_APPLICABLE",
    },
  ],
  // 위와 같은 대상 타입 입력. 여러 블록을 한 transaction으로 바꾼다.
  setBlockTypes: [
    {
      title: "callout 대상 변환",
      enabledBlockTypes: DENY_TEXT_TYPES,
      run: (editor) =>
        editor.commands.setBlockTypes(["a", "b"], { type: "callout" }),
      code: "COMMAND_NOT_APPLICABLE",
    },
  ],
  // 새 paragraph 노드를 만든다. paragraph를 막으면 노드 타입이 없다.
  insertParagraphAfter: [
    {
      title: "paragraph를 막은 설정",
      enabledBlockTypes: deny("paragraph"),
      run: (editor) => editor.commands.insertParagraphAfter("a"),
      code: "COMMAND_NOT_APPLICABLE",
    },
  ],
  // divider와 동반 paragraph 노드를 만든다. 둘 중 하나만 막아도 래퍼가 거절한다.
  insertDivider: [
    {
      title: "divider를 막은 설정",
      enabledBlockTypes: deny("divider"),
      run: (editor) => editor.commands.insertDivider("a"),
      code: "EDITOR_FEATURE_UNAVAILABLE",
    },
    {
      title: "paragraph를 막은 설정",
      enabledBlockTypes: deny("paragraph"),
      run: (editor) => editor.commands.insertDivider("a"),
      code: "EDITOR_FEATURE_UNAVAILABLE",
    },
  ],
  // kind 문자열이 곧 노드 타입 이름이다. kind를 막으면 명령 모듈이 거절한다.
  insertMediaBlock: MEDIA_KINDS.map((kind) => ({
    title: `${kind}를 막은 설정`,
    enabledBlockTypes: deny(kind),
    run: (editor: EditorController) =>
      editor.commands.insertMediaBlock("a", kind),
    code: "EDITOR_FEATURE_UNAVAILABLE" as const,
  })),
  // table 노드를 만든다. table을 막으면 래퍼가 거절한다.
  insertTable: [
    {
      title: "table을 막은 설정",
      enabledBlockTypes: deny("table"),
      run: (editor) =>
        editor.commands.insertTable("a", { rows: 2, columns: 2 }),
      code: "EDITOR_FEATURE_UNAVAILABLE",
    },
  ],
  // table 노드를 만든다. table을 막으면 래퍼가 거절한다.
  pasteTabularData: [
    {
      title: "table을 막은 설정",
      enabledBlockTypes: deny("table"),
      run: (editor) => editor.commands.pasteTabularData(TABULAR_DATA),
      code: "EDITOR_FEATURE_UNAVAILABLE",
    },
  ],
};

/**
 * 블록 타입과 무관한 명령과 근거 표. 값은 소스에서 읽은 근거 한 줄이다.
 * 이 명령들은 blockId로 문서에 이미 있는 블록(막지 않은 타입)을 찾아 attrs·
 * 마크·위치·선택·이력만 바꾼다. 막은 타입은 문서에 존재할 수 없어 대상이 되지
 * 않는다.
 */
const UNRELATED_COMMANDS: Partial<Record<CommandName, string>> = {
  setText:
    "기존 블록의 인라인 텍스트만 바꾼다(generic-text-commands.ts). 노드 타입을 만들지 않는다.",
  moveBlockBefore:
    "기존 블록을 옮긴다(generic-block-move-commands.ts). 노드를 새로 만들지 않는다.",
  moveSelectedBlocksBefore:
    "블록 선택 범위를 옮긴다(generic-block-move-commands.ts). 노드를 새로 만들지 않는다.",
  selectBlockRange: "블록 선택 상태만 바꾼다(selection-cursor-commands.ts).",
  clearBlockSelection: "블록 선택 상태만 지운다(selection-cursor-commands.ts).",
  duplicateBlock:
    "문서에 있는 블록의 하위 트리를 같은 타입으로 복제한다(generic-block-duplicate-commands.ts).",
  deleteBlock: "블록을 지운다(generic-block-delete-commands.ts).",
  deleteSelectedBlocks:
    "블록 선택 범위를 지운다(generic-block-delete-commands.ts).",
  indentBlock:
    "blockGroup 중첩만 바꾼다(indent-commands.ts). 콘텐츠 타입은 그대로다.",
  outdentBlock:
    "blockGroup 중첩만 바꾼다(indent-commands.ts). 콘텐츠 타입은 그대로다.",
  toggleCheckListItemChecked:
    "checkListItem의 checked attr만 뒤집는다(check-list-item-commands.ts).",
  toggleListItemCollapse:
    "toggleListItem의 collapsed attr만 뒤집는다(toggle-collapse-commands.ts).",
  setCalloutIcon:
    "기존 callout의 icon attr만 바꾼다(callout-commands.ts). callout이 없으면 BLOCK_NOT_FOUND다.",
  toggleBold: "선택 범위에 마크를 켜고 끈다(inline-mark-commands.ts).",
  toggleItalic: "선택 범위에 마크를 켜고 끈다(inline-mark-commands.ts).",
  toggleUnderline: "선택 범위에 마크를 켜고 끈다(inline-mark-commands.ts).",
  toggleStrike: "선택 범위에 마크를 켜고 끈다(inline-mark-commands.ts).",
  toggleCode: "선택 범위에 마크를 켜고 끈다(inline-mark-commands.ts).",
  setLink: "선택 범위에 link 마크를 단다(inline-mark-commands.ts).",
  unsetLink: "선택 범위의 link 마크를 뗀다(inline-mark-commands.ts).",
  toggleInlineTextColor:
    "선택 범위에 색 마크를 켜고 끈다(inline-mark-commands.ts).",
  toggleInlineBackgroundColor:
    "선택 범위에 배경색 마크를 켜고 끈다(inline-mark-commands.ts).",
  toggleCustomStyle:
    "선택 범위에 커스텀 스타일 마크를 켜고 끈다(inline-mark-commands.ts).",
  toggleCaretMark: "캐럿의 stored mark만 바꾼다(caret-mark-commands.ts).",
  toggleCaretTextColor: "캐럿의 stored mark만 바꾼다(caret-mark-commands.ts).",
  toggleCaretBackgroundColor:
    "캐럿의 stored mark만 바꾼다(caret-mark-commands.ts).",
  setBlockTextColor:
    "blockContainer의 textColor attr만 바꾼다(block-attribute-commands.ts).",
  setBlockBackgroundColor:
    "blockContainer의 backgroundColor attr만 바꾼다(block-attribute-commands.ts).",
  setBlockTextAlignment:
    "blockContainer의 textAlignment attr만 바꾼다(block-attribute-commands.ts).",
  setMediaBlockUrl:
    "기존 미디어 블록의 url attr만 바꾼다(block-attribute-commands.ts). 막은 kind는 문서에 없다.",
  setMediaBlockName:
    "기존 미디어 블록의 name attr만 바꾼다(block-attribute-commands.ts).",
  setMediaBlockCaption:
    "기존 미디어 블록의 caption attr만 바꾼다(block-attribute-commands.ts).",
  setMediaBlockBackgroundColor:
    "기존 미디어 블록의 backgroundColor attr만 바꾼다(block-attribute-commands.ts).",
  setMediaPreviewWidth:
    "기존 미디어 블록의 previewWidth attr만 바꾼다(block-attribute-commands.ts).",
  setMediaShowPreview:
    "기존 미디어 블록의 showPreview attr만 바꾼다(block-attribute-commands.ts).",
  setMediaTextAlignment:
    "기존 미디어 블록의 textAlignment attr만 바꾼다(block-attribute-commands.ts).",
  setIframeSrc:
    "기존 iframe 블록의 src attr만 바꾼다(block-attribute-commands.ts). 막은 iframe은 문서에 없다.",
  setCodeBlockWrap:
    "기존 codeBlock의 wrap attr만 바꾼다(block-attribute-commands.ts).",
  setCodeBlockCaption:
    "기존 codeBlock의 caption attr만 바꾼다(block-attribute-commands.ts).",
  uploadMediaFile:
    "기존 미디어 블록(blockId)에 파일을 올린다(production-editor-media-upload.ts). 블록을 새로 만들지 않는다.",
  replaceMediaBlockFile:
    "기존 미디어 블록(blockId)의 파일을 바꾼다(production-editor-media-upload.ts). 블록을 새로 만들지 않는다.",
  cancelMediaUpload:
    "진행 중인 업로드의 AbortController만 중단한다(block-attribute-commands.ts).",
  insertTableRow:
    "기존 표에 행을 넣는다(table-commands.ts). 막은 table은 문서에 없다.",
  insertTableColumn:
    "기존 표에 열을 넣는다(table-commands.ts). 막은 table은 문서에 없다.",
  moveTableRow: "기존 표의 행을 옮긴다(table-commands.ts).",
  moveTableColumn: "기존 표의 열을 옮긴다(table-commands.ts).",
  resizeTableColumn: "기존 표의 열 너비만 바꾼다(table-commands.ts).",
  fitTableColumnsToContainer: "기존 표의 열 너비만 바꾼다(table-commands.ts).",
  mergeTableCells: "기존 표의 셀을 병합한다(table-commands.ts).",
  splitTableCell: "기존 표의 셀을 나눈다(table-commands.ts).",
  deleteTableRow: "기존 표의 행을 지운다(table-commands.ts).",
  deleteTableColumn: "기존 표의 열을 지운다(table-commands.ts).",
  toggleTableHeaderRow: "기존 표의 headerRows만 바꾼다(table-commands.ts).",
  toggleTableHeaderColumn:
    "기존 표의 headerColumns만 바꾼다(table-commands.ts).",
  setTableCellTextColor:
    "기존 표 셀의 textColor attr만 바꾼다(table-commands.ts).",
  setTableCellBackgroundColor:
    "기존 표 셀의 backgroundColor attr만 바꾼다(table-commands.ts).",
  setTableCellAlign: "기존 표 셀의 align attr만 바꾼다(table-commands.ts).",
  insertCustomBlock:
    "등록한 CustomBlock 타입을 넣는다(custom-block-commands.ts). CustomBlock은 enabledBlockTypes 판정에서 건너뛰는 대상이라 막을 수 없다.",
  insertCustomInlineContent:
    "등록한 커스텀 인라인 원소를 캐럿에 넣는다(custom-inline-content-commands.ts). 블록 타입이 아니다.",
  undo: "이력을 되돌린다(editor-controller.ts). 문서에 있던 상태로만 돌아간다.",
  redo: "이력을 다시 적용한다(editor-controller.ts). 문서에 있던 상태로만 돌아간다.",
};

const rejectionEntries = Object.entries(REJECTING_COMMANDS).flatMap(
  ([command, cases]) =>
    (cases ?? []).map(
      (scenario) => [command, scenario.title, scenario] as const,
    ),
);

describe("enabledBlockTypes 명령 분류 매트릭스(Issue #370)", () => {
  describe("분류 표", () => {
    const rejectingKeys = Object.keys(REJECTING_COMMANDS);
    const unrelatedKeys = Object.keys(UNRELATED_COMMANDS);

    it("editor.commands의 모든 키가 표에 분류돼 있다", () => {
      const classified = new Set([...rejectingKeys, ...unrelatedKeys]);

      expect(listCommandKeys().filter((key) => !classified.has(key))).toEqual(
        [],
      );
    });

    it("표의 모든 항목이 editor.commands에 있는 키다", () => {
      const actual = new Set(listCommandKeys());

      expect(
        [...rejectingKeys, ...unrelatedKeys].filter((key) => !actual.has(key)),
      ).toEqual([]);
    });

    it("한 키가 두 분류에 함께 있지 않다", () => {
      const unrelated = new Set(unrelatedKeys);

      expect(rejectingKeys.filter((key) => unrelated.has(key))).toEqual([]);
    });

    it("거절 분류의 모든 키가 시나리오를 하나 이상 가진다", () => {
      const withoutScenario = Object.entries(REJECTING_COMMANDS)
        .filter(([, cases]) => (cases ?? []).length === 0)
        .map(([command]) => command);

      expect(withoutScenario).toEqual([]);
    });

    it("무관 분류의 모든 키가 근거를 가진다", () => {
      const withoutReason = Object.entries(UNRELATED_COMMANDS)
        .filter(([, reason]) => reason === undefined || reason.trim() === "")
        .map(([command]) => command);

      expect(withoutReason).toEqual([]);
    });
  });

  describe("거절 분류 명령", () => {
    it.each(rejectionEntries)(
      "%s / %s: 거절하고 문서와 undo 스택을 바꾸지 않는다",
      (_command, _title, scenario) => {
        const { editor, tiptap } = setup(scenario.enabledBlockTypes);
        const before = editor.getDocument();
        const undoBefore = undoDepth(tiptap.state);

        const result = scenario.run(editor);

        expect(result).toMatchObject({
          ok: false,
          error: { code: scenario.code },
        });
        expect(editor.getDocument()).toEqual(before);
        expect(undoDepth(tiptap.state)).toBe(undoBefore);
      },
    );

    it.each(
      rejectionEntries.filter(
        ([, , scenario]) => scenario.code === "EDITOR_FEATURE_UNAVAILABLE",
      ),
    )(
      "%s / %s: EDITOR_FEATURE_UNAVAILABLE 메시지가 enabledBlockTypes를 가리킨다",
      (_command, _title, scenario) => {
        const { editor } = setup(scenario.enabledBlockTypes);

        const result = scenario.run(editor) as {
          error: { message: string };
        };

        expect(result.error.message).toContain(
          "CreateEditorOptions.enabledBlockTypes",
        );
      },
    );

    it.each(rejectionEntries)(
      "%s / %s: 막지 않은 설정에서는 같은 호출이 성공한다",
      (_command, _title, scenario) => {
        const { editor } = setup();

        const result = scenario.run(editor) as { ok: boolean };

        expect(result.ok).toBe(true);
      },
    );
  });
});
