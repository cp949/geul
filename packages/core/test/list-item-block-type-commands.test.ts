/**
 * public setBlockType 목록 input의 번호 의미·변환 행렬·CodeBlock 경계와
 * command 원자성을 EditorController seam에서 검증한다.
 */
import type { Block } from "@cp949/geul-model";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";
import {
  type DocumentChangeEvent,
  type EditorController,
  type SetBlockTypeDescriptor,
} from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  editorState,
  listItemBlock as list,
  mountTiptapEditor,
  mounted,
  notApplicable,
  paragraphBlock as paragraph,
  restored,
  setBoldStoredMark,
} from "./list-item-block-type-support.js";

const okResult = { ok: true, value: undefined } as const;
/** 대상 블록 뒤에 trailing paragraph를 둔 mounted command fixture를 만든다. */
const mountedBlock = (block: Block) =>
  mounted(documentOf(block, paragraph("tail", "tail")));

/** 거절 command의 독자·PM·selection·stored marks·event·dispatch·history 무변경을 묶어 단언한다. */
const expectAtomicRejection = (
  editor: EditorController,
  tiptap: ReturnType<typeof mountTiptapEditor>["tiptap"],
  changes: DocumentChangeEvent[],
  invoke: () => unknown,
) => {
  setBoldStoredMark(tiptap);
  const before = editorState(editor, tiptap);
  const dispatch = vi.spyOn(tiptap.view, "dispatch");
  expect(invoke()).toEqual(notApplicable("setBlockType"));
  expect(editorState(editor, tiptap)).toEqual(before);
  expect(changes).toEqual([]);
  expect(dispatch).not.toHaveBeenCalled();
  expect(editor.commands.undo()).toEqual(notApplicable("undo"));
};

describe("목록 text block 변환 행렬", () => {
  const sources = [
    { type: "paragraph" },
    { type: "heading", level: 3 },
    { type: "quote" },
    { type: "bulletListItem" },
    { type: "numberedListItem", startNumber: 4 },
  ] as const satisfies readonly SetBlockTypeDescriptor[];
  const targets = [
    { type: "paragraph" },
    { type: "heading", level: 2 },
    { type: "quote" },
    { type: "bulletListItem" },
    { type: "numberedListItem", startNumber: 8 },
  ] as const satisfies readonly SetBlockTypeDescriptor[];
  const matrix = sources.flatMap((source) =>
    targets
      .filter(
        (target) =>
          source.type !== target.type ||
          ["heading", "numberedListItem"].includes(source.type),
      )
      .map((target) => [source, target] as const),
  );

  it.each(matrix)(
    "%o에서 %o로 바꾸면 id·content·marks·children과 역방향 selection을 보존한다",
    (source, target) => {
      const content = [
        { text: "marked", marks: [{ type: "bold" as const }] },
        { text: " text" },
      ];
      const children: Block[] = [paragraph("child", "child")];
      const sourceBlock = {
        id: "target",
        ...source,
        content,
        children,
      } as Block;
      const { editor, changes, tiptap } = mounted(
        documentOf(sourceBlock, paragraph("tail", "tail")),
      );
      const start = contentTextStart(tiptap, "target");
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(
          TextSelection.create(tiptap.state.doc, start + 5, start + 1),
        ),
      );
      const selection = tiptap.state.selection.toJSON();
      changes.length = 0;
      expect(editor.commands.setBlockType("target", target)).toEqual(okResult);
      expect(editor.getDocument().blocks[0]).toEqual({
        id: "target",
        ...target,
        content,
        children,
      });
      expect(tiptap.state.selection.toJSON()).toEqual(selection);
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["target"], reason: "local" },
      ]);
    },
  );

  it("numbered의 startNumber null은 명시 번호를 제거한다", () => {
    const { editor } = mountedBlock(
      list("target", "numberedListItem", "numbered", { startNumber: 12 }),
    );
    expect(
      editor.commands.setBlockType("target", {
        type: "numberedListItem",
        startNumber: null,
      }),
    ).toEqual(okResult);
    expect(editor.getDocument().blocks[0]).toEqual(
      list("target", "numberedListItem", "numbered"),
    );
  });

  it("다른 타입에서 numbered 생략은 번호를 만들지 않고 숫자는 설정하며 다른 target은 제거한다", () => {
    const { editor } = mountedBlock(paragraph("target", "text"));
    expect(
      editor.commands.setBlockType("target", { type: "numberedListItem" }),
    ).toEqual(okResult);
    expect(editor.getDocument().blocks[0]).toEqual(
      list("target", "numberedListItem", "text"),
    );
    expect(
      editor.commands.setBlockType("target", {
        type: "numberedListItem",
        startNumber: 0,
      }),
    ).toEqual(okResult);
    expect(editor.getDocument().blocks[0]).toEqual(
      list("target", "numberedListItem", "text", { startNumber: 0 }),
    );
    expect(
      editor.commands.setBlockType("target", { type: "bulletListItem" }),
    ).toEqual(okResult);
    expect(editor.getDocument().blocks[0]).toEqual(
      list("target", "bulletListItem", "text"),
    );
  });
});

