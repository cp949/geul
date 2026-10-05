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

  it("codeBlock을 뺀 나머지가 모두 Heading 2면 그 값을 보여 준다", () => {
    // setBlockTypes가 codeBlock을 건너뛰므로 공통 타입 판정에서도 뺀다(Issue #269).
    renderMultiSelection([
      { blockId: "code-id", blockType: { type: "codeBlock" as const } },
      {
        blockId: "heading-id",
        blockType: { type: "heading" as const, level: 2 as const },
      },
    ]);

    const select = screen.getByRole("combobox", {
      name: "Block type",
    }) as HTMLSelectElement;
    expect(select.value).toBe("heading-2");
  });

  it("codeBlock을 뺀 나머지 타입이 섞여 있으면 값 없는 중립 항목을 보여 준다", () => {
    renderMultiSelection([
      { blockId: "code-id", blockType: { type: "codeBlock" as const } },
      paragraph("p-id"),
      { blockId: "list-id", blockType: { type: "bulletListItem" as const } },
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

  it("codeBlock 문자를 교차하는 선택에서는 mark·색상 버튼을 숨기고 블록 타입 select는 남긴다", () => {
    // 여러 블록 선택은 blockSelection이 null이라 단일 블록 판정으로는
    // codeBlock을 걸친 것을 알 수 없다. core mark 가드와 같은
    // selectionIntersectsCodeBlock()으로 판정한다(Issue #241).
    const controller = fakeController(
      vi.fn(() => []),
      vi.fn(() => null),
    );
    controller.getSelectionBlocks.mockReturnValue([
      paragraph("a"),
      { blockId: "b", blockType: { type: "codeBlock" } },
      paragraph("c"),
    ]);
    controller.selectionIntersectsCodeBlock.mockReturnValue(true);
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

    expect(screen.getByRole("combobox", { name: "Block type" })).not.toBeNull();
    for (const name of [
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Inline code",
      "Text color",
      "Background color",
    ]) {
      expect(screen.queryByRole("button", { name }), name).toBeNull();
    }
  });

  it("codeBlock 문자를 교차하지 않는 여러 블록 선택에서는 mark·색상 버튼을 보인다", () => {
    // 끝점만 codeBlock에 닿는 선택이다. core가 mark를 적용하므로 숨기지 않는다.
    renderMultiSelection([
      paragraph("a"),
      { blockId: "b", blockType: { type: "codeBlock" } },
    ]);

    expect(screen.getByRole("button", { name: "Bold" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Text color" })).not.toBeNull();
  });
});
