// @vitest-environment jsdom

/**
 * StaticToolbar의 블록 타입 컨트롤(트리거 버튼 + listbox 메뉴)을 확인한다
 * (RD-003-DELTA-01, Issue #218 결함 5).
 * fake controller로는 열림 상태, 옵션 구성, 키보드 이동이 변환을 일으키지
 * 않는 계약을, 실제 편집기로는 확정·Escape·바깥 클릭 뒤 포커스 위치를 본다.
 * Enter를 누른 채 있을 때의 자동 반복(Issue #228)도 실제 편집기로 본다.
 * 실제 입력이 어느 블록에 들어가는지와 viewport 클램프는 브라우저에서만
 * 확인되어 e2e가 소유한다.
 * 추가 주제(Issue #233, RD-002 DELTA-03): 바깥 클릭·Escape 닫힘이
 * useDismissibleOverlay를 거친다.
 * - 다른 module 오버레이와 함께 열렸을 때 Escape LIFO.
 * - 편집기가 먼저 막은 Escape와 IME 조합 중 Escape.
 * 바깥 클릭과 Escape 뒤 초점은 기존 단언이 이전 전후로 그대로 고정한다.
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
import {
  fakeStaticToolbarController,
  mountToolbarWithEditor,
  openProbe,
  press,
  ProbeOverlay,
  reachesEditor,
} from "./static-toolbar-test-support.js";

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

describe("StaticToolbar 블록 타입 메뉴를 연 채 툴바 버튼을 누를 때의 포커스(Issue #225)", () => {
  it("키보드로 연 메뉴에서 툴바 Bold를 누르면 메뉴가 닫히고 포커스가 편집기 안에 있다", () => {
    const { editable } = mountToolbarWithEditor();
    openByKeyboard();
    expect(document.activeElement?.getAttribute("role")).toBe("option");
    const bold = screen.getByRole("button", { name: "Bold" });

    // 실제 마우스 클릭 순서다. 툴바 버튼 mousedown은 `preventDefault`라 포커스가
    // 옵션에 남은 채 메뉴가 언마운트된다. jsdom은 mousedown 기본 동작으로
    // 포커스를 옮기지 않으므로 이 순서가 브라우저와 같다.
    fireEvent.pointerDown(bold);
    fireEvent.mouseDown(bold);
    fireEvent.click(bold, { detail: 1 });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(editable.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("마우스로 연 메뉴(포커스 편집기)에서 툴바 Bold를 눌러도 포커스는 편집기에 남는다", () => {
    const { editable } = mountToolbarWithEditor();
    editable.focus();
    openByMouse();
    const bold = screen.getByRole("button", { name: "Bold" });

    fireEvent.pointerDown(bold);
    fireEvent.mouseDown(bold);
    fireEvent.click(bold, { detail: 1 });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("포커스가 메뉴 밖의 다른 요소에 있으면 바깥 클릭으로 닫혀도 포커스를 옮기지 않는다", () => {
    mountToolbarWithEditor();
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      openByMouse();
      outside.focus();

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

describe("StaticToolbar 블록 타입 트리거의 방향키 열기", () => {
  it.each(["ArrowDown", "ArrowUp"])(
    "트리거에서 %s를 누르면 메뉴가 열리고 현재 타입 옵션으로 포커스가 간다",
    (key) => {
      render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

      fireEvent.keyDown(blockTypeTrigger(), { key });

      expect(blockTypeTrigger().getAttribute("aria-expanded")).toBe("true");
      expect(document.activeElement).toBe(
        screen.getByRole("option", { name: "Text" }),
      );
    },
  );
});

describe("StaticToolbar 블록 타입 메뉴의 Tab 기본 동작", () => {
  it("Tab은 브라우저 기본 이동을 막는다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByKeyboard();

    // fireEvent는 preventDefault가 불렸으면 false를 돌려준다. 막지 않으면
    // 트리거로 돌린 포커스가 기본 Tab 이동으로 툴바 밖까지 밀려난다.
    const notPrevented = fireEvent.keyDown(document.activeElement as Element, {
      key: "Tab",
    });

    expect(notPrevented).toBe(false);
  });
});

describe("StaticToolbar 블록 타입 메뉴의 트리거 추적", () => {
  /** 트리거의 viewport 좌표를 바꾼다. 스크롤을 흉내 낸다. */
  const moveTrigger = (left: number, bottom: number) => {
    vi.spyOn(blockTypeTrigger(), "getBoundingClientRect").mockReturnValue({
      left,
      bottom,
      top: bottom - 26,
      right: left + 104,
      width: 104,
      height: 26,
      x: left,
      y: bottom - 26,
      toJSON: () => ({}),
    });
  };

  const menuStyle = () => {
    const { left, top } = screen.getByRole("listbox", {
      name: "Block type",
    }).style;
    return { left, top };
  };

  it.each([
    ["scroll", () => fireEvent.scroll(window)],
    ["resize", () => fireEvent(window, new Event("resize"))],
  ])("%s가 일어나면 열린 메뉴가 트리거 아래로 따라간다", (_name, trigger) => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    moveTrigger(10, 100);
    openByMouse();
    expect(menuStyle()).toEqual({ left: "10px", top: "104px" });

    moveTrigger(30, 60);
    act(() => {
      trigger();
    });

    expect(menuStyle()).toEqual({ left: "30px", top: "64px" });
  });

  it("메뉴를 닫은 뒤에는 window 리스너가 남지 않는다", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByMouse();
    fireEvent.click(blockTypeTrigger());

    const removed = remove.mock.calls.map(([type]) => type);
    expect(removed).toEqual(expect.arrayContaining(["scroll", "resize"]));
    remove.mockRestore();
  });
});