describe("목록 변환 원자성과 CodeBlock 경계", () => {
  type Options = { clearContent?: boolean };
  type Reject = readonly [string, Block, SetBlockTypeDescriptor, Options?];
  /** 같은 명시 번호를 가진 no-op fixture를 간결하게 만든다. */
  const numbered = (startNumber: number) =>
    list("target", "numberedListItem", "item", { startNumber });
  const rejectionCases: readonly Reject[] = [
    [
      "bullet 동일",
      list("target", "bulletListItem", "item"),
      { type: "bulletListItem" },
    ],
    ["numbered 생략 동일", numbered(12), { type: "numberedListItem" }],
    [
      "numbered 명시 동일",
      numbered(12),
      { type: "numberedListItem", startNumber: 12 },
    ],
    ...[-1, 1_000_000_000, 1.5, Number.NaN, Number.POSITIVE_INFINITY].map(
      (startNumber) =>
        [
          "번호 범위",
          paragraph("target", "item"),
          { type: "numberedListItem", startNumber },
        ] as Reject,
    ),
    ...(["bulletListItem", "numberedListItem"] as const).flatMap((type) =>
      [false, true].flatMap((clearContent) => {
        const target =
          type === "bulletListItem"
            ? ({ type } as const)
            : ({ type, startNumber: 3 } as const);
        return [
          [
            "목록→Code",
            list("target", type, "item"),
            { type: "codeBlock" },
            { clearContent },
          ],
          [
            "Code→목록",
            { id: "target", type: "codeBlock", content: [{ text: "code" }] },
            target,
            { clearContent },
          ],
        ] as Reject[];
      }),
    ),
  ];

  it.each(rejectionCases)(
    "%s 거절은 mutation 전 모든 상태와 history를 보존한다",
    (...values) => {
      const [, block, target, options] = values as unknown as Reject;
      const { editor, changes, tiptap } = mountedBlock(block);
      expectAtomicRejection(editor, tiptap, changes, () =>
        editor.commands.setBlockType("target", target, options),
      );
    },
  );

  it("성공은 dispatch·revision·event가 한 번이고 undo 한 번으로 selection과 상태를 복원한다", () => {
    const { editor, changes, tiptap } = mountedBlock(
      paragraph("target", "text"),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 2);
    const before = editorState(editor, tiptap);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");
    expect(
      editor.commands.setBlockType("target", { type: "bulletListItem" }),
    ).toEqual(okResult);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(editor.getDocument().revision).toBe(1);
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["target"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("중첩 목록 변환은 자식 위치와 ID를 보존한다", () => {
    const child = paragraph("grandchild", "grandchild");
    const nested = list("nested", "numberedListItem", "nested", {
      startNumber: 5,
      children: [child],
    });
    const { editor } = mounted(
      documentOf(
        paragraph("parent", "parent", [nested]),
        paragraph("tail", "tail"),
      ),
    );
    expect(
      editor.commands.setBlockType("nested", { type: "bulletListItem" }),
    ).toEqual(okResult);
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraph("parent", "parent", [
        list("nested", "bulletListItem", "nested", {
          children: [child],
        }),
      ]),
    );
  });
});

/**
 * checkListItem은 checked가 필수 필드라 위 공유 sources/targets 행렬의
 * `...source`/`...target` 스프레드 패턴(numberedListItem의 optional
 * startNumber를 전제)과 맞지 않는다(RD-001 DELTA-04) — 로컬 builder와
 * 전용 행렬로 분리한다(G-TST-002).
 */
describe("checkListItem 변환", () => {
  /** checked를 명시로 받는 checkListItem 전용 리터럴 builder. */
  const checkListItemBlock = (
    id: string,
    text: string,
    checked: boolean,
    children?: Block[],
  ): Block => ({
    id,
    type: "checkListItem",
    checked,
    content: text === "" ? [] : [{ text }],
    ...(children === undefined ? {} : { children }),
  });

  const otherSources = [
    { type: "paragraph" },
    { type: "heading", level: 3 },
    { type: "quote" },
    { type: "bulletListItem" },
    { type: "numberedListItem", startNumber: 4 },
  ] as const satisfies readonly SetBlockTypeDescriptor[];

  it.each(otherSources)(
    "%o에서 checkListItem으로 바꾸면 id·content·children을 보존하고 checked는 false로 생성된다",
    (source) => {
      const content = [
        { text: "marked", marks: [{ type: "bold" as const }] },
        { text: " text" },
      ];
      const children: Block[] = [paragraph("child", "child")];
      const sourceBlock = {
        id: "target",
        ...source,
        content,
        children,
      } as Block;
      const { editor, tiptap } = mounted(
        documentOf(sourceBlock, paragraph("tail", "tail")),
      );
      const start = contentTextStart(tiptap, "target");
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(
          TextSelection.create(tiptap.state.doc, start + 5, start + 1),
        ),
      );
      const selection = tiptap.state.selection.toJSON();

      expect(
        editor.commands.setBlockType("target", { type: "checkListItem" }),
      ).toEqual(okResult);

      expect(editor.getDocument().blocks[0]).toEqual({
        id: "target",
        type: "checkListItem",
        checked: false,
        content,
        children,
      });
      expect(tiptap.state.selection.toJSON()).toEqual(selection);
    },
  );

  const otherTargets = [
    { type: "paragraph" },
    { type: "heading", level: 2 },
    { type: "quote" },
    { type: "bulletListItem" },
    { type: "numberedListItem", startNumber: 8 },
  ] as const satisfies readonly SetBlockTypeDescriptor[];

  it.each(otherTargets)(
    "checkListItem에서 %o로 바꾸면 id·content·children을 보존한다(checked는 버려진다)",
    (target) => {
      const content = [{ text: "본문" }];
      const children: Block[] = [paragraph("child", "child")];
      const sourceBlock = checkListItemBlock("target", "", true, children);
      const sourceWithContent = { ...sourceBlock, content };
      const { editor } = mountedBlock(sourceWithContent);

      expect(editor.commands.setBlockType("target", target)).toEqual(okResult);

      expect(editor.getDocument().blocks[0]).toEqual({
        id: "target",
        ...target,
        content,
        children,
      });
    },
  );

  it("checkListItem에 checkListItem을 재적용하면 거절하고 상태를 그대로 둔다", () => {
    const { editor, changes, tiptap } = mountedBlock(
      checkListItemBlock("target", "item", false),
    );
    expectAtomicRejection(editor, tiptap, changes, () =>
      editor.commands.setBlockType("target", { type: "checkListItem" }),
    );
  });

  it.each([false, true])(
    "checkListItem↔codeBlock 양방향 변환은 clearContent(%s)와 무관하게 거절한다",
    (clearContent) => {
      const {
        editor: toCode,
        changes: toCodeChanges,
        tiptap: toCodeTiptap,
      } = mountedBlock(checkListItemBlock("target", "item", false));
      expectAtomicRejection(toCode, toCodeTiptap, toCodeChanges, () =>
        toCode.commands.setBlockType(
          "target",
          { type: "codeBlock" },
          { clearContent },
        ),
      );

      const {
        editor: fromCode,
        changes: fromCodeChanges,
        tiptap: fromCodeTiptap,
      } = mountedBlock({
        id: "target",
        type: "codeBlock",
        content: [{ text: "code" }],
      });
      expectAtomicRejection(fromCode, fromCodeTiptap, fromCodeChanges, () =>
        fromCode.commands.setBlockType(
          "target",
          { type: "checkListItem" },
          { clearContent },
        ),
      );
    },
  );
});
