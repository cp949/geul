/**
 * atom(divider·image/video/audio/file) 인접 Backspace/Delete의 재귀
 * 스킵(Issue #202 RD-002, "atom이 연속된 경우 재귀적으로 전부 건너뛴다")과
 * table 경계 보존을 확인한다. 단일 atom 인접은 divider.test.ts·
 * media-atom.test.ts가 각 파일에서 다룬다 — 이 파일은 두 종류가 섞여
 * 연속될 때와, 그 연속이 table에 닿을 때만 다룬다.
 *
 * 구현은 별도 재귀 코드가 아니다 — `Selection.findFrom(pos, dir,
 * textOnly=true)`(prosemirror-state)가 atom 자식을 무조건 건너뛰므로
 * 연속된 atom도 한 호출로 전부 넘어간다. table은 atom이 아니라
 * (`isAtom: false`) 이 skip에 걸리지 않고 컨테이너로 재귀되므로, 셀 안
 * 위치에 닿으면 기존 hasTableCellAncestor 가드가 표 전체 선택으로 계속
 * 가로챈다 — RD-002가 RD-003 범위(표 편입)를 침범하지 않는다는 회귀
 * 확인이다.
 */
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";

import { contentTextStart, dispatchKeydown } from "../block-test-support.js";
import {
  documentOf,
  dividerD1,
  mediaBlock,
  mounted,
  notApplicable,
  okResult,
  oneCellTableBlock,
  paragraphBlock,
} from "../editor-controller-support.js";
import { countNodes } from "./block-join-test-support.js";

describe("연속된 atom 재귀 스킵(Issue #202 RD-002)", () => {
  it("Backspace가 divider+image 두 atom을 연속으로 건너뛰어 이전 텍스트블록에 병합한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one"),
        dividerD1,
        mediaBlock("image", "m-1"),
        paragraphBlock("p-2", "two"),
        paragraphBlock("tail", ""),
      ),
    );

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-2"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    // 두 atom 모두 지워지지 않고 원래 순서 그대로 남는다.
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "onetwo"),
      dividerD1,
      mediaBlock("image", "m-1"),
      paragraphBlock("tail", ""),
    ]);
    expect(countNodes(tiptap, "divider")).toBe(1);
    expect(countNodes(tiptap, "image")).toBe(1);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one"),
      dividerD1,
      mediaBlock("image", "m-1"),
      paragraphBlock("p-2", "two"),
      paragraphBlock("tail", ""),
    ]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("Delete가 image+divider 두 atom을 연속으로 건너뛰어 다음 텍스트블록과 결합한다", () => {
    // 순서를 뒤집어(media가 먼저, divider가 나중) 양쪽 조합 모두 재귀가
    // 성립함을 확인한다.
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one"),
        mediaBlock("file", "f-1"),
        dividerD1,
        paragraphBlock("p-2", "two"),
        paragraphBlock("tail", ""),
      ),
    );

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "p-1") + "one".length,
    );
    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "onetwo"),
      mediaBlock("file", "f-1"),
      dividerD1,
      paragraphBlock("tail", ""),
    ]);
    expect(countNodes(tiptap, "file")).toBe(1);
    expect(countNodes(tiptap, "divider")).toBe(1);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one"),
      mediaBlock("file", "f-1"),
      dividerD1,
      paragraphBlock("p-2", "two"),
      paragraphBlock("tail", ""),
    ]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });
});

describe("atom 스킵이 table 경계에서 멈춘다(RD-003 범위 미침범 회귀)", () => {
  it("Delete가 divider를 건너뛴 뒤 table에 닿으면 병합하지 않고 표 전체를 선택한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one"),
        dividerD1,
        oneCellTableBlock("t-1"),
        paragraphBlock("p-2", "two"),
      ),
    );
    const before = editor.getDocument();

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "p-1") + "one".length,
    );
    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
    const selection = tiptap.state.selection as CellSelection;
    expect(selection.$anchorCell.node(-1).attrs.blockId).toBe("t-1");
    expect(selection.$headCell.node(-1).attrs.blockId).toBe("t-1");
    // selection-only — 문서·히스토리 무변경.
    expect(editor.getDocument()).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("Backspace가 divider를 건너뛴 뒤 table에 닿으면 병합하지 않고 표 전체를 선택한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one"),
        oneCellTableBlock("t-1"),
        dividerD1,
        paragraphBlock("p-2", "two"),
      ),
    );
    const before = editor.getDocument();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-2"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
    const selection = tiptap.state.selection as CellSelection;
    expect(selection.$anchorCell.node(-1).attrs.blockId).toBe("t-1");
    expect(selection.$headCell.node(-1).attrs.blockId).toBe("t-1");
    expect(editor.getDocument()).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });
});
