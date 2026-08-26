// @vitest-environment jsdom

import type { CreateEditorOptions, EditorController } from "@cp949/geul-core";
import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider, useEditor } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { queryMountedEditable } from "./query-mounted-editable.js";

// jsdom(27.x)은 Clipboard API(DataTransfer/ClipboardEvent)를 구현하지 않는다
// (jsdom/jsdom#1568) — packages/core/test/editor-controller-table-paste.test.ts와
// 같은 최소 폴리필을 여기서도 쓴다. 이후 jsdom이 네이티브로 지원하게 되면 이
// 블록은 자동으로 건너뛴다.
if (typeof globalThis.DataTransfer === "undefined") {
  class JsdomDataTransfer {
    private readonly store = new Map<string, string>();

    setData(format: string, data: string): void {
      this.store.set(format, data);
    }

    getData(format: string): string {
      return this.store.get(format) ?? "";
    }
  }

  globalThis.DataTransfer = JsdomDataTransfer as unknown as typeof DataTransfer;
}

if (typeof globalThis.ClipboardEvent === "undefined") {
  class JsdomClipboardEvent extends Event {
    readonly clipboardData: DataTransfer | null;

    constructor(type: string, eventInit?: ClipboardEventInit) {
      super(type, eventInit);
      this.clipboardData = eventInit?.clipboardData ?? null;
    }
  }

  globalThis.ClipboardEvent =
    JsdomClipboardEvent as unknown as typeof ClipboardEvent;
}

// @testing-library/react는 전역 afterEach나 teardown이 함수일 때만 자동
// cleanup을 등록한다(dist/index.js의 typeof afterEach === "function" 분기와
// 그 else의 teardown fallback). vitest는 globals: true일 때만 그 전역을
// 노출하는데 저장소 루트 vitest.config.ts에는 globals도 setupFiles도 없어 자동
// cleanup이 없다(실측: 이 설정에서 둘 다 undefined). 각 it 말미의 unmount로는
// assertion이 먼저 던질 때 DOM이 남아 다음 테스트의 getByRole(...)가
// "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
afterEach(cleanup);

const paragraphDocument = (
  text: string,
): CreateEditorOptions["initialDocument"] => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "block-1",
      type: "paragraph",
      content: [{ text }],
    },
  ],
});

const fakeController = () => ({
  mount: vi.fn(),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  replaceDocument: vi.fn(),
  commands: {
    setText: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  },
});

