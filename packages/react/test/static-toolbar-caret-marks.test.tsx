// @vitest-environment jsdom

/**
 * StaticToolbar가 접힌 캐럿 명령을 먼저 호출하고, 적용할 수 없을 때만 기존
 * 선택 영역 명령으로 넘어가는 배선을 확인한다(RD-002-DELTA-02, Issue #218).
 * fake로는 호출 순서와 폴백 조건을, 실제 편집기로는 키보드 클릭이 DOM
 * selection을 다시 쓰지 않는지 본다(Issue #222).
 * - DOM selection을 다시 쓰면 포커스가 버튼에서 편집기로 옮겨진다.
 * - 브라우저에서 포커스와 선택 범위가 유지되는지는
 *   e2e(showcase-static-toolbar-focus.spec.ts)가 소유한다.
 * - 브라우저에서 stored mark가 입력까지 살아남는지도 e2e가 소유한다.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaticToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { mountBlockEditor, placeCaret } from "./mount-editor.js";
import { fakeStaticToolbarController } from "./static-toolbar-test-support.js";

afterEach(cleanup);

const ok = () => ({ ok: true as const, value: undefined });

/** 캐럿 명령이 돌려줄 수 있는 거절 결과를 만든다. */
const rejected = (
  code: "COMMAND_NOT_APPLICABLE" | "CODE_BLOCK_MARK_NOT_ALLOWED",
) =>
  code === "COMMAND_NOT_APPLICABLE"
    ? { ok: false as const, error: { code, command: "caret" } }
    : { ok: false as const, error: { code } };

const MARK_BUTTONS = [
  ["Bold", "bold", "toggleBold"],
  ["Italic", "italic", "toggleItalic"],
  ["Underline", "underline", "toggleUnderline"],
  ["Strikethrough", "strike", "toggleStrike"],
  ["Inline code", "code", "toggleCode"],
] as const;

describe("StaticToolbar mark 버튼의 캐럿 명령 배선", () => {
  it.each(MARK_BUTTONS)(
    "%s 버튼은 캐럿 명령이 성공하면 기존 명령을 호출하지 않는다",
    (label, mark, legacy) => {
      const controller = fakeStaticToolbarController();
      controller.commands.toggleCaretMark.mockReturnValue(ok());
      render(withProvider(controller, <StaticToolbar />));

      fireEvent.click(screen.getByRole("button", { name: label }));

      expect(controller.commands.toggleCaretMark).toHaveBeenCalledWith(mark);
      expect(controller.commands[legacy]).not.toHaveBeenCalled();
    },
  );

  it.each(MARK_BUTTONS)(
    "%s 버튼은 캐럿 명령이 COMMAND_NOT_APPLICABLE이면 기존 명령으로 넘어간다",
    (label, mark, legacy) => {
      const controller = fakeStaticToolbarController();
      controller.commands.toggleCaretMark.mockReturnValue(
        rejected("COMMAND_NOT_APPLICABLE"),
      );
      render(withProvider(controller, <StaticToolbar />));

      fireEvent.click(screen.getByRole("button", { name: label }));

      expect(controller.commands.toggleCaretMark).toHaveBeenCalledWith(mark);
      expect(controller.commands[legacy]).toHaveBeenCalledOnce();
    },
  );

  it("캐럿 명령이 CODE_BLOCK_MARK_NOT_ALLOWED이면 기존 명령으로 넘어가지 않는다", () => {
    const controller = fakeStaticToolbarController();
    controller.commands.toggleCaretMark.mockReturnValue(
      rejected("CODE_BLOCK_MARK_NOT_ALLOWED"),
    );
    render(withProvider(controller, <StaticToolbar />));

    fireEvent.click(screen.getByRole("button", { name: "Bold" }));

    expect(controller.commands.toggleCaretMark).toHaveBeenCalledOnce();
    expect(controller.commands.toggleBold).not.toHaveBeenCalled();
  });

  it("aria-disabled 버튼은 캐럿 명령도 기존 명령도 호출하지 않는다", () => {
    const controller = fakeStaticToolbarController(
      undefined,
      vi.fn(() => ({ blockId: "block-1", blockType: { type: "codeBlock" } })),
    );
    render(withProvider(controller, <StaticToolbar />));

    fireEvent.click(screen.getByRole("button", { name: "Bold" }));

    expect(controller.commands.toggleCaretMark).not.toHaveBeenCalled();
    expect(controller.commands.toggleBold).not.toHaveBeenCalled();
  });
});

