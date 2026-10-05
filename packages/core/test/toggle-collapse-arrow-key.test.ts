/**
 * 접힌 toggleListItem 라벨에서 ArrowDown·ArrowRight가 숨은 첫 자식 atom에
 * 막히지 않는지 검증한다(Issue #254, #255). 핸들러는 첫 숨은 자식이 있으면
 * 종류(atom·문단·표)와 무관하게 키를 소비하고(Issue #261), 접힌 container 뒤
 * 첫 선택 가능 위치로 selection을 옮긴다.
 * 소비 조건(빈 TextSelection·접힌 라벨·첫 위치가 숨은 자손),
 * 착지(텍스트블록 시작·atom NodeSelection), 중첩 접힘, dispatch 1회·문서 불변,
 * 클릭 직후 stale selection(G-EDT-002)을 다룬다.
 * 라벨 끝 요구는 ArrowRight만 갖는다. ArrowDown은 라벨 중간·시작에서도
 * 마지막 줄이면 소비한다(Issue #255).
 * ArrowRight는 시각 방향 "right"로 판정한다. RTL로 끝나는 라벨은 논리 끝이어도
 * 시각 오른쪽 끝이 아닐 수 있다(Issue #268).
 * ArrowLeft는 소비하지 않고 사후 교정한다. 라벨 끝 keydown 뒤 PM이 만든 숨은
 * NodeSelection만 접힌 container 뒤로 옮긴다(Issue #273).
 *
 * jsdom은 레이아웃이 없어 view.endOfTextblock을 믿을 수 없다. 값을
 * vi.spyOn으로 고정한다(ADR-0007). 실제 값은 e2e가 증명한다.
 */
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";
import type { ResolvedPos } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vitest";

import { contentTextStart, dispatchKeydown } from "./block-test-support.js";
import {
  dividerBlock,
  documentOf,
  expectDividerNodeSelection,
  mediaBlock,
  mounted,
  oneCellTableBlock,
  paragraphBlock,
  toggleBlock,
} from "./editor-controller-support.js";
import {
  withNativeCaret,
  withoutScrollCrash,
} from "./native-selection-test-support.js";

import type { Editor as TiptapEditor } from "@tiptap/core";

const LABEL = "토글";

/**
 * fixture. 접힌 toggle마다 뒤에 보이는 블록을 둔다.
 * - t1: 접힘, 첫 자식 divider. 뒤는 문단 a1.
 * - t2: 접힘, 첫 자식 문단. 뒤는 문단 a2.
 * - t3: 접힘, 자식 없음. 뒤는 문단 a3.
 * - t4: 접힘, 첫 자식 divider. 뒤는 divider n4(atom).
 * - u1: 펼침, 첫 자식 divider. 뒤는 문단 a5.
 * - t6: 접힘, 첫 자식 image. 뒤는 문단 a6.
 * - p1: 펼침. 마지막 자식이 접힌 t7(첫 자식 divider). 뒤는 문단 a7.
 * - t8: 접힘, 첫 자식 문단 c8. 뒤는 divider n8(atom).
 * - t9: 접힘, 첫 자식 1칸 표 tb9. 뒤는 divider n9(atom).
 * - tail: 꼬리 문단.
 */
