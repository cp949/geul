/**
 * moveBlockAdjacent(block-move-commands.ts)와 BlockMoveKeyboardExtension이
 * 캐럿 단일 블록을 같은 형제 배열(최상위 또는 같은 blockGroup) 안에서
 * 한 칸 위/아래로 정확히 교환하는지, 경계에서 no-op인지, 표 셀 안에서는
 * 관여하지 않는지 검증한다(RD-004 DELTA-01). `moveBlockBefore`(cross-parent
 * 이동)와 달리 같은 부모 안 이동이라 깊이·자손 가드가 없다(RD-004.md
 * "결정" (b)).
 */
import { describe, expect, it } from "vitest";

import { BlockMoveKeyboardExtension } from "../src/block-move-keyboard-extension.js";
import {
  contentTextStart,
  dispatchModShiftKeydown,
} from "./block-test-support.js";
import {
  documentOf,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";
import {
  createTableFixtureEditor,
  docWithTwoRowTable,
  placeCaretInCell,
} from "./table-test-support.js";

describe("최상위 형제 배열 이동", () => {
  it("중간 블록 위로 이동은 바로 앞 형제와 자리를 바꾼다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("a", "A"),
        paragraphBlock("b", "B"),
        paragraphBlock("c", "C"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "b"));

    expect(dispatchModShiftKeydown(tiptap, "ArrowUp")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("b", "B"),
      paragraphBlock("a", "A"),
      paragraphBlock("c", "C"),
    ]);
  });

  it("중간 블록 아래로 이동은 바로 뒤 형제와 자리를 바꾼다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("a", "A"),
        paragraphBlock("b", "B"),
        paragraphBlock("c", "C"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "b"));

    expect(dispatchModShiftKeydown(tiptap, "ArrowDown")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("a", "A"),
      paragraphBlock("c", "C"),
      paragraphBlock("b", "B"),
    ]);
  });

  it("맨 위 블록에서 위로는 no-op이다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("a", "A"), paragraphBlock("b", "B")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "a"));

    expect(dispatchModShiftKeydown(tiptap, "ArrowUp")).toBe(false);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("a", "A"),
      paragraphBlock("b", "B"),
    ]);
  });

  it("맨 아래 블록에서 아래로는 no-op이다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("a", "A"), paragraphBlock("b", "B")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "b"));

    expect(dispatchModShiftKeydown(tiptap, "ArrowDown")).toBe(false);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("a", "A"),
      paragraphBlock("b", "B"),
    ]);
  });

  it("이동한 블록 안 같은 상대 텍스트 위치에 캐럿이 남는다", () => {
    const { tiptap } = mounted(
      documentOf(
        paragraphBlock("a", "A"),
        paragraphBlock("b", "Bbb"),
        paragraphBlock("c", "C"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "b") + 2);

    expect(dispatchModShiftKeydown(tiptap, "ArrowUp")).toBe(true);
    expect(tiptap.state.selection.from).toBe(contentTextStart(tiptap, "b") + 2);
  });
});

describe("들여쓴 blockGroup 안 형제 배열 이동", () => {
  it("같은 blockGroup 안 형제와도 자리를 바꾼다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("parent", "부모", [
          paragraphBlock("child-a", "A"),
          paragraphBlock("child-b", "B"),
        ]),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "child-b"));

    expect(dispatchModShiftKeydown(tiptap, "ArrowUp")).toBe(true);
    // "parent"가 blockGroup 자식(들여쓴 두 항목)을 가져 doc 최상위 마지막
    // 블록의 "childless paragraph" 조건을 못 만족한다 — mount 시
    // TrailingBlockExtension이 자동으로 trailing 문단(첫 자동 id "id-1")을
    // 붙인다(RD-003 DELTA-02에서 처음 확인한 것과 같은 불변식).
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("parent", "부모", [
        paragraphBlock("child-b", "B"),
        paragraphBlock("child-a", "A"),
      ]),
      paragraphBlock("id-1", ""),
    ]);
  });
});

describe("표 셀 안에서는 관여하지 않는다", () => {
  it("표 셀 안 keydown은 실제 keymap 디스패치에서도 소비되지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable, [
      BlockMoveKeyboardExtension,
    ]);
    placeCaretInCell(editor, "cell-1");

    expect(dispatchModShiftKeydown(editor, "ArrowUp")).toBe(false);
    expect(dispatchModShiftKeydown(editor, "ArrowDown")).toBe(false);
  });
});
