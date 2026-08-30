/**
 * 글머리·번호 목록 항목의 Enter split과 빈 항목 paragraph exit 계약을
 * production EditorController 경계에서 검증한다. 타입·속성·안정 ID·children
 * 배치·selection·revision/event·dispatch·undo 원자성과 기존 텍스트 블록
 * split 회귀를 함께 고정한다.
 */
import type { Block } from "@cp949/geul-model";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it, vi } from "vitest";

import { contentTextStart, dispatchKeydown } from "./block-test-support.js";
import {
  caretAt,
  documentOf,
  editorState,
  listItemBlock,
  mounted,
  oneCellTableBlock,
  paragraphBlock,
  restored,
  tailParagraphBlock,
} from "./editor-controller-support.js";
import { withNativeCaret } from "./native-selection-test-support.js";

/**
 * 실제 DOM caret은 target 목록에 두고 PM selection만 stale 목록으로 되돌린다.
 * 클릭 직후 selectionchange보다 Enter keydown이 먼저 오는 G-EDT-002 상황을
 * production editor DOM에서 재현한다.
 */
function withStaleListCaret(
  tiptap: ReturnType<typeof mounted>["tiptap"],
  targetBlockId: string,
  staleBlockId: string,
  fn: () => void,
): void {
  const targetPosition = contentTextStart(tiptap, targetBlockId) + 1;
  tiptap.commands.setTextSelection(targetPosition);
  const targetDom = tiptap.view.domAtPos(targetPosition);

  withNativeCaret(
    tiptap.view.dom as HTMLElement,
    () => {
      const stalePosition = contentTextStart(tiptap, staleBlockId) + 1;
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(
          TextSelection.create(tiptap.state.doc, stalePosition),
        ),
      );
      fn();
    },
    targetDom.node,
    targetDom.offset,
  );
}