const fixture = () =>
  mounted(
    documentOf(
      toggleBlock("t1", LABEL, {
        collapsed: true,
        children: [dividerBlock("d1")],
      }),
      paragraphBlock("a1", "뒤1"),
      toggleBlock("t2", LABEL, {
        collapsed: true,
        children: [paragraphBlock("c2", "숨은 문단")],
      }),
      paragraphBlock("a2", "뒤2"),
      toggleBlock("t3", LABEL, { collapsed: true }),
      paragraphBlock("a3", "뒤3"),
      toggleBlock("t4", LABEL, {
        collapsed: true,
        children: [dividerBlock("d4")],
      }),
      dividerBlock("n4"),
      toggleBlock("u1", LABEL, { children: [dividerBlock("d5")] }),
      paragraphBlock("a5", "뒤5"),
      toggleBlock("t6", LABEL, {
        collapsed: true,
        children: [mediaBlock("image", "m6")],
      }),
      paragraphBlock("a6", "뒤6"),
      toggleBlock("p1", "부모", {
        children: [
          paragraphBlock("pc", "보이는 자식"),
          toggleBlock("t7", LABEL, {
            collapsed: true,
            children: [dividerBlock("d7")],
          }),
        ],
      }),
      paragraphBlock("a7", "뒤7"),
      toggleBlock("t8", LABEL, {
        collapsed: true,
        children: [paragraphBlock("c8", "숨은 문단8")],
      }),
      dividerBlock("n8"),
      toggleBlock("t9", LABEL, {
        collapsed: true,
        children: [oneCellTableBlock("tb9")],
      }),
      dividerBlock("n9"),
      paragraphBlock("tail", "꼬리"),
    ),
  );

/** blockId 라벨 끝 위치. */
const labelEnd = (tiptap: TiptapEditor, blockId: string): number =>
  contentTextStart(tiptap, blockId) + LABEL.length;

/** pos에 빈 TextSelection을 dispatch한다. */
const placeCaret = (tiptap: TiptapEditor, pos: number): void => {
  tiptap.view.dispatch(
    tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, pos)),
  );
};

/** blockId 라벨 중간(시작 다음 글자 뒤) 위치. */
const labelMiddle = (tiptap: TiptapEditor, blockId: string): number =>
  contentTextStart(tiptap, blockId) + 1;

/** blockId 라벨 끝에 캐럿을 둔다. */
const placeCaretAtLabelEnd = (tiptap: TiptapEditor, blockId: string): void =>
  placeCaret(tiptap, labelEnd(tiptap, blockId));

/** blockId 라벨 중간에 캐럿을 둔다. */
const placeCaretAtLabelMiddle = (tiptap: TiptapEditor, blockId: string): void =>
  placeCaret(tiptap, labelMiddle(tiptap, blockId));

/** blockId 라벨 시작(offset 0)에 캐럿을 둔다. */
const placeCaretAtLabelStart = (tiptap: TiptapEditor, blockId: string): void =>
  placeCaret(tiptap, contentTextStart(tiptap, blockId));

/** view.endOfTextblock 값을 고정한다. jsdom은 이 값을 믿을 수 없다. */
const stubEndOfTextblock = (tiptap: TiptapEditor, value: boolean) =>
  vi.spyOn(tiptap.view, "endOfTextblock").mockReturnValue(value);

/** 현재 selection이 pos의 빈 TextSelection인지 단언한다. */
const expectCaretAt = (tiptap: TiptapEditor, pos: number): void => {
  const { selection } = tiptap.state;
  expect(selection).toBeInstanceOf(TextSelection);
  expect({ anchor: selection.anchor, head: selection.head }).toEqual({
    anchor: pos,
    head: pos,
  });
};

/**
 * $pos가 접힌 toggle의 숨은 자손 안인지 판정한다. 구현 모듈 헬퍼를 import하지
 * 않고 조상 체인에서 다시 판정한다. 테스트가 구현과 같은 결함을 공유하지 않게 한다.
 */
const isHidden = ($pos: ResolvedPos): boolean => {
  for (let depth = 0; depth <= $pos.depth; depth += 1) {
    const node = $pos.node(depth);
    const first = node.firstChild;
    if (
      node.type.name === "blockContainer" &&
      first?.type.name === "toggleListItem" &&
      first.attrs.collapsed === true &&
      depth < $pos.depth &&
      $pos.index(depth) >= 1
    ) {
      return true;
    }
  }
  return false;
};

const KEYS = ["ArrowDown", "ArrowRight"] as const;
const EXPECTED_DIRECTION = {
  ArrowDown: "down",
  ArrowRight: "right",
} as const;