describe("StaticToolbar 블록 타입 메뉴의 수식 키(Issue #225)", () => {
  // 가운데 옵션(Heading 2)에서 시작한다. 화살표·Home·End가 가로채이면
  // 포커스가 반드시 움직이는 자리다.
  const openAtHeading2 = () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByKeyboard();
    const heading2 = screen.getByRole("option", { name: "Heading 2" });
    heading2.focus();
    return heading2;
  };

  it.each([
    ["Alt", "ArrowDown", { altKey: true }],
    ["Control", "ArrowDown", { ctrlKey: true }],
    ["Meta", "ArrowDown", { metaKey: true }],
    ["Alt", "ArrowUp", { altKey: true }],
    ["Alt", "Home", { altKey: true }],
    ["Control", "End", { ctrlKey: true }],
  ])(
    "옵션에서 %s+%s는 포커스를 옮기지 않고 기본 동작을 막지 않는다",
    (_modifier, key, init) => {
      const heading2 = openAtHeading2();

      const notPrevented = fireEvent.keyDown(heading2, { key, ...init });

      expect(notPrevented).toBe(true);
      expect(document.activeElement).toBe(heading2);
    },
  );

  it("수식 키 없는 ArrowDown은 기존대로 다음 옵션으로 이동하고 기본 동작을 막는다", () => {
    const heading2 = openAtHeading2();

    const notPrevented = fireEvent.keyDown(heading2, { key: "ArrowDown" });

    expect(notPrevented).toBe(false);
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Heading 3" }),
    );
  });

  it("Shift+ArrowDown은 수식 키로 보지 않아 기존대로 이동한다", () => {
    const heading2 = openAtHeading2();

    const notPrevented = fireEvent.keyDown(heading2, {
      key: "ArrowDown",
      shiftKey: true,
    });

    expect(notPrevented).toBe(false);
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Heading 3" }),
    );
  });

  it.each([
    ["Control", { ctrlKey: true }],
    ["Alt", { altKey: true }],
  ])("%s+Tab은 메뉴를 닫지 않고 기본 동작을 막지 않는다", (_modifier, init) => {
    const heading2 = openAtHeading2();

    const notPrevented = fireEvent.keyDown(heading2, { key: "Tab", ...init });

    expect(notPrevented).toBe(true);
    expect(screen.getByRole("listbox", { name: "Block type" })).not.toBeNull();
    expect(document.activeElement).toBe(heading2);
  });

  it("Shift+Tab은 Tab과 같이 메뉴를 닫고 포커스를 트리거로 돌린다", () => {
    const heading2 = openAtHeading2();

    const notPrevented = fireEvent.keyDown(heading2, {
      key: "Tab",
      shiftKey: true,
    });

    expect(notPrevented).toBe(false);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(blockTypeTrigger());
  });

  it.each([
    ["Control", "ArrowDown", { ctrlKey: true }],
    ["Alt", "ArrowUp", { altKey: true }],
    ["Meta", "ArrowDown", { metaKey: true }],
  ])(
    "트리거에서 %s+%s는 메뉴를 열지 않고 기본 동작을 막지 않는다",
    (_modifier, key, init) => {
      render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
      blockTypeTrigger().focus();

      const notPrevented = fireEvent.keyDown(blockTypeTrigger(), {
        key,
        ...init,
      });

      expect(notPrevented).toBe(true);
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(blockTypeTrigger().getAttribute("aria-expanded")).toBe("false");
    },
  );

  it("트리거에서 수식 키 없는 ArrowDown은 기존대로 메뉴를 연다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

    const notPrevented = fireEvent.keyDown(blockTypeTrigger(), {
      key: "ArrowDown",
    });

    expect(notPrevented).toBe(false);
    expect(blockTypeTrigger().getAttribute("aria-expanded")).toBe("true");
  });
});

