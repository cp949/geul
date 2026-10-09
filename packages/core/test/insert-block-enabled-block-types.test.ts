/**
 * enabledBlockTypes가 막은 divider·table을 insertDivider·insertTable·
 * pasteTabularData로 넣는 호출이 예외 없이 EDITOR_FEATURE_UNAVAILABLE로
 * 거절되는 계약을 고정한다(Issue #330, spec §3.2 DOC-005·§4.4 EXT-004).
 * 예전에는 스키마에 없는 노드 타입을 만나 TypeError를 던졌다.
 *
 * 다루는 축은 세 명령의 거절, deny·allow 모드, 거절 메시지 형식과
 * clearAfterBlockText 옵션, 대조군(미지정 설정, 허용 타입, 다른 쪽 타입만
 * 막은 설정), 표가 없을 때 insertTableRow·insertTableColumn의 반환이다.
 * 거절은 문서와 undo 스택을 바꾸지 않는다.
 */
import type { Block } from "@cp949/geul-model";
import type { TabularData } from "@cp949/geul-io";
import { undoDepth } from "@tiptap/pm/history";
import { describe, expect, it } from "vitest";

import { type CreateEditorOptions, createEditor } from "../src/index.js";
import {
  documentOf,
  headingBlock,
  mountTiptapEditor,
  paragraphBlock,
  sequentialIds,
} from "./editor-controller-support.js";

type EnabledBlockTypes = NonNullable<CreateEditorOptions["enabledBlockTypes"]>;

const DENY_DIVIDER: EnabledBlockTypes = { mode: "deny", types: ["divider"] };
const DENY_TABLE: EnabledBlockTypes = { mode: "deny", types: ["table"] };
const DENY_QUOTE: EnabledBlockTypes = { mode: "deny", types: ["quote"] };
const ALLOW_PARAGRAPH: EnabledBlockTypes = {
  mode: "allow",
  types: ["paragraph"],
};

const TABULAR_DATA: TabularData = {
  columnCount: 2,
  rows: [
    {
      cells: [
        {
          columnIndex: 0,
          rowSpan: 1,
          columnSpan: 1,
          content: [{ text: "A" }],
        },
        {
          columnIndex: 1,
          rowSpan: 1,
          columnSpan: 1,
          content: [{ text: "B" }],
        },
      ],
    },
  ],
};

// 기준 문서: 문단 b1 하나. 캐럿은 b1 텍스트 안(표 밖)에 둔다.
const setup = (
  enabledBlockTypes: EnabledBlockTypes | undefined,
  blocks: Block[] = [paragraphBlock("b1", "one")],
) => {
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("new"),
    ...(enabledBlockTypes === undefined ? {} : { enabledBlockTypes }),
  });
  const { tiptap } = mountTiptapEditor(editor);
  tiptap.commands.setTextSelection(1);
  return { editor, tiptap };
};

type Setup = ReturnType<typeof setup>;

const DIVIDER_DISABLED_MESSAGE =
  'Block type "divider" is disabled via CreateEditorOptions.enabledBlockTypes';
const TABLE_DISABLED_MESSAGE =
  'Block type "table" is disabled via CreateEditorOptions.enabledBlockTypes';

// 거절이 예외 없이 지정한 메시지의 EDITOR_FEATURE_UNAVAILABLE를 돌려주고
// 문서·undo 스택을 바꾸지 않는지 한 번에 확인한다.
const expectRejectedWithoutChange = (
  enabledBlockTypes: EnabledBlockTypes,
  run: (editor: Setup["editor"]) => unknown,
  message: string,
  blocks?: Block[],
) => {
  const { editor, tiptap } = setup(enabledBlockTypes, blocks);
  const before = editor.getDocument();
  const undoBefore = undoDepth(tiptap.state);
  const selectionBefore = tiptap.state.selection.toJSON();

  const result = run(editor);

  expect(result).toEqual({
    ok: false,
    error: { code: "EDITOR_FEATURE_UNAVAILABLE", message },
  });
  expect(editor.getDocument()).toEqual(before);
  expect(undoDepth(tiptap.state)).toBe(undoBefore);
  expect(tiptap.state.selection.toJSON()).toEqual(selectionBefore);
};

