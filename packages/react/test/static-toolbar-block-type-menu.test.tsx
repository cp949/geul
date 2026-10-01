// @vitest-environment jsdom

/**
 * StaticToolbar의 블록 타입 컨트롤(트리거 버튼 + listbox 메뉴)을 확인한다
 * (RD-003-DELTA-01, Issue #218 결함 5).
 * fake controller로는 열림 상태, 옵션 구성, 키보드 이동이 변환을 일으키지
 * 않는 계약을, 실제 편집기로는 확정·Escape·바깥 클릭 뒤 포커스 위치를 본다.
 * 실제 입력이 어느 블록에 들어가는지와 viewport 클램프는 브라우저에서만
 * 확인되어 e2e가 소유한다.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { BlockTypeDescriptor } from "@cp949/geul-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaticToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { mountBlockEditor, placeCaret } from "./mount-editor.js";
import { fakeStaticToolbarController } from "./static-toolbar-test-support.js";

afterEach(cleanup);

/** 블록 타입 트리거 버튼을 찾는다. */
const blockTypeTrigger = () =>
  screen.getByRole("button", { name: "Block type" });

/** 열린 listbox의 옵션 라벨을 순서대로 읽는다. */
const optionLabels = () =>
  within(screen.getByRole("listbox", { name: "Block type" }))
    .getAllByRole("option")
    .map((option) => option.textContent);

/** 현재 블록 타입을 돌려주는 조회 mock을 만든다. */
const blockTypeQuery = (blockType: BlockTypeDescriptor) =>
  vi.fn(() => ({ blockId: "block-1", blockType }));

/**
 * 마우스 클릭으로 메뉴를 연다. 실제 마우스 클릭은 `detail`이 1 이상이다.
 * 키보드로 연 경로(`detail` 0)와 구분하려고 값을 명시한다.
 */
const openByMouse = () => fireEvent.click(blockTypeTrigger(), { detail: 1 });

/** 키보드 활성화(Enter·Space)로 메뉴를 연다. 이때 `detail`은 0이다. */
const openByKeyboard = () => fireEvent.click(blockTypeTrigger(), { detail: 0 });

/**
 * 실제 편집기와 StaticToolbar를 마운트하고 첫 문단에 캐럿을 놓는다.
 * 편집 영역에 포커스를 둔 채로 돌려준다. 포커스가 처음부터 편집기에 있으면
 * "편집기로 되돌렸다"는 단언이 공허해지므로 호출부가 `focusOutsideEditor`를
 * 쓸지 정한다.
 */
const mountToolbarWithEditor = () => {
  const mounted = mountBlockEditor({
    blockIds: ["block-1"],
    children: <StaticToolbar />,
  });
  const paragraph = mounted.blocks[0]?.querySelector("p") ?? mounted.blocks[0];
  if (paragraph === undefined) throw new Error("문단을 찾지 못했다");
  placeCaret(paragraph);
  return mounted;
};

