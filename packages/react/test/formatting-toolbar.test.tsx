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
import {
  DEFAULT_DICTIONARY,
  type BlockTypeDescriptor,
  type EditorController,
} from "@cp949/geul-core";
import { LucideProvider } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, FormattingToolbar } from "../src/index.js";
import { expectIconOnlyButton } from "./expect-icon-button.js";
import { withProvider } from "./fake-editor-provider.js";
import { fakeController } from "./formatting-toolbar-test-support.js";
import { queryMountedEditable } from "./query-mounted-editable.js";
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

  it("미디어 블록을 선택하면 렌더링하지 않는다", () => {
    // 미디어 노드(NodeSelection) 선택도 DOM selection을 non-collapsed
    // Range로 만든다 — Range 자체로는 텍스트 선택과 구별할 수 없으므로
    // getSelectionMediaBlock()의 반환값으로 구별한다(formatting-toolbar.tsx
    // 가드). Bold 등 mark·색상은 텍스트 없는 미디어 노드엔 적용 불가하고
    // MediaToolbar가 전담한다(스크린샷 QA).
    const controller = fakeController();
    controller.getSelectionMediaBlock.mockReturnValue({
      blockId: "media-1",
      kind: "image",
      url: "https://example.com/a.png",
      name: null,
      caption: null,
      showPreview: true,
      textAlignment: null,
    });
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

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("표에서 여러 셀을 선택(CellSelection)하면 렌더링하지 않는다", () => {
    // 표 드래그 다중 셀 선택도 DOM selection이 그 범위를 덮는 non-collapsed
    // Range가 돼 위 미디어 가드와 같은 구멍이 있었다 —
    // table-selection-toolbar.tsx가 이미 같은 선택에 서식 컨트롤을 띄우므로
    // 여기서 또 뜨면 두 툴바가 겹친다(isCellRangeSelected() 가드).
    const controller = fakeController();
    controller.isCellRangeSelected.mockReturnValue(true);
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

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("Escape로 닫고 편집기로 초점을 되돌린다(G-UI-001, QA-002/QA-015)", () => {
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
    const host = screen.getByRole("textbox", { name: "Editor" });
    const contentEditable = host.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    );
    if (contentEditable === null)
      throw new Error("Content editable was not rendered");
    const textNode = host.firstChild?.firstChild;
    if (!textNode) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);
    expect(screen.queryByRole("toolbar")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("toolbar")).toBeNull();
    // 바깥 클릭과 달리 Escape는 돌아갈 클릭 대상이 없어 초점을 편집기로
    // 되돌린다(G-UI-001, table-handle-menu.test.tsx와 같은 계약).
    expect(document.activeElement).toBe(contentEditable);
  });

  it("Escape로 닫은 뒤 같은 selection이 재관측돼도 다시 열리지 않는다(G-UI-001)", () => {
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
    const editableHost = screen.getByRole("textbox", { name: "Editor" });
    const textNode = editableHost.firstChild?.firstChild;
    if (!textNode) throw new Error("Text node was not rendered");
    // jsdom(27.0.1)은 focus()로 activeElement가 바뀌는 contenteditable에
    // 기존 non-collapsed Selection이 있어도 그 selection을 (element, 0)
    // collapsed로 되돌린다(link-toolbar.tsx 테스트에서 실측 확인 — 실제
    // Chromium은 그러지 않는다). 스텁하지 않으면 closeToolbar의
    // focusEditor() 호출이 selection을 collapse시켜, scroll 재관측이 이미
    // "selection.isCollapsed" 게이트만으로 닫혀 dismissSuppression 자체는
    // 한 번도 검증되지 않는 vacuous pass가 된다.
    const contentEditable = queryMountedEditable(editableHost);
    const focusSpy = vi
      .spyOn(contentEditable, "focus")
      .mockImplementation(() => {});
    selectText(textNode, 0, 8);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("toolbar")).toBeNull();

    // scroll/keyup 등은 selection이 그대로여도 updateFromSelection을 다시
    // 부른다 — 같은 Range 재관측만으로 되살아나면 Escape가 무의미해진다.
    fireEvent.scroll(document);

    expect(screen.queryByRole("toolbar")).toBeNull();
    focusSpy.mockRestore();
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

  // 실브라우저(Chromium) 실측: 네이티브 <select>는 mousedown의 기본 동작이
  // 곧 드롭다운을 여는 것이라, IconButton이 초점 도난 방지에 쓰는
  // onMouseDown={preventDefault} 패턴을 그대로 복제하면 드롭다운 자체가
  // 안 열려 "클릭해도 옵션이 선택되지 않는다"가 된다(QA-087). preventDefault
  // 호출 여부는 dispatchEvent의 반환값(취소되면 false)으로 직접 확인한다.
  it("블록 종류 select에 mousedown해도 기본 동작(드롭다운 열기)을 막지 않는다(QA-087)", () => {
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

    const notPrevented = fireEvent.mouseDown(
      screen.getByRole("combobox", { name: "Block type" }),
    );

    expect(notPrevented).toBe(true);
  });

  // select에 실제로 초점이 옮겨가도 편집기의 window.getSelection()은
  // collapse되지 않는다(Chromium 실측) — 즉 select가 초점을 가져가는 동안
  // 텍스트 선택이 풀려 툴바가 통째로 사라지는 경로는 애초에 없다. 그래서
  // 위 mousedown 테스트 하나로 QA-087의 근본 원인(드롭다운이 안 열림)을
  // 충분히 고정한다 — "초점 도난 방지" 가드는 지킬 불변식이 없어 추가하지
  // 않는다.

  it("dictionary override 시 블록 종류 select의 표시 텍스트가 바뀐다(EXT-009)", () => {
    const controller = fakeController();
    controller.getDictionary = vi.fn(() => ({
      ...DEFAULT_DICTIONARY,
      blockType: {
        ...DEFAULT_DICTIONARY.blockType,
        paragraph: { label: "본문", description: "일반 문단" },
      },
    }));
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

    const select = screen.getByRole("combobox", {
      name: "Block type",
    }) as HTMLSelectElement;
    expect(select.value).toBe("paragraph");
    expect(select.options[select.selectedIndex]?.textContent).toBe("본문");
  });

  it("dictionary override 시 컨테이너 aria-label(Formatting)이 바뀐다(EXT-009)", () => {
    const controller = fakeController();
    controller.getDictionary = vi.fn(() => ({
      ...DEFAULT_DICTIONARY,
      toolbar: {
        ...DEFAULT_DICTIONARY.toolbar,
        formatting: { ariaLabel: "서식 툴바" },
      },
    }));
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

    expect(screen.getByRole("toolbar", { name: "서식 툴바" })).not.toBeNull();
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
        withProvider(
          controller,
          <FormattingToolbar component={CustomToolbar} />,
        ),
      );

      expect(screen.queryByRole("toolbar")).toBeNull();
      expect(screen.queryByRole("button", { name: "Custom bold" })).toBeNull();
    });
  });
});
