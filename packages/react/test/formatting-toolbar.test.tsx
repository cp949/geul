// @vitest-environment jsdom

/**
 * FormattingToolbar 컴포넌트: 텍스트 선택에 따른 서식 툴바 노출과 mark 토글
 * 버튼 상태, 블록 종류 select 표시·변경, 에디터 바깥 선택 시 숨김 유지,
 * 아이콘·title 렌더링과 소비자 LucideProvider 설정 격리를 검증한다. 들여쓰기/
 * 내어쓰기 버튼의 명령 호출·게이트(blockSelection !== null) 재사용·실패
 * 무시(DELTA-05)도 이 파일이 검증한다.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { BlockTypeDescriptor } from "@cp949/geul-core";
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
  blockType: BlockTypeDescriptor;
} | null;

// indentBlock/outdentBlock의 Result 반환 타입을 성공/실패 양쪽 다 받도록
// 미리 넓혀 둔다 — 실패 케이스 테스트가 기본값과 다른 모양의 vi.fn을 넘겨도
// 대입 타입 에러(TS2322)가 나지 않는다.
type CommandResult =
  | { ok: true; value: undefined }
  | { ok: false; error: { code: string; command: string } };

type BlockNestingActionState = {
  canIndent: boolean;
  canOutdent: boolean;
};

/**
 * FormattingToolbar가 읽는 최소 controller 표면을 만든다.
 * 각 테스트는 query와 command override만 주입해 버튼 상태 변화를 격리한다.
 */
const fakeController = (
  getSelectionMarks = vi.fn(() => [] as string[]),
  getSelectionBlockType = vi.fn((): SelectionBlockType => ({
    blockId: "block-1",
    blockType: { type: "paragraph" },
  })),
  setBlockType = vi.fn((...args: [string, BlockTypeDescriptor]) => {
    void args;
    return { ok: true as const, value: undefined };
  }),
  indentBlock = vi.fn((): CommandResult => ({ ok: true, value: undefined })),
  outdentBlock = vi.fn((): CommandResult => ({ ok: true, value: undefined })),
  getBlockNestingActionState = vi.fn((): BlockNestingActionState => ({
    canIndent: true,
    canOutdent: true,
  })),
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
  getBlockNestingActionState,
  replaceDocument: vi.fn(),
  commands: {
    setText: vi.fn(),
    setBlockType,
    indentBlock,
    outdentBlock,
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
        "quote",
        "bullet-list",
        "numbered-list",
        "check-list",
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
        "quote",
        "bullet-list",
        "numbered-list",
        "check-list",
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
        "quote",
        "bullet-list",
        "numbered-list",
        "check-list",
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
        "quote",
        "code",
        "bullet-list",
        "numbered-list",
        "check-list",
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