const COLOR_CASES = [
  ["글자색", "Text color", "toggleCaretTextColor", "toggleInlineTextColor"],
  [
    "배경색",
    "Background color",
    "toggleCaretBackgroundColor",
    "toggleInlineBackgroundColor",
  ],
] as const;

/** 색상 메뉴를 열고 첫 번째 스와치를 눌러 선택한 색 값을 돌려준다. */
const pickFirstSwatch = (triggerLabel: string) => {
  fireEvent.click(screen.getByRole("button", { name: triggerLabel }));
  const swatch = screen.getByRole("menu").querySelector("button");
  if (swatch === null) throw new Error("색상 스와치를 찾지 못했다");
  fireEvent.click(swatch);
};

describe.each(COLOR_CASES)(
  "StaticToolbar %s 스와치의 캐럿 명령 배선",
  (_name, trigger, caret, legacy) => {
    it("캐럿 명령이 성공하면 기존 명령을 호출하지 않는다", () => {
      const controller = fakeStaticToolbarController();
      controller.commands[caret].mockReturnValue(ok());
      render(withProvider(controller, <StaticToolbar />));

      pickFirstSwatch(trigger);

      expect(controller.commands[caret]).toHaveBeenCalledOnce();
      expect(controller.commands[legacy]).not.toHaveBeenCalled();
    });

    it("캐럿 명령이 COMMAND_NOT_APPLICABLE이면 같은 색으로 기존 명령을 호출한다", () => {
      const controller = fakeStaticToolbarController();
      render(withProvider(controller, <StaticToolbar />));

      pickFirstSwatch(trigger);

      const [color] = controller.commands[caret].mock.calls[0] ?? [];
      expect(typeof color).toBe("string");
      expect(controller.commands[legacy]).toHaveBeenCalledWith(color);
    });

    it("색 없음 스와치는 null로 캐럿 명령을 먼저 호출한다", () => {
      const controller = fakeStaticToolbarController();
      controller.commands[caret].mockReturnValue(ok());
      render(withProvider(controller, <StaticToolbar />));

      fireEvent.click(screen.getByRole("button", { name: trigger }));
      const none = screen.getByRole("menu").querySelectorAll("button");
      fireEvent.click(none[none.length - 1] as HTMLElement);

      expect(controller.commands[caret]).toHaveBeenCalledWith(null);
      expect(controller.commands[legacy]).not.toHaveBeenCalled();
    });

    it("캐럿 명령이 CODE_BLOCK_MARK_NOT_ALLOWED이면 기존 명령으로 넘어가지 않는다", () => {
      const controller = fakeStaticToolbarController();
      controller.commands[caret].mockReturnValue(
        rejected("CODE_BLOCK_MARK_NOT_ALLOWED"),
      );
      render(withProvider(controller, <StaticToolbar />));

      pickFirstSwatch(trigger);

      expect(controller.commands[caret]).toHaveBeenCalledOnce();
      expect(controller.commands[legacy]).not.toHaveBeenCalled();
    });
  },
);

describe("StaticToolbar 실제 편집기의 키보드 클릭", () => {
  it("키보드 클릭(detail 0)은 DOM selection을 다시 쓰지 않고 캐럿 명령을 호출한다", () => {
    const { editor, blocks } = mountBlockEditor({
      blockIds: ["block-1"],
      children: <StaticToolbar />,
    });
    const paragraph = blocks[0]?.querySelector("p") ?? blocks[0];
    if (paragraph === undefined) throw new Error("문단을 찾지 못했다");
    placeCaret(paragraph);
    // jsdom에서는 selection 이동만으로 통지가 오지 않는다. 캐럿 명령 하나로
    // 통지를 일으켜 툴바가 편집기 안의 Range를 관측하게 한다.
    act(() => {
      editor.commands.toggleCaretMark("italic");
    });

    const selection = document.getSelection();
    if (selection === null) throw new Error("DOM 선택을 얻지 못했다");
    const addRange = vi.spyOn(selection, "addRange");
    const removeAllRanges = vi.spyOn(selection, "removeAllRanges");
    const caret = vi.spyOn(editor.commands, "toggleCaretMark");
    try {
      fireEvent.click(screen.getByRole("button", { name: "Bold" }), {
        detail: 0,
      });

      expect(caret).toHaveBeenCalledWith("bold");
      expect(addRange).not.toHaveBeenCalled();
      expect(removeAllRanges).not.toHaveBeenCalled();
    } finally {
      // Selection 객체는 문서가 소유해 테스트 사이에 남는다(G-TST-003).
      addRange.mockRestore();
      removeAllRanges.mockRestore();
    }
  });
});
