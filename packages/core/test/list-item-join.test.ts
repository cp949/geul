/**
 * 글머리·번호 목록 항목의 Backspace/Delete exit·join 계약을 production
 * EditorController 경계에서 검증한다. 목록 타입 편입, 시각적 인접 대상 타입
 * 유지, 제거 항목 children 승격, selection·revision/event·dispatch·undo
 * 원자성과 stale DOM selection no-op을 고정한다.
 */
import type { Block } from "@cp949/geul-model";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it, vi } from "vitest";

import { contentTextStart, dispatchKeydown } from "./block-test-support.js";
import {
  caretAt,
  dividerBlock,
  documentOf,
  editorState,
  listItemBlock,
  mounted,
  notApplicable,
  oneCellTableBlock,
  paragraphBlock,
  restored,
  selectBlockNode,
  setBoldStoredMark,
  tailParagraphBlock,
} from "./editor-controller-support.js";
import { withNativeCaret } from "./native-selection-test-support.js";
import { selectSingleCell } from "./table-test-support.js";

describe("목록 선두 Backspace exit·join", () => {
  it("문서 최선두 번호 목록 Backspace는 ID·children·깊이를 보존한 paragraph로 단일 transaction 전환한다", () => {
    const children = [
      paragraphBlock("child-1", "첫 자식"),
      listItemBlock("child-2", "bulletListItem", "둘째 자식"),
    ];
    const source = listItemBlock("list-1", "numberedListItem", "목록", {
      startNumber: 7,
      children,
    });
    const { editor, tiptap, changes } = mounted(
      documentOf(source, tailParagraphBlock),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, source.id));
    const before = editorState(editor, tiptap);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");
    const appendedTransactionCounts: number[] = [];
    tiptap.on("transaction", ({ appendedTransactions }) => {
      appendedTransactionCounts.push(appendedTransactions.length);
    });

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(appendedTransactionCounts).toEqual([0]);
    expect(editor.getDocument()).toEqual({
      ...documentOf(
        paragraphBlock("list-1", "목록", children),
        tailParagraphBlock,
      ),
      revision: 1,
    });
    expect(tiptap.state.doc.child(0).firstChild?.type.name).toBe("paragraph");
    expect(tiptap.state.doc.child(0).attrs.blockId).toBe("list-1");
    expect(tiptap.state.doc.child(0).child(1).childCount).toBe(2);
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "list-1"));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ revision: 1, reason: "local" });

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it.each([
    [
      "paragraph",
      paragraphBlock("target", "앞"),
      paragraphBlock("target", "앞뒤"),
    ],
    [
      "heading",
      {
        id: "target",
        type: "heading",
        level: 4,
        content: [{ text: "앞" }],
      } satisfies Block,
      {
        id: "target",
        type: "heading",
        level: 4,
        content: [{ text: "앞뒤" }],
      } satisfies Block,
    ],
    [
      "quote",
      {
        id: "target",
        type: "quote",
        content: [{ text: "앞" }],
      } satisfies Block,
      {
        id: "target",
        type: "quote",
        content: [{ text: "앞뒤" }],
      } satisfies Block,
    ],
    [
      "numberedListItem",
      listItemBlock("target", "numberedListItem", "앞", { startNumber: 9 }),
      listItemBlock("target", "numberedListItem", "앞뒤", {
        startNumber: 9,
      }),
    ],
  ] as const)(
    "목록 선두 Backspace는 시각적 이전 %s 타입을 유지하고 제거 항목 children을 같은 자리에 승격한다",
    (targetType, target, expectedTarget) => {
      const promoted = [
        paragraphBlock("child-1", "자식1"),
        listItemBlock("child-2", "bulletListItem", "자식2"),
      ];
      const removed = listItemBlock("removed", "bulletListItem", "뒤", {
        children: promoted,
      });
      const { editor, tiptap, changes } = mounted(
        documentOf(target, removed, tailParagraphBlock),
      );
      tiptap.commands.setTextSelection(contentTextStart(tiptap, removed.id));
      const before = editorState(editor, tiptap);
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(editor.getDocument()).toEqual({
        ...documentOf(expectedTarget, ...promoted, tailParagraphBlock),
        revision: 1,
      });
      expect(tiptap.state.doc.child(0).firstChild?.type.name).toBe(targetType);
      expect(tiptap.state.selection.$from.parent.type.name).toBe(targetType);
      expect(tiptap.state.selection.$from.parentOffset).toBe(1);
      expect(changes).toHaveLength(1);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    },
  );
});

