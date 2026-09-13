// @vitest-environment jsdom

/**
 * StaticToolbar의 상시 렌더, mark/색상 동작과 media·표 셀·codeBlock에서의
 * disable(숨김 아님) 계약을 확인한다. FormattingToolbar와 커맨드 세트는
 * 같지만 표시 정책이 다르다(RD-001-DELTA-02) — 그 차이만 별도로 검증하고,
 * 공유 계산(activeMarks/blockSelection/nestingActions/media·cell 판정)의
 * 정확성 자체는 formatting-toolbar.test.tsx 계열이 이미 검증한다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BlockTypeDescriptor } from "@cp949/geul-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaticToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { fakeController } from "./formatting-toolbar-test-support.js";

afterEach(cleanup);

describe("StaticToolbar 상단 고정 툴바", () => {
  it("선택이 전혀 없어도 항상 렌더되고 커서 위치의 활성 mark를 반영한다", () => {
    const controller = fakeController(vi.fn(() => ["bold"]));
    render(withProvider(controller, <StaticToolbar />));

    const toolbar = screen.getByRole("toolbar", { name: "Toolbar" });
    expect(toolbar).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Italic" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("mark 버튼을 클릭하면 대응하는 core 명령을 호출한다", () => {
    const controller = fakeController();
    render(withProvider(controller, <StaticToolbar />));

    fireEvent.click(screen.getByRole("button", { name: "Bold" }));

    expect(controller.commands.toggleBold).toHaveBeenCalledOnce();
  });

  it("블록타입 select를 바꾸면 setBlockType을 호출한다", () => {
    const controller = fakeController();
    render(withProvider(controller, <StaticToolbar />));

    fireEvent.change(screen.getByRole("combobox", { name: "Block type" }), {
      target: { value: "heading-1" },
    });

    expect(controller.commands.setBlockType).toHaveBeenCalledOnce();
  });

  it("blockSelection이 null이면(표 셀 안 등) 블록타입 select와 들여쓰기 버튼을 렌더하지 않는다", () => {
    const controller = fakeController(
      undefined,
      vi.fn(() => null),
    );
    render(withProvider(controller, <StaticToolbar />));

    expect(screen.queryByRole("combobox", { name: "Block type" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Indent" })).toBeNull();
  });

  it("미디어 블록이 선택돼도 툴바는 유지되고 mark·색상 버튼만 disable된다", () => {
    const controller = fakeController(
      undefined,
      vi.fn(() => null),
    );
    controller.getSelectionMediaBlock.mockReturnValue({
      blockId: "media-1",
      kind: "image",
      url: "https://example.com/a.png",
      name: null,
      caption: null,
      showPreview: null,
      textAlignment: null,
    });
    render(withProvider(controller, <StaticToolbar />));

    expect(screen.getByRole("toolbar", { name: "Toolbar" })).not.toBeNull();
    const bold = screen.getByRole("button", { name: "Bold" });
    expect(bold.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(bold);
    expect(controller.commands.toggleBold).not.toHaveBeenCalled();
  });

  it("표 셀 다중선택(CellSelection)에서도 툴바는 유지되고 mark 버튼만 disable된다", () => {
    const controller = fakeController();
    controller.isCellRangeSelected.mockReturnValue(true);
    render(withProvider(controller, <StaticToolbar />));

    expect(screen.getByRole("toolbar", { name: "Toolbar" })).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Bold" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("codeBlock 선택에서는 mark 버튼만 disable되고 블록타입 select는 그대로 남는다", () => {
    const codeBlockType: BlockTypeDescriptor = { type: "codeBlock" };
    const controller = fakeController(
      undefined,
      vi.fn(() => ({ blockId: "block-1", blockType: codeBlockType })),
    );
    render(withProvider(controller, <StaticToolbar />));

    expect(
      screen
        .getByRole("button", { name: "Bold" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      screen.queryByRole("combobox", { name: "Block type" }),
    ).not.toBeNull();
  });

  describe("portalTarget", () => {
    it("지정하면 그 요소 하위에 렌더한다", () => {
      const portalTarget = document.createElement("div");
      document.body.append(portalTarget);
      const controller = fakeController();
      render(
        withProvider(controller, <StaticToolbar portalTarget={portalTarget} />),
      );

      expect(portalTarget.querySelector('[role="toolbar"]')).not.toBeNull();
      portalTarget.remove();
    });
  });

  describe("component override", () => {
    it("지정하면 소비자 컴포넌트가 렌더되고 editor를 받는다", () => {
      const controller = fakeController();
      const Custom = ({ editor }: { editor: unknown }) => (
        <button onClick={() => void editor}>custom</button>
      );
      render(withProvider(controller, <StaticToolbar component={Custom} />));

      expect(screen.getByRole("toolbar", { name: "Toolbar" })).not.toBeNull();
      expect(screen.getByText("custom")).not.toBeNull();
    });
  });

  it("className을 지정하면 기본 클래스와 함께 적용된다", () => {
    const controller = fakeController();
    render(
      withProvider(controller, <StaticToolbar className="consumer-sticky" />),
    );

    const toolbar = screen.getByRole("toolbar", { name: "Toolbar" });
    expect(toolbar.classList.contains("geul-static-toolbar")).toBe(true);
    expect(toolbar.classList.contains("consumer-sticky")).toBe(true);
  });
});
