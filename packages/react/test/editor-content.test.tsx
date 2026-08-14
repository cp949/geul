// @vitest-environment jsdom

import type { CreateEditorOptions, EditorController } from "@cp949/geul-core";
import { render, screen } from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider, useEditor } from "../src/index.js";

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

const externalProvider = (
  controller: ReturnType<typeof fakeController>,
  children: ReactNode,
) => (
  <EditorProvider editor={controller as unknown as EditorController}>
    {children}
  </EditorProvider>
);

describe("React editor adapter", () => {
  it("mounts and unmounts an external controller without destroying it", () => {
    const controller = fakeController();
    const view = render(externalProvider(controller, <EditorContent />));

    const mount = screen.getByRole("textbox", { name: "Editor" });
    expect(mount.getAttribute("aria-multiline")).toBe("true");
    expect(mount.hasAttribute("contenteditable")).toBe(false);
    expect(controller.mount).toHaveBeenCalledOnce();
    expect(controller.mount).toHaveBeenCalledWith(mount);

    view.unmount();

    expect(controller.unmount).toHaveBeenCalledOnce();
    expect(controller.destroy).not.toHaveBeenCalled();
  });

  it("moves the mounted content from external controller A to B", () => {
    const controllerA = fakeController();
    const controllerB = fakeController();
    const view = render(externalProvider(controllerA, <EditorContent />));
    const mount = screen.getByRole("textbox", { name: "Editor" });

    view.rerender(externalProvider(controllerB, <EditorContent />));

    expect(controllerA.unmount).toHaveBeenCalledOnce();
    expect(controllerA.destroy).not.toHaveBeenCalled();
    expect(controllerB.mount).toHaveBeenCalledOnce();
    expect(controllerB.mount).toHaveBeenCalledWith(mount);

    view.unmount();
    expect(controllerB.unmount).toHaveBeenCalledOnce();
    expect(controllerB.destroy).not.toHaveBeenCalled();
  });

  it("owns an internal controller without replacing its document from props", () => {
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

  it("keeps initialDocument fixed while delivering changes to the latest callback", () => {
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

  it("throws a stable error outside EditorProvider", () => {
    const message = "Editor components must be used within an EditorProvider.";
    const HookConsumer = () => {
      useEditor();
      return null;
    };

    expect(() => render(<HookConsumer />)).toThrow(message);
    expect(() => render(<EditorContent />)).toThrow(message);
  });

  it("keeps the active internal controller alive through StrictMode probes", () => {
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
