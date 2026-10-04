/**
 * 접힌 toggleListItem의 숨은 자손 안으로 selection이 들어가지 않는 불변식을
 * 검증한다(Issue #246). 가드는 appendTransaction으로 selection 끝점이 숨은
 * 그룹 안이면 가장 바깥 접힌 toggle의 라벨 끝으로 옮긴다.
 * TextSelection 끝점별 clamp, NodeSelection·CellSelection 보정, 중첩 접힘,
 * 보이는 selection 무변경, 접기·표 방향키·API 유입 경로, undo·redo 왕복을 다룬다.
 *
 * selection은 DOM selection이 아니라 view.dispatch(tr.setSelection(...))로
 * 만든다. jsdom selectionchange 큐잉이 순서 결함을 가리기 때문이다.
 */
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import { contentTextStart, dispatchKeydown } from "./block-test-support.js";
import {
  documentOf,
  mounted,
  okResult,
  oneCellTableBlock,
  paragraphBlock,
  selectBlockNode,
} from "./editor-controller-support.js";
import { placeCaretInCell, selectSingleCell } from "./table-test-support.js";

import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";

/** toggleListItem 리터럴을 만든다. */
const toggleBlock = (
  id: string,
  text: string,
  options: { collapsed?: boolean; children?: Block[] } = {},
): Block => ({
  id,
  type: "toggleListItem",
  content: [{ text }],
  ...(options.collapsed === undefined ? {} : { collapsed: options.collapsed }),
  ...(options.children === undefined ? {} : { children: options.children }),
});

const LABEL_T1 = "토글";
const LABEL_T2 = "중첩";
const LABEL_U2 = "안쪽 접힘";

/**
 * 가드 fixture.
 * - t1: 접힘. 자식 c1(문단)·d1(구분선)·tb1(표)·t2(접힌 중첩 toggle, 자식 c2).
 * - u1: 펼침. 자식 u2(접힘, 자식 u3)와 u4(보이는 자식).
 * - tail: 최상위 문단.
 */
const fixture = () =>
  mounted(
    documentOf(
      toggleBlock("t1", LABEL_T1, {
        collapsed: true,
        children: [
          paragraphBlock("c1", "자식"),
          { id: "d1", type: "divider" },
          oneCellTableBlock("tb1"),
          toggleBlock("t2", LABEL_T2, {
            collapsed: true,
            children: [paragraphBlock("c2", "깊은 자식")],
          }),
        ],
      }),
      toggleBlock("u1", "펼침", {
        children: [
          toggleBlock("u2", LABEL_U2, {
            collapsed: true,
            children: [paragraphBlock("u3", "안쪽 숨김")],
          }),
          paragraphBlock("u4", "보이는 자식"),
        ],
      }),
      paragraphBlock("tail", "꼬리"),
    ),
  );

/** blockId 콘텐츠 시작 + offset에 selection을 만들어 dispatch한다. */
const selectText = (
  tiptap: TiptapEditor,
  anchorId: string,
  anchorOffset: number,
  headId = anchorId,
  headOffset = anchorOffset,
): void => {
  const selection = TextSelection.create(
    tiptap.state.doc,
    contentTextStart(tiptap, anchorId) + anchorOffset,
    contentTextStart(tiptap, headId) + headOffset,
  );
  tiptap.view.dispatch(tiptap.state.tr.setSelection(selection));
};

/** blockId 라벨 끝 위치. */
const labelEnd = (
  tiptap: TiptapEditor,
  blockId: string,
  label: string,
): number => contentTextStart(tiptap, blockId) + label.length;

/** 현재 selection이 pos의 빈 TextSelection인지 단언한다. */
const expectCaretAt = (tiptap: TiptapEditor, pos: number): void => {
  const { selection } = tiptap.state;
  expect(selection).toBeInstanceOf(TextSelection);
  expect({ anchor: selection.anchor, head: selection.head }).toEqual({
    anchor: pos,
    head: pos,
  });
};

