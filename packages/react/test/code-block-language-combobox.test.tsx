// @vitest-environment jsdom

/**
 * CodeBlock language combobox의 표시, draft commit/cancel, ARIA 관계와
 * 블록 선택·초점·위치 변화 대응을 실제 EditorController 마운트로 검증한다.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SlashMenu } from "../src/index.js";
import {
  type MountBlockEditorOptions,
  type MountedBlockEditor,
  mountBlockEditor,
  placeCaret,
} from "./mount-editor.js";
import { fireSelectionChange, selectText } from "./selection-events.js";

afterEach(cleanup);

type CodeFixtureOptions = {
  blockId?: string;
  language?: string;
  withParagraph?: boolean;
  secondCodeLanguage?: string;
  onChange?: MountBlockEditorOptions["onChange"];
};

/** 실제 CodeBlock 저장 문서를 SlashMenu composite root와 함께 마운트한다. */
const mountCodeFixture = ({
  blockId = "code-1",
  language,
  withParagraph = false,
  secondCodeLanguage,
  onChange,
}: CodeFixtureOptions = {}): MountedBlockEditor => {
  const rendered = mountBlockEditor({
    initialBlocks: [
      {
        id: blockId,
        type: "codeBlock",
        ...(language === undefined ? {} : { language }),
        content: [{ text: "const value = 1" }],
      },
      ...(withParagraph
        ? [
            {
              id: "paragraph-1",
              type: "paragraph" as const,
              content: [{ text: "다음 문단" }],
            },
          ]
        : []),
      ...(secondCodeLanguage === undefined
        ? []
        : [
            {
              id: "code-2",
              type: "codeBlock" as const,
              language: secondCodeLanguage,
              content: [{ text: "body {}" }],
            },
          ]),
    ],
    children: <SlashMenu />,
    onChange,
  });
  rendered.editable.focus();
  const code = rendered.host.querySelector<HTMLElement>("code");
  if (code === null) throw new Error("CodeBlock DOM을 찾지 못했다");
  placeCaret(code);
  fireSelectionChange();
  return rendered;
};

/** 현재 language 입력을 accessible name으로 찾아 정확한 HTML 타입으로 좁힌다. */
const languageInput = (): HTMLInputElement =>
  screen.getByRole<HTMLInputElement>("combobox", { name: "Code language" });

/** 저장 문서의 첫 CodeBlock language를 타입 검사 뒤 반환한다. */
const storedLanguage = (rendered: MountedBlockEditor): string | undefined => {
  const block = rendered.editor.getDocument().blocks[0];
  if (block?.type !== "codeBlock") throw new Error("CodeBlock이 아니다");
  return block.language;
};