describe("React 에디터 어댑터", () => {
  it("외부 컨트롤러는 마운트·언마운트만 하고 destroy하지 않는다", () => {
    const controller = fakeController();
    const view = render(withProvider(controller, <EditorContent />));

    const mount = screen.getByRole("textbox", { name: "Editor" });
    expect(mount.getAttribute("aria-multiline")).toBe("true");
    expect(mount.hasAttribute("contenteditable")).toBe(false);
    expect(controller.mount).toHaveBeenCalledOnce();
    expect(controller.mount).toHaveBeenCalledWith(mount);

    view.unmount();

    expect(controller.unmount).toHaveBeenCalledOnce();
    expect(controller.destroy).not.toHaveBeenCalled();
  });

  it("마운트된 내용을 외부 컨트롤러 A에서 B로 옮긴다", () => {
    const controllerA = fakeController();
    const controllerB = fakeController();
    const view = render(withProvider(controllerA, <EditorContent />));
    const mount = screen.getByRole("textbox", { name: "Editor" });

    view.rerender(withProvider(controllerB, <EditorContent />));

    expect(controllerA.unmount).toHaveBeenCalledOnce();
    expect(controllerA.destroy).not.toHaveBeenCalled();
    expect(controllerB.mount).toHaveBeenCalledOnce();
    expect(controllerB.mount).toHaveBeenCalledWith(mount);

    view.unmount();
    expect(controllerB.unmount).toHaveBeenCalledOnce();
    expect(controllerB.destroy).not.toHaveBeenCalled();
  });

  it("내부 컨트롤러를 소유하되 props 변경으로 문서를 교체하지 않는다", () => {
    let controller: EditorController | undefined;
    const CaptureEditor = () => {
      controller = useEditor();
      return null;
    };
    const view = render(
      <EditorProvider initialDocument={paragraphDocument("first")}>
        <CaptureEditor />
      </EditorProvider>,
    );

    expect(controller?.getDocument().blocks[0]).toMatchObject({
      content: [{ text: "first" }],
    });

    view.rerender(
      <EditorProvider initialDocument={paragraphDocument("second")}>
        <CaptureEditor />
      </EditorProvider>,
    );
    expect(controller?.getDocument().blocks[0]).toMatchObject({
      content: [{ text: "first" }],
    });

    view.unmount();

    expect(controller?.commands.setText("block-1", "after destroy")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setText" },
    });
  });

  it("initialDocument는 고정한 채 변경 알림은 최신 콜백으로 전달한다", () => {
    let controller: EditorController | undefined;
    const firstCallback = vi.fn();
    const latestCallback = vi.fn();
    const CaptureEditor = () => {
      controller = useEditor();
      return null;
    };
    const view = render(
      <EditorProvider
        initialDocument={paragraphDocument("first")}
        onChange={firstCallback}
      >
        <CaptureEditor />
      </EditorProvider>,
    );

    view.rerender(
      <EditorProvider
        initialDocument={paragraphDocument("ignored")}
        onChange={latestCallback}
      >
        <CaptureEditor />
      </EditorProvider>,
    );
    expect(controller?.commands.setText("block-1", "changed")).toEqual({
      ok: true,
      value: undefined,
    });

    expect(firstCallback).not.toHaveBeenCalled();
    expect(latestCallback).toHaveBeenCalledWith({
      revision: 1,
      changedBlockIds: ["block-1"],
      reason: "local",
    });
    expect(controller?.getDocument().blocks[0]).toMatchObject({
      content: [{ text: "changed" }],
    });
  });

  it("표 붙여넣기가 거절되면 onPasteRejected에 최신 콜백으로 원인을 전달한다", () => {
    let controller: EditorController | undefined;
    const firstCallback = vi.fn();
    const latestCallback = vi.fn();
    const CaptureEditor = () => {
      controller = useEditor();
      return null;
    };
    const view = render(
      <EditorProvider
        initialDocument={paragraphDocument("first")}
        onPasteRejected={firstCallback}
      >
        <CaptureEditor />
        <EditorContent />
      </EditorProvider>,
    );

    view.rerender(
      <EditorProvider
        initialDocument={paragraphDocument("ignored")}
        onPasteRejected={latestCallback}
      >
        <CaptureEditor />
        <EditorContent />
      </EditorProvider>,
    );

    const host = screen.getByRole("textbox", { name: "Editor" });
    const editable = queryMountedEditable(host);
    editable.focus();

    // 10,000셀 상한을 넘는 HTML 표 — 파서가 표를 찾고 나서 거절하므로
    // CLIPBOARD_TABLE_INVALID다(editor-controller-table-paste.test.ts와 같은
    // fixture).
    const cells = Array.from({ length: 101 }, () => "<td>x</td>").join("");
    const rows = Array.from({ length: 101 }, () => `<tr>${cells}</tr>`).join(
      "",
    );
    const data = new DataTransfer();
    data.setData("text/html", `<table><tbody>${rows}</tbody></table>`);
    editable.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(firstCallback).not.toHaveBeenCalled();
    expect(latestCallback).toHaveBeenCalledTimes(1);
    expect(latestCallback.mock.calls[0]?.[0]).toMatchObject({
      code: "CLIPBOARD_TABLE_INVALID",
    });
    expect(controller?.getDocument().blocks[0]).toMatchObject({
      content: [{ text: "first" }],
    });

    view.unmount();
  });

  it("EditorProvider 바깥에서 사용하면 항상 같은 오류를 던진다", () => {
    const message = "Editor components must be used within an EditorProvider.";
    const HookConsumer = () => {
      useEditor();
      return null;
    };

    expect(() => render(<HookConsumer />)).toThrow(message);
    expect(() => render(<EditorContent />)).toThrow(message);
  });

  it("StrictMode의 이중 마운트에도 활성 내부 컨트롤러를 살려 둔다", () => {
    let controller: EditorController | undefined;
    const CaptureEditor = () => {
      controller = useEditor();
      return null;
    };
    const view = render(
      <StrictMode>
        <EditorProvider initialDocument={paragraphDocument("before")}>
          <CaptureEditor />
        </EditorProvider>
      </StrictMode>,
    );

    expect(controller?.commands.setText("block-1", "after")).toEqual({
      ok: true,
      value: undefined,
    });

    view.unmount();
    expect(controller?.commands.setText("block-1", "after unmount")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setText" },
    });
  });
});
