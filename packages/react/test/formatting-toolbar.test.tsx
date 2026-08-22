// @vitest-environment jsdom

/**
 * FormattingToolbar 컴포넌트: 텍스트 선택에 따른 서식 툴바 노출과 mark 토글
 * 버튼 상태, 블록 종류 select 표시·변경, 에디터 바깥 선택 시 숨김 유지,
 * 아이콘·title 렌더링과 소비자 LucideProvider 설정 격리를 검증한다.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LucideProvider } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, FormattingToolbar } from "../src/index.js";
import { expectIconOnlyButton } from "./expect-icon-button.js";
import { withProvider } from "./fake-editor-provider.js";
import { collapseSelection, selectText } from "./selection-events.js";

// @testing-library/react는 전역 afterEach나 teardown이 함수일 때만 자동
// cleanup을 등록한다(dist/index.js의 typeof afterEach === "function" 분기와
// 그 else의 teardown fallback). vitest는 globals: true일 때만 그 전역을
// 노출하는데 저장소 루트 vitest.config.ts에는 globals도 setupFiles도 없어 자동
// cleanup이 없다(실측: 이 설정에서 둘 다 undefined). 각 it 말미의 unmount로는
// assertion이 먼저 던질 때 DOM이 남아 다음 테스트의 getByRole(...)가
// "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
afterEach(cleanup);

type SelectionBlockType = {
  blockId: string;
  blockType: { type: "paragraph" } | { type: "heading"; level: 1 | 2 | 3 };
} | null;

const fakeController = (
  getSelectionMarks = vi.fn(() => [] as string[]),
  getSelectionBlockType = vi.fn(
    (): SelectionBlockType => ({
      blockId: "block-1",
      blockType: { type: "paragraph" },
    }),
  ),
  setBlockType = vi.fn(() => ({ ok: true, value: undefined })),
) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    // 실제 브라우저와 달리 jsdom은 contentEditable IDL 프로퍼티를
    // contenteditable 속성으로 반영하지 않는다. formatting-toolbar.tsx에는
    // 이 속성을 읽는 초점 복구 경로가 없지만, 실제 브라우저 DOM 동작과 fake를
    // 맞추기 위해 속성을 직접 세운다.
    editable.setAttribute("contenteditable", "true");
    editable.textContent = "editor text";
    element.append(editable);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMarks,
  getSelectionBlockType,
  replaceDocument: vi.fn(),
  commands: {
    setText: vi.fn(),
    setBlockType,
    toggleBold: vi.fn(() => ({ ok: true, value: undefined })),
    toggleItalic: vi.fn(() => ({ ok: true, value: undefined })),
    toggleUnderline: vi.fn(() => ({ ok: true, value: undefined })),
    toggleStrike: vi.fn(() => ({ ok: true, value: undefined })),
    toggleCode: vi.fn(() => ({ ok: true, value: undefined })),
    undo: vi.fn(),
    redo: vi.fn(),
  },
});

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
});