describe("CodeBlock 언어 combobox 표시와 선택", () => {
  it("활성 CodeBlock caret에서 미지정 언어를 text로 표시하되 문서를 바꾸지 않는다", () => {
    const onChange = vi.fn();
    const rendered = mountCodeFixture({ onChange });

    expect(languageInput().value).toBe("text");
    expect(rendered.editor.getDocument().revision).toBe(0);
    expect(storedLanguage(rendered)).toBeUndefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("unknown 현재 언어의 공백과 대소문자를 그대로 표시한다", () => {
    mountCodeFixture({ language: " My Lang " });

    expect(languageInput().value).toBe(" My Lang ");
  });

  it("CodeBlock 내부 range에서는 표시하고 일반 블록과 교차한 range에서는 숨긴다", () => {
    const rendered = mountCodeFixture({ withParagraph: true });
    const codeText = rendered.host.querySelector("code")?.firstChild;
    const paragraphText = rendered.host.querySelector("p")?.firstChild;
    if (codeText == null || paragraphText == null) {
      throw new Error("range fixture 텍스트를 찾지 못했다");
    }

    selectText(codeText, 0, 5);
    fireSelectionChange();
    expect(languageInput()).toBeTruthy();

    const range = document.createRange();
    range.setStart(codeText, 0);
    range.setEnd(paragraphText, 2);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireSelectionChange();
    fireSelectionChange();
    expect(
      screen.queryByRole("combobox", { name: "Code language" }),
    ).toBeNull();
  });

  it("일반 블록 caret에서는 표시하지 않는다", () => {
    const rendered = mountBlockEditor({ children: <SlashMenu /> });
    rendered.editable.focus();
    const paragraph = rendered.host.querySelector<HTMLElement>("p");
    if (paragraph === null) throw new Error("문단 DOM을 찾지 못했다");
    placeCaret(paragraph);
    fireSelectionChange();

    expect(
      screen.queryByRole("combobox", { name: "Code language" }),
    ).toBeNull();
  });

  it("따옴표와 백슬래시가 든 block id도 anchor로 찾아 위치를 계산한다", () => {
    mountCodeFixture({ blockId: 'a"b\\c' });

    const root = languageInput().closest<HTMLElement>(
      ".geul-code-block-language",
    );
    expect(root?.dataset.blockId).toBe('a"b\\c');
    expect(root?.style.left).toBe("8px");
    expect(root?.style.top).toBe("20px");
  });

  it("owner window scroll과 resize에서 활성 CodeBlock의 현재 rect로 anchor를 다시 계산한다", () => {
    const rendered = mountCodeFixture();
    const codeBlock = rendered.blocks[0];
    const root = languageInput().closest<HTMLElement>(
      ".geul-code-block-language",
    );
    if (codeBlock === undefined || root === null) {
      throw new Error("CodeBlock 또는 language overlay를 찾지 못했다");
    }
    let left = 40;
    let bottom = 80;
    codeBlock.getBoundingClientRect = () =>
      ({
        left,
        bottom,
        right: left + 120,
        top: bottom - 30,
        width: 120,
        height: 30,
        x: left,
        y: bottom - 30,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.scroll(window);
    expect(root.style.left).toBe("40px");
    expect(root.style.top).toBe("80px");

    left = 60;
    bottom = 100;
    fireEvent(window, new Event("resize"));
    expect(root.style.left).toBe("60px");
    expect(root.style.top).toBe("100px");
  });

  it("unmount에서 owner window scroll과 resize listener를 같은 callback으로 해제한다", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    mountCodeFixture();
    const scrollListeners = addEventListener.mock.calls.filter(
      ([type]) => type === "scroll",
    );
    const resizeListeners = addEventListener.mock.calls.filter(
      ([type]) => type === "resize",
    );

    expect(scrollListeners).toHaveLength(2);
    expect(resizeListeners).toHaveLength(2);
    cleanup();

    for (const listener of [...scrollListeners, ...resizeListeners]) {
      expect(removeEventListener).toHaveBeenCalledWith(...listener);
    }
  });
});

describe("CodeBlock 언어 combobox suggestion과 ARIA", () => {
  it("combobox와 listbox, 활성 option을 stable id로 연결한다", () => {
    mountCodeFixture();
    const input = languageInput();
    fireEvent.focus(input);

    const listbox = screen.getByRole("listbox", {
      name: "Code language suggestions",
    });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    const activeId = input.getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    expect(document.getElementById(activeId ?? "")?.getAttribute("role")).toBe(
      "option",
    );
  });

  it("12개 display name과 canonical·alias 텍스트를 모두 제공한다", () => {
    mountCodeFixture();
    const input = languageInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(12);
    expect(options.map((option) => option.textContent)).toEqual([
      "Plain Texttext, plain text, none",
      "JavaScriptjavascript, js",
      "TypeScripttypescript, ts",
      "HTMLhtml",
      "CSScss",
      "JSONjson",
      "Bashbash, sh, shell",
      "Pythonpython, py",
      "Javajava",
      "Kotlinkotlin",
      "SQLsql",
      "Markdownmarkdown, md",
    ]);
  });

  it("display name과 alias로 suggestion을 검색한다", () => {
    mountCodeFixture();
    const input = languageInput();

    fireEvent.change(input, { target: { value: "plain text" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toContain("Plain Text");

    fireEvent.change(input, { target: { value: "shell" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toContain("Bash");
  });
});

describe("CodeBlock 언어 draft와 commit", () => {
  it("change와 blur는 draft만 바꾸고 문서에는 commit하지 않는다", () => {
    const onChange = vi.fn();
    const rendered = mountCodeFixture({ language: "js", onChange });
    const input = languageInput();

    fireEvent.change(input, { target: { value: "typescript" } });
    fireEvent.blur(input);

    expect(input.value).toBe("typescript");
    expect(storedLanguage(rendered)).toBe("javascript");
    expect(rendered.editor.getDocument().revision).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ["", "text"],
    ["js", "javascript"],
    [" My Lang ", " My Lang "],
  ])("%s Enter commit 결과를 %s로 core에서 다시 읽는다", (draft, expected) => {
    const onChange = vi.fn();
    const rendered = mountCodeFixture({ language: "css", onChange });
    const input = languageInput();

    fireEvent.change(input, { target: { value: draft } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(storedLanguage(rendered)).toBe(expected);
    expect(rendered.editor.getDocument().revision).toBe(1);
    expect(onChange).toHaveBeenCalledOnce();
    expect(input.value).toBe(expected);
    expect(document.activeElement).toBe(rendered.editable);
    expect(rendered.editor.getSelectionBlockType()).toEqual({
      blockId: "code-1",
      blockType: { type: "codeBlock", language: expected },
    });
    expect(rendered.editor.commands.undo().ok).toBe(true);
    expect(storedLanguage(rendered)).toBe("css");
  });

  it("option click은 해당 canonical language를 commit하고 편집기로 초점을 복원한다", () => {
    const rendered = mountCodeFixture({ language: "text" });
    const input = languageInput();
    fireEvent.change(input, { target: { value: "shell" } });

    const bash = screen.getByRole("option", { name: /Bash/ });
    fireEvent.mouseDown(bash);
    fireEvent.click(bash);

    expect(storedLanguage(rendered)).toBe("bash");
    expect(document.activeElement).toBe(rendered.editable);
  });

  it.each([
    { language: "javascript", draft: "js", action: "Enter" },
    { language: "text", draft: "text", action: "option click" },
  ])(
    "같은 canonical 언어의 $action no-op도 overlay를 닫고 편집기로 초점을 복원한다",
    ({ language, draft, action }) => {
      const onChange = vi.fn();
      const rendered = mountCodeFixture({ language, onChange });
      const input = languageInput();
      input.focus();
      fireEvent.focus(input);
      expect(document.activeElement).toBe(input);

      if (action === "Enter") {
        fireEvent.change(input, { target: { value: draft } });
        fireEvent.keyDown(input, { key: "Enter" });
      } else {
        fireEvent.click(screen.getByRole("option", { name: /Plain Text/ }));
      }

      expect(input.value).toBe(language);
      expect(input.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(rendered.editable);
      expect(rendered.editor.getDocument().revision).toBe(0);
      expect(onChange).not.toHaveBeenCalled();
      expect(rendered.editor.commands.undo().ok).toBe(false);
    },
  );

  it("display label이 raw unknown draft면 option을 활성화하지 않고 exact 값을 commit한다", () => {
    const rendered = mountCodeFixture({ language: "text" });
    const input = languageInput();
    fireEvent.change(input, { target: { value: "JavaScript" } });

    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(storedLanguage(rendered)).toBe("JavaScript");
  });

  it("IME composition 중 Enter는 commit하거나 기본 동작을 막지 않는다", () => {
    const rendered = mountCodeFixture({ language: "text" });
    const input = languageInput();
    fireEvent.change(input, { target: { value: "python" } });
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });

    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(storedLanguage(rendered)).toBe("text");
    expect(input.value).toBe("python");
  });

  it.each(["bad\u0000lang", "\tjs\t"])(
    "core가 거절한 control character %j는 문서를 보존하고 draft를 유지한다",
    (draft) => {
      const rendered = mountCodeFixture({ language: "javascript" });
      const input = languageInput();
      input.focus();
      fireEvent.focus(input);
      expect(document.activeElement).toBe(input);
      fireEvent.change(input, { target: { value: draft } });

      fireEvent.keyDown(input, { key: "Enter" });

      expect(storedLanguage(rendered)).toBe("javascript");
      expect(input.value).toBe(draft);
      expect(input.getAttribute("aria-expanded")).toBe("true");
      expect(document.activeElement).toBe(input);
      expect(rendered.editor.getDocument().revision).toBe(0);
    },
  );
});

describe("CodeBlock 언어 draft 취소와 selection 동기화", () => {
  it("Escape는 draft를 취소하고 suggestion을 닫은 뒤 편집기로 초점을 복원한다", () => {
    const rendered = mountCodeFixture({ language: "javascript" });
    const input = languageInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "python" } });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(input.value).toBe("javascript");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(rendered.editable);
    expect(storedLanguage(rendered)).toBe("javascript");
  });

  it("바깥 pointerdown은 draft만 취소하고 대상의 자연 focus를 덮지 않는다", () => {
    const rendered = mountCodeFixture({ language: "javascript" });
    const input = languageInput();
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "python" } });

      fireEvent.pointerDown(outside);
      outside.focus();

      expect(input.value).toBe("javascript");
      expect(document.activeElement).toBe(outside);
      expect(storedLanguage(rendered)).toBe("javascript");
    } finally {
      outside.remove();
    }
  });

  it("같은 CodeBlock의 selectionchange는 편집 중 draft를 유지한다", () => {
    mountCodeFixture({ language: "javascript" });
    const input = languageInput();
    fireEvent.change(input, { target: { value: "python" } });

    fireSelectionChange();

    expect(input.value).toBe("python");
  });

  it("다른 블록으로 전환하면 draft를 버리고 combobox를 숨긴다", () => {
    const rendered = mountCodeFixture({
      language: "javascript",
      withParagraph: true,
    });
    const input = languageInput();
    fireEvent.change(input, { target: { value: "python" } });
    const paragraph = rendered.host.querySelector<HTMLElement>("p");
    if (paragraph === null) throw new Error("문단 DOM을 찾지 못했다");

    rendered.editable.focus();
    placeCaret(paragraph);
    fireSelectionChange();

    expect(
      screen.queryByRole("combobox", { name: "Code language" }),
    ).toBeNull();
    expect(storedLanguage(rendered)).toBe("javascript");
  });

  it("다른 CodeBlock으로 전환하면 해당 블록의 committed 값으로 draft를 reset한다", () => {
    const rendered = mountCodeFixture({
      language: "javascript",
      secondCodeLanguage: "css",
    });
    fireEvent.change(languageInput(), { target: { value: "python" } });
    const secondCode = rendered.host.querySelectorAll<HTMLElement>("code")[1];
    if (secondCode === undefined)
      throw new Error("두 번째 CodeBlock을 찾지 못했다");

    rendered.editable.focus();
    placeCaret(secondCode);
    fireSelectionChange();

    expect(languageInput().value).toBe("css");
    expect(
      languageInput().closest<HTMLElement>(".geul-code-block-language")?.dataset
        .blockId,
    ).toBe("code-2");
  });
});
