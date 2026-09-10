// @vitest-environment jsdom

/**
 * CodeBlock 언어 트리거(버튼)·팝오버(검색+목록)의 표시, commit/cancel, ARIA
 * 관계와 블록 선택·초점·위치 변화 대응을 실제 EditorController 마운트로
 * 검증한다.
 *
 * RD-002(코드블록 언어 선택기 UX 개편, Issue #173)에서 입력형 콤보박스
 * (draft가 곧 표시값)를 button+popover로 바꿨다 — committed 값과 검색어를
 * 분리해 "committed 값이 검색어를 자기 자신으로 필터링해 다른 언어를
 * 고르려면 지워야 하는" 문제를 없앴다. 이전 "다음 블록 겹침 회피(뒤집기)"
 * 기능은 폐기했다 — 트리거는 코드블록 자신의 우상단에 작게 앵커링돼
 * 아래 블록을 덮지 않고, 팝오버는 열렸을 때만 잠깐 내용을 덮는 일반적인
 * 드롭다운 동작이라 별도 회피가 필요 없다(RD-002.md "결정").
 */

import { DEFAULT_DICTIONARY, type CodeBlock } from "@cp949/geul-core";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SlashMenu } from "../src/index.js";
import {
  type MountBlockEditorOptions,
  type MountedBlockEditor,
  mountBlockEditor,
  placeCaret,
  stubRect,
} from "./mount-editor.js";
import { fireSelectionChange, selectText } from "./selection-events.js";

afterEach(() => {
  cleanup();
  // 아래 flushDeferredUpdate가 켠 fake timer를 다음 테스트로 새지 않게
  // 매번 되돌린다 — 켜지 않은 테스트에서는 no-op이다.
  vi.useRealTimers();
});

/**
 * selectionchange/mouseup/keyup 재조회를 한 매크로태스크 미루는
 * deferredUpdateFromSelection(code-block-language-combobox.tsx, Issue #173
 * QA — ProseMirror 자신의 selectionchange 핸들러보다 이 컴포넌트의 리스너가
 * 먼저 등록돼 한 박자 밀린 selection을 읽던 문제의 수정)을 흘려보낸다.
 * 호출부가 미리 `vi.useFakeTimers()`를 켜 둬야 한다 — 그래야 지연 갱신이
 * 예약될 때부터 fake timer로 잡혀 여기서 동기로 확정할 수 있다.
 */
const flushDeferredUpdate = () => {
  act(() => {
    vi.runOnlyPendingTimers();
  });
};

type CodeFixtureOptions = {
  blockId?: string;
  language?: string;
  withParagraph?: boolean;
  secondCodeLanguage?: string;
  onChange?: MountBlockEditorOptions["onChange"];
  dictionary?: MountBlockEditorOptions["dictionary"];
  codeBlockLanguages?: MountBlockEditorOptions["codeBlockLanguages"];
};

/** 실제 CodeBlock 저장 문서를 SlashMenu composite root와 함께 마운트한다. */
const mountCodeFixture = ({
  blockId = "code-1",
  language,
  withParagraph = false,
  secondCodeLanguage,
  onChange,
  dictionary,
  codeBlockLanguages,
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
    ...(dictionary === undefined ? {} : { dictionary }),
    ...(codeBlockLanguages === undefined ? {} : { codeBlockLanguages }),
  });
  rendered.editable.focus();
  const code = rendered.host.querySelector<HTMLElement>("code");
  if (code === null) throw new Error("CodeBlock DOM을 찾지 못했다");
  placeCaret(code);
  fireSelectionChange();
  return rendered;
};

/** 언어 트리거 버튼을 accessible name으로 찾는다(기본 dictionary 이름). */
const languageButton = (name = "Code language"): HTMLButtonElement =>
  screen.getByRole<HTMLButtonElement>("button", { name });