const typesOf = (editor: Setup["editor"]) =>
  editor.getDocument().blocks.map((block) => block.type);

const PARAGRAPH_DISABLED_MESSAGE =
  'Block type "paragraph" is disabled via CreateEditorOptions.enabledBlockTypes';
const DENY_PARAGRAPH: EnabledBlockTypes = {
  mode: "deny",
  types: ["paragraph"],
};
const ALLOW_HEADING_DIVIDER: EnabledBlockTypes = {
  mode: "allow",
  types: ["heading", "divider"],
};
// paragraph를 막으면 문서 첫 블록이 문단일 수 없다.
const HEADING_ONLY_BLOCKS = [headingBlock("b1", 1, "one")];

const insertDivider = (editor: Setup["editor"]) =>
  editor.commands.insertDivider("b1");
const insertTable = (editor: Setup["editor"]) =>
  editor.commands.insertTable("b1", { rows: 2, columns: 2 });
const pasteTabularData = (editor: Setup["editor"]) =>
  editor.commands.pasteTabularData(TABULAR_DATA);

describe("막은 divider·table 삽입은 거절한다(Issue #330)", () => {
  describe("deny 모드", () => {
    it("deny:[divider]에서 insertDivider는 EDITOR_FEATURE_UNAVAILABLE이다", () => {
      expectRejectedWithoutChange(
        DENY_DIVIDER,
        insertDivider,
        DIVIDER_DISABLED_MESSAGE,
      );
    });

    it("deny:[table]에서 insertTable은 EDITOR_FEATURE_UNAVAILABLE이다", () => {
      expectRejectedWithoutChange(
        DENY_TABLE,
        insertTable,
        TABLE_DISABLED_MESSAGE,
      );
    });

    it("deny:[table]에서 표 밖 캐럿의 pasteTabularData는 EDITOR_FEATURE_UNAVAILABLE이다", () => {
      expectRejectedWithoutChange(
        DENY_TABLE,
        pasteTabularData,
        TABLE_DISABLED_MESSAGE,
      );
    });
  });

  describe("allow 모드", () => {
    it("allow:[paragraph]에서 insertDivider를 거절한다", () => {
      expectRejectedWithoutChange(
        ALLOW_PARAGRAPH,
        insertDivider,
        DIVIDER_DISABLED_MESSAGE,
      );
    });

    it("allow:[paragraph]에서 insertTable을 거절한다", () => {
      expectRejectedWithoutChange(
        ALLOW_PARAGRAPH,
        insertTable,
        TABLE_DISABLED_MESSAGE,
      );
    });

    it("allow:[paragraph]에서 pasteTabularData를 거절한다", () => {
      expectRejectedWithoutChange(
        ALLOW_PARAGRAPH,
        pasteTabularData,
        TABLE_DISABLED_MESSAGE,
      );
    });
  });

  describe("clearAfterBlockText 옵션", () => {
    it("insertDivider는 옵션을 줘도 같은 메시지로 거절한다", () => {
      expectRejectedWithoutChange(
        DENY_DIVIDER,
        (editor) =>
          editor.commands.insertDivider("b1", { clearAfterBlockText: true }),
        DIVIDER_DISABLED_MESSAGE,
      );
    });

    it("insertTable은 옵션을 줘도 같은 메시지로 거절한다", () => {
      expectRejectedWithoutChange(
        DENY_TABLE,
        (editor) =>
          editor.commands.insertTable(
            "b1",
            { rows: 2, columns: 2 },
            { clearAfterBlockText: true },
          ),
        TABLE_DISABLED_MESSAGE,
      );
    });
  });

  // divider-commands.ts는 스키마에 paragraph 노드가 없으면 뒤따르는 형제와
  // 무관하게 던진다(뒤따를 블록이 없을 때 맨몸 paragraph를 넣기 때문에
  // 노드 타입을 먼저 확보해 둔다). 래퍼는 그 전제를 거절로 바꾼다.
  describe("paragraph를 막은 설정의 insertDivider", () => {
    it("deny:[paragraph]에서 EDITOR_FEATURE_UNAVAILABLE이다", () => {
      expectRejectedWithoutChange(
        DENY_PARAGRAPH,
        insertDivider,
        PARAGRAPH_DISABLED_MESSAGE,
        HEADING_ONLY_BLOCKS,
      );
    });

    it("allow:[heading, divider]에서도 같다", () => {
      expectRejectedWithoutChange(
        ALLOW_HEADING_DIVIDER,
        insertDivider,
        PARAGRAPH_DISABLED_MESSAGE,
        HEADING_ONLY_BLOCKS,
      );
    });

    it("divider와 paragraph를 모두 막으면 divider를 먼저 보고한다", () => {
      expectRejectedWithoutChange(
        { mode: "deny", types: ["divider", "paragraph"] },
        insertDivider,
        DIVIDER_DISABLED_MESSAGE,
        HEADING_ONLY_BLOCKS,
      );
    });

    it("deny:[paragraph]에서도 insertTable은 성공한다", () => {
      const { editor } = setup(DENY_PARAGRAPH, HEADING_ONLY_BLOCKS);

      expect(insertTable(editor).ok).toBe(true);
      expect(typesOf(editor)).toContain("table");
    });
  });

  describe("대조군", () => {
    it("enabledBlockTypes 미지정 편집기는 세 호출이 성공한다", () => {
      const { editor } = setup(undefined);
      expect(insertDivider(editor)).toMatchObject({ ok: true });
      expect(insertTable(editor)).toMatchObject({ ok: true });
      expect(pasteTabularData(editor)).toMatchObject({ ok: true });
      expect(typesOf(editor)).toContain("divider");
      expect(typesOf(editor).filter((type) => type === "table")).toHaveLength(
        2,
      );
    });

    it("deny:[quote] 편집기는 세 호출이 성공한다", () => {
      const { editor } = setup(DENY_QUOTE);
      expect(insertDivider(editor)).toMatchObject({ ok: true });
      expect(insertTable(editor)).toMatchObject({ ok: true });
      expect(pasteTabularData(editor)).toMatchObject({ ok: true });
      expect(typesOf(editor)).toContain("divider");
      expect(typesOf(editor).filter((type) => type === "table")).toHaveLength(
        2,
      );
    });

    it("deny:[divider]에서도 insertTable은 성공한다", () => {
      const { editor } = setup(DENY_DIVIDER);
      expect(insertTable(editor)).toMatchObject({ ok: true });
      expect(typesOf(editor)).toContain("table");
    });

    it("deny:[table]에서도 insertDivider는 성공한다", () => {
      const { editor } = setup(DENY_TABLE);
      expect(insertDivider(editor)).toMatchObject({ ok: true });
      expect(typesOf(editor)).toContain("divider");
    });
  });

  describe("표가 없는 deny:[table] 편집기의 행·열 삽입", () => {
    // 수정 전부터 예외가 없었다 — 래퍼 거절을 적용하지 않고 현행 반환을 고정한다.
    it("insertTableRow는 예외 없이 TABLE_NOT_FOUND를 돌려준다", () => {
      const { editor } = setup(DENY_TABLE);
      expect(editor.commands.insertTableRow("b1", 0)).toEqual({
        ok: false,
        error: { code: "TABLE_NOT_FOUND", blockId: "b1" },
      });
    });

    it("insertTableColumn은 예외 없이 TABLE_NOT_FOUND를 돌려준다", () => {
      const { editor } = setup(DENY_TABLE);
      expect(editor.commands.insertTableColumn("b1", 0)).toEqual({
        ok: false,
        error: { code: "TABLE_NOT_FOUND", blockId: "b1" },
      });
    });
  });
});