describe("StaticToolbar 블록 타입 트리거와 메뉴 열기", () => {
  it("블록 타입 컨트롤은 네이티브 select가 아니라 listbox 팝업 버튼이다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

    const toolbar = screen.getByRole("toolbar", { name: "Toolbar" });
    expect(toolbar.querySelector("select")).toBeNull();
    const trigger = blockTypeTrigger();
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("트리거를 누르면 aria-expanded가 true가 되고 Text와 Heading 1~6 옵션이 열린다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

    openByMouse();

    expect(blockTypeTrigger().getAttribute("aria-expanded")).toBe("true");
    expect(optionLabels()).toEqual([
      "Text",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Heading 4",
      "Heading 5",
      "Heading 6",
    ]);
  });

  it("트리거는 현재 블록 타입의 라벨을 보이고 그 옵션만 aria-selected다", () => {
    const controller = fakeStaticToolbarController(
      undefined,
      blockTypeQuery({ type: "heading", level: 2 }),
    );
    render(withProvider(controller, <StaticToolbar />));

    expect(blockTypeTrigger().textContent).toContain("Heading 2");
    openByMouse();

    const selected = screen
      .getAllByRole("option")
      .filter((option) => option.getAttribute("aria-selected") === "true");
    expect(selected.map((option) => option.textContent)).toEqual(["Heading 2"]);
  });

  it("현재 타입이 목록 밖(Quote)이면 트리거가 중립 라벨을 보이고 선택된 옵션이 없다", () => {
    const controller = fakeStaticToolbarController(
      undefined,
      blockTypeQuery({ type: "quote" }),
    );
    render(withProvider(controller, <StaticToolbar />));

    expect(blockTypeTrigger().textContent).toContain("Other");
    expect(blockTypeTrigger().textContent).not.toContain("Text");
    openByMouse();

    const selected = screen
      .getAllByRole("option")
      .filter((option) => option.getAttribute("aria-selected") === "true");
    expect(selected).toEqual([]);
  });

  it("열린 상태에서 트리거를 다시 누르면 메뉴가 닫힌다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

    openByMouse();
    openByMouse();

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(blockTypeTrigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("열린 상태에서 트리거를 누르면 바깥 클릭으로 먼저 닫혔다가 다시 열리지 않는다", () => {
    // fake provider는 편집기 마운트 요소가 없어 바깥 클릭 리스너가 걸리지
    // 않는다. 실제 편집기를 쓴다.
    mountToolbarWithEditor();
    openByMouse();

    // 실제 마우스 클릭은 pointerdown 뒤에 click이 온다. 트리거가 바깥 클릭
    // 판정에서 제외되지 않으면 pointerdown이 메뉴를 닫고 click이 다시 연다.
    fireEvent.pointerDown(blockTypeTrigger());
    fireEvent.click(blockTypeTrigger(), { detail: 1 });

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("enabledBlockTypes로 deny된 타입은 옵션에서 사라진다", () => {
    const controller = fakeStaticToolbarController();
    controller.isBlockTypeEnabled = vi.fn((type: string) => type !== "heading");
    render(withProvider(controller, <StaticToolbar />));

    openByMouse();

    expect(optionLabels()).toEqual(["Text"]);
  });
});

describe("StaticToolbar 블록 타입 메뉴의 포커스 위치", () => {
  it("마우스로 열면 포커스를 옮기지 않고 편집기에 둔다", () => {
    const { editable } = mountToolbarWithEditor();
    editable.focus();

    openByMouse();

    expect(screen.getByRole("listbox", { name: "Block type" })).not.toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("키보드로 열면 현재 선택된 옵션으로 포커스가 옮겨진다", () => {
    const controller = fakeStaticToolbarController(
      undefined,
      blockTypeQuery({ type: "heading", level: 3 }),
    );
    render(withProvider(controller, <StaticToolbar />));

    openByKeyboard();

    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Heading 3" }),
    );
  });

  it("키보드로 열었을 때 선택된 옵션이 없으면 첫 옵션이 포커스를 받는다", () => {
    const controller = fakeStaticToolbarController(
      undefined,
      blockTypeQuery({ type: "quote" }),
    );
    render(withProvider(controller, <StaticToolbar />));

    openByKeyboard();

    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Text" }),
    );
  });

  it("트리거에서 ArrowDown을 누르면 메뉴가 열리고 선택된 옵션으로 포커스가 옮겨진다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

    fireEvent.keyDown(blockTypeTrigger(), { key: "ArrowDown" });

    expect(blockTypeTrigger().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Text" }),
    );
  });
});

describe("StaticToolbar 블록 타입 메뉴의 키보드 이동", () => {
  it("ArrowDown·ArrowUp은 포커스만 옮기고 블록을 변환하지 않는다", () => {
    const controller = fakeStaticToolbarController();
    render(withProvider(controller, <StaticToolbar />));
    openByKeyboard();

    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Heading 1" }),
    );
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Heading 2" }),
    );
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Heading 1" }),
    );

    expect(controller.commands.setBlockType).not.toHaveBeenCalled();
  });

  it("첫 옵션에서 ArrowUp, 마지막 옵션에서 ArrowDown은 제자리에 머문다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByKeyboard();
    const first = screen.getByRole("option", { name: "Text" });

    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);

    const last = screen.getByRole("option", { name: "Heading 6" });
    last.focus();
    fireEvent.keyDown(last, { key: "ArrowDown" });
    expect(document.activeElement).toBe(last);
  });

  it("Home과 End는 처음과 마지막 옵션으로 포커스를 옮긴다", () => {
    const controller = fakeStaticToolbarController();
    render(withProvider(controller, <StaticToolbar />));
    openByKeyboard();

    fireEvent.keyDown(document.activeElement as Element, { key: "End" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Heading 6" }),
    );
    fireEvent.keyDown(document.activeElement as Element, { key: "Home" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Text" }),
    );

    expect(controller.commands.setBlockType).not.toHaveBeenCalled();
  });

  it("Tab은 메뉴를 닫고 포커스를 트리거로 돌린다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByKeyboard();

    fireEvent.keyDown(document.activeElement as Element, { key: "Tab" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(blockTypeTrigger());
  });
});

describe("StaticToolbar 블록 타입 메뉴의 확정과 닫기", () => {
  it("옵션을 클릭하면 현재 블록을 그 타입으로 변환하고 메뉴를 닫는다", () => {
    const controller = fakeStaticToolbarController();
    render(withProvider(controller, <StaticToolbar />));
    openByMouse();

    fireEvent.click(screen.getByRole("option", { name: "Heading 1" }));

    expect(controller.commands.setBlockType).toHaveBeenCalledWith("block-1", {
      type: "heading",
      level: 1,
    });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("확정한 변환은 클릭 시점의 현재 블록에 적용된다", () => {
    const query = blockTypeQuery({ type: "paragraph" });
    const controller = fakeStaticToolbarController(undefined, query);
    render(withProvider(controller, <StaticToolbar />));
    openByMouse();

    // 메뉴가 열려 있는 동안 선택이 다른 블록으로 옮겨 간 상황이다.
    query.mockReturnValue({
      blockId: "block-9",
      blockType: { type: "paragraph" },
    });
    fireEvent.click(screen.getByRole("option", { name: "Heading 2" }));

    expect(controller.commands.setBlockType).toHaveBeenCalledWith("block-9", {
      type: "heading",
      level: 2,
    });
  });

  it("실제 편집기에서 확정하면 블록이 바뀌고 포커스가 편집기로 돌아온다", () => {
    const { editor, editable } = mountToolbarWithEditor();
    blockTypeTrigger().focus();
    openByMouse();

    fireEvent.click(screen.getByRole("option", { name: "Heading 1" }));

    expect(editor.getDocument().blocks[0]?.type).toBe("heading");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("Escape는 메뉴를 닫고 포커스를 편집기로 돌린다", () => {
    const { editable } = mountToolbarWithEditor();
    openByKeyboard();
    expect(document.activeElement).not.toBe(editable);

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("바깥 클릭은 메뉴를 닫지만 포커스를 옮기지 않는다", () => {
    mountToolbarWithEditor();
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      outside.focus();
      openByMouse();

      fireEvent.pointerDown(outside);

      expect(screen.queryByRole("listbox")).toBeNull();
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });
});

describe("StaticToolbar 블록 타입 메뉴의 자동 닫힘 포커스(G-UI-001)", () => {
  /**
   * 대상 블록이 사라진 상황을 만든다. 조회를 null로 고정한 뒤 다른 블록의
   * 타입을 바꿔 상태 변경 통지를 일으킨다.
   */
  const invalidateTarget = (mounted: ReturnType<typeof mountTwoBlocks>) => {
    vi.spyOn(mounted.editor, "getSelectionBlockType").mockReturnValue(null);
    act(() => {
      mounted.editor.commands.setBlockType(mounted.blockIds[1] ?? "", {
        type: "quote",
      });
    });
  };

  const mountTwoBlocks = () => {
    const mounted = mountBlockEditor({
      blockIds: ["block-1", "block-2"],
      children: <StaticToolbar />,
    });
    const first = mounted.blocks[0]?.querySelector("p") ?? mounted.blocks[0];
    if (first === undefined) throw new Error("첫 문단을 찾지 못했다");
    placeCaret(first);
    return mounted;
  };

  it("포커스가 메뉴 옵션에 있을 때 자동으로 닫히면 포커스를 편집기로 돌린다", () => {
    const mounted = mountTwoBlocks();
    openByKeyboard();
    expect(document.activeElement?.getAttribute("role")).toBe("option");

    invalidateTarget(mounted);

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(mounted.editable);
  });

  it("포커스가 메뉴 밖에 있을 때 자동으로 닫혀도 포커스를 옮기지 않는다", () => {
    const mounted = mountTwoBlocks();
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      openByMouse();
      outside.focus();

      invalidateTarget(mounted);

      expect(screen.queryByRole("listbox")).toBeNull();
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });
});

describe("StaticToolbar 블록 타입 메뉴와 색상 메뉴의 상호배제", () => {
  it("색상 메뉴를 열면 블록 타입 메뉴가 닫힌다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByMouse();

    fireEvent.click(screen.getByRole("button", { name: "Text color" }));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("menu", { name: "Text color" })).not.toBeNull();
  });

  it("블록 타입 메뉴를 열면 색상 메뉴가 닫힌다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    fireEvent.click(screen.getByRole("button", { name: "Text color" }));

    openByMouse();

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("listbox", { name: "Block type" })).not.toBeNull();
  });
});