describe("목록 끝 Delete join", () => {
  it("중첩 목록 끝 Delete는 시각적 다음 이종 목록을 대상 타입으로 합치고 그 children을 부모의 같은 자리에 승격한다", () => {
    const promoted = [
      paragraphBlock("grandchild-1", "손자1"),
      listItemBlock("grandchild-2", "bulletListItem", "손자2"),
    ];
    const next = listItemBlock("next", "numberedListItem", "뒤", {
      startNumber: 13,
      children: promoted,
    });
    const source = listItemBlock("source", "bulletListItem", "앞", {
      children: [next],
    });
    const { editor, tiptap, changes } = mounted(
      documentOf(source, tailParagraphBlock),
    );
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, source.id) + "앞".length,
    );
    const before = editorState(editor, tiptap);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(dispatchKeydown(tiptap, "Delete")).toBe(true);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(editor.getDocument()).toEqual({
      ...documentOf(
        listItemBlock("source", "bulletListItem", "앞뒤", {
          children: promoted,
        }),
        tailParagraphBlock,
      ),
      revision: 1,
    });
    const sourceContainer = tiptap.state.doc.child(0);
    expect(sourceContainer.firstChild?.type.name).toBe("bulletListItem");
    expect(sourceContainer.firstChild?.textContent).toBe("앞뒤");
    expect(
      sourceContainer
        .child(1)
        .content.content.map((node) => node.attrs.blockId),
    ).toEqual(["grandchild-1", "grandchild-2"]);
    expect(tiptap.state.selection.$from.parent).toBe(
      sourceContainer.firstChild,
    );
    expect(tiptap.state.selection.$from.parentOffset).toBe(1);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });
});