describe("접힌 toggle 방향키", () => {
  describe.each(KEYS)("%s", (key) => {
    it.each([
      ["divider", "t1", "a1"],
      ["미디어(atom)", "t6", "a6"],
      ["문단(텍스트블록)", "t2", "a2"],
    ])(
      "첫 숨은 자식이 %s이면 키를 소비하고 다음 보이는 블록 시작으로 간다",
      (_label, toggleId, nextId) => {
        const { tiptap } = fixture();
        placeCaretAtLabelEnd(tiptap, toggleId);
        const endOfTextblock = stubEndOfTextblock(tiptap, true);

        const consumed = dispatchKeydown(tiptap, key);

        expect(consumed).toBe(true);
        // gapcursor도 같은 spy를 부른다. 핸들러 방향("right"·"down") 호출이 있는지 본다.
        expect(
          endOfTextblock.mock.calls.map(([direction]) => direction),
        ).toContain(EXPECTED_DIRECTION[key]);
        expectCaretAt(tiptap, contentTextStart(tiptap, nextId));
      },
    );

    it("다음 보이는 블록이 atom이면 그 atom의 NodeSelection이 된다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t4");
      stubEndOfTextblock(tiptap, true);

      const consumed = dispatchKeydown(tiptap, key);

      expect(consumed).toBe(true);
      expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
      expectDividerNodeSelection(tiptap, "n4");
    });

    it("첫 숨은 자식이 텍스트블록이어도 다음 보이는 블록이 atom이면 그 NodeSelection이 된다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t8");
      stubEndOfTextblock(tiptap, true);

      expect(dispatchKeydown(tiptap, key)).toBe(true);

      expectDividerNodeSelection(tiptap, "n8");
    });

    it("자식 없는 접힌 toggle은 소비하지 않는다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t3");
      stubEndOfTextblock(tiptap, true);
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchKeydown(tiptap, key)).toBe(false);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("접히지 않은 toggle 라벨 끝은 소비하지 않는다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "u1");
      stubEndOfTextblock(tiptap, true);
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchKeydown(tiptap, key)).toBe(false);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("일반 블록 끝은 소비하지 않는다", () => {
      const { tiptap } = fixture();
      placeCaret(tiptap, contentTextStart(tiptap, "a1") + "뒤1".length);
      stubEndOfTextblock(tiptap, true);
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchKeydown(tiptap, key)).toBe(false);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("라벨 끝이어도 endOfTextblock이 false면(줄바꿈 라벨의 중간 줄) 소비하지 않는다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t1");
      stubEndOfTextblock(tiptap, false);
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchKeydown(tiptap, key)).toBe(false);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("endOfTextblock이 throw하면 소비하지 않는다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t1");
      // gapcursor 플러그인도 endOfTextblock을 부른다. state를 넘기는 호출만
      // throw시켜 gapcursor 쪽 예외가 테스트를 깨뜨리지 않게 한다.
      vi.spyOn(tiptap.view, "endOfTextblock").mockImplementation(
        (_direction, state) => {
          if (state !== undefined) throw new Error("레이아웃 없음");
          return false;
        },
      );
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchKeydown(tiptap, key)).toBe(false);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("접힌 toggle이 부모 toggle의 마지막 자식이면 부모 뒤 첫 선택 가능 위치로 간다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t7");
      stubEndOfTextblock(tiptap, true);

      expect(dispatchKeydown(tiptap, key)).toBe(true);

      expectCaretAt(tiptap, contentTextStart(tiptap, "a7"));
    });

    it("dispatch 1회로 selection만 바꾸고 숨은 자손에 들어가지 않는다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t1");
      stubEndOfTextblock(tiptap, true);
      const docBefore = tiptap.state.doc;
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchKeydown(tiptap, key)).toBe(true);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(tiptap.state.doc).toBe(docBefore);
      const { selection } = tiptap.state;
      expect(isHidden(selection.$from)).toBe(false);
      expect(isHidden(selection.$to)).toBe(false);
    });

    it.each([
      ["문단", "t2"],
      ["divider", "t8"],
    ])(
      "첫 숨은 자식이 문단이고 뒤가 %s인 접힌 toggle도 dispatch 1회로 selection만 바꾸고 숨은 자손에 들어가지 않는다",
      (_label, toggleId) => {
        const { tiptap } = fixture();
        placeCaretAtLabelEnd(tiptap, toggleId);
        stubEndOfTextblock(tiptap, true);
        const docBefore = tiptap.state.doc;
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        expect(dispatchKeydown(tiptap, key)).toBe(true);

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(tiptap.state.doc).toBe(docBefore);
        const { selection } = tiptap.state;
        expect(isHidden(selection.$from)).toBe(false);
        expect(isHidden(selection.$to)).toBe(false);
      },
    );

    it("목적지가 없으면 키만 소비하고 selection을 바꾸지 않는다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t1");
      stubEndOfTextblock(tiptap, true);
      const labelSelection = tiptap.state.selection;
      // 접힌 container 뒤 위치의 탐색만 null로 만든다. 숨은 atom 판정 탐색은 원본이다.
      const { $head } = labelSelection;
      const exitPos = $head.after($head.depth - 1);
      const original = Selection.findFrom.bind(Selection);
      // Selection은 전역이라 spy를 반드시 복원한다(G-TST-003).
      const findFrom = vi
        .spyOn(Selection, "findFrom")
        .mockImplementation(($pos, dir, textOnly) =>
          $pos.pos === exitPos ? null : original($pos, dir, textOnly),
        );
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      try {
        expect(dispatchKeydown(tiptap, key)).toBe(true);
      } finally {
        findFrom.mockRestore();
      }

      expect(dispatch).not.toHaveBeenCalled();
      expect(tiptap.state.selection).toBe(labelSelection);
    });

    it("클릭 직후 stale selection이어도 DOM 기준 캐럿으로 판정한다", () => {
      const { tiptap } = fixture();
      const dom = tiptap.view.domAtPos(labelEnd(tiptap, "t1"));
      // PM selection만 의도적으로 다른 문단으로 stale하게 만든다.
      placeCaret(tiptap, contentTextStart(tiptap, "tail"));
      stubEndOfTextblock(tiptap, true);

      withNativeCaret(
        tiptap.view.dom as HTMLElement,
        () => {
          withoutScrollCrash(tiptap, () => {
            expect(dispatchKeydown(tiptap, key)).toBe(true);
          });
        },
        dom.node,
        dom.offset,
      );

      expectCaretAt(tiptap, contentTextStart(tiptap, "a1"));
    });

    it("역방향 stale(DOM 캐럿은 대상 밖, live selection은 라벨 끝)이면 소비하지 않는다", () => {
      const { tiptap } = fixture();
      const dom = tiptap.view.domAtPos(contentTextStart(tiptap, "tail"));
      placeCaretAtLabelEnd(tiptap, "t1");
      const labelSelection = tiptap.state.selection;
      stubEndOfTextblock(tiptap, true);
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      withNativeCaret(
        tiptap.view.dom as HTMLElement,
        () => {
          expect(dispatchKeydown(tiptap, key)).toBe(false);
        },
        dom.node,
        dom.offset,
      );

      expect(dispatch).not.toHaveBeenCalled();
      expect(tiptap.state.selection).toBe(labelSelection);
    });
  });

  it("ArrowRight는 라벨 중간이면(endOfTextblock이 true여도) 소비하지 않는다", () => {
    const { tiptap } = fixture();
    placeCaretAtLabelMiddle(tiptap, "t1");
    stubEndOfTextblock(tiptap, true);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(dispatchKeydown(tiptap, "ArrowRight")).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("ArrowRight는 라벨 논리 끝이어도 시각 오른쪽 끝이 아니면(RTL) 소비하지 않는다", () => {
    const { tiptap } = fixture();
    placeCaretAtLabelEnd(tiptap, "t1");
    // RTL로 끝나는 라벨의 Firefox 판정이다. "right"만 false다(Issue #268).
    // gapcursor도 같은 spy를 부른다.
    vi.spyOn(tiptap.view, "endOfTextblock").mockImplementation(
      (direction) => direction !== "right",
    );
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(dispatchKeydown(tiptap, "ArrowRight")).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("ArrowRight는 라벨 시작에서도 소비하지 않는다", () => {
    const { tiptap } = fixture();
    placeCaretAtLabelStart(tiptap, "t1");
    stubEndOfTextblock(tiptap, true);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(dispatchKeydown(tiptap, "ArrowRight")).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  // 라벨 끝 요구는 ArrowDown에서 뺐다. 마지막 줄 판정은 endOfTextblock이 맡는다(Issue #255).
  describe("ArrowDown 라벨 중간·시작", () => {
    const POSITIONS = [
      ["중간", placeCaretAtLabelMiddle],
      ["시작", placeCaretAtLabelStart],
    ] as const;

    describe.each(POSITIONS)("라벨 %s", (_position, place) => {
      it.each([
        ["divider", "t1", "a1"],
        ["미디어(atom)", "t6", "a6"],
        ["문단(텍스트블록)", "t2", "a2"],
      ])(
        "첫 숨은 자식이 %s이면 키를 소비하고 다음 보이는 블록 시작으로 간다",
        (_label, toggleId, nextId) => {
          const { tiptap } = fixture();
          place(tiptap, toggleId);
          const endOfTextblock = stubEndOfTextblock(tiptap, true);

          const consumed = dispatchKeydown(tiptap, "ArrowDown");

          expect(consumed).toBe(true);
          expect(
            endOfTextblock.mock.calls.map(([direction]) => direction),
          ).toContain("down");
          expectCaretAt(tiptap, contentTextStart(tiptap, nextId));
        },
      );

      it("다음 보이는 블록이 atom이면 그 atom의 NodeSelection이 된다", () => {
        const { tiptap } = fixture();
        place(tiptap, "t4");
        stubEndOfTextblock(tiptap, true);

        expect(dispatchKeydown(tiptap, "ArrowDown")).toBe(true);

        expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
        expectDividerNodeSelection(tiptap, "n4");
      });

      it("첫 숨은 자식이 텍스트블록이어도 다음 보이는 블록이 atom이면 그 NodeSelection이 된다", () => {
        const { tiptap } = fixture();
        place(tiptap, "t8");
        stubEndOfTextblock(tiptap, true);

        expect(dispatchKeydown(tiptap, "ArrowDown")).toBe(true);

        expectDividerNodeSelection(tiptap, "n8");
      });

      it.each([
        ["자식 없는 접힌 toggle", "t3"],
        ["접히지 않은 toggle", "u1"],
      ])("%s은 소비하지 않고 dispatch하지 않는다", (_label, toggleId) => {
        const { tiptap } = fixture();
        place(tiptap, toggleId);
        stubEndOfTextblock(tiptap, true);
        const before = tiptap.state.selection;
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        expect(dispatchKeydown(tiptap, "ArrowDown")).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
        expect(tiptap.state.selection).toBe(before);
      });

      it("endOfTextblock이 false면(여러 줄 라벨의 첫 줄) 소비하지 않고 dispatch하지 않는다", () => {
        const { tiptap } = fixture();
        place(tiptap, "t1");
        stubEndOfTextblock(tiptap, false);
        const before = tiptap.state.selection;
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        expect(dispatchKeydown(tiptap, "ArrowDown")).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
        expect(tiptap.state.selection).toBe(before);
      });

      it("endOfTextblock이 throw하면 소비하지 않는다", () => {
        const { tiptap } = fixture();
        place(tiptap, "t1");
        // gapcursor 쪽 호출은 state를 넘기지 않는다. state를 넘기는 호출만 throw시킨다.
        vi.spyOn(tiptap.view, "endOfTextblock").mockImplementation(
          (_direction, state) => {
            if (state !== undefined) throw new Error("레이아웃 없음");
            return false;
          },
        );
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        expect(dispatchKeydown(tiptap, "ArrowDown")).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
      });

      it("접힌 toggle이 부모 toggle의 마지막 자식이면 부모 뒤 첫 선택 가능 위치로 간다", () => {
        const { tiptap } = fixture();
        place(tiptap, "t7");
        stubEndOfTextblock(tiptap, true);

        expect(dispatchKeydown(tiptap, "ArrowDown")).toBe(true);

        expectCaretAt(tiptap, contentTextStart(tiptap, "a7"));
      });

      it("dispatch 1회로 selection만 바꾸고 숨은 자손에 들어가지 않는다", () => {
        const { tiptap } = fixture();
        place(tiptap, "t1");
        stubEndOfTextblock(tiptap, true);
        const docBefore = tiptap.state.doc;
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        expect(dispatchKeydown(tiptap, "ArrowDown")).toBe(true);

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(tiptap.state.doc).toBe(docBefore);
        const { selection } = tiptap.state;
        expect(isHidden(selection.$from)).toBe(false);
        expect(isHidden(selection.$to)).toBe(false);
      });

      it.each([
        ["문단", "t2"],
        ["divider", "t8"],
      ])(
        "첫 숨은 자식이 문단이고 뒤가 %s인 접힌 toggle도 dispatch 1회로 selection만 바꾸고 숨은 자손에 들어가지 않는다",
        (_label, toggleId) => {
          const { tiptap } = fixture();
          place(tiptap, toggleId);
          stubEndOfTextblock(tiptap, true);
          const docBefore = tiptap.state.doc;
          const dispatch = vi.spyOn(tiptap.view, "dispatch");

          expect(dispatchKeydown(tiptap, "ArrowDown")).toBe(true);

          expect(dispatch).toHaveBeenCalledTimes(1);
          expect(tiptap.state.doc).toBe(docBefore);
          const { selection } = tiptap.state;
          expect(isHidden(selection.$from)).toBe(false);
          expect(isHidden(selection.$to)).toBe(false);
        },
      );
    });

    it("일반 블록 중간은 소비하지 않는다", () => {
      const { tiptap } = fixture();
      placeCaret(tiptap, contentTextStart(tiptap, "a1") + 1);
      stubEndOfTextblock(tiptap, true);
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchKeydown(tiptap, "ArrowDown")).toBe(false);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("클릭 직후 stale selection이어도 DOM 기준 라벨 중간 캐럿으로 판정한다", () => {
      const { tiptap } = fixture();
      const dom = tiptap.view.domAtPos(labelMiddle(tiptap, "t1"));
      // PM selection만 의도적으로 다른 문단으로 stale하게 만든다.
      placeCaret(tiptap, contentTextStart(tiptap, "tail"));
      stubEndOfTextblock(tiptap, true);

      withNativeCaret(
        tiptap.view.dom as HTMLElement,
        () => {
          withoutScrollCrash(tiptap, () => {
            expect(dispatchKeydown(tiptap, "ArrowDown")).toBe(true);
          });
        },
        dom.node,
        dom.offset,
      );

      expectCaretAt(tiptap, contentTextStart(tiptap, "a1"));
    });
  });

  // 첫 숨은 자식이 표면 첫 위치는 숨은 셀 안 TextSelection이다(Issue #261).
  describe("첫 숨은 자식이 표", () => {
    it.each([
      ["끝", placeCaretAtLabelEnd],
      ["중간", placeCaretAtLabelMiddle],
    ])(
      "라벨 %s ArrowDown은 다음 보이는 divider의 NodeSelection으로 가고 dispatch 1회다",
      (_position, place) => {
        const { tiptap } = fixture();
        place(tiptap, "t9");
        stubEndOfTextblock(tiptap, true);
        const docBefore = tiptap.state.doc;
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        expect(dispatchKeydown(tiptap, "ArrowDown")).toBe(true);

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(tiptap.state.doc).toBe(docBefore);
        expectDividerNodeSelection(tiptap, "n9");
        expect(isHidden(tiptap.state.selection.$from)).toBe(false);
      },
    );
  });

  it("Shift+ArrowDown은 소비하지 않는다", () => {
    const { tiptap } = fixture();
    placeCaretAtLabelEnd(tiptap, "t1");
    stubEndOfTextblock(tiptap, true);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(dispatchKeydown(tiptap, "ArrowDown", true)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("Shift+ArrowRight는 소비하지 않는다", () => {
    const { tiptap } = fixture();
    placeCaretAtLabelEnd(tiptap, "t1");
    stubEndOfTextblock(tiptap, true);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(dispatchKeydown(tiptap, "ArrowRight", true)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("ArrowUp·ArrowLeft는 건드리지 않는다", () => {
    const { tiptap } = fixture();
    placeCaretAtLabelEnd(tiptap, "t1");
    stubEndOfTextblock(tiptap, true);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(dispatchKeydown(tiptap, "ArrowUp")).toBe(false);
    expect(dispatchKeydown(tiptap, "ArrowLeft")).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  // Firefox·WebKit은 RTL 라벨 끝 ArrowLeft를 forward로 처리해 숨은 첫 자식
  // NodeSelection을 만든다. jsdom은 레이아웃이 없어 PM의 RTL forward 판정을
  // 재현할 수 없다. 그 NodeSelection을 직접 dispatch한다(ADR-0007).
  describe("ArrowLeft 사후 교정(RTL, Issue #273)", () => {
    /**
     * blockId 라벨 뒤 첫 선택 가능 위치(숨은 첫 자식)의 NodeSelection을
     * dispatch한다. PM moveSelectionBlock이 만들 selection과 같다.
     */
    const dispatchHiddenNodeSelection = (
      tiptap: TiptapEditor,
      blockId: string,
    ): void => {
      const { doc } = tiptap.state;
      const $end = doc.resolve(labelEnd(tiptap, blockId));
      const selection = Selection.findFrom(doc.resolve($end.after()), 1);
      // 전제: 숨은 첫 자식 atom의 NodeSelection이다.
      expect(selection).toBeInstanceOf(NodeSelection);
      expect(isHidden((selection as NodeSelection).$from)).toBe(true);
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(selection as NodeSelection),
      );
    };

    it.each([
      ["첫 숨은 자식이 divider", "t1", "a1"],
      ["부모 toggle의 마지막 자식", "t7", "a7"],
    ])(
      "%s인 접힌 toggle 라벨 끝 keydown 뒤 숨은 NodeSelection은 다음 보이는 블록 시작으로 간다",
      (_label, toggleId, nextId) => {
        const { tiptap } = fixture();
        placeCaretAtLabelEnd(tiptap, toggleId);
        const docBefore = tiptap.state.doc;

        dispatchKeydown(tiptap, "ArrowLeft");
        dispatchHiddenNodeSelection(tiptap, toggleId);

        expectCaretAt(tiptap, contentTextStart(tiptap, nextId));
        expect(tiptap.state.doc).toBe(docBefore);
      },
    );

    it("다음 보이는 블록이 atom이면 그 atom의 NodeSelection이 된다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t4");

      dispatchKeydown(tiptap, "ArrowLeft");
      dispatchHiddenNodeSelection(tiptap, "t4");

      expectDividerNodeSelection(tiptap, "n4");
    });

    it("keydown 없이 숨은 NodeSelection이 오면 가드대로 라벨 끝으로 간다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t1");

      dispatchHiddenNodeSelection(tiptap, "t1");

      expectCaretAt(tiptap, labelEnd(tiptap, "t1"));
    });

    it("keydown 뒤 다른 transaction이 끼면 기록이 만료되어 라벨 끝으로 간다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t1");

      dispatchKeydown(tiptap, "ArrowLeft");
      // 무관한 selection 이동 뒤 같은 라벨 끝으로 돌아온다. state 객체가 바뀐다.
      placeCaret(tiptap, contentTextStart(tiptap, "tail"));
      placeCaretAtLabelEnd(tiptap, "t1");
      dispatchHiddenNodeSelection(tiptap, "t1");

      expectCaretAt(tiptap, labelEnd(tiptap, "t1"));
    });

    it("라벨 중간 keydown 뒤 숨은 NodeSelection은 가드대로 라벨 끝으로 간다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelMiddle(tiptap, "t1");

      dispatchKeydown(tiptap, "ArrowLeft");
      dispatchHiddenNodeSelection(tiptap, "t1");

      expectCaretAt(tiptap, labelEnd(tiptap, "t1"));
    });

    it("Shift+ArrowLeft keydown 뒤 숨은 NodeSelection은 가드대로 라벨 끝으로 간다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t1");

      dispatchKeydown(tiptap, "ArrowLeft", true);
      dispatchHiddenNodeSelection(tiptap, "t1");

      expectCaretAt(tiptap, labelEnd(tiptap, "t1"));
    });

    it("keydown 뒤 라벨 안 TextSelection은 교정하지 않는다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t1");
      const back = labelEnd(tiptap, "t1") - 1;

      dispatchKeydown(tiptap, "ArrowLeft");
      placeCaret(tiptap, back);

      expectCaretAt(tiptap, back);
    });

    it("라벨 끝 ArrowLeft keydown은 소비하지 않는다", () => {
      const { tiptap } = fixture();
      placeCaretAtLabelEnd(tiptap, "t1");

      expect(dispatchKeydown(tiptap, "ArrowLeft")).toBe(false);
    });

    // 빈 라벨은 논리 끝이자 시작이다. PM은 backward로 처리해 앞 접힌 toggle의
    // 숨은 마지막 atom을 고른다. 이 경로는 jsdom에서도 PM captureKeyDown이
    // 실제로 돈다(view.dom keydown).
    it("빈 라벨 ArrowLeft가 앞 접힌 toggle의 숨은 atom을 고르면 가드대로 앞 라벨 끝으로 간다", () => {
      const { tiptap } = mounted(
        documentOf(
          toggleBlock("ta", LABEL, {
            collapsed: true,
            children: [paragraphBlock("ca", "숨은 문단"), dividerBlock("da")],
          }),
          { id: "tb", type: "toggleListItem", content: [], collapsed: true },
          paragraphBlock("ab", "뒤"),
        ),
      );
      placeCaret(tiptap, contentTextStart(tiptap, "tb"));

      withoutScrollCrash(tiptap, () => {
        tiptap.view.dom.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowLeft",
            keyCode: 37,
            bubbles: true,
            cancelable: true,
          }),
        );
      });

      expectCaretAt(tiptap, labelEnd(tiptap, "ta"));
    });

    it("역방향 stale(DOM 캐럿은 대상 밖, live selection은 라벨 끝)이면 기록하지 않아 라벨 끝으로 간다", () => {
      const { tiptap } = fixture();
      const dom = tiptap.view.domAtPos(contentTextStart(tiptap, "tail"));
      placeCaretAtLabelEnd(tiptap, "t1");

      withNativeCaret(
        tiptap.view.dom as HTMLElement,
        () => {
          dispatchKeydown(tiptap, "ArrowLeft");
        },
        dom.node,
        dom.offset,
      );
      dispatchHiddenNodeSelection(tiptap, "t1");

      expectCaretAt(tiptap, labelEnd(tiptap, "t1"));
    });
  });
});
