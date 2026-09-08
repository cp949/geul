// @vitest-environment jsdom

/**
 * LinkToolbar 컴포넌트: 텍스트 선택에 따른 링크 추가/편집/제거 컨트롤 노출,
 * 허용되지 않는 링크 URL의 거부 메시지, selectionchange에 따른 표시·숨김 전환,
 * URL 입력에서 Escape 시 닫힘과 편집기로의 초점 복구를 검증한다.
 */

import {
  DEFAULT_DICTIONARY,
  type Dictionary,
  type EditorController,
} from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EditorContent,
  LinkToolbar,
  type LinkToolbarProps,
} from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { queryMountedEditable } from "./query-mounted-editable.js";
import { collapseSelection, selectText } from "./selection-events.js";

// @testing-library/react는 전역 afterEach나 teardown이 함수일 때만 자동
// cleanup을 등록한다(dist/index.js의 typeof afterEach === "function" 분기와
// 그 else의 teardown fallback). vitest는 globals: true일 때만 그 전역을
// 노출하는데 저장소 루트 vitest.config.ts에는 globals도 setupFiles도 없어 자동
// cleanup이 없다(실측: 이 설정에서 둘 다 undefined). 각 it 말미의 unmount로는
// assertion이 먼저 던질 때 DOM이 남아 다음 테스트의 getByRole(...)가
// "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
afterEach(cleanup);

type FakeControllerOptions = {
  getSelectionLink?: () => { href: string } | null;
  setLink?: (href: string) => { ok: boolean; error?: { code: string } };
  dictionary?: Dictionary;
};

const fakeController = ({
  getSelectionLink = () => null,
  setLink = () => ({ ok: true }),
  dictionary,
}: FakeControllerOptions = {}) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    // 실제 브라우저와 달리 jsdom은 contentEditable IDL 프로퍼티를
    // contenteditable 속성으로 반영하지 않는다. link-toolbar.tsx:145의
    // closeAndRestoreFocus는 '[contenteditable="true"]'로 대상을 찾으므로,
    // 속성을 직접 세우지 않으면 초점 복구가 단위 테스트에서 조용히 no-op가 된다.
    editable.setAttribute("contenteditable", "true");
    editable.textContent = "editor text";
    element.append(editable);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMarks: vi.fn(() => [] as string[]),
  getSelectionLink: vi.fn(getSelectionLink),
  getDictionary: vi.fn(() => dictionary ?? DEFAULT_DICTIONARY),
  replaceDocument: vi.fn(),
  commands: {
    setText: vi.fn(),
    toggleBold: vi.fn(() => ({ ok: true, value: undefined })),
    toggleItalic: vi.fn(() => ({ ok: true, value: undefined })),
    toggleUnderline: vi.fn(() => ({ ok: true, value: undefined })),
    toggleStrike: vi.fn(() => ({ ok: true, value: undefined })),
    toggleCode: vi.fn(() => ({ ok: true, value: undefined })),
    setLink: vi.fn(setLink),
    unsetLink: vi.fn(() => ({ ok: true, value: undefined })),
    undo: vi.fn(),
    redo: vi.fn(),
  },
});

const renderWithSelectedText = (
  controller: ReturnType<typeof fakeController>,
  props: LinkToolbarProps = {},
) => {
  render(
    withProvider(
      controller,
      <>
        <LinkToolbar {...props} />
        <EditorContent />
      </>,
    ),
  );
  const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
    ?.firstChild;
  if (textNode === null || textNode === undefined) {
    throw new Error("Text node was not rendered");
  }
  selectText(textNode, 0, 8);
};

/**
 * 초점 복구 단언 대상을 얻는다. `role="textbox"` host 자체가 아니라 그 안의
 * 편집 가능 영역을 돌려준다 — LinkToolbar의 초점 복구는
 * `'[contenteditable="true"]'`로 찾은 자식에 `focus()`를 거는데, host는 이
 * 셀렉터에 매치되지 않는다(G-TST-001). 그래서 초점 단언은 host가 아니라 이
 * 헬퍼가 돌려주는 편집 영역을 대상으로 해야 공허해지지 않는다.
 */
