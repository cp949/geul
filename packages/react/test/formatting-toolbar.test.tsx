// @vitest-environment jsdom

/**
 * FormattingToolbar의 표시, mark 동작, block type 선택과 아이콘 격리 계약을 확인한다.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { BlockTypeDescriptor, EditorController } from "@cp949/geul-core";
import { LucideProvider } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, FormattingToolbar } from "../src/index.js";
import { expectIconOnlyButton } from "./expect-icon-button.js";
import { withProvider } from "./fake-editor-provider.js";
import { fakeController } from "./formatting-toolbar-test-support.js";
import { collapseSelection, selectText } from "./selection-events.js";

afterEach(cleanup);

describe("FormattingToolbar 서식 툴바", () => {
  it("텍스트 선택이 없으면 렌더링하지 않는다", () => {
    const controller = fakeController();
    render(withProvider(controller, <FormattingToolbar />));

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("텍스트를 선택하면 활성 mark 상태를 반영한 토글 버튼을 표시한다", () => {
    const controller = fakeController(vi.fn(() => ["bold"]));
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

    const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
    expect(toolbar).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Italic" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("토글 버튼을 클릭하면 대응하는 core 명령을 호출한다", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    fireEvent.click(screen.getByRole("button", { name: "Underline" }));

    expect(controller.commands.toggleBold).toHaveBeenCalledOnce();
    expect(controller.commands.toggleUnderline).toHaveBeenCalledOnce();
  });

  it("선택이 collapsed 상태가 되면 숨긴다", () => {
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
    expect(screen.queryByRole("toolbar")).not.toBeNull();

    collapseSelection();

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("현재 블록 종류를 반영한 블록 종류 select를 표시한다", () => {
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

    expect(
      (
        screen.getByRole("combobox", {
          name: "Block type",
        }) as HTMLSelectElement
      ).value,
    ).toBe("paragraph");
  });

  it("블록 종류 select에 제목 레벨을 표시한다", () => {
    const controller = fakeController(
      vi.fn(() => []),
      vi.fn(() => ({
        blockId: "block-1",
        blockType: { type: "heading", level: 2 },
      })),
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
      (
        screen.getByRole("combobox", {
          name: "Block type",
        }) as HTMLSelectElement
      ).value,
    ).toBe("heading-2");
  });

  // isToggleable(RD-004 DELTA-04)이 BlockTypeDescriptor.heading에 없으면
  // select가 isToggleable heading을 일반 heading-2로 오분류한다 — 이
  // 회귀를 고정한다.
  it("블록 종류 select에 isToggleable heading을 toggle-heading-N으로 표시한다", () => {
    const controller = fakeController(
      vi.fn(() => []),
      vi.fn(() => ({
        blockId: "block-1",
        blockType: { type: "heading", level: 2, isToggleable: true },
      })),
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
      (
        screen.getByRole("combobox", {
          name: "Block type",
        }) as HTMLSelectElement
      ).value,
    ).toBe("toggle-heading-2");
  });

  it.each([
    [
      "CodeBlock",
      { type: "codeBlock" },
      [
        "paragraph",
        "heading-1",
        "heading-2",
        "heading-3",
        "heading-4",
        "heading-5",
        "heading-6",
        "toggle-heading-1",
        "toggle-heading-2",
        "toggle-heading-3",
        "toggle-heading-4",
        "toggle-heading-5",
        "toggle-heading-6",
        "quote",
        "code",
      ],
    ],
    [
      "bulletListItem",
      { type: "bulletListItem" },
      [
        "paragraph",
        "heading-1",
        "heading-2",
        "heading-3",
        "heading-4",
        "heading-5",
        "heading-6",
        "toggle-heading-1",
        "toggle-heading-2",
        "toggle-heading-3",
        "toggle-heading-4",
        "toggle-heading-5",
        "toggle-heading-6",
        "quote",
        "bullet-list",
        "numbered-list",
        "check-list",
        "toggle-list",
      ],
    ],
    [
      "numberedListItem",
      { type: "numberedListItem" },
      [
        "paragraph",
        "heading-1",
        "heading-2",
        "heading-3",
        "heading-4",
        "heading-5",
        "heading-6",
        "toggle-heading-1",
        "toggle-heading-2",
        "toggle-heading-3",
        "toggle-heading-4",
        "toggle-heading-5",
        "toggle-heading-6",
        "quote",
        "bullet-list",
        "numbered-list",
        "check-list",
        "toggle-list",
      ],
    ],
    [
      "checkListItem",
      { type: "checkListItem" },
      [
        "paragraph",
        "heading-1",
        "heading-2",
        "heading-3",
        "heading-4",
        "heading-5",
        "heading-6",
        "toggle-heading-1",
        "toggle-heading-2",
        "toggle-heading-3",
        "toggle-heading-4",
        "toggle-heading-5",
        "toggle-heading-6",
        "quote",
        "bullet-list",
        "numbered-list",
        "check-list",
        "toggle-list",
      ],
    ],
    [
      "toggleListItem",
      { type: "toggleListItem" },
      [
        "paragraph",
        "heading-1",
        "heading-2",
        "heading-3",
        "heading-4",
        "heading-5",
        "heading-6",
        "toggle-heading-1",
        "toggle-heading-2",
        "toggle-heading-3",
        "toggle-heading-4",
        "toggle-heading-5",
        "toggle-heading-6",
        "quote",
        "bullet-list",
        "numbered-list",
        "check-list",
        "toggle-list",
      ],
    ],
    [
      "paragraph",
      { type: "paragraph" },
      [
        "paragraph",
        "heading-1",
        "heading-2",
        "heading-3",
        "heading-4",
        "heading-5",
        "heading-6",
        "toggle-heading-1",
        "toggle-heading-2",
        "toggle-heading-3",
        "toggle-heading-4",
        "toggle-heading-5",
        "toggle-heading-6",
        "quote",
        "code",
        "bullet-list",
        "numbered-list",
        "check-list",
        "toggle-list",
      ],
    ],
  ] as const)(
    "%s source의 option ID와 순서를 고정한다",
    (_title, blockType, expectedIds) => {
      const controller = fakeController(
        vi.fn(() => []),
        vi.fn(() => ({ blockId: "block-1", blockType })),
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
      const textNode = screen.getByRole("textbox", { name: "Editor" })
        .firstChild?.firstChild;
      if (!textNode) throw new Error("Text node was not rendered");
      selectText(textNode, 0, 8);

      const ids = Array.from(
        (
          screen.getByRole("combobox", {
            name: "Block type",
          }) as HTMLSelectElement
        ).options,
      ).map((option) => option.value);
      expect(ids).toEqual(expectedIds);
    },
  );

  it("명시 startNumber가 있는 numbered 목록도 numbered-list option을 선택한다", () => {
    const controller = fakeController(
      vi.fn(() => []),
      vi.fn(() => ({
        blockId: "block-1",
        blockType: { type: "numberedListItem", startNumber: 42 },
      })),
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
      (
        screen.getByRole("combobox", {
          name: "Block type",
        }) as HTMLSelectElement
      ).value,
    ).toBe("numbered-list");
  });

  it.each([
    [
      "paragraph",
      "bullet-list",
      { type: "paragraph" },
      { type: "bulletListItem" },
    ],
    [
      "paragraph",
      "numbered-list",
      { type: "paragraph" },
      { type: "numberedListItem" },
    ],
    [
      "bulletListItem",
      "paragraph",
      { type: "bulletListItem" },
      { type: "paragraph" },
    ],
    [
      "numberedListItem",
      "heading-1",
      { type: "numberedListItem" },
      { type: "heading", level: 1 },
    ],
    ["bulletListItem", "quote", { type: "bulletListItem" }, { type: "quote" }],
    [
      "paragraph",
      "toggle-list",
      { type: "paragraph" },
      { type: "toggleListItem" },
    ],
    [
      "toggleListItem",
      "paragraph",
      { type: "toggleListItem" },
      { type: "paragraph" },
    ],
    [
      "paragraph",
      "toggle-heading-1",
      { type: "paragraph" },
      { type: "heading", level: 1, isToggleable: true },
    ],
  ] as const)(
    "%s에서 %s로 변환할 때 내용을 보존한다",
    (_source, targetId, blockType, expectedType) => {
      const setBlockType = vi.fn((...args: [string, BlockTypeDescriptor]) => {
        void args;
        return { ok: true as const, value: undefined };
      });
      const controller = fakeController(
        vi.fn(() => []),
        vi.fn(() => ({ blockId: "block-1", blockType })),
        setBlockType,
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
      const textNode = screen.getByRole("textbox", { name: "Editor" })
        .firstChild?.firstChild;
      if (!textNode) throw new Error("Text node was not rendered");
      selectText(textNode, 0, 8);

      fireEvent.change(screen.getByRole("combobox", { name: "Block type" }), {
        target: { value: targetId },
      });

      expect(setBlockType).toHaveBeenCalledWith("block-1", expectedType);
      expect(setBlockType.mock.calls[0]).toHaveLength(2);
    },
  );

  it("목록 변환은 내용을 지우지 않고 변환 후 descriptor를 다시 읽는다", () => {
    let currentBlockType: BlockTypeDescriptor = { type: "paragraph" };
    const getSelectionBlockType = vi.fn(() => ({
      blockId: "block-1",
      blockType: currentBlockType,
    }));
    const setBlockType = vi.fn(
      (_blockId: string, blockType: BlockTypeDescriptor) => {
        currentBlockType = blockType;
        return { ok: true as const, value: undefined };
      },
    );
    const controller = fakeController(
      vi.fn(() => []),
      getSelectionBlockType,
      setBlockType,
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

    fireEvent.change(screen.getByRole("combobox", { name: "Block type" }), {
      target: { value: "bullet-list" },
    });

    expect(setBlockType).toHaveBeenCalledWith("block-1", {
      type: "bulletListItem",
    });
    expect(setBlockType.mock.calls[0]).toHaveLength(2);
    expect(
      (
        screen.getByRole("combobox", {
          name: "Block type",
        }) as HTMLSelectElement
      ).value,
    ).toBe("bullet-list");

    currentBlockType = { type: "paragraph" };
    act(() => document.dispatchEvent(new Event("selectionchange")));
    expect(
      (
        screen.getByRole("combobox", {
          name: "Block type",
        }) as HTMLSelectElement
      ).value,
    ).toBe("paragraph");
  });

  it("블록 종류 select를 바꾸면 setBlockType을 호출한다", () => {
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

    fireEvent.change(screen.getByRole("combobox", { name: "Block type" }), {
      target: { value: "heading-1" },
    });

    expect(controller.commands.setBlockType).toHaveBeenCalledWith("block-1", {
      type: "heading",
      level: 1,
    });
  });

  it("자기 에디터 바깥의 텍스트를 선택하면 계속 숨긴 상태를 유지한다", () => {
    const controller = fakeController();
    render(
      withProvider(
        controller,
        <>
          <p data-testid="outside">outside text</p>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByTestId("outside").firstChild;
    if (!textNode) throw new Error("Text node was not rendered");

    selectText(textNode, 0, 7);

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("각 토글 버튼에 16px aria-hidden 아이콘 svg와 동일 title을 렌더링한다", () => {
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

    const expectedButtons = [
      { label: "Bold", iconClass: "lucide-bold" },
      { label: "Italic", iconClass: "lucide-italic" },
      { label: "Underline", iconClass: "lucide-underline" },
      { label: "Strikethrough", iconClass: "lucide-strikethrough" },
      { label: "Inline code", iconClass: "lucide-code" },
      { label: "Text color", iconClass: "lucide-baseline" },
      { label: "Background color", iconClass: "lucide-paint-bucket" },
    ];
    for (const { label, iconClass } of expectedButtons) {
      expectIconOnlyButton(
        screen.getByRole("button", { name: label }),
        label,
        iconClass,
      );
    }
  });

  it("소비자 앱의 LucideProvider 설정이 geul 내부 아이콘에 전파되지 않는다", () => {
    const controller = fakeController();
    render(
      <LucideProvider
        absoluteStrokeWidth
        className="app-icon"
        color="#e00"
        size={32}
      >
        {withProvider(
          controller,
          <>
            <FormattingToolbar />
            <EditorContent />
          </>,
        )}
      </LucideProvider>,
    );
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (!textNode) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);

    const icon = screen
      .getByRole("button", { name: "Bold" })
      .querySelector("svg");
    if (!icon) throw new Error("Bold 버튼에 svg 아이콘이 없다");
    expect(icon.classList.contains("app-icon")).toBe(false);
    expect(icon.getAttribute("stroke")).toBe("currentColor");
    expect(icon.getAttribute("stroke-width")).toBe("2");
    expect(icon.getAttribute("width")).toBe("16");
    expect(icon.getAttribute("height")).toBe("16");
  });

  describe("portalTarget", () => {
    it("지정하면 그 요소 하위에 렌더한다", () => {
      const controller = fakeController(vi.fn(() => ["bold"]));
      const portalTarget = document.createElement("div");
      document.body.appendChild(portalTarget);
      render(
        withProvider(
          controller,
          <>
            <FormattingToolbar portalTarget={portalTarget} />
            <EditorContent />
          </>,
        ),
      );
      const textNode = screen.getByRole("textbox", { name: "Editor" })
        .firstChild?.firstChild;
      if (!textNode) throw new Error("Text node was not rendered");
      selectText(textNode, 0, 8);

      const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
      expect(portalTarget.contains(toolbar)).toBe(true);

      portalTarget.remove();
    });

    it("색상 팔레트도 같은 portalTarget 하위에 렌더한다", () => {
      const controller = fakeController(vi.fn(() => ["bold"]));
      const portalTarget = document.createElement("div");
      document.body.appendChild(portalTarget);
      render(
        withProvider(
          controller,
          <>
            <FormattingToolbar portalTarget={portalTarget} />
            <EditorContent />
          </>,
        ),
      );
      const textNode = screen.getByRole("textbox", { name: "Editor" })
        .firstChild?.firstChild;
      if (!textNode) throw new Error("Text node was not rendered");
      selectText(textNode, 0, 8);

      fireEvent.click(screen.getByRole("button", { name: "Text color" }));

      const colorMenu = screen.getByRole("menu", { name: "Text color" });
      expect(portalTarget.contains(colorMenu)).toBe(true);

      portalTarget.remove();
    });

    it("지정하지 않으면 기존 위치(부모 트리 내부)에 렌더한다", () => {
      const controller = fakeController(vi.fn(() => ["bold"]));
      const { container } = render(
        withProvider(
          controller,
          <>
            <FormattingToolbar />
            <EditorContent />
          </>,
        ),
      );
      const textNode = screen.getByRole("textbox", { name: "Editor" })
        .firstChild?.firstChild;
      if (!textNode) throw new Error("Text node was not rendered");
      selectText(textNode, 0, 8);

      const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
      expect(container.contains(toolbar)).toBe(true);
    });
  });

  describe("component override", () => {
    const CustomToolbar = ({ editor }: { editor: EditorController }) => (
      <button onClick={() => editor.commands.toggleBold()} type="button">
        Custom bold
      </button>
    );

    it("지정하면 소비자 컴포넌트가 렌더되고 editor를 받는다", () => {
      const controller = fakeController(vi.fn(() => ["bold"]));
      render(
        withProvider(
          controller,
          <>
            <FormattingToolbar component={CustomToolbar} />
            <EditorContent />
          </>,
        ),
      );
      const textNode = screen.getByRole("textbox", { name: "Editor" })
        .firstChild?.firstChild;
      if (!textNode) throw new Error("Text node was not rendered");
      selectText(textNode, 0, 8);

      const button = screen.getByRole("button", { name: "Custom bold" });
      fireEvent.click(button);

      expect(controller.commands.toggleBold).toHaveBeenCalledOnce();
      // 기본 내장 UI(마크 버튼·블록 타입 select·색상 트리거)는 통째
      // 교체되어 하나도 남지 않는다.
      expect(screen.queryByRole("button", { name: "Italic" })).toBeNull();
      expect(screen.queryByRole("combobox", { name: "Block type" })).toBeNull();
    });

    it("지정해도 표시 판정(선택 없으면 렌더 안 함)은 wrapper가 그대로 유지한다", () => {
      const controller = fakeController();
      render(
        withProvider(controller, <FormattingToolbar component={CustomToolbar} />),
      );

      expect(screen.queryByRole("toolbar")).toBeNull();
      expect(screen.queryByRole("button", { name: "Custom bold" })).toBeNull();
    });
  });
});
