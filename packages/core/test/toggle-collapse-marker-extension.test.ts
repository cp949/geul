/**
 * 접힘 트라이앵글 마커(decoration widget, RD-004 DELTA-03)를 production
 * EditorController 경계에서 검증한다. marker DOM 렌더링·collapsed 상태
 * 반영, 클릭 → toggleHeadingCollapse/toggleListItemCollapse와 동일한 undo
 * 1회 복원, 우클릭·비대상 블록 무시, selection 불변, 형제·자식 무변경을
 * 다룬다. Slash 메뉴·Turn into는 이 DELTA의 범위 밖이다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  editorState,
  mounted,
  okResult,
  paragraphBlock,
  restored,
} from "./editor-controller-support.js";

/**
 * heading 리터럴을 만든다. isToggleable/collapsed는 지정할 때만 필드를
 * 채운다 — 부재가 곧 model 필드 부재와 대응하는 계약(RD-003)을 그대로
 * 반영한다. `toggle-collapse-commands.test.ts`와 같은 이유로 이 파일
 * 전용 리터럴 빌더로 둔다(2번째 사용처, G-TST-002 추출 임계값 아님).
 */
const headingBlock = (
  id: string,
  level: 1 | 2 | 3 | 4 | 5 | 6,
  text: string,
  options?: { isToggleable?: boolean; collapsed?: boolean; children?: Block[] },
): Block => ({
  id,
  type: "heading",
  level,
  content: text === "" ? [] : [{ text }],
  ...(options?.isToggleable === undefined
    ? {}
    : { isToggleable: options.isToggleable }),
  ...(options?.collapsed === undefined ? {} : { collapsed: options.collapsed }),
  ...(options?.children === undefined ? {} : { children: options.children }),
});

/** toggleListItem 리터럴을 만든다. collapsed 부재/명시를 headingBlock과 동일하게 구분한다. */
const toggleListItemBlock = (
  id: string,
  text: string,
  options?: { collapsed?: boolean; children?: Block[] },
): Block => ({
  id,
  type: "toggleListItem",
  content: text === "" ? [] : [{ text }],
  ...(options?.collapsed === undefined ? {} : { collapsed: options.collapsed }),
  ...(options?.children === undefined ? {} : { children: options.children }),
});

/** blockId의 접힘 트라이앵글 marker 위젯 DOM을 찾는다. */
const marker = (editable: HTMLElement, blockId: string): HTMLElement => {
  const found = editable.querySelector<HTMLElement>(
    `[data-be-block-id="${blockId}"] [data-be-toggle-marker]`,
  );
  if (found === null) throw new Error(`${blockId} marker 조회 실패`);
  return found;
};

/** marker에 좌클릭 mousedown을 실 디스패치한다. */
const clickMarker = (element: HTMLElement, button = 0): void => {
  element.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true, button }),
  );
};