const getEditable = () => {
  const host = screen.getByRole("textbox", { name: "Editor" });
  return queryMountedEditable(host);
};

describe("LinkToolbar 링크 툴바", () => {
  it("선택도 활성 링크도 없으면 렌더링하지 않는다", () => {
    const controller = fakeController();
    render(withProvider(controller, <LinkToolbar />));

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("링크 없는 텍스트를 선택하면 링크 추가 컨트롤을 표시한다", () => {
    const controller = fakeController();
    renderWithSelectedText(controller);

    expect(screen.getByRole("toolbar", { name: "Link" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add link" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Remove link" })).toBeNull();
  });

  it("커서가 기존 링크 안에 있으면 열기·편집·제거 컨트롤을 표시한다", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
    });
    render(
      withProvider(
        controller,
        <>
          <LinkToolbar />
          <EditorContent />
        </>,
      ),
    );
    collapseSelection();

    expect(screen.getByRole("toolbar", { name: "Link" })).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "Open link" }).getAttribute("href"),
    ).toBe("https://example.com");
    expect(screen.getByRole("button", { name: "Edit link" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove link" })).not.toBeNull();
  });

  it("dictionary override 시 컨테이너·컨트롤·Cancel(aria-label≠텍스트)이 바뀐다(EXT-009)", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
      dictionary: {
        ...DEFAULT_DICTIONARY,
        toolbar: {
          ...DEFAULT_DICTIONARY.toolbar,
          link: {
            ...DEFAULT_DICTIONARY.toolbar.link,
            ariaLabel: "링크 툴바",
            editLink: "링크 편집",
            cancelAriaLabel: "링크 편집 취소",
            cancel: "취소",
          },
        },
      },
    });
    render(
      withProvider(
        controller,
        <>
          <LinkToolbar />
          <EditorContent />
        </>,
      ),
    );
    collapseSelection();

    expect(screen.getByRole("toolbar", { name: "링크 툴바" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "링크 편집" }));

    const cancelButton = screen.getByRole("button", { name: "링크 편집 취소" });
    expect(cancelButton).not.toBeNull();
    expect(cancelButton.textContent).toBe("취소");
  });

  it("링크 추가 컨트롤로 링크를 만든다", () => {
    const controller = fakeController();
    renderWithSelectedText(controller);

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Link URL" }), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));

    expect(controller.commands.setLink).toHaveBeenCalledWith(
      "https://example.com",
    );
  });

  it("허용되지 않는 링크 URL이면 거부 메시지를 표시한다", () => {
    const controller = fakeController({
      setLink: () => ({
        ok: false,
        error: { code: "LINK_HREF_REJECTED" },
      }),
    });
    renderWithSelectedText(controller);

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Link URL" }), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Link URL" })).not.toBeNull();
  });

  it("dictionary override 시 거부 메시지(Unsupported link URL)가 바뀐다(EXT-009)", () => {
    const controller = fakeController({
      setLink: () => ({
        ok: false,
        error: { code: "LINK_HREF_REJECTED" },
      }),
      dictionary: {
        ...DEFAULT_DICTIONARY,
        status: {
          ...DEFAULT_DICTIONARY.status,
          unsupportedLinkUrl: "지원하지 않는 링크 URL",
        },
      },
    });
    renderWithSelectedText(controller);

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Link URL" }), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "지원하지 않는 링크 URL",
    );
  });

  it("제거 컨트롤로 링크를 제거하고 편집기로 초점을 되돌린다", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
    });
    render(
      withProvider(
        controller,
        <>
          <LinkToolbar />
          <EditorContent />
        </>,
      ),
    );
    collapseSelection();
    const editable = getEditable();

    fireEvent.click(screen.getByRole("button", { name: "Remove link" }));

    expect(controller.commands.unsetLink).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(editable);
  });

  it("기존 링크의 href를 편집하고 편집기로 초점을 되돌린다", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
    });
    render(
      withProvider(
        controller,
        <>
          <LinkToolbar />
          <EditorContent />
        </>,
      ),
    );
    collapseSelection();
    const editable = getEditable();

    fireEvent.click(screen.getByRole("button", { name: "Edit link" }));
    const input = screen.getByRole("textbox", {
      name: "Link URL",
    }) as HTMLInputElement;
    expect(input.value).toBe("https://example.com");

    fireEvent.change(input, {
      target: { value: "https://updated.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));

    expect(controller.commands.setLink).toHaveBeenCalledWith(
      "https://updated.example.com",
    );
    expect(document.activeElement).toBe(editable);
  });

  it("기존 href가 그대로면 적용하지 않고 닫으며 편집기로 초점을 되돌린다", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
    });
    render(
      withProvider(
        controller,
        <>
          <LinkToolbar />
          <EditorContent />
        </>,
      ),
    );
    collapseSelection();
    const editable = getEditable();

    fireEvent.click(screen.getByRole("button", { name: "Edit link" }));
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));

    expect(controller.commands.setLink).not.toHaveBeenCalled();
    expect(screen.queryByRole("toolbar", { name: "Link" })).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("선택이 collapsed가 되고 활성 링크도 없으면 숨긴다", () => {
    const controller = fakeController();
    renderWithSelectedText(controller);
    expect(screen.queryByRole("toolbar")).not.toBeNull();

    collapseSelection();

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("view 모드에서 Escape를 누르면 툴바를 닫고 편집기로 초점을 되돌린다(G-UI-001, QA-003/QA-015)", () => {
    const controller = fakeController();
    renderWithSelectedText(controller);
    const editable = getEditable();
    expect(screen.queryByRole("toolbar")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("Escape로 닫은 뒤 같은 selection이 재관측돼도 다시 열리지 않는다(G-UI-001)", () => {
    const controller = fakeController();
    renderWithSelectedText(controller);
    // jsdom(27.0.1) focus() selection-collapse 부작용을 스텁으로 배제한다 —
    // 아래 "커서가 기존 링크 안(collapsed selection)에서도..." 테스트의 같은
    // 주석 참고. 스텁이 없으면 closeViewOnEscape의 focusEditor()가 selection을
    // collapse시켜 scroll 재관측이 "activeLink===null && !hasRange" 게이트
    // 만으로 이미 닫혀, dismissSuppression은 검증되지 않는 vacuous pass가 된다.
    const focusSpy = vi
      .spyOn(getEditable(), "focus")
      .mockImplementation(() => {});
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("toolbar")).toBeNull();

    fireEvent.scroll(document);

    expect(screen.queryByRole("toolbar")).toBeNull();
    focusSpy.mockRestore();
  });

  it("커서가 기존 링크 안(collapsed selection)에서도 Escape로 닫힌 뒤 재관측을 억제한다(G-UI-001)", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
    });
    render(
      withProvider(
        controller,
        <>
          <LinkToolbar />
          <EditorContent />
        </>,
      ),
    );
    const host = screen.getByRole("textbox", { name: "Editor" });
    const textNode = host.firstChild?.firstChild;
    if (!textNode) throw new Error("Text node was not rendered");
    // focus() 스텁 이유는 위 "Escape로 닫은 뒤 같은 selection이..." 테스트의
    // 주석 참고 — jsdom 전용 selection-collapse 부작용을 배제한다.
    const contentEditable = queryMountedEditable(host);
    const focusSpy = vi
      .spyOn(contentEditable, "focus")
      .mockImplementation(() => {});
    // 진짜 "링크 안 caret"은 collapseSelection()(rangeCount 0)이 아니라 실제
    // collapsed Range다 — start===end인 selectText가 그 Range를 만든다.
    // rangeCount 0으로는 dismiss-suppression이 비교할 Range 자체가 없어
    // 이 시나리오를 재현하지 못한다.
    selectText(textNode, 2, 2);
    expect(screen.queryByRole("toolbar")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("toolbar")).toBeNull();

    fireEvent.scroll(document);

    expect(screen.queryByRole("toolbar")).toBeNull();
    focusSpy.mockRestore();
  });

  it("편집 중 selectionchange가 발생해도 URL 입력을 열어 둔다", () => {
    const controller = fakeController();
    renderWithSelectedText(controller);

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    collapseSelection();

    expect(screen.getByRole("textbox", { name: "Link URL" })).not.toBeNull();
  });

  it("URL 입력에서 Escape를 누르면 툴바를 닫고 편집기로 초점을 되돌린다", () => {
    const controller = fakeController();
    renderWithSelectedText(controller);
    const editable = getEditable();

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    const input = screen.getByRole("textbox", { name: "Link URL" });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "Link URL" })).toBeNull();
    // URL 입력만 사라졌는지가 아니라 툴바 자체가 닫혔는지를 본다 — 입력만
    // 보는 단언은 closeAndRestoreFocus가 mode:"closed" 대신 mode:"view"로
    // 되돌아가도 통과해 제목이 주장하는 "툴바를 닫고"를 잠그지 못한다.
    expect(screen.queryByRole("toolbar", { name: "Link" })).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("Cancel 버튼을 클릭하면 툴바를 닫고 편집기로 초점을 되돌린다", () => {
    const controller = fakeController();
    renderWithSelectedText(controller);
    const editable = getEditable();

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel link edit" }));

    expect(screen.queryByRole("textbox", { name: "Link URL" })).toBeNull();
    expect(screen.queryByRole("toolbar", { name: "Link" })).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  describe("portalTarget", () => {
    it("지정하면 그 요소 하위에 렌더한다", () => {
      const controller = fakeController();
      const portalTarget = document.createElement("div");
      document.body.appendChild(portalTarget);
      render(
        withProvider(
          controller,
          <>
            <LinkToolbar portalTarget={portalTarget} />
            <EditorContent />
          </>,
        ),
      );
      const textNode = screen.getByRole("textbox", { name: "Editor" })
        .firstChild?.firstChild;
      if (!textNode) throw new Error("Text node was not rendered");
      selectText(textNode, 0, 8);

      const toolbar = screen.getByRole("toolbar", { name: "Link" });
      expect(portalTarget.contains(toolbar)).toBe(true);

      portalTarget.remove();
    });

    it("지정하지 않으면 기존 위치(부모 트리 내부)에 렌더한다", () => {
      const controller = fakeController();
      const { container } = render(
        withProvider(
          controller,
          <>
            <LinkToolbar />
            <EditorContent />
          </>,
        ),
      );
      const textNode = screen.getByRole("textbox", { name: "Editor" })
        .firstChild?.firstChild;
      if (!textNode) throw new Error("Text node was not rendered");
      selectText(textNode, 0, 8);

      const toolbar = screen.getByRole("toolbar", { name: "Link" });
      expect(container.contains(toolbar)).toBe(true);
    });
  });

  describe("component override", () => {
    const CustomLinkToolbar = ({ editor }: { editor: EditorController }) => (
      <button onClick={() => editor.commands.unsetLink()} type="button">
        Custom remove link
      </button>
    );

    it("지정하면 소비자 컴포넌트가 렌더되고 editor를 받는다", () => {
      const controller = fakeController();
      renderWithSelectedText(controller, { component: CustomLinkToolbar });

      const button = screen.getByRole("button", {
        name: "Custom remove link",
      });
      fireEvent.click(button);

      expect(controller.commands.unsetLink).toHaveBeenCalledOnce();
      expect(screen.queryByRole("button", { name: "Add link" })).toBeNull();
    });

    it("지정해도 표시 판정은 wrapper가 그대로 유지한다", () => {
      const controller = fakeController();
      render(
        withProvider(controller, <LinkToolbar component={CustomLinkToolbar} />),
      );

      expect(screen.queryByRole("toolbar")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Custom remove link" }),
      ).toBeNull();
    });
  });
});