describe("접힌 toggle 숨은 selection 가드", () => {
  it("숨은 자식 안 캐럿을 접힌 toggle 라벨 끝으로 옮긴다", () => {
    const { tiptap } = fixture();

    selectText(tiptap, "c1", 1);

    expectCaretAt(tiptap, labelEnd(tiptap, "t1", LABEL_T1));
  });

  it("비축약 TextSelection은 숨은 끝점만 옮기고 반대편 끝점은 유지한다", () => {
    const { tiptap } = fixture();
    const anchor = contentTextStart(tiptap, "t1") + 1;

    selectText(tiptap, "t1", 1, "c1", 2);

    const { selection } = tiptap.state;
    expect(selection.anchor).toBe(anchor);
    expect(selection.head).toBe(labelEnd(tiptap, "t1", LABEL_T1));
  });

  it("head가 라벨에 있고 anchor가 숨은 자식에 있으면 anchor만 옮긴다", () => {
    const { tiptap } = fixture();
    const head = contentTextStart(tiptap, "t1") + 1;

    selectText(tiptap, "c1", 2, "t1", 1);

    const { selection } = tiptap.state;
    expect(selection.anchor).toBe(labelEnd(tiptap, "t1", LABEL_T1));
    expect(selection.head).toBe(head);
  });

  it("두 끝점이 모두 숨으면 라벨 끝 캐럿이 된다", () => {
    const { tiptap } = fixture();

    selectText(tiptap, "c1", 0, "c2", 1);

    expectCaretAt(tiptap, labelEnd(tiptap, "t1", LABEL_T1));
  });

  it("서로 다른 접힌 toggle의 자식에 있는 양 끝점을 각 라벨 끝으로 보정한다", () => {
    const { tiptap } = fixture();

    selectText(tiptap, "c1", 1, "u3", 1);

    const { selection } = tiptap.state;
    expect(selection.anchor).toBe(labelEnd(tiptap, "t1", LABEL_T1));
    expect(selection.head).toBe(labelEnd(tiptap, "u2", LABEL_U2));
  });

  it("숨은 atom 블록의 NodeSelection을 라벨 끝 캐럿으로 바꾼다", () => {
    const { tiptap } = fixture();

    selectBlockNode(tiptap, "d1");

    expectCaretAt(tiptap, labelEnd(tiptap, "t1", LABEL_T1));
  });

  it("숨은 표 셀의 CellSelection을 라벨 끝 캐럿으로 바꾼다", () => {
    const { tiptap } = fixture();

    selectSingleCell(tiptap, "cell-1");

    expect(tiptap.state.selection).not.toBeInstanceOf(CellSelection);
    expectCaretAt(tiptap, labelEnd(tiptap, "t1", LABEL_T1));
  });

  it("숨은 표 셀 안 캐럿을 라벨 끝 캐럿으로 바꾼다", () => {
    const { tiptap } = fixture();

    placeCaretInCell(tiptap, "cell-1");

    expectCaretAt(tiptap, labelEnd(tiptap, "t1", LABEL_T1));
  });

  it("중첩 접힘의 가장 깊은 자손 끝점은 가장 바깥 접힌 toggle 라벨 끝으로 간다", () => {
    const { tiptap } = fixture();

    selectText(tiptap, "c2", 1);

    expectCaretAt(tiptap, labelEnd(tiptap, "t1", LABEL_T1));
  });

  it("펼친 toggle 안의 접힌 toggle이면 그 접힌 toggle 라벨 끝으로 간다", () => {
    const { tiptap } = fixture();

    selectText(tiptap, "u3", 1);

    expectCaretAt(tiptap, labelEnd(tiptap, "u2", LABEL_U2));
  });

  it("보이는 위치의 selection은 바꾸지 않고 appended transaction도 만들지 않는다", () => {
    const { tiptap } = fixture();
    const visible = [
      TextSelection.create(
        tiptap.state.doc,
        contentTextStart(tiptap, "t1") + 1,
      ), // 접힌 toggle 라벨
      TextSelection.create(
        tiptap.state.doc,
        contentTextStart(tiptap, "u4") + 1,
      ), // 펼친 toggle의 자식
      TextSelection.create(
        tiptap.state.doc,
        contentTextStart(tiptap, "u2") + 1,
      ), // 펼친 toggle 안 접힌 toggle의 라벨
      TextSelection.create(
        tiptap.state.doc,
        contentTextStart(tiptap, "tail") + 1,
      ), // 일반 블록
    ];

    for (const selection of visible) {
      const tr = tiptap.state.tr.setSelection(selection);
      const applied = tiptap.state.applyTransaction(tr);
      expect(applied.transactions).toHaveLength(1);
      expect(applied.state.selection.eq(selection)).toBe(true);
    }
  });

  it("보정이 필요한 transaction은 selection만 바꾸는 appended transaction 하나를 더한다", () => {
    const { tiptap } = fixture();
    const hidden = TextSelection.create(
      tiptap.state.doc,
      contentTextStart(tiptap, "c1") + 1,
    );

    const applied = tiptap.state.applyTransaction(
      tiptap.state.tr.setSelection(hidden),
    );

    expect(applied.transactions).toHaveLength(2);
    expect(applied.transactions[1]?.docChanged).toBe(false);
    expect(applied.transactions[1]?.getMeta("addToHistory")).toBe(false);
  });

  it("보정 뒤 selection은 보이는 위치라 다시 보정하지 않는다", () => {
    const { tiptap } = fixture();
    selectText(tiptap, "c1", 1);
    const settled = tiptap.state.selection;

    const applied = tiptap.state.applyTransaction(
      tiptap.state.tr.setSelection(settled),
    );

    expect(applied.transactions).toHaveLength(1);
  });

  it("접힌 toggle 안 전체 블록 NodeSelection(blockContainer)도 라벨 끝으로 옮긴다", () => {
    const { tiptap } = fixture();
    const position = findBlockPosition(tiptap.state.doc, "c1");
    if (position === null) throw new Error("c1 조회 실패");

    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        NodeSelection.create(tiptap.state.doc, position),
      ),
    );

    expectCaretAt(tiptap, labelEnd(tiptap, "t1", LABEL_T1));
  });

  describe("유입 경로", () => {
    it("접기 명령은 캐럿이 든 자식이 숨겨져도 selection을 라벨 끝으로 보정한다", () => {
      const { editor, tiptap } = mounted(
        documentOf(
          toggleBlock("t1", LABEL_T1, {
            children: [paragraphBlock("c1", "자식")],
          }),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      selectText(tiptap, "c1", 1);

      expect(editor.commands.toggleListItemCollapse("t1")).toEqual(okResult);

      expectCaretAt(tiptap, labelEnd(tiptap, "t1", LABEL_T1));
    });

    it("접힌 toggle 바로 뒤 표 첫 셀 ArrowLeft가 숨은 자식에 닿아도 라벨 끝으로 보정한다", () => {
      const { tiptap } = mounted(
        documentOf(
          toggleBlock("t1", LABEL_T1, {
            collapsed: true,
            children: [paragraphBlock("c1", "숨김")],
          }),
          oneCellTableBlock("tb-top"),
        ),
      );
      placeCaretInCell(tiptap, "cell-1");

      dispatchKeydown(tiptap, "ArrowLeft");

      expectCaretAt(tiptap, labelEnd(tiptap, "t1", LABEL_T1));
    });

    it("setTextCursorPosition은 오류 없이 성공하고 selection을 라벨 끝으로 보정한다", () => {
      const { editor, tiptap } = fixture();

      expect(editor.setTextCursorPosition("c1", "end")).toEqual(okResult);

      expectCaretAt(tiptap, labelEnd(tiptap, "t1", LABEL_T1));
    });

    it("setSelection은 오류 없이 성공하고 숨은 끝점만 라벨 끝으로 보정한다", () => {
      const { editor, tiptap } = fixture();
      const anchor = contentTextStart(tiptap, "t1");

      expect(editor.setSelection("t1", "c1")).toEqual(okResult);

      const { selection } = tiptap.state;
      expect(selection.anchor).toBe(anchor);
      expect(selection.head).toBe(labelEnd(tiptap, "t1", LABEL_T1));
    });
  });

  describe("undo·redo", () => {
    it("접기 undo는 접기 직전 캐럿을, redo는 라벨 끝 캐럿을 복원하고 숨은 selection을 남기지 않는다", () => {
      const { editor, tiptap } = mounted(
        documentOf(
          toggleBlock("t1", LABEL_T1, {
            children: [paragraphBlock("c1", "자식")],
          }),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      selectText(tiptap, "c1", 1);
      const caretBefore = tiptap.state.selection.anchor;
      expect(editor.commands.toggleListItemCollapse("t1")).toEqual(okResult);
      expectCaretAt(tiptap, labelEnd(tiptap, "t1", LABEL_T1));

      expect(editor.commands.undo()).toEqual(okResult);
      expectCaretAt(tiptap, caretBefore);

      expect(editor.commands.redo()).toEqual(okResult);
      expectCaretAt(tiptap, labelEnd(tiptap, "t1", LABEL_T1));
    });
  });
});