describe("접힘 트라이앵글 마커(toggleCollapseMarker)", () => {
  it("isToggleable heading의 collapsed: false/true 각각 marker를 렌더링하고 data-be-collapsed·aria-expanded가 실제 값과 일치한다", () => {
    const { editable } = mounted(
      documentOf(
        headingBlock("expanded", 2, "펼침", { isToggleable: true }),
        headingBlock("collapsed", 2, "접힘", {
          isToggleable: true,
          collapsed: true,
        }),
      ),
    );

    const expandedMarker = marker(editable, "expanded");
    expect(expandedMarker.getAttribute("data-be-collapsed")).toBe("false");
    expect(expandedMarker.getAttribute("aria-expanded")).toBe("true");
    expect(expandedMarker.getAttribute("role")).toBe("button");

    const collapsedMarker = marker(editable, "collapsed");
    expect(collapsedMarker.getAttribute("data-be-collapsed")).toBe("true");
    expect(collapsedMarker.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggleListItem의 collapsed: false/true 각각 marker를 렌더링하고 data-be-collapsed·aria-expanded가 실제 값과 일치한다", () => {
    const { editable } = mounted(
      documentOf(
        toggleListItemBlock("expanded", "펼침"),
        toggleListItemBlock("collapsed", "접힘", { collapsed: true }),
      ),
    );

    const expandedMarker = marker(editable, "expanded");
    expect(expandedMarker.getAttribute("data-be-collapsed")).toBe("false");
    expect(expandedMarker.getAttribute("aria-expanded")).toBe("true");

    const collapsedMarker = marker(editable, "collapsed");
    expect(collapsedMarker.getAttribute("data-be-collapsed")).toBe("true");
    expect(collapsedMarker.getAttribute("aria-expanded")).toBe("false");
  });

  it("isToggleable이 없거나 false인 heading, toggleListItem이 아닌 블록에는 marker가 없다", () => {
    const { editable } = mounted(
      documentOf(
        headingBlock("plain", 2, "일반 제목"),
        headingBlock("off", 2, "해제", { isToggleable: false }),
        paragraphBlock("para", "본문"),
      ),
    );

    expect(
      editable.querySelector(
        `[data-be-block-id="plain"] [data-be-toggle-marker]`,
      ),
    ).toBeNull();
    expect(
      editable.querySelector(
        `[data-be-block-id="off"] [data-be-toggle-marker]`,
      ),
    ).toBeNull();
    expect(
      editable.querySelector(
        `[data-be-block-id="para"] [data-be-toggle-marker]`,
      ),
    ).toBeNull();
  });

  it("heading marker 클릭은 toggleHeadingCollapse와 동일하게 collapsed를 반전하고 undo 1회로 복원한다", () => {
    const { editor, editable, tiptap } = mounted(
      documentOf(
        headingBlock("h-1", 2, "제목", { isToggleable: true }),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    const before = editorState(editor, tiptap);

    clickMarker(marker(editable, "h-1"));

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        headingBlock("h-1", 2, "제목", { isToggleable: true, collapsed: true }),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("toggleListItem marker 클릭은 toggleListItemCollapse와 동일하게 collapsed를 반전하고 undo 1회로 복원한다", () => {
    const { editor, editable, tiptap } = mounted(
      documentOf(
        toggleListItemBlock("t-1", "본문"),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    const before = editorState(editor, tiptap);

    clickMarker(marker(editable, "t-1"));

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        toggleListItemBlock("t-1", "본문", { collapsed: true }),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("우클릭은 collapsed를 바꾸지 않는다", () => {
    const { editor, editable, tiptap } = mounted(
      documentOf(headingBlock("h-1", 2, "제목", { isToggleable: true })),
    );
    const before = editorState(editor, tiptap);

    clickMarker(marker(editable, "h-1"), 2);

    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("클릭 이전 selection이 다른 블록에 있었다면 클릭 뒤에도 그대로 유지된다", () => {
    const { editor, editable, tiptap } = mounted(
      documentOf(
        toggleListItemBlock("t-1", "본문"),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "tail"));
    const selectionBefore = tiptap.state.selection.toJSON();

    clickMarker(marker(editable, "t-1"));

    expect(editor.getDocument().blocks[0]).toEqual({
      id: "t-1",
      type: "toggleListItem",
      collapsed: true,
      content: [{ text: "본문" }],
    });
    expect(tiptap.state.selection.toJSON()).toEqual(selectionBefore);
  });

  it("형제·자식 중 클릭한 항목만 반전하고 나머지는 그대로 둔다", () => {
    const child = toggleListItemBlock("child-1", "자식");
    const source = toggleListItemBlock("t-1", "본문", { children: [child] });
    const sibling = headingBlock("h-1", 3, "형제", {
      isToggleable: true,
      collapsed: true,
    });
    const { editor, editable } = mounted(
      documentOf(source, sibling, paragraphBlock("tail", "꼬리")),
    );

    clickMarker(marker(editable, "h-1"));

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        toggleListItemBlock("t-1", "본문", { children: [child] }),
        headingBlock("h-1", 3, "형제", {
          isToggleable: true,
          collapsed: false,
        }),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });
  });
});
