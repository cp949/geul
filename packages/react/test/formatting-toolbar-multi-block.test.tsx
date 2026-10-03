// @vitest-environment jsdom

/**
 * 여러 블록에 걸친 텍스트 선택에서 FormattingToolbar의 블록 타입 select가
 * 뜨고 `setBlockTypes`로 한 번에 바꾸는 계약을 확인한다. 변환 규칙 자체는
 * core `set-block-types.test.ts`가 소유한다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BlockTypeDescriptor } from "@cp949/geul-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, FormattingToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { fakeController } from "./formatting-toolbar-test-support.js";
import { selectText } from "./selection-events.js";

afterEach(cleanup);

type SelectionBlock = { blockId: string; blockType: BlockTypeDescriptor };

const paragraph = (blockId: string): SelectionBlock => ({
  blockId,
  blockType: { type: "paragraph" },
});

/** 단일 블록 선택은 없고 `blocks`에 걸친 선택이 있는 controller를 렌더하고 선택한다. */
const renderMultiSelection = (
  blocks: SelectionBlock[] = [paragraph("a"), paragraph("b"), paragraph("c")],
) => {
  const controller = fakeController(
    vi.fn(() => []),
    vi.fn(() => null),
  );
  controller.getSelectionBlocks.mockReturnValue(blocks);
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
  return controller;
};

describe("FormattingToolbar 여러 블록 선택", () => {
  it("블록 타입 select를 띄우고 공통 타입을 보여 준다", () => {
    renderMultiSelection();

    const select = screen.getByRole("combobox", {
      name: "Block type",
    }) as HTMLSelectElement;
    expect(select.value).toBe("paragraph");
  });

  it("타입이 섞여 있으면 값 없는 중립 항목을 보여 준다", () => {
    renderMultiSelection([
      paragraph("a"),
      { blockId: "b", blockType: { type: "bulletListItem" as const } },
    ]);

    const select = screen.getByRole("combobox", {
      name: "Block type",
    }) as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("고른 타입을 선택한 블록 전부에 setBlockTypes로 적용한다", () => {
    const controller = renderMultiSelection();

    fireEvent.change(screen.getByRole("combobox", { name: "Block type" }), {
      target: { value: "bullet-list" },
    });

    expect(controller.commands.setBlockTypes).toHaveBeenCalledWith(
      ["a", "b", "c"],
      { type: "bulletListItem" },
    );
    expect(controller.commands.setBlockType).not.toHaveBeenCalled();
  });

  it("Code 항목은 목록에 없다", () => {
    renderMultiSelection();

    expect(screen.queryByRole("option", { name: "Code" })).toBeNull();
  });

  it("Indent·Outdent는 단일 블록에만 있다", () => {
    renderMultiSelection();

    expect(screen.queryByRole("button", { name: "Indent" })).toBeNull();
  });
});