describe("StaticToolbar 블록 타입 메뉴에서 Enter를 누른 채 있을 때의 반복(Issue #228)", () => {
  // 옵션 버튼은 keydown Enter마다 click을 낸다. 확정으로 메뉴가 닫혀 포커스가
  // 편집기로 돌아간 뒤에도 같은 키의 반복이 이어지면 편집기가 블록을 나눈다.
  // jsdom은 keydown에서 click을 내지 않으므로 click은 직접 보낸다.

  it("키보드로 연 메뉴의 옵션에서 Enter 반복은 기본 동작을 막고 처음 Enter는 막지 않는다", () => {
    mountToolbarWithEditor();
    openByKeyboard();

    // 처음 Enter는 막지 않는다. 막으면 브라우저가 click을 내지 않는다.
    expect(press("Enter")).toBe(true);
    expect(press("Enter", { repeat: true })).toBe(false);
    fireEvent.keyUp(document.activeElement as Element, { key: "Enter" });
  });

  it("옵션 확정 뒤 편집기로 간 Enter 반복은 편집기에 닿지 않고 keyup 뒤에는 닿는다", () => {
    const { editable } = mountToolbarWithEditor();
    openByKeyboard();

    press("Enter");
    fireEvent.click(screen.getByRole("option", { name: "Heading 1" }), {
      detail: 0,
    });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(editable);

    expect(reachesEditor(editable, "Enter", { repeat: true })).toBe(false);
    expect(reachesEditor(editable, "Enter", { repeat: true })).toBe(false);
    fireEvent.keyUp(editable, { key: "Enter" });
    expect(reachesEditor(editable, "Enter", { repeat: true })).toBe(true);
  });

  it("마우스로 연 메뉴의 트리거에서 Enter로 닫아도 편집기로 간 Enter 반복은 닿지 않는다", () => {
    const { editable } = mountToolbarWithEditor();
    openByMouse();
    blockTypeTrigger().focus();

    press("Enter");
    fireEvent.click(blockTypeTrigger(), { detail: 0 });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(editable);

    expect(reachesEditor(editable, "Enter", { repeat: true })).toBe(false);
    fireEvent.keyUp(editable, { key: "Enter" });
  });

  it("옵션에서 Control+Enter 반복도 기본 동작을 막는다", () => {
    mountToolbarWithEditor();
    openByKeyboard();

    // 수식 키 가드가 Enter 반복 억제보다 앞서면 반복이 막히지 않는다.
    expect(press("Enter", { repeat: true, ctrlKey: true })).toBe(false);
  });

  it("트리거의 Control+Enter로 메뉴를 닫아도 편집기로 간 Enter 반복은 닿지 않는다", () => {
    const { editable } = mountToolbarWithEditor();
    openByMouse();
    blockTypeTrigger().focus();

    // 트리거의 수식 키 가드가 억제보다 앞서면 억제가 걸리지 않아 반복이
    // 편집기에 닿는다.
    press("Enter", { ctrlKey: true });
    fireEvent.click(blockTypeTrigger(), { detail: 0 });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(editable);

    expect(
      reachesEditor(editable, "Enter", { repeat: true, ctrlKey: true }),
    ).toBe(false);
    fireEvent.keyUp(editable, { key: "Enter" });
  });

  it("메뉴가 닫힌 트리거의 처음 Enter는 억제를 걸지 않는다", () => {
    const { editable } = mountToolbarWithEditor();
    blockTypeTrigger().focus();

    // 닫힌 트리거의 Enter는 메뉴를 여는 일반 활성화다. 억제를 걸면 뒤이은
    // 편집기의 Enter 반복이 삼켜진다.
    press("Enter");
    editable.focus();

    expect(reachesEditor(editable, "Enter", { repeat: true })).toBe(true);
  });
});