describe("목록 항목 Enter split", () => {
  it.each([
    ["글머리", "bulletListItem"],
    ["번호", "numberedListItem"],
  ] as const)(
    "%s 목록 중간 Enter는 같은 목록 타입의 다음 형제를 만들고 신규 ID·selection·event·undo를 한 dispatch로 확정한다",
    (_label, type) => {
      const source = listItemBlock("list-1", type, "앞뒤", {
        ...(type === "numberedListItem" ? { startNumber: 11 } : {}),
      });
      const fixture = mounted(documentOf(source, tailParagraphBlock));
      const { editor, tiptap, changes } = fixture;
      tiptap.commands.setTextSelection(caretAt(tiptap, source.id).anchor + 1);
      const before = editorState(editor, tiptap);
      const dispatch = vi.spyOn(tiptap.view, "dispatch");
      const transactionBatches: Array<{
        rootNewId: unknown;
        appendedNewIds: unknown[];
      }> = [];
      tiptap.on("transaction", ({ transaction, appendedTransactions }) => {
        transactionBatches.push({
          rootNewId: transaction.doc.child(1).attrs.blockId,
          appendedNewIds: appendedTransactions.map(
            (appended) => appended.doc.child(1).attrs.blockId,
          ),
        });
      });

      expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(transactionBatches).toEqual([
        { rootNewId: null, appendedNewIds: ["id-1"] },
      ]);
      expect(editor.getDocument()).toEqual({
        ...documentOf(
          listItemBlock("list-1", type, "앞", {
            ...(type === "numberedListItem" ? { startNumber: 11 } : {}),
          }),
          listItemBlock("id-1", type, "뒤"),
          tailParagraphBlock,
        ),
        revision: 1,
      });
      expect(tiptap.state.doc.child(1).firstChild?.type.name).toBe(type);
      expect(tiptap.state.doc.child(1).firstChild?.attrs.startNumber).toBe(
        type === "numberedListItem" ? null : undefined,
      );
      expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "id-1"));
      expect(changes).toHaveLength(1);
      expect(changes[0]?.revision).toBe(1);
      expect(changes[0]?.reason).toBe("local");

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    },
  );

  it("startNumber와 children이 있는 번호 목록 중간 Enter는 원본 속성을 유지하고 자동 번호 새 항목을 기존 첫 자식 앞에 둔다", () => {
    const existingChild = paragraphBlock("child-1", "기존 자식");
    const source = listItemBlock("numbered-1", "numberedListItem", "가나다라", {
      startNumber: 37,
      children: [existingChild],
    });
    const { editor, tiptap, changes } = mounted(
      documentOf(source, tailParagraphBlock),
    );
    tiptap.commands.setTextSelection(caretAt(tiptap, source.id).anchor + 2);
    const before = editorState(editor, tiptap);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");
    const transactionBatches: Array<{
      rootNewId: unknown;
      appendedNewIds: unknown[];
    }> = [];
    tiptap.on("transaction", ({ transaction, appendedTransactions }) => {
      transactionBatches.push({
        rootNewId: transaction.doc.child(0).child(1).child(0).attrs.blockId,
        appendedNewIds: appendedTransactions.map(
          (appended) => appended.doc.child(0).child(1).child(0).attrs.blockId,
        ),
      });
    });

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(transactionBatches).toEqual([
      { rootNewId: null, appendedNewIds: ["id-1"] },
    ]);
    expect(editor.getDocument()).toEqual({
      ...documentOf(
        listItemBlock("numbered-1", "numberedListItem", "가나", {
          startNumber: 37,
          children: [
            listItemBlock("id-1", "numberedListItem", "다라"),
            existingChild,
          ],
        }),
        tailParagraphBlock,
      ),
      revision: 1,
    });
    const childGroup = tiptap.state.doc.child(0).child(1);
    expect(childGroup.child(0).attrs.blockId).toBe("id-1");
    expect(childGroup.child(0).firstChild?.attrs.startNumber).toBeNull();
    expect(childGroup.child(1).attrs.blockId).toBe("child-1");
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "id-1"));
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it.each([
    ["글머리", "bulletListItem"],
    ["번호", "numberedListItem"],
  ] as const)(
    "%s 목록 끝 Enter는 빈 같은 목록 타입을 만들고 신규 번호 항목에 startNumber를 복제하지 않는다",
    (_label, type) => {
      const source = listItemBlock("list-1", type, "끝", {
        ...(type === "numberedListItem" ? { startNumber: 29 } : {}),
      });
      const { editor, tiptap } = mounted(
        documentOf(source, tailParagraphBlock),
      );
      tiptap.commands.setTextSelection(contentTextStart(tiptap, source.id) + 1);

      expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

      expect(editor.getDocument().blocks).toEqual([
        source,
        listItemBlock("id-1", type, ""),
        tailParagraphBlock,
      ]);
      expect(tiptap.state.doc.child(1).firstChild?.type.name).toBe(type);
      expect(tiptap.state.doc.child(1).firstChild?.attrs.startNumber).toBe(
        type === "numberedListItem" ? null : undefined,
      );
      expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "id-1"));
    },
  );

  it.each([
    ["뒤 목록", "list-2", "list-1"],
    ["앞 목록", "list-1", "list-2"],
  ] as const)(
    "DOM caret이 %s이고 PM selection이 반대 목록에 stale해도 클릭한 목록만 split한다",
    (_label, targetId, staleId) => {
      const first = listItemBlock("list-1", "bulletListItem", "가나");
      const second = listItemBlock("list-2", "bulletListItem", "다라");
      const { editor, tiptap, changes } = mounted(
        documentOf(first, second, tailParagraphBlock),
      );
      let before: ReturnType<typeof editorState> | undefined;

      withStaleListCaret(tiptap, targetId, staleId, () => {
        before = editorState(editor, tiptap);
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(editor.getDocument()).toEqual({
          ...documentOf(
            ...(targetId === "list-1"
              ? [
                  listItemBlock("list-1", "bulletListItem", "가"),
                  listItemBlock("id-1", "bulletListItem", "나"),
                  second,
                ]
              : [
                  first,
                  listItemBlock("list-2", "bulletListItem", "다"),
                  listItemBlock("id-1", "bulletListItem", "라"),
                ]),
            tailParagraphBlock,
          ),
          revision: 1,
        });
        expect(tiptap.state.selection.toJSON()).toEqual(
          caretAt(tiptap, "id-1"),
        );
        expect(changes).toHaveLength(1);
      });

      if (before === undefined) throw new Error("stale fixture 실행 실패");
      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    },
  );

  it("표 CellSelection 직후 목록을 클릭한 Enter는 클릭한 목록을 split한다", () => {
    const source = listItemBlock("list-1", "bulletListItem", "가나");
    const { editor, tiptap } = mounted(
      documentOf(oneCellTableBlock("table-1"), source, tailParagraphBlock),
    );
    const sourceStart = contentTextStart(tiptap, source.id);
    tiptap.commands.setTextSelection(sourceStart);
    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);

    const targetPosition = sourceStart + 1;
    const targetDom = tiptap.view.domAtPos(targetPosition);
    withNativeCaret(
      tiptap.view.dom,
      () => {
        expect(dispatchKeydown(tiptap, "Enter")).toBe(true);
      },
      targetDom.node,
      targetDom.offset,
    );

    expect(editor.getDocument().blocks).toEqual([
      oneCellTableBlock("table-1"),
      listItemBlock("list-1", "bulletListItem", "가"),
      listItemBlock("id-1", "bulletListItem", "나"),
      tailParagraphBlock,
    ]);
  });
});

