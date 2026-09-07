/**
 * BlockJoinExtension의 Backspace/Delete 병합 계약을 확인한다.
 *
 * 컨테이너 스키마(D19)에서 PM joinBackward의 deleteBarrier는 두
 * blockContainer를 join하지 못하고(blockContent 둘 연속은 content
 * expression 위반) findWrapping(blockGroup) 경로로 떨어져 뒤 블록을 앞
 * 블록의 자식으로 들여쓴다 — 평면 문서에서도. Delete(forward)도 대칭으로
 * 뒤 블록을 자식화한다. 이 파일은 D22(커스텀 split/join 커맨드 도입)의
 * join 쪽 이행이 dev(StarterKit joinBackward/joinForward) 의미론 —
 * 병합·빈 블록 제거·표 인접 NodeSelection — 을 복원함을 고정한다.
 * 병합은 단일 dispatch(undo 1회 단위, G-EDT-001)여야 한다.
 *
 * Issue #38 슬라이스 3(DELTA-05)이 더한 축: quote 블록의 Backspace join이
 * paragraph|heading 규칙을 그대로 따르고(05-C2), divider(비포장 atom)
 * 인접 Backspace/Delete가 텍스트를 divider 너머로 병합하지 않고 divider를
 * NodeSelection으로 선택한다(05-C5 — 첫 키는 selection-only, 이어지는 키가
 * divider를 지우고 그 삭제가 undo 1회 단위다).
 *
 * Issue #138이 더한 축: 표가 인접한 중첩 위치에서도 첫 키는 표 전체
 * CellSelection만 만들고, 이어지는 키는 표만 삭제해 undo 1회로 복원한다.
 *
 * 키 소비(반환 true)는 view.someProp("handleKeyDown", ...) 실 디스패치로
 * 검증한다 — 이 커맨드는 addKeyboardShortcuts로만 등록돼 editor.commands로
 * 노출되지 않는다(G-WKS-001).
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it, vi } from "vitest";

import { BlockJoinExtension } from "../../src/block-join-extension.js";
import { contentTextStart, dispatchKeydown } from "../block-test-support.js";
import {
  dividerBetweenParagraphsDocument, dividerD1, documentOf, editorState,
  expectDividerNodeSelection, firstParagraphBlock, mounted, nestedParagraphDocument,
  notApplicable, okResult, oneCellTableBlock, paragraphBlock, restored,
  secondParagraphBlock, tailParagraphBlock,
} from "../editor-controller-support.js";
import { cellJson, createTableFixtureEditor, placeCaretInCell } from "../table-test-support.js";
import { countNodes, expectSchemaValid, mountDocument } from "./block-join-test-support.js";

/**
 * Issue #138의 Backspace/Delete 대칭 중첩 배치를 마운트하고 표에 인접한
 * 텍스트 경계에 캐럿을 둔다. 각 테스트는 첫 키부터 공개 상태를 관찰한다.
 */
const mountedBesideNestedTable = (key: "Backspace" | "Delete") => {
  const context = mounted(
    documentOf(
      paragraphBlock(
        "p-1",
        "one",
        key === "Backspace"
          ? [paragraphBlock("c-1", "c"), oneCellTableBlock("t-1")]
          : [oneCellTableBlock("t-1"), paragraphBlock("c-1", "c")],
      ),
      paragraphBlock("p-2", "two"),
    ),
  );
  context.tiptap.commands.setTextSelection(
    key === "Backspace"
      ? contentTextStart(context.tiptap, "p-2")
      : contentTextStart(context.tiptap, "p-1") + "one".length,
  );
  return context;
};