describe("StaticToolbar 블록 타입 메뉴의 Escape가 useDismissibleOverlay를 거친다(Issue #233 RD-002 DELTA-03)", () => {
  it("메뉴를 연 뒤 다른 오버레이를 열고 Escape를 누르면 나중에 연 오버레이만 닫히고 메뉴가 남는다", () => {
    mountToolbarWithEditor();
    render(<ProbeOverlay />);
    openByMouse();
    openProbe();
    expect(screen.getByRole("listbox", { name: "Block type" })).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "Probe" })).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    // 개수만 보면 FIFO와 구분되지 않는다. 남은 쪽이 메뉴임을 단언한다.
    expect(screen.queryByRole("dialog", { name: "Probe" })).toBeNull();
    expect(screen.getByRole("listbox", { name: "Block type" })).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("다른 오버레이를 연 뒤 메뉴를 열고 Escape를 누르면 메뉴만 먼저 닫히고 오버레이가 남는다", () => {
    mountToolbarWithEditor();
    render(<ProbeOverlay />);
    openProbe();
    openByMouse();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Probe" })).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Probe" })).toBeNull();
  });

  it("편집기가 Escape를 먼저 preventDefault해도 마우스로 연 메뉴가 닫히고 초점이 편집기에 남는다", () => {
    const { editable } = mountToolbarWithEditor();
    editable.focus();
    openByMouse();
    expect(screen.getByRole("listbox", { name: "Block type" })).not.toBeNull();
    // ProseMirror editHandlers.keydown이 편집기 안의 Escape를 막는 것을 흉내 낸다.
    const consume = (event: Event) => event.preventDefault();
    editable.addEventListener("keydown", consume);
    try {
      fireEvent.keyDown(editable, { key: "Escape" });
    } finally {
      editable.removeEventListener("keydown", consume);
    }

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("IME 조합 중 Escape는 메뉴를 닫지 않고 조합이 끝난 뒤 Escape는 닫는다", () => {
    mountToolbarWithEditor();
    openByMouse();

    fireEvent.keyDown(document, { key: "Escape", isComposing: true });
    expect(screen.getByRole("listbox", { name: "Block type" })).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
