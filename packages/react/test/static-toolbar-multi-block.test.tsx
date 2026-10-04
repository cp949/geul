// @vitest-environment jsdom

/**
 * 여러 블록에 걸친 텍스트 선택에서 StaticToolbar가 블록 타입 컨트롤을
 * 켜고 `setBlockTypes`로 한 번에 바꾸는 계약을 확인한다. 변환 자체의
 * 규칙(건너뛰기·원자성)은 core `set-block-types.test.ts`가 소유한다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BlockTypeDescriptor } from "@cp949/geul-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaticToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { fakeStaticToolbarController } from "./static-toolbar-test-support.js";

afterEach(cleanup);

/** 단일 블록 선택은 없고 문단 3개에 걸친 선택이 있는 controller. */
type SelectionBlock = { blockId: string; blockType: BlockTypeDescriptor };

const multiController = (
  blocks: SelectionBlock[] = [
    { blockId: "a", blockType: { type: "paragraph" } },
    { blockId: "b", blockType: { type: "paragraph" } },
    { blockId: "c", blockType: { type: "paragraph" } },
  ],
) => {
  const controller = fakeStaticToolbarController(
    undefined,
    vi.fn(() => null),
  );
  controller.getSelectionBlocks.mockReturnValue(blocks);
  return controller;
};

describe("StaticToolbar 여러 블록 선택", () => {
  it("블록 타입 컨트롤은 켜고 Indent·Outdent는 끈다", () => {
    render(withProvider(multiController(), <StaticToolbar />));

    expect(
      screen
        .getByRole("button", { name: "Block type" })
        .getAttribute("aria-disabled"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: "Bulleted List" })
        .getAttribute("aria-disabled"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: "Indent" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("아이콘 버튼을 누르면 선택한 블록 전부에 setBlockTypes를 호출한다", () => {
    const controller = multiController();
    render(withProvider(controller, <StaticToolbar />));

    fireEvent.click(screen.getByRole("button", { name: "Bulleted List" }));

    expect(controller.commands.setBlockTypes).toHaveBeenCalledWith(
      ["a", "b", "c"],
      { type: "bulletListItem" },
    );
    expect(controller.commands.setBlockType).not.toHaveBeenCalled();
  });

  it("블록 타입 메뉴에서 Text를 고르면 선택한 블록 전부에 setBlockTypes를 호출한다", () => {
    const controller = multiController([
      { blockId: "a", blockType: { type: "bulletListItem" as const } },
      { blockId: "b", blockType: { type: "bulletListItem" as const } },
    ]);
    render(withProvider(controller, <StaticToolbar />));

    fireEvent.click(screen.getByRole("button", { name: "Block type" }), {
      detail: 1,
    });
    fireEvent.click(screen.getByRole("option", { name: "Text" }));

    expect(controller.commands.setBlockTypes).toHaveBeenCalledWith(["a", "b"], {
      type: "paragraph",
    });
  });

  it("타입이 섞여 있으면 활성 아이콘이 없다", () => {
    render(
      withProvider(
        multiController([
          { blockId: "a", blockType: { type: "paragraph" as const } },
          { blockId: "b", blockType: { type: "bulletListItem" as const } },
        ]),
        <StaticToolbar />,
      ),
    );

    expect(
      screen
        .getByRole("button", { name: "Bulleted List" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: "Numbered List" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("타입이 모두 같으면 그 아이콘이 눌린 상태다", () => {
    render(
      withProvider(
        multiController([
          { blockId: "a", blockType: { type: "bulletListItem" as const } },
          { blockId: "b", blockType: { type: "bulletListItem" as const } },
        ]),
        <StaticToolbar />,
      ),
    );

    expect(
      screen
        .getByRole("button", { name: "Bulleted List" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("Code는 여러 블록 대상에서 비활성이다", () => {
    const controller = multiController();
    render(withProvider(controller, <StaticToolbar />));

    const code = screen.getByRole("button", { name: "Code" });
    expect(code.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(code);
    expect(controller.commands.setBlockTypes).not.toHaveBeenCalled();
  });

  it("블록이 하나뿐이면 여러 블록 선택으로 치지 않는다", () => {
    render(
      withProvider(
        multiController([
          { blockId: "a", blockType: { type: "paragraph" as const } },
        ]),
        <StaticToolbar />,
      ),
    );

    expect(
      screen
        .getByRole("button", { name: "Block type" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("표 셀 범위와 미디어 선택이면 여러 블록 선택으로 치지 않는다", () => {
    const controller = multiController();
    controller.isCellRangeSelected.mockReturnValue(true);
    render(withProvider(controller, <StaticToolbar />));

    expect(
      screen
        .getByRole("button", { name: "Block type" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("codeBlock 문자를 교차하지 않는 여러 블록 선택에서는 mark 버튼이 켜져 있고 명령을 호출한다", () => {
    // 끝점만 codeBlock에 닿는 선택이다. core가 mark를 적용하므로 UI도 켠다.
    const controller = multiController([
      { blockId: "a", blockType: { type: "paragraph" } },
      { blockId: "b", blockType: { type: "codeBlock" } },
    ]);
    controller.selectionIntersectsCodeBlock.mockReturnValue(false);
    render(withProvider(controller, <StaticToolbar />));

    const bold = screen.getByRole("button", { name: "Bold" });
    expect(bold.getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(bold);
    expect(controller.commands.toggleBold).toHaveBeenCalledTimes(1);
  });
});
