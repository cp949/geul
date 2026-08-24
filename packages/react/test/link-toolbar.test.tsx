// @vitest-environment jsdom

/**
 * LinkToolbar 컴포넌트: 텍스트 선택에 따른 링크 추가/편집/제거 컨트롤 노출,
 * 허용되지 않는 링크 URL의 거부 메시지, selectionchange에 따른 표시·숨김 전환,
 * URL 입력에서 Escape 시 닫힘과 편집기로의 초점 복구를 검증한다.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, LinkToolbar } from "../src/index.js";
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
};

const fakeController = ({
  getSelectionLink = () => null,
  setLink = () => ({ ok: true }),
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
) => {
  render(
    withProvider(
      controller,
      <>
        <LinkToolbar />
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
});