describe("빈 목록 항목 Enter exit", () => {
  it.each([
    ["글머리", "bulletListItem"],
    ["번호", "numberedListItem"],
  ] as const)(
    "빈 평면 %s 목록 Enter는 같은 ID의 paragraph로 단일 transaction 전환하고 selection·event·undo를 한 번만 바꾼다",
    (_label, type) => {
      const source = listItemBlock("list-1", type, "", {
        ...(type === "numberedListItem" ? { startNumber: 19 } : {}),
      });
      const { editor, tiptap, changes } = mounted(
        documentOf(source, tailParagraphBlock),
      );
      tiptap.commands.setTextSelection(caretAt(tiptap, source.id).anchor);
      const before = editorState(editor, tiptap);
      const dispatch = vi.spyOn(tiptap.view, "dispatch");
      const appendedTransactionCounts: number[] = [];
      tiptap.on("transaction", ({ appendedTransactions }) => {
        appendedTransactionCounts.push(appendedTransactions.length);
      });

      expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(appendedTransactionCounts).toEqual([0]);
      expect(editor.getDocument()).toEqual({
        ...documentOf(paragraphBlock("list-1", ""), tailParagraphBlock),
        revision: 1,
      });
      expect(tiptap.state.selection.toJSON()).toEqual(
        caretAt(tiptap, "list-1"),
      );
      expect(changes).toHaveLength(1);
      expect(changes[0]?.revision).toBe(1);
      expect(changes[0]?.reason).toBe("local");

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    },
  );

  it.each([
    ["글머리", "bulletListItem"],
    ["번호", "numberedListItem"],
  ] as const)(
    "중첩된 빈 %s 목록 Enter는 깊이·ID·children을 보존한 paragraph exit다",
    (_label, type) => {
      const grandchild = paragraphBlock("grandchild-1", "손자");
      const nested = listItemBlock("nested-1", type, "", {
        ...(type === "numberedListItem" ? { startNumber: 7 } : {}),
        children: [grandchild],
      });
      const parent = paragraphBlock("parent-1", "부모", [nested]);
      const { editor, tiptap, changes } = mounted(
        documentOf(parent, tailParagraphBlock),
      );
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(
          TextSelection.near(
            tiptap.state.doc.resolve(caretAt(tiptap, nested.id).anchor),
            -1,
          ),
        ),
      );
      expect(tiptap.state.selection.$from.parent.type.name).toBe(type);
      const before = editorState(editor, tiptap);
      const dispatch = vi.spyOn(tiptap.view, "dispatch");
      const appendedTransactionCounts: number[] = [];
      tiptap.on("transaction", ({ appendedTransactions }) => {
        appendedTransactionCounts.push(appendedTransactions.length);
      });

      expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(appendedTransactionCounts).toEqual([0]);
      expect(editor.getDocument()).toEqual({
        ...documentOf(
          paragraphBlock("parent-1", "부모", [
            paragraphBlock("nested-1", "", [grandchild]),
          ]),
          tailParagraphBlock,
        ),
        revision: 1,
      });
      expect(tiptap.state.selection.toJSON()).toEqual(
        caretAt(tiptap, "nested-1"),
      );
      expect(changes).toHaveLength(1);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    },
  );
});

describe("목록 Enter 거절 상태", () => {
  it("revision 상한에서 목록 Enter는 문서·selection·event·history를 바꾸지 않는다", () => {
    const source = listItemBlock("list-1", "bulletListItem", "앞뒤");
    const { editor, tiptap, changes } = mounted({
      ...documentOf(source, tailParagraphBlock),
      revision: Number.MAX_SAFE_INTEGER,
    });
    tiptap.commands.setTextSelection(caretAt(tiptap, source.id).anchor + 1);
    const before = editorState(editor, tiptap);

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
    expect(editorState(editor, tiptap)).toEqual(before);
  });
});

describe("기존 텍스트 블록 Enter characterization", () => {
  it.each([
    [paragraphBlock("block-1", "앞뒤"), "paragraph", {}],
    [
      {
        id: "block-1",
        type: "heading",
        level: 3,
        content: [{ text: "앞뒤" }],
      } satisfies Block,
      "heading",
      { level: 3 },
    ],
    [
      {
        id: "block-1",
        type: "quote",
        content: [{ text: "앞뒤" }],
      } satisfies Block,
      "quote",
      {},
    ],
  ] as const)(
    "%s 중간 Enter는 기존 native split 타입·속성·undo 계약을 유지한다",
    (source, type, expectedAttributes) => {
      const { editor, tiptap } = mounted(
        documentOf(source, tailParagraphBlock),
      );
      tiptap.commands.setTextSelection(caretAt(tiptap, source.id).anchor + 1);
      const before = editorState(editor, tiptap);

      expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

      expect(tiptap.state.doc.child(0).firstChild?.type.name).toBe(type);
      expect(tiptap.state.doc.child(1).firstChild?.type.name).toBe(type);
      expect(tiptap.state.doc.child(0).firstChild?.textContent).toBe("앞");
      expect(tiptap.state.doc.child(1).firstChild?.textContent).toBe("뒤");
      expect(tiptap.state.doc.child(1).firstChild?.attrs).toMatchObject(
        expectedAttributes,
      );

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    },
  );
});