describe("중첩 표 인접 Backspace/Delete", () => {
  it.each(["Backspace", "Delete"] as const)(
    "DOM에 붙은 중첩 표 CellSelection에서 %s 한 번 더는 표만 삭제한다",
    (key) => {
      const { editor, editable, tiptap } = mountedBesideNestedTable(key);
      const container = editable.parentElement;
      if (container === null) throw new Error("편집기 컨테이너 조회 실패");

      try {
        expect(dispatchKeydown(tiptap, key)).toBe(true);
        expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
        const beforeDelete = editorState(editor, tiptap);
        document.body.append(container);
        tiptap.view.focus();
        expect(document.getSelection()?.focusNode).not.toBeNull();
        const coordsAtPos = vi
          .spyOn(tiptap.view, "coordsAtPos")
          .mockReturnValue({ left: 0, right: 0, top: 0, bottom: 0 });

        try {
          expect(dispatchKeydown(tiptap, key)).toBe(true);

          expect(countNodes(tiptap, "table")).toBe(0);
          expect(editor.commands.undo()).toEqual(okResult);
          expect(editorState(editor, tiptap)).toEqual(
            restored(beforeDelete, 2),
          );
        } finally {
          coordsAtPos.mockRestore();
        }
      } finally {
        container.remove();
      }
    },
  );

  it("앞 형제의 마지막 자식 표에 인접한 Backspace는 표 전체를 선택하고 문서·revision·히스토리를 바꾸지 않는다", () => {
    const { editor, tiptap, changes } = mountedBesideNestedTable("Backspace");
    const before = editorState(editor, tiptap);

    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
    const selection = tiptap.state.selection as CellSelection;
    expect(selection.$anchorCell.node(-1).attrs.blockId).toBe("t-1");
    expect(selection.$headCell.node(-1).attrs.blockId).toBe("t-1");
    expect(tiptap.state.doc.toJSON()).toEqual(before.tiptapDocument);
    expect(editor.getDocument()).toEqual(before.document);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("부모의 첫 자식 표에 인접한 Delete는 표 전체를 선택하고 문서·revision·히스토리를 바꾸지 않는다", () => {
    const { editor, tiptap, changes } = mountedBesideNestedTable("Delete");
    const before = editorState(editor, tiptap);

    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
    const selection = tiptap.state.selection as CellSelection;
    expect(selection.$anchorCell.node(-1).attrs.blockId).toBe("t-1");
    expect(selection.$headCell.node(-1).attrs.blockId).toBe("t-1");
    expect(tiptap.state.doc.toJSON()).toEqual(before.tiptapDocument);
    expect(editor.getDocument()).toEqual(before.document);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("중첩 표 CellSelection에서 Backspace 한 번 더는 표만 삭제하고 undo 1회로 선택과 문서를 복원한다", () => {
    const { editor, tiptap, changes } = mountedBesideNestedTable("Backspace");

    dispatchKeydown(tiptap, "Backspace");
    const beforeDelete = editorState(editor, tiptap);
    expect(changes).toEqual([]);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one", [paragraphBlock("c-1", "c")]),
      paragraphBlock("p-2", "two"),
    ]);
    expect(countNodes(tiptap, "table")).toBe(0);
    expect(countNodes(tiptap, "blockGroup")).toBe(1);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.reason).toBe("local");

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(beforeDelete, 2));
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("중첩 표 CellSelection에서 Delete 한 번 더는 표만 삭제하고 undo 1회로 선택과 문서를 복원한다", () => {
    const { editor, tiptap, changes } = mountedBesideNestedTable("Delete");

    dispatchKeydown(tiptap, "Delete");
    const beforeDelete = editorState(editor, tiptap);
    expect(changes).toEqual([]);

    expect(dispatchKeydown(tiptap, "Delete")).toBe(true);

    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one", [paragraphBlock("c-1", "c")]),
      paragraphBlock("p-2", "two"),
    ]);
    expect(countNodes(tiptap, "table")).toBe(0);
    expect(countNodes(tiptap, "blockGroup")).toBe(1);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.reason).toBe("local");

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(beforeDelete, 2));
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("표가 blockGroup의 유일한 자식이면 Backspace 두 번이 빈 문단을 채우지 않고 그룹까지 제거한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one", [oneCellTableBlock("t-1")]),
        paragraphBlock("p-2", "two"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-2"));

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
    const beforeDelete = editorState(editor, tiptap);
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
    expect(changes).toEqual([]);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one"),
      paragraphBlock("p-2", "two"),
    ]);
    expect(countNodes(tiptap, "table")).toBe(0);
    expect(countNodes(tiptap, "blockGroup")).toBe(0);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(beforeDelete, 2));
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });
});