const queryLanguageButton = (
  name = "Code language",
): HTMLButtonElement | null =>
  screen.queryByRole<HTMLButtonElement>("button", { name });

/** 팝오버 검색 input을 accessible name(=searchPlaceholder)으로 찾는다. */
const searchInput = (name = "Search for a language"): HTMLInputElement =>
  screen.getByRole<HTMLInputElement>("combobox", { name });

const querySearchInput = (
  name = "Search for a language",
): HTMLInputElement | null =>
  screen.queryByRole<HTMLInputElement>("combobox", { name });

/** 저장 문서의 첫 CodeBlock language를 타입 검사 뒤 반환한다. */
const storedLanguage = (rendered: MountedBlockEditor): string | undefined => {
  const block = rendered.editor.getDocument().blocks[0];
  if (block?.type !== "codeBlock") throw new Error("CodeBlock이 아니다");
  // "codeBlock"은 예약 리터럴이라 CustomBlock일 수 없다.
  return (block as CodeBlock).language;
};

describe("CodeBlock 언어 트리거 표시", () => {
  it("활성 CodeBlock caret에서 미지정 언어를 Plain Text로 표시하되 문서를 바꾸지 않는다", () => {
    const onChange = vi.fn();
    const rendered = mountCodeFixture({ onChange });

    expect(languageButton().textContent).toBe("Plain Text");
    expect(rendered.editor.getDocument().revision).toBe(0);
    expect(storedLanguage(rendered)).toBeUndefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("unknown 현재 언어의 공백과 대소문자를 그대로 표시한다", () => {
    mountCodeFixture({ language: " My Lang " });

    expect(languageButton().textContent).toBe(" My Lang ");
  });

  it("CodeBlock 내부 range에서는 표시하고 일반 블록과 교차한 range에서는 숨긴다", () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const rendered = mountCodeFixture({ withParagraph: true });
    const codeText = rendered.host.querySelector("code")?.firstChild;
    const paragraphText = rendered.host.querySelector("p")?.firstChild;
    if (codeText == null || paragraphText == null) {
      throw new Error("range fixture 텍스트를 찾지 못했다");
    }

    selectText(codeText, 0, 5);
    fireSelectionChange();
    flushDeferredUpdate();
    expect(languageButton()).toBeTruthy();

    const range = document.createRange();
    range.setStart(codeText, 0);
    range.setEnd(paragraphText, 2);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireSelectionChange();
    fireSelectionChange();
    flushDeferredUpdate();
    expect(queryLanguageButton()).toBeNull();
  });

  it("일반 블록 caret에서는 표시하지 않는다", () => {
    const rendered = mountBlockEditor({ children: <SlashMenu /> });
    rendered.editable.focus();
    const paragraph = rendered.host.querySelector<HTMLElement>("p");
    if (paragraph === null) throw new Error("문단 DOM을 찾지 못했다");
    placeCaret(paragraph);
    fireSelectionChange();

    expect(queryLanguageButton()).toBeNull();
  });

  it("따옴표와 백슬래시가 든 block id도 anchor로 찾아 코드블록 우상단에 위치를 계산한다", () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    mountCodeFixture({ blockId: 'a"b\\c' });
    flushDeferredUpdate();
    fireEvent.scroll(window);
    flushDeferredUpdate();

    const root = languageButton().closest<HTMLElement>(
      ".geul-code-block-language-trigger",
    );
    // 기본 레이아웃(left 0/top 0/width 600/height 20) → anchor = rect.right,
    // rect.top = (600, 0). 트리거 자신은 jsdom에서 0x0으로 측정돼(rect
    // 미스텁) topRight offset(dx=-width)도 0이라 anchor 그대로 clamp된다.
    // top=0은 뷰포트 여백(8px) 아래라 8로 끌어올려진다.
    expect(root?.dataset.blockId).toBe('a"b\\c');
    expect(root?.style.left).toBe("600px");
    expect(root?.style.top).toBe("8px");
  });

  it("owner window scroll과 resize에서 활성 CodeBlock의 현재 rect로 트리거 anchor를 다시 계산한다", () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const rendered = mountCodeFixture();
    flushDeferredUpdate();
    const codeBlock = rendered.blocks[0];
    const root = languageButton().closest<HTMLElement>(
      ".geul-code-block-language-trigger",
    );
    if (codeBlock === undefined || root === null) {
      throw new Error("CodeBlock 또는 language trigger를 찾지 못했다");
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
    flushDeferredUpdate();
    // anchor = rect.right(=160), rect.top(=50).
    expect(root.style.left).toBe("160px");
    expect(root.style.top).toBe("50px");

    left = 60;
    bottom = 100;
    fireEvent(window, new Event("resize"));
    flushDeferredUpdate();
    // anchor = rect.right(=180), rect.top(=70).
    expect(root.style.left).toBe("180px");
    expect(root.style.top).toBe("70px");
  });

  it("팝오버는 트리거 버튼 자신의 우하단을 anchor로 삼는다", () => {
    mountCodeFixture();
    const trigger = languageButton().closest<HTMLElement>(
      ".geul-code-block-language-trigger",
    );
    if (trigger === null) throw new Error("language trigger를 찾지 못했다");
    stubRect(trigger, { left: 500, top: 40, width: 100, height: 24 });

    fireEvent.click(languageButton());

    const popoverRoot = searchInput().closest<HTMLElement>(
      ".geul-code-block-language-popover",
    );
    // popover anchor = 트리거 rect.right(=600), rect.bottom(=64).
    expect(popoverRoot?.style.left).toBe("600px");
    expect(popoverRoot?.style.top).toBe("64px");
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

    // 이 fixture는 SlashMenu·BlockSideMenu 등 sibling overlay도 함께
    // mount한다. listener 개수는 sibling 구성에 결합하지 않고, 실제로
    // 등록된 owner window listener가 전부 같은 인자로 해제되는지만 본다.
    expect(scrollListeners.length).toBeGreaterThan(0);
    expect(resizeListeners.length).toBeGreaterThan(0);
    cleanup();

    for (const listener of [...scrollListeners, ...resizeListeners]) {
      expect(removeEventListener).toHaveBeenCalledWith(...listener);
    }
  });
});

