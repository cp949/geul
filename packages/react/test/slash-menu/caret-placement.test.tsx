// @vitest-environment jsdom

/**
 * SlashMenu의 캐럿 배치를 검증한다(Issue #234 RD-004).
 * - 열릴 때와 scroll·resize 뒤에 캐럿 rect 하단·왼쪽 좌표를 따라간다.
 * - 캐럿이 편집기 밖이면 열린 첫 좌표는 96/48이고 이후에는 마지막 좌표를 유지한다.
 * - scroll·resize는 배치만 다시 읽는다. 열림 판정(`getCaretBlockContext`)은 다시 하지 않는다.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addBlockLabel,
  renderCaretBlocks,
  renderRealBlocks,
  typeIntoBlock,
} from "./slash-menu-test-support.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type CaretRect = { left: number; top: number; height: number };

/**
 * 캐럿 Range의 rect를 고정한다. 돌려준 객체를 바꾸면 다음 읽기부터 새 rect다.
 * jsdom은 Range 레이아웃이 없어 `mount-editor.tsx`가 전부 0으로 폴리필한다.
 */
const stubCaretRect = (initial: CaretRect): CaretRect => {
  const caret = { ...initial };
  vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        left: caret.left,
        top: caret.top,
        right: caret.left + 1,
        bottom: caret.top + caret.height,
        width: 1,
        height: caret.height,
        x: caret.left,
        y: caret.top,
        toJSON: () => ({}),
      }) as DOMRect,
  );
  return caret;
};

const readMenuPosition = () => {
  const menu = screen.getByRole("listbox", { name: "Slash menu" });
  return { left: menu.style.left, top: menu.style.top };
};

describe("SlashMenu 캐럿 배치(Issue #234 RD-004)", () => {
  it("열릴 때 캐럿 하단·왼쪽에 뜬다", () => {
    const caret = stubCaretRect({ left: 40, top: 100, height: 20 });
    const rendered = renderCaretBlocks();

    typeIntoBlock(rendered, 0, "/");

    expect(readMenuPosition()).toEqual({
      left: `${caret.left}px`,
      top: `${caret.top + caret.height}px`,
    });
  });

  it("window scroll 뒤에 캐럿을 다시 읽어 따라간다", () => {
    const caret = stubCaretRect({ left: 40, top: 100, height: 20 });
    const rendered = renderCaretBlocks();
    typeIntoBlock(rendered, 0, "/");

    caret.top = 60;
    fireEvent.scroll(window);

    expect(readMenuPosition()).toEqual({ left: "40px", top: "80px" });
  });

  it("안쪽 스크롤 컨테이너 scroll도 capture로 받아 따라간다", () => {
    const caret = stubCaretRect({ left: 40, top: 100, height: 20 });
    const rendered = renderCaretBlocks();
    typeIntoBlock(rendered, 0, "/");

    caret.top = 70;
    // scroll은 버블링하지 않는다. window capture 구독만 이 이벤트를 받는다.
    fireEvent.scroll(rendered.editable);

    expect(readMenuPosition()).toEqual({ left: "40px", top: "90px" });
  });

  it("resize 뒤에 캐럿을 다시 읽어 따라간다", () => {
    const caret = stubCaretRect({ left: 40, top: 100, height: 20 });
    const rendered = renderCaretBlocks();
    typeIntoBlock(rendered, 0, "/");

    caret.left = 90;
    fireEvent(window, new Event("resize"));

    expect(readMenuPosition()).toEqual({ left: "90px", top: "120px" });
  });

  it("scroll·resize는 열림 판정을 다시 하지 않는다", () => {
    stubCaretRect({ left: 40, top: 100, height: 20 });
    const rendered = renderCaretBlocks();
    typeIntoBlock(rendered, 0, "/");
    const context = vi.spyOn(rendered.editor, "getCaretBlockContext");

    fireEvent.scroll(window);
    fireEvent(window, new Event("resize"));

    expect(context).not.toHaveBeenCalled();
  });

  it("닫힌 채 scroll·resize가 와도 열림 판정을 하지 않는다", () => {
    const rendered = renderCaretBlocks();
    const context = vi.spyOn(rendered.editor, "getCaretBlockContext");

    fireEvent.scroll(window);
    fireEvent(window, new Event("resize"));

    expect(context).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("편집기 밖에 DOM 선택이 있으면 열린 첫 좌표는 96/48이다", () => {
    // 초점 없는 편집기: ProseMirror가 DOM 선택을 동기화하지 않아 캐럿 rect가 null이다.
    const rendered = renderRealBlocks();
    const [block] = rendered.blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");
    fireEvent.pointerMove(block);

    fireEvent.click(screen.getByRole("button", { name: addBlockLabel }));

    expect(readMenuPosition()).toEqual({ left: "96px", top: "48px" });
  });

  it("편집기 밖 선택에서 scroll해도 마지막 좌표를 유지한다", () => {
    const rendered = renderRealBlocks();
    const [block] = rendered.blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");
    fireEvent.pointerMove(block);
    fireEvent.click(screen.getByRole("button", { name: addBlockLabel }));

    fireEvent.scroll(window);

    expect(readMenuPosition()).toEqual({ left: "96px", top: "48px" });
  });
});