describe("목록 join 거절·no-op", () => {
  it.each([
    {
      key: "Backspace",
      blocks: (table: Block, list: Block, code: Block) => [table, code, list],
      nativeOffset: 0,
      expectedCodeOffset: 2,
    },
    {
      key: "Delete",
      blocks: (table: Block, list: Block, code: Block) => [table, list, code],
      nativeOffset: 2,
      expectedCodeOffset: 0,
    },
  ] as const)(
    "live 표 전체 CellSelection에서 native 목록 $key 경계와 인접한 CodeBlock으로 selection-only 이동한다",
    ({ key, blocks, nativeOffset, expectedCodeOffset }) => {
      const table = oneCellTableBlock("table");
      const list = listItemBlock("list", "bulletListItem", "가나");
      const code = {
        id: "code",
        type: "codeBlock",
        content: [{ text: "XY" }],
      } satisfies Block;
      const { editor, tiptap, changes } = mounted(
        documentOf(...blocks(table, list, code), tailParagraphBlock),
      );
      const nativePosition = contentTextStart(tiptap, list.id) + nativeOffset;
      tiptap.commands.setTextSelection(nativePosition);
      const targetDom = tiptap.view.domAtPos(nativePosition);
      const beforeDocument = editor.getDocument();
      const beforeTiptapDocument = tiptap.state.doc.toJSON();

      withNativeCaret(
        tiptap.view.dom as HTMLElement,
        () => {
          selectSingleCell(tiptap, "cell-1");
          expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
          const dispatch = vi.spyOn(tiptap.view, "dispatch");

          expect(dispatchKeydown(tiptap, key)).toBe(true);

          expect(dispatch).toHaveBeenCalledTimes(1);
          const expectedPosition =
            contentTextStart(tiptap, code.id) + expectedCodeOffset;
          expect(tiptap.state.selection.toJSON()).toEqual({
            type: "text",
            anchor: expectedPosition,
            head: expectedPosition,
          });
          expect(editor.getDocument()).toEqual(beforeDocument);
          expect(tiptap.state.doc.toJSON()).toEqual(beforeTiptapDocument);
          expect(changes).toEqual([]);
          expect(editor.commands.undo()).toEqual(notApplicable("undo"));
        },
        targetDom.node,
        targetDom.offset,
      );
    },
  );

  it.each(["Backspace", "Delete"] as const)(
    "live 표 전체 CellSelection과 native 문단 중간 caret이 다른 $key은 키만 소비하고 상태·history를 보존한다",
    (key) => {
      const table = oneCellTableBlock("table");
      const paragraph = paragraphBlock("paragraph", "가나");
      const { editor, tiptap, changes } = mounted(documentOf(table, paragraph));
      const nativePosition = contentTextStart(tiptap, paragraph.id) + 1;
      tiptap.commands.setTextSelection(nativePosition);
      const targetDom = tiptap.view.domAtPos(nativePosition);

      withNativeCaret(
        tiptap.view.dom as HTMLElement,
        () => {
          selectSingleCell(tiptap, "cell-1");
          setBoldStoredMark(tiptap);
          expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
          const before = editorState(editor, tiptap);
          const dispatch = vi.spyOn(tiptap.view, "dispatch");

          expect(dispatchKeydown(tiptap, key)).toBe(true);

          expect(dispatch).not.toHaveBeenCalled();
          expect(editorState(editor, tiptap)).toEqual(before);
          expect(changes).toEqual([]);
          expect(editor.commands.undo()).toEqual(notApplicable("undo"));
          expect(editorState(editor, tiptap)).toEqual(before);
        },
        targetDom.node,
        targetDom.offset,
      );
    },
  );

  it.each(["Backspace", "Delete"] as const)(
    "live divider NodeSelection과 native 문단 중간 caret이 다른 $key은 stale divider를 삭제하지 않고 상태·history를 보존한다",
    (key) => {
      const paragraph = paragraphBlock("paragraph", "가나");
      const divider = dividerBlock("divider");
      const tail = paragraphBlock("tail", "다라");
      const { editor, tiptap, changes } = mounted(
        documentOf(paragraph, divider, tail),
      );
      const nativePosition = contentTextStart(tiptap, paragraph.id) + 1;
      tiptap.commands.setTextSelection(nativePosition);
      const targetDom = tiptap.view.domAtPos(nativePosition);

      withNativeCaret(
        tiptap.view.dom as HTMLElement,
        () => {
          selectBlockNode(tiptap, divider.id);
          setBoldStoredMark(tiptap);
          const before = editorState(editor, tiptap);
          const dispatch = vi.spyOn(tiptap.view, "dispatch");

          expect(dispatchKeydown(tiptap, key)).toBe(true);

          expect(dispatch).not.toHaveBeenCalled();
          expect(editorState(editor, tiptap)).toEqual(before);
          expect(changes).toEqual([]);
          expect(editor.commands.undo()).toEqual(notApplicable("undo"));
          expect(editorState(editor, tiptap)).toEqual(before);
        },
        targetDom.node,
        targetDom.offset,
      );
    },
  );

  it("네이티브 목록 선두 caret은 live 표 전체 CellSelection보다 우선해 표를 보존하고 목록을 join한다", () => {
    const table = oneCellTableBlock("table");
    const paragraph = paragraphBlock("paragraph", "앞");
    const list = listItemBlock("list", "bulletListItem", "뒤");
    const { editor, tiptap, changes } = mounted(
      documentOf(table, paragraph, list, tailParagraphBlock),
    );
    const nativePosition = contentTextStart(tiptap, list.id);
    tiptap.commands.setTextSelection(nativePosition);
    const targetDom = tiptap.view.domAtPos(nativePosition);
    const beforeDocument = editor.getDocument();

    withNativeCaret(
      tiptap.view.dom as HTMLElement,
      () => {
        selectSingleCell(tiptap, "cell-1");
        expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(editor.getDocument()).toEqual({
          ...documentOf(
            table,
            paragraphBlock("paragraph", "앞뒤"),
            tailParagraphBlock,
          ),
          revision: 1,
        });
        expect(changes).toHaveLength(1);
      },
      targetDom.node,
      targetDom.offset,
    );

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toEqual({ ...beforeDocument, revision: 2 });
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("네이티브 목록 선두 caret은 live CodeBlock 중간 selection보다 우선해 목록을 join한다", () => {
    const paragraph = paragraphBlock("paragraph", "앞");
    const list = listItemBlock("list", "bulletListItem", "뒤");
    const code = {
      id: "code",
      type: "codeBlock",
      content: [{ text: "XY" }],
    } satisfies Block;
    const { editor, tiptap, changes } = mounted(
      documentOf(paragraph, list, code, tailParagraphBlock),
    );
    const nativePosition = contentTextStart(tiptap, list.id);
    tiptap.commands.setTextSelection(nativePosition);
    const targetDom = tiptap.view.domAtPos(nativePosition);
    const beforeDocument = editor.getDocument();

    withNativeCaret(
      tiptap.view.dom as HTMLElement,
      () => {
        tiptap.view.dispatch(
          tiptap.state.tr.setSelection(
            TextSelection.create(
              tiptap.state.doc,
              contentTextStart(tiptap, code.id) + 1,
            ),
          ),
        );
        expect(tiptap.state.selection.$from.parent.type.name).toBe("codeBlock");
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(editor.getDocument()).toEqual({
          ...documentOf(
            paragraphBlock("paragraph", "앞뒤"),
            code,
            tailParagraphBlock,
          ),
          revision: 1,
        });
        expect(changes).toHaveLength(1);
      },
      targetDom.node,
      targetDom.offset,
    );

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toEqual({ ...beforeDocument, revision: 2 });
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("네이티브 caret이 목록 선두이고 live selection이 문단 중간에 stale해도 클릭한 목록을 단일 transaction으로 join한다", () => {
    const paragraph = paragraphBlock("paragraph", "가나");
    const list = listItemBlock("list", "bulletListItem", "다라");
    const { editor, tiptap, changes } = mounted(
      documentOf(paragraph, list, tailParagraphBlock),
    );
    const nativePosition = contentTextStart(tiptap, list.id);
    tiptap.commands.setTextSelection(nativePosition);
    const targetDom = tiptap.view.domAtPos(nativePosition);
    const beforeDocument = editor.getDocument();
    const beforeTiptapDocument = tiptap.state.doc.toJSON();

    withNativeCaret(
      tiptap.view.dom as HTMLElement,
      () => {
        const stalePosition = contentTextStart(tiptap, paragraph.id) + 1;
        tiptap.view.dispatch(
          tiptap.state.tr.setSelection(
            TextSelection.create(tiptap.state.doc, stalePosition),
          ),
        );
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(editor.getDocument()).toEqual({
          ...documentOf(
            paragraphBlock("paragraph", "가나다라"),
            tailParagraphBlock,
          ),
          revision: 1,
        });
        expect(tiptap.state.selection.$from.parentOffset).toBe(2);
        expect(changes).toHaveLength(1);
      },
      targetDom.node,
      targetDom.offset,
    );

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toEqual({
      ...beforeDocument,
      revision: 2,
    });
    expect(tiptap.state.doc.toJSON()).toEqual(beforeTiptapDocument);
    expect(tiptap.state.selection.toJSON()).toEqual({
      type: "text",
      anchor: caretAt(tiptap, paragraph.id).anchor + 1,
      head: caretAt(tiptap, paragraph.id).head + 1,
    });
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("네이티브 caret이 문단 중간으로 옮겨졌고 live selection이 목록 선두에 stale하면 키만 소비하고 상태·history를 보존한다", () => {
    const paragraph = paragraphBlock("paragraph", "가나");
    const list = listItemBlock("list", "bulletListItem", "다라");
    const { editor, tiptap, changes } = mounted(
      documentOf(paragraph, list, tailParagraphBlock),
    );
    const nativePosition = contentTextStart(tiptap, paragraph.id) + 1;
    tiptap.commands.setTextSelection(nativePosition);
    const targetDom = tiptap.view.domAtPos(nativePosition);

    withNativeCaret(
      tiptap.view.dom as HTMLElement,
      () => {
        const stalePosition = contentTextStart(tiptap, list.id);
        tiptap.view.dispatch(
          tiptap.state.tr.setSelection(
            TextSelection.create(tiptap.state.doc, stalePosition),
          ),
        );
        setBoldStoredMark(tiptap);
        const before = editorState(editor, tiptap);
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

        expect(dispatch).not.toHaveBeenCalled();
        expect(editorState(editor, tiptap)).toEqual(before);
        expect(changes).toEqual([]);
        expect(editor.commands.undo()).toEqual(notApplicable("undo"));
        expect(editorState(editor, tiptap)).toEqual(before);
      },
      targetDom.node,
      targetDom.offset,
    );
  });
});