describe("CodeBlock 언어 팝오버 suggestion과 ARIA", () => {
  it("트리거 클릭이 팝오버를 열고 검색 combobox·listbox를 stable id로 연결한다", () => {
    mountCodeFixture();
    fireEvent.click(languageButton());

    const input = searchInput();
    const listbox = screen.getByRole("listbox", {
      name: "Code language suggestions",
    });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    // 검색어가 비어 있어도 현재 committed 언어(기본 fixture는 "text")를
    // 기본 활성 항목으로 삼는다.
    const activeId = input.getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    const activeOption = document.getElementById(activeId ?? "");
    expect(activeOption?.getAttribute("role")).toBe("option");
    expect(activeOption?.textContent).toContain("Plain Text");
  });

  it("트리거를 다시 클릭하면 팝오버를 닫는다", () => {
    mountCodeFixture();
    fireEvent.click(languageButton());
    expect(querySearchInput()).not.toBeNull();

    fireEvent.click(languageButton());

    expect(querySearchInput()).toBeNull();
  });

  it("dictionary override 시 트리거 라벨·검색 placeholder·listbox aria-label·Plain Text가 바뀌고 검색은 고정 영어로 동작한다(EXT-009)", () => {
    mountCodeFixture({
      dictionary: {
        ...DEFAULT_DICTIONARY,
        codeLanguage: {
          label: "코드 언어",
          suggestionsAriaLabel: "코드 언어 제안",
          plainText: "일반 텍스트",
          searchPlaceholder: "언어를 검색하세요",
        },
      },
    });
    const trigger = languageButton("코드 언어");
    expect(trigger.textContent).toBe("일반 텍스트");
    fireEvent.click(trigger);

    const input = searchInput("언어를 검색하세요");
    expect(input.placeholder).toBe("언어를 검색하세요");
    expect(
      screen.getByRole("listbox", { name: "코드 언어 제안" }),
    ).not.toBeNull();

    fireEvent.change(input, { target: { value: "" } });
    // fixture가 language를 지정하지 않아 committed가 기본값 "text" —
    // Plain Text 행에 체크마크가 붙는다.
    expect(screen.getAllByRole("option")[0]?.textContent).toBe(
      "✓일반 텍스트text, plain text, none",
    );

    // 렌더 텍스트는 "일반 텍스트"로 바뀌었어도 검색은 여전히 고정 영어
    // "plain text"로 매칭해야 한다(blockType.*/slashMenu.*와 동일 결정).
    fireEvent.change(input, { target: { value: "plain text" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toBe(
      "✓일반 텍스트text, plain text, none",
    );
  });

  it("12개 옵션에 label·alias·현재 언어 체크마크를 모두 제공한다", () => {
    mountCodeFixture({ language: "javascript" });
    fireEvent.click(languageButton());

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(12);
    expect(options.map((option) => option.textContent)).toEqual([
      "Plain Texttext, plain text, none",
      "✓JavaScriptjavascript, js",
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

    const javascriptOption = screen.getByRole("option", { name: /JavaScript/ });
    expect(javascriptOption.getAttribute("aria-selected")).toBe("true");
    expect(within(javascriptOption).getByText("✓")).toBeTruthy();

    const cssOption = screen.getByRole("option", { name: /^CSS/ });
    expect(cssOption.getAttribute("aria-selected")).toBe("false");
  });

  it("display name과 alias로 suggestion을 검색한다", () => {
    mountCodeFixture();
    fireEvent.click(languageButton());
    const input = searchInput();

    fireEvent.change(input, { target: { value: "plain text" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toContain("Plain Text");

    fireEvent.change(input, { target: { value: "shell" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toContain("Bash");
  });
});

describe("CodeBlock 언어 검색과 commit", () => {
  it("검색어 변경과 blur는 트리거 라벨을 바꾸지 않고 문서에도 commit하지 않는다", () => {
    const onChange = vi.fn();
    const rendered = mountCodeFixture({ language: "js", onChange });
    fireEvent.click(languageButton());
    const input = searchInput();

    fireEvent.change(input, { target: { value: "typescript" } });
    fireEvent.blur(input);

    expect(languageButton().textContent).toBe("JavaScript");
    expect(storedLanguage(rendered)).toBe("javascript");
    expect(rendered.editor.getDocument().revision).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ["", "text", "Plain Text"],
    ["js", "javascript", "JavaScript"],
    [" My Lang ", " My Lang ", " My Lang "],
  ])(
    "%s Enter commit 결과를 %s로 core에서 다시 읽고 트리거에 %s로 표시한다",
    (draft, expected, expectedLabel) => {
      const onChange = vi.fn();
      const rendered = mountCodeFixture({ language: "css", onChange });
      fireEvent.click(languageButton());
      const input = searchInput();

      fireEvent.change(input, { target: { value: draft } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(storedLanguage(rendered)).toBe(expected);
      expect(rendered.editor.getDocument().revision).toBe(1);
      expect(onChange).toHaveBeenCalledOnce();
      expect(languageButton().textContent).toBe(expectedLabel);
      expect(querySearchInput()).toBeNull();
      expect(document.activeElement).toBe(rendered.editable);
      expect(rendered.editor.getSelectionBlockType()).toEqual({
        blockId: "code-1",
        blockType: { type: "codeBlock", language: expected },
      });
      expect(rendered.editor.commands.undo().ok).toBe(true);
      expect(storedLanguage(rendered)).toBe("css");
    },
  );

  it("option click은 해당 canonical language를 commit하고 편집기로 초점을 복원한다", () => {
    const rendered = mountCodeFixture({ language: "text" });
    fireEvent.click(languageButton());
    fireEvent.change(searchInput(), { target: { value: "shell" } });

    const bash = screen.getByRole("option", { name: /Bash/ });
    fireEvent.mouseDown(bash);
    fireEvent.click(bash);

    expect(storedLanguage(rendered)).toBe("bash");
    expect(document.activeElement).toBe(rendered.editable);
    expect(querySearchInput()).toBeNull();
  });

  it.each([
    { language: "javascript", draft: "js", action: "Enter" },
    { language: "text", draft: "text", action: "option click" },
  ])(
    "같은 canonical 언어의 $action no-op도 팝오버를 닫고 편집기로 초점을 복원한다",
    ({ language, draft, action }) => {
      const onChange = vi.fn();
      const rendered = mountCodeFixture({ language, onChange });
      fireEvent.click(languageButton());
      const input = searchInput();

      if (action === "Enter") {
        fireEvent.change(input, { target: { value: draft } });
        fireEvent.keyDown(input, { key: "Enter" });
      } else {
        fireEvent.click(screen.getByRole("option", { name: /Plain Text/ }));
      }

      expect(querySearchInput()).toBeNull();
      expect(document.activeElement).toBe(rendered.editable);
      expect(rendered.editor.getDocument().revision).toBe(0);
      expect(onChange).not.toHaveBeenCalled();
      expect(rendered.editor.commands.undo().ok).toBe(false);
    },
  );

  it("검색어가 raw unknown 값이면 option을 활성화하지 않고 exact 값을 commit한다", () => {
    const rendered = mountCodeFixture({ language: "text" });
    fireEvent.click(languageButton());
    const input = searchInput();
    fireEvent.change(input, { target: { value: "JavaScript" } });

    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(storedLanguage(rendered)).toBe("JavaScript");
  });

  it("IME composition 중 Enter는 commit하거나 기본 동작을 막지 않는다", () => {
    const rendered = mountCodeFixture({ language: "text" });
    fireEvent.click(languageButton());
    const input = searchInput();
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
    "core가 거절한 control character %j는 문서를 보존하고 팝오버를 열어둔다",
    (draft) => {
      const rendered = mountCodeFixture({ language: "javascript" });
      fireEvent.click(languageButton());
      const input = searchInput();
      fireEvent.change(input, { target: { value: draft } });

      fireEvent.keyDown(input, { key: "Enter" });

      expect(storedLanguage(rendered)).toBe("javascript");
      expect(input.value).toBe(draft);
      expect(input.getAttribute("aria-expanded")).toBe("true");
      expect(document.activeElement).toBe(input);
      expect(rendered.editor.getDocument().revision).toBe(0);
      expect(languageButton().textContent).toBe("JavaScript");
    },
  );
});

describe("CodeBlock 언어 팝오버 취소와 selection 동기화", () => {
  it("Escape는 팝오버를 닫고 검색을 버린 뒤 편집기로 초점을 복원한다", () => {
    const rendered = mountCodeFixture({ language: "javascript" });
    fireEvent.click(languageButton());
    fireEvent.change(searchInput(), { target: { value: "python" } });

    fireEvent.keyDown(searchInput(), { key: "Escape" });

    expect(querySearchInput()).toBeNull();
    expect(languageButton().textContent).toBe("JavaScript");
    expect(document.activeElement).toBe(rendered.editable);
    expect(storedLanguage(rendered)).toBe("javascript");
  });

  it("바깥 pointerdown은 팝오버만 닫고 대상의 자연 focus를 덮지 않는다", () => {
    const rendered = mountCodeFixture({ language: "javascript" });
    fireEvent.click(languageButton());
    fireEvent.change(searchInput(), { target: { value: "python" } });
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      fireEvent.pointerDown(outside);
      outside.focus();

      expect(querySearchInput()).toBeNull();
      expect(document.activeElement).toBe(outside);
      expect(storedLanguage(rendered)).toBe("javascript");
    } finally {
      outside.remove();
    }
  });

  it("같은 CodeBlock의 selectionchange는 팝오버를 연 채 검색어를 유지한다", () => {
    mountCodeFixture({ language: "javascript" });
    fireEvent.click(languageButton());
    fireEvent.change(searchInput(), { target: { value: "python" } });

    fireSelectionChange();

    expect(querySearchInput()).not.toBeNull();
    expect(searchInput().value).toBe("python");
  });

  it("다른 블록으로 전환하면 팝오버를 닫고 트리거도 숨긴다", () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const rendered = mountCodeFixture({
      language: "javascript",
      withParagraph: true,
    });
    fireEvent.click(languageButton());
    fireEvent.change(searchInput(), { target: { value: "python" } });
    const paragraph = rendered.host.querySelector<HTMLElement>("p");
    if (paragraph === null) throw new Error("문단 DOM을 찾지 못했다");

    rendered.editable.focus();
    placeCaret(paragraph);
    fireSelectionChange();
    flushDeferredUpdate();

    expect(queryLanguageButton()).toBeNull();
    expect(querySearchInput()).toBeNull();
    expect(storedLanguage(rendered)).toBe("javascript");
  });

  it("다른 CodeBlock으로 전환하면 팝오버를 닫고 그 블록의 committed 값을 트리거에 표시한다", () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const rendered = mountCodeFixture({
      language: "javascript",
      secondCodeLanguage: "css",
    });
    fireEvent.click(languageButton());
    fireEvent.change(searchInput(), { target: { value: "python" } });
    const secondCode = rendered.host.querySelectorAll<HTMLElement>("code")[1];
    if (secondCode === undefined)
      throw new Error("두 번째 CodeBlock을 찾지 못했다");

    rendered.editable.focus();
    placeCaret(secondCode);
    fireSelectionChange();
    flushDeferredUpdate();

    expect(languageButton().textContent).toBe("CSS");
    expect(
      languageButton().closest<HTMLElement>(".geul-code-block-language-trigger")
        ?.dataset.blockId,
    ).toBe("code-2");
    expect(querySearchInput()).toBeNull();
  });
});

// codeBlockLanguages 배선 계약(spec §6, RD-002-DELTA-02, Issue #162).
describe("CodeBlock 언어 팝오버 — codeBlockLanguages(BLK-017)", () => {
  it("지정하면 후보 목록이 완전 교체되고 option.id가 그대로 commit된다", () => {
    const rendered = mountCodeFixture({
      codeBlockLanguages: [
        { id: "rust", label: "Rust" },
        { id: "go", label: "Go", aliases: ["golang"] },
      ],
    });
    fireEvent.click(languageButton());

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Rustrust",
      "Gogo, golang",
    ]);

    fireEvent.click(screen.getByRole("option", { name: /Go/ }));
    expect(storedLanguage(rendered)).toBe("go");
  });

  it("미지정 시 기존 기본 12개가 그대로 유지된다(무회귀)", () => {
    mountCodeFixture();
    fireEvent.click(languageButton());

    expect(screen.getAllByRole("option")).toHaveLength(12);
  });

  it("codeBlockLanguages를 지정해도 목록에 없는 값 직접 입력은 그대로 commit된다(자유 입력 무회귀)", () => {
    const rendered = mountCodeFixture({
      codeBlockLanguages: [{ id: "rust", label: "Rust" }],
    });
    fireEvent.click(languageButton());
    const input = searchInput();
    fireEvent.change(input, { target: { value: "brainfuck" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(storedLanguage(rendered)).toBe("brainfuck");
    expect(languageButton().textContent).toBe("brainfuck");
  });
});
