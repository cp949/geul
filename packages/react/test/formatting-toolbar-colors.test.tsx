// @vitest-environment jsdom

/**
 * FormattingToolbar의 인라인 색상 팔레트 열기·명령·dismiss·focus 계약을 확인한다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EditorContent, FormattingToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { fakeController } from "./formatting-toolbar-test-support.js";
import { collapseSelection, selectText } from "./selection-events.js";

afterEach(cleanup);

describe("인라인 색상 팔레트", () => {
  /**
   * 텍스트를 선택한 뒤 글자색 palette를 연다.
   * 각 palette 상호작용 테스트가 동일한 사전 조건을 공유한다.
   */
  const openTextColorPalette = () => {
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (!textNode) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);
    fireEvent.click(screen.getByRole("button", { name: "Text color" }));
  };

  it("Text color 트리거를 클릭하면 8색 + None 팔레트를 연다", () => {
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

    openTextColorPalette();

    expect(screen.getByRole("menu", { name: "Text color" })).toBeTruthy();
    expect(screen.getAllByRole("menuitem")).toHaveLength(9);
    expect(
      screen.getByRole("menuitem", { name: "Text color Blue" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Text color None" }),
    ).toBeTruthy();
  });

  it("글자색 스와치를 클릭하면 그 색상값으로 toggleInlineTextColor를 호출하고 팔레트를 닫는다", () => {
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
    openTextColorPalette();

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color Blue" }));

    expect(controller.commands.toggleInlineTextColor).toHaveBeenCalledWith(
      "#1A73E8",
    );
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("배경색 트리거 → None 스와치 클릭 시 toggleInlineBackgroundColor(null)을 호출한다", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Background color" }));

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Background color None" }),
    );

    expect(
      controller.commands.toggleInlineBackgroundColor,
    ).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("열려 있는 트리거를 다시 클릭하면 팔레트를 닫고 색상 명령을 호출하지 않는다", () => {
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
    openTextColorPalette();
    expect(screen.queryByRole("menu")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Text color" }));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(controller.commands.toggleInlineTextColor).not.toHaveBeenCalled();
  });

  it("팔레트가 열린 상태에서 다른 트리거를 클릭하면 그 색상 섹션으로 전환한다", () => {
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
    openTextColorPalette();

    fireEvent.click(screen.getByRole("button", { name: "Background color" }));

    expect(screen.getByRole("menu", { name: "Background color" })).toBeTruthy();
    expect(
      screen.queryByRole("menuitem", { name: "Text color Blue" }),
    ).toBeNull();
  });

  it("Escape로 팔레트를 닫고 편집기로 초점을 되돌린다", () => {
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
    openTextColorPalette();
    const editable = screen.getByRole("textbox", { name: "Editor" }).firstChild;

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("팔레트 바깥을 클릭하면 초점을 옮기지 않고 팔레트만 닫는다", () => {
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
    openTextColorPalette();

    const outsideButton = document.createElement("button");
    outsideButton.textContent = "outside";
    document.body.append(outsideButton);
    outsideButton.focus();

    try {
      fireEvent.pointerDown(outsideButton);

      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(outsideButton);
    } finally {
      outsideButton.remove();
    }
  });

  it("선택이 collapsed 상태가 되면 팔레트도 함께 닫히고 재선택 시 되살아나지 않는다", () => {
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
    openTextColorPalette();
    expect(screen.queryByRole("menu")).not.toBeNull();

    collapseSelection();
    expect(screen.queryByRole("toolbar")).toBeNull();

    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (!textNode) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);

    expect(screen.queryByRole("toolbar")).not.toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
