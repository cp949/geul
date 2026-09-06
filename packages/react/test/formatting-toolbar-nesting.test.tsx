// @vitest-environment jsdom

/**
 * FormattingToolbar의 들여쓰기·내어쓰기 버튼 상태와 command 연결 계약을 확인한다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, FormattingToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import {
  fakeController,
  type BlockNestingActionState,
} from "./formatting-toolbar-test-support.js";
import { selectText } from "./selection-events.js";

afterEach(cleanup);

describe("들여쓰기/내어쓰기 버튼", () => {
  it("core query가 불가로 판정한 버튼만 disabled와 aria-disabled를 함께 표시한다", () => {
    const getBlockNestingActionState = vi.fn(() => ({
      canIndent: false,
      canOutdent: true,
    }));
    const controller = fakeController(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      getBlockNestingActionState,
    );
    render(
      withProvider(
        controller,
        <>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (!textNode) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);

    const indent = screen.getByRole("button", { name: "Indent" });
    const outdent = screen.getByRole("button", { name: "Outdent" });
    expect((indent as HTMLButtonElement).disabled).toBe(true);
    expect(indent.getAttribute("aria-disabled")).toBe("true");
    expect((outdent as HTMLButtonElement).disabled).toBe(false);
    expect(outdent.getAttribute("aria-disabled")).toBe("false");
    expect(getBlockNestingActionState).toHaveBeenCalledWith("block-1");
  });

  it("구조 변경 뒤 같은 블록의 action 상태를 다시 조회해 연속 클릭을 허용한다", () => {
    const getBlockNestingActionState = vi
      .fn<() => BlockNestingActionState>()
      .mockReturnValueOnce({ canIndent: true, canOutdent: false })
      .mockReturnValue({ canIndent: true, canOutdent: true });
    const controller = fakeController(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      getBlockNestingActionState,
    );
    render(
      withProvider(
        controller,
        <>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (!textNode) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);

    expect(
      (screen.getByRole("button", { name: "Outdent" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Indent" }));

    expect(getBlockNestingActionState).toHaveBeenCalledTimes(2);
    expect(
      (screen.getByRole("button", { name: "Outdent" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("텍스트가 선택된 상태(blockSelection !== null)에서 들여쓰기 버튼 클릭 시 editor.commands.indentBlock이 해당 blockId로 호출된다", () => {
    const controller = fakeController();
    render(
      withProvider(
        controller,
        <>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (!textNode) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);

    fireEvent.click(screen.getByRole("button", { name: "Indent" }));

    expect(controller.commands.indentBlock).toHaveBeenCalledWith("block-1");
  });

  it("내어쓰기 버튼도 같은 조건에서 outdentBlock을 호출한다", () => {
    const controller = fakeController();
    render(
      withProvider(
        controller,
        <>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (!textNode) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);

    fireEvent.click(screen.getByRole("button", { name: "Outdent" }));

    expect(controller.commands.outdentBlock).toHaveBeenCalledWith("block-1");
  });

  it("캐럿만 있고 텍스트가 선택되지 않은 상태(toolbarState === null)에서는 버튼이 렌더링되지 않는다", () => {
    const controller = fakeController();
    render(withProvider(controller, <FormattingToolbar />));

    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Indent" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Outdent" })).toBeNull();
  });

  it("표 셀 안(캐럿·선택 모두 셀 안)에서는 버튼이 렌더링되지 않는다", () => {
    // getSelectionBlockType이 null을 반환하는 상태는 표 셀 안에서 이미
    // 성립하는 기존 동작(updateFromSelection)이다 — 블록 타입 select가
    // 셀 안에서 자동 숨김되는 것과 같은 게이트를 이 버튼도 재사용한다.
    // 변이(게이트 제거)로 이 테스트가 실제로 실패하는지는 formatting-toolbar.tsx의
    // {toolbarState.blockSelection !== null && (...)} 조건을 지우고
    // 확인했다(RED 재현, 이후 원상복구).
    const controller = fakeController(
      vi.fn(() => []),
      vi.fn(() => null),
    );
    render(
      withProvider(
        controller,
        <>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (!textNode) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);

    // 툴바 자체(mark 버튼)는 blockSelection과 무관하게 계속 뜬다 — 숨는
    // 것은 들여쓰기/내어쓰기 버튼뿐이다.
    expect(screen.getByRole("toolbar", { name: "Formatting" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Indent" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Outdent" })).toBeNull();
  });

  it("버튼 클릭이 Result의 실패(COMMAND_NOT_APPLICABLE 등)를 예외로 던지지 않는다", () => {
    const getBlockNestingActionState = vi
      .fn<() => BlockNestingActionState>()
      .mockReturnValueOnce({ canIndent: true, canOutdent: true })
      .mockReturnValue({ canIndent: false, canOutdent: true });
    const controller = fakeController(
      undefined,
      undefined,
      undefined,
      vi.fn(() => ({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "indentBlock" },
      })),
      vi.fn(() => ({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "outdentBlock" },
      })),
      getBlockNestingActionState,
    );
    render(
      withProvider(
        controller,
        <>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (!textNode) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);

    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: "Indent" }));
      fireEvent.click(screen.getByRole("button", { name: "Outdent" }));
    }).not.toThrow();
    expect(getBlockNestingActionState).toHaveBeenCalledTimes(3);
    expect(
      (screen.getByRole("button", { name: "Indent" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
