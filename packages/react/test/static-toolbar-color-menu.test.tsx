// @vitest-environment jsdom

/**
 * StaticToolbar의 글자색·배경색 컨트롤(트리거 버튼 + menu)을 확인한다
 * (Issue #224). 블록 타입 메뉴와 같은 접근성·키보드 계약이 대상이다.
 * fake controller로는 트리거 속성, 열림 포커스, 화살표 이동이 색상 명령을
 * 부르지 않는 계약, Tab 닫기를, 실제 편집기로는 Escape·확정·바깥 클릭 뒤
 * 포커스 위치를 본다.
 * 키보드 입력이 실제로 어느 글자에 색을 입히는지는 브라우저에서만 확인되어
 * e2e(showcase-static-toolbar-color-menu.spec.ts)가 소유한다.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaticToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import {
  fakeStaticToolbarController,
  mountToolbarWithEditor,
  press,
} from "./static-toolbar-test-support.js";

afterEach(cleanup);

/** 색상 트리거 두 종류. 속성 이름과 트리거 라벨을 함께 둔다. 메뉴 라벨은 트리거 라벨과 같다. */
const TRIGGERS = [
  ["글자색", "Text color"],
  ["배경색", "Background color"],
] as const;

/** 라벨로 색상 트리거를 찾는다. */
const colorTrigger = (label: string) =>
  screen.getByRole("button", { name: label });

/** 열린 색상 메뉴의 스와치를 DOM 순서대로 돌려준다. */
const swatches = (label: string) =>
  within(screen.getByRole("menu", { name: label })).getAllByRole("menuitem");

/**
 * 마우스 클릭으로 색상 메뉴를 연다. 실제 마우스 클릭은 `detail`이 1 이상이다.
 * 키보드로 연 경로(`detail` 0)와 구분하려고 값을 명시한다.
 */
const openByMouse = (label: string) =>
  fireEvent.click(colorTrigger(label), { detail: 1 });

/** 키보드 활성화(Enter·Space)로 색상 메뉴를 연다. 이때 `detail`은 0이다. */
const openByKeyboard = (label: string) =>
  fireEvent.click(colorTrigger(label), { detail: 0 });

describe("StaticToolbar 색상 트리거의 접근성 속성", () => {
  it.each(TRIGGERS)(
    "%s 트리거는 aria-haspopup menu와 aria-expanded false를 가진다",
    (_name, label) => {
      render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

      expect(colorTrigger(label).getAttribute("aria-haspopup")).toBe("menu");
      expect(colorTrigger(label).getAttribute("aria-expanded")).toBe("false");
    },
  );

  it("한쪽 메뉴를 열면 그쪽 트리거만 aria-expanded true이고 닫으면 false로 돌아온다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

    openByMouse("Text color");

    expect(colorTrigger("Text color").getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(colorTrigger("Background color").getAttribute("aria-expanded")).toBe(
      "false",
    );

    openByMouse("Text color");

    expect(colorTrigger("Text color").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("글자색 메뉴가 열린 채 배경색 트리거를 누르면 aria-expanded가 배경색으로 옮겨 간다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByMouse("Text color");

    openByMouse("Background color");

    expect(colorTrigger("Text color").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(colorTrigger("Background color").getAttribute("aria-expanded")).toBe(
      "true",
    );
  });
});

describe("StaticToolbar 색상 메뉴의 열림 포커스", () => {
  it.each(TRIGGERS)(
    "키보드로(%s) 열면 첫 스와치가 포커스를 받는다",
    (_name, label) => {
      render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

      openByKeyboard(label);

      expect(document.activeElement).toBe(swatches(label)[0]);
    },
  );

  it.each(TRIGGERS)(
    "마우스로(%s) 열면 포커스가 메뉴로 가지 않고 편집기에 남는다",
    (_name, label) => {
      const { editable } = mountToolbarWithEditor();
      editable.focus();

      openByMouse(label);

      expect(screen.getByRole("menu", { name: label })).not.toBeNull();
      expect(document.activeElement).toBe(editable);
    },
  );

  it.each(
    TRIGGERS.flatMap(([name, label]) => [
      [name, label, "ArrowDown"],
      [name, label, "ArrowUp"],
    ]),
  )(
    "%s 트리거(%s)에서 %s 키를 누르면 메뉴를 열고 첫 스와치로 포커스를 옮긴다",
    (_name, label, key) => {
      render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

      const notPrevented = fireEvent.keyDown(colorTrigger(label as string), {
        key: key as string,
      });

      expect(notPrevented).toBe(false);
      expect(colorTrigger(label as string).getAttribute("aria-expanded")).toBe(
        "true",
      );
      expect(document.activeElement).toBe(swatches(label as string)[0]);
    },
  );

  it("같은 속성의 메뉴가 이미 열려 있으면 트리거의 방향키는 아무것도 하지 않는다", () => {
    const { editable } = mountToolbarWithEditor();
    editable.focus();
    openByMouse("Text color");
    const menu = screen.getByRole("menu", { name: "Text color" });

    const notPrevented = fireEvent.keyDown(colorTrigger("Text color"), {
      key: "ArrowDown",
    });

    expect(notPrevented).toBe(false);
    expect(screen.getByRole("menu", { name: "Text color" })).toBe(menu);
    expect(document.activeElement).toBe(editable);
  });

  it("aria-disabled 트리거에서는 방향키로 메뉴를 열지 않는다", () => {
    const controller = fakeStaticToolbarController(
      undefined,
      vi.fn(() => ({ blockId: "block-1", blockType: { type: "codeBlock" } })),
    );
    render(withProvider(controller, <StaticToolbar />));
    expect(colorTrigger("Text color").getAttribute("aria-disabled")).toBe(
      "true",
    );

    fireEvent.keyDown(colorTrigger("Text color"), { key: "ArrowDown" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(colorTrigger("Text color").getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("마우스로 연 글자색 메뉴가 열린 채 배경색을 키보드로 열면 배경색 메뉴의 첫 스와치가 포커스를 받는다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByMouse("Text color");
    expect(screen.getByRole("menu", { name: "Text color" })).not.toBeNull();

    openByKeyboard("Background color");

    expect(screen.queryByRole("menu", { name: "Text color" })).toBeNull();
    expect(
      screen.getByRole("menu", { name: "Background color" }),
    ).not.toBeNull();
    expect(document.activeElement).toBe(swatches("Background color")[0]);
  });
});

describe("StaticToolbar 색상 메뉴의 키보드 이동", () => {
  /** 현재 포커스가 스와치 몇 번째인지 돌려준다. 스와치 밖이면 -1이다. */
  const focusedIndex = (label: string) =>
    swatches(label).indexOf(document.activeElement as HTMLElement);

  it.each(TRIGGERS)(
    "%s 메뉴는 스와치가 색 8개와 색 없음 1개다",
    (_name, label) => {
      render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

      openByKeyboard(label);

      expect(swatches(label)).toHaveLength(9);
    },
  );

  it("ArrowRight·ArrowDown은 다음, ArrowLeft·ArrowUp은 이전 스와치로 포커스를 옮긴다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByKeyboard("Text color");
    expect(focusedIndex("Text color")).toBe(0);

    expect(press("ArrowRight")).toBe(false);
    expect(focusedIndex("Text color")).toBe(1);
    expect(press("ArrowDown")).toBe(false);
    expect(focusedIndex("Text color")).toBe(2);
    expect(press("ArrowLeft")).toBe(false);
    expect(focusedIndex("Text color")).toBe(1);
    expect(press("ArrowUp")).toBe(false);
    expect(focusedIndex("Text color")).toBe(0);
  });

  it("Home과 End는 처음과 마지막 스와치로 포커스를 옮긴다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByKeyboard("Background color");

    expect(press("End")).toBe(false);
    expect(focusedIndex("Background color")).toBe(8);
    expect(press("Home")).toBe(false);
    expect(focusedIndex("Background color")).toBe(0);
  });

  it("첫 스와치에서 이전, 마지막 스와치에서 다음 이동은 제자리에 머문다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByKeyboard("Text color");

    expect(press("ArrowLeft")).toBe(false);
    expect(focusedIndex("Text color")).toBe(0);
    expect(press("ArrowUp")).toBe(false);
    expect(focusedIndex("Text color")).toBe(0);

    press("End");
    expect(press("ArrowRight")).toBe(false);
    expect(focusedIndex("Text color")).toBe(8);
    expect(press("ArrowDown")).toBe(false);
    expect(focusedIndex("Text color")).toBe(8);
  });

  it.each(TRIGGERS)(
    "이동만으로(%s) 색상 명령을 호출하지 않는다",
    (_name, label) => {
      const controller = fakeStaticToolbarController();
      render(withProvider(controller, <StaticToolbar />));
      openByKeyboard(label);

      for (const key of ["ArrowRight", "ArrowDown", "End", "Home"]) {
        press(key);
      }

      expect(controller.commands.toggleCaretTextColor).not.toHaveBeenCalled();
      expect(
        controller.commands.toggleCaretBackgroundColor,
      ).not.toHaveBeenCalled();
      expect(controller.commands.toggleInlineTextColor).not.toHaveBeenCalled();
      expect(
        controller.commands.toggleInlineBackgroundColor,
      ).not.toHaveBeenCalled();
    },
  );

  it("처리하지 않는 키는 기본 동작을 막지 않는다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByKeyboard("Text color");

    expect(press("a")).toBe(true);
    expect(focusedIndex("Text color")).toBe(0);
  });

  it("스와치의 Enter 자동 반복은 기본 동작을 막고 첫 Enter는 막지 않는다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByKeyboard("Text color");

    // 버튼은 keydown Enter마다 click을 낸다. 트리거를 Enter로 열고 계속
    // 누르면 반복이 첫 스와치를 확정하고 편집기에서 이어진다.
    expect(press("Enter", { repeat: true })).toBe(false);
    expect(press("Enter")).toBe(true);
    expect(focusedIndex("Text color")).toBe(0);
    // 첫 Enter가 문서에 반복 차단을 걸었다. 테스트 사이에 남기지 않는다.
    fireEvent.keyUp(document.activeElement as Element, { key: "Enter" });
  });
});

describe("StaticToolbar 색상 메뉴의 Tab 정지점", () => {
  it.each(TRIGGERS)(
    "%s 메뉴의 스와치 9개는 모두 tabIndex가 -1이다",
    (_name, label) => {
      render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

      openByKeyboard(label);

      const tabIndexes = swatches(label).map((swatch) => swatch.tabIndex);
      expect(tabIndexes).toEqual(Array(9).fill(-1));
    },
  );

  it.each(TRIGGERS)(
    "%s 메뉴 안의 Tab은 기본 이동을 막고 메뉴를 닫은 뒤 그 트리거로 포커스를 돌린다",
    (_name, label) => {
      render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
      openByKeyboard(label);

      const notPrevented = fireEvent.keyDown(
        document.activeElement as Element,
        { key: "Tab" },
      );

      expect(notPrevented).toBe(false);
      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(colorTrigger(label));
    },
  );

  it.each(TRIGGERS)(
    "%s 메뉴 안의 Shift+Tab도 메뉴를 닫고 그 트리거로 포커스를 돌린다",
    (_name, label) => {
      render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
      openByKeyboard(label);

      const notPrevented = fireEvent.keyDown(
        document.activeElement as Element,
        { key: "Tab", shiftKey: true },
      );

      expect(notPrevented).toBe(false);
      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(colorTrigger(label));
    },
  );
});

describe("StaticToolbar 색상 메뉴의 닫기와 포커스(실제 편집기)", () => {
  it("Escape는 메뉴를 닫고 포커스를 편집기로 돌린다", () => {
    const { editable } = mountToolbarWithEditor();
    openByKeyboard("Text color");
    expect(document.activeElement).not.toBe(editable);

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("스와치를 확정하면 메뉴를 닫고 포커스를 편집기로 돌린다", () => {
    const { editable } = mountToolbarWithEditor();
    openByKeyboard("Background color");
    expect(document.activeElement).not.toBe(editable);

    fireEvent.click(swatches("Background color")[1] as HTMLElement, {
      detail: 0,
    });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it.each([
    ["글자색", "Text color", "toggleCaretTextColor"],
    ["배경색", "Background color", "toggleCaretBackgroundColor"],
  ] as const)(
    "%s 스와치를 확정하면 포커스를 편집기로 돌린 뒤 캐럿 명령을 부른다",
    (_name, label, caretCommand) => {
      const { editor, editable } = mountToolbarWithEditor();
      openByKeyboard(label);
      const swatch = swatches(label)[0] as HTMLElement;
      expect(document.activeElement).toBe(swatch);
      // 포커스가 스와치에 있는 채로 명령을 부르면 DOM 갱신이 selection을
      // 접는다. 순서는 명령이 불리는 순간의 포커스로 본다.
      const original = editor.commands[caretCommand].bind(editor.commands);
      const focusAtCommand: Array<Element | null> = [];
      vi.spyOn(editor.commands, caretCommand).mockImplementation((color) => {
        focusAtCommand.push(document.activeElement);
        return original(color);
      });

      fireEvent.click(swatch, { detail: 0 });

      expect(focusAtCommand).toEqual([editable]);
    },
  );

  describe("Enter를 누른 채 있을 때의 반복", () => {
    // 버튼은 keydown Enter마다 click을 낸다. 확정으로 포커스가 편집기로 돌아간
    // 뒤에도 같은 키의 반복이 이어지면 편집기가 선택 범위를 줄바꿈으로 바꾼다.
    // jsdom은 keydown에서 click을 내지 않으므로 click은 직접 보낸다.
    // 편집기도 Enter를 `preventDefault`하므로 반환값으로는 막힘을 가를 수
    // 없다. 키가 편집기 요소에 도달했는지로 본다.

    /** 포커스된 요소에 keydown을 보내고 편집기 요소가 그 키를 받았는지 돌려준다. */
    const reachesEditor = (
      editable: HTMLElement,
      key: string,
      init: KeyboardEventInit = {},
    ) => {
      const received = vi.fn();
      editable.addEventListener("keydown", received);
      try {
        press(key, init);
      } finally {
        editable.removeEventListener("keydown", received);
      }
      return received.mock.calls.length > 0;
    };

    it("스와치 확정 뒤 편집기로 간 Enter 반복은 편집기에 닿지 않고 keyup 뒤에는 닿는다", () => {
      const { editable } = mountToolbarWithEditor();
      openByKeyboard("Text color");

      press("Enter");
      fireEvent.click(swatches("Text color")[0] as HTMLElement, { detail: 0 });
      expect(document.activeElement).toBe(editable);

      expect(reachesEditor(editable, "Enter", { repeat: true })).toBe(false);
      expect(reachesEditor(editable, "Enter", { repeat: true })).toBe(false);
      fireEvent.keyUp(editable, { key: "Enter" });
      expect(reachesEditor(editable, "Enter", { repeat: true })).toBe(true);
    });

    it("다른 키를 새로 누르면 Enter 반복 차단을 푼다", () => {
      const { editable } = mountToolbarWithEditor();
      openByKeyboard("Text color");
      press("Enter");
      fireEvent.click(swatches("Text color")[0] as HTMLElement, { detail: 0 });
      expect(document.activeElement).toBe(editable);

      expect(reachesEditor(editable, "a")).toBe(true);

      expect(reachesEditor(editable, "Enter", { repeat: true })).toBe(true);
    });

    it("마우스로 연 메뉴의 트리거에서 Enter로 닫아도 편집기로 간 Enter 반복은 닿지 않는다", () => {
      const { editable } = mountToolbarWithEditor();
      openByMouse("Text color");
      colorTrigger("Text color").focus();

      press("Enter");
      fireEvent.click(colorTrigger("Text color"), { detail: 0 });
      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(editable);

      expect(reachesEditor(editable, "Enter", { repeat: true })).toBe(false);
      fireEvent.keyUp(editable, { key: "Enter" });
    });

    it("트리거의 Control+Enter로 메뉴를 닫아도 편집기로 간 Enter 반복은 닿지 않는다", () => {
      const { editable } = mountToolbarWithEditor();
      openByMouse("Text color");
      colorTrigger("Text color").focus();

      // 수식 키 가드가 Enter 반복 억제보다 앞서면 억제가 걸리지 않아
      // 반복이 편집기에 닿는다.
      press("Enter", { ctrlKey: true });
      fireEvent.click(colorTrigger("Text color"), { detail: 0 });
      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(editable);

      expect(
        reachesEditor(editable, "Enter", { repeat: true, ctrlKey: true }),
      ).toBe(false);
      fireEvent.keyUp(editable, { key: "Enter" });
    });
  });

  it("바깥 pointerdown은 메뉴를 닫지만 포커스를 옮기지 않는다", () => {
    mountToolbarWithEditor();
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      outside.focus();
      openByMouse("Text color");

      fireEvent.pointerDown(outside);

      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it("키보드로 연 글자색 메뉴가 열린 채 배경색 트리거를 마우스로 누르면 포커스가 편집기로 간다", () => {
    const { editable } = mountToolbarWithEditor();
    openByKeyboard("Text color");
    const focused = document.activeElement;
    expect(
      screen.getByRole("menu", { name: "Text color" }).contains(focused),
    ).toBe(true);

    // 트리거 mousedown은 preventDefault라 포커스가 스와치에 남은 채 메뉴가 바뀐다.
    // 스와치가 언마운트되면 브라우저가 포커스를 `<body>`로 떨어뜨린다.
    fireEvent.click(colorTrigger("Background color"), { detail: 1 });

    expect(
      screen.getByRole("menu", { name: "Background color" }),
    ).not.toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("키보드로 연 메뉴가 열린 채 툴바의 다른 버튼을 누르면 메뉴가 닫히고 포커스가 편집기로 간다", () => {
    const { editable } = mountToolbarWithEditor();
    openByKeyboard("Text color");
    expect(document.activeElement).not.toBe(editable);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Bold" }));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("열린 상태에서 트리거를 누르면 바깥 클릭으로 먼저 닫혔다가 다시 열리지 않는다", () => {
    mountToolbarWithEditor();
    openByMouse("Text color");

    // 실제 마우스 클릭은 pointerdown 뒤에 click이 온다. 트리거가 바깥 클릭
    // 판정에서 제외되지 않으면 pointerdown이 메뉴를 닫고 click이 다시 연다.
    fireEvent.pointerDown(colorTrigger("Text color"));
    fireEvent.click(colorTrigger("Text color"), { detail: 1 });

    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("StaticToolbar 색상 메뉴의 수식 키(Issue #225)", () => {
  /** 가운데(5번째) 스와치로 포커스를 옮겨 둔다. 이동이 가로채이면 반드시 움직이는 자리다. */
  const openAtMiddleSwatch = (label: string) => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByKeyboard(label);
    const middle = swatches(label)[4] as HTMLElement;
    middle.focus();
    return middle;
  };

  it.each([
    ["Alt", "ArrowRight", { altKey: true }],
    ["Alt", "ArrowLeft", { altKey: true }],
    ["Control", "ArrowDown", { ctrlKey: true }],
    ["Control", "ArrowUp", { ctrlKey: true }],
    ["Meta", "Home", { metaKey: true }],
    ["Control", "End", { ctrlKey: true }],
  ])(
    "스와치에서 %s+%s는 포커스를 옮기지 않고 기본 동작을 막지 않는다",
    (_modifier, key, init) => {
      const middle = openAtMiddleSwatch("Text color");

      const notPrevented = fireEvent.keyDown(middle, { key, ...init });

      expect(notPrevented).toBe(true);
      expect(document.activeElement).toBe(middle);
    },
  );

  it("Shift+ArrowRight는 수식 키로 보지 않아 기존대로 다음 스와치로 이동한다", () => {
    const middle = openAtMiddleSwatch("Text color");

    const notPrevented = fireEvent.keyDown(middle, {
      key: "ArrowRight",
      shiftKey: true,
    });

    expect(notPrevented).toBe(false);
    expect(document.activeElement).toBe(swatches("Text color")[5]);
  });

  it.each(TRIGGERS)(
    "%s 메뉴에서 Control+Tab·Alt+Tab은 메뉴를 닫지 않고 기본 동작을 막지 않는다",
    (_name, label) => {
      const middle = openAtMiddleSwatch(label);

      for (const init of [{ ctrlKey: true }, { altKey: true }]) {
        const notPrevented = fireEvent.keyDown(middle, { key: "Tab", ...init });

        expect(notPrevented).toBe(true);
        expect(screen.getByRole("menu", { name: label })).not.toBeNull();
        expect(document.activeElement).toBe(middle);
      }
    },
  );

  it("스와치의 Control+Enter 자동 반복도 기본 동작을 막는다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    openByKeyboard("Text color");

    // Enter 반복 억제가 수식 키 가드보다 앞이다. 가드가 앞서면 반복이
    // 그대로 새어 첫 스와치를 확정한다.
    expect(press("Enter", { repeat: true, ctrlKey: true })).toBe(false);
  });

  it.each([
    ["Control", "ArrowDown", { ctrlKey: true }],
    ["Alt", "ArrowUp", { altKey: true }],
    ["Meta", "ArrowDown", { metaKey: true }],
  ])(
    "색상 트리거에서 %s+%s는 메뉴를 열지 않고 기본 동작을 막지 않는다",
    (_modifier, key, init) => {
      render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

      for (const [, label] of TRIGGERS) {
        const notPrevented = fireEvent.keyDown(colorTrigger(label), {
          key,
          ...init,
        });

        expect(notPrevented).toBe(true);
        expect(screen.queryByRole("menu")).toBeNull();
        expect(colorTrigger(label).getAttribute("aria-expanded")).toBe("false");
      }
    },
  );
});

describe("StaticToolbar 색상 메뉴가 열린 채 mark 적용이 불가능해질 때(Issue #225)", () => {
  /** 첫 문단을 코드 블록으로 바꿔 selection이 있는 채 `isMarkingDisabled`가 되게 한다. */
  const convertToCodeBlock = (
    mounted: ReturnType<typeof mountToolbarWithEditor>,
  ) => {
    act(() => {
      mounted.editor.commands.setBlockType("block-1", { type: "codeBlock" });
    });
    expect(colorTrigger("Text color").getAttribute("aria-disabled")).toBe(
      "true",
    );
  };

  /** 코드 블록을 다시 일반 문단으로 돌려 `isMarkingDisabled`를 푼다. */
  const convertToParagraph = (
    mounted: ReturnType<typeof mountToolbarWithEditor>,
  ) => {
    act(() => {
      mounted.editor.commands.setBlockType("block-1", { type: "paragraph" });
    });
    expect(colorTrigger("Text color").getAttribute("aria-disabled")).toBe(
      "false",
    );
  };

  it.each(TRIGGERS)(
    "마우스로 연 %s 메뉴(포커스 편집기)는 selection이 코드 블록으로 옮겨 가면 닫히고 포커스는 편집기에 남는다",
    (_name, label) => {
      const mounted = mountToolbarWithEditor();
      mounted.editable.focus();
      openByMouse(label);
      expect(screen.getByRole("menu", { name: label })).not.toBeNull();

      convertToCodeBlock(mounted);

      expect(screen.queryByRole("menu")).toBeNull();
      expect(colorTrigger(label).getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(mounted.editable);
    },
  );

  it.each(TRIGGERS)(
    "키보드로 연 %s 메뉴(포커스 스와치)는 mark 적용이 불가능해지면 닫히고 포커스가 편집기로 간다",
    (_name, label) => {
      const mounted = mountToolbarWithEditor();
      openByKeyboard(label);
      expect(document.activeElement).toBe(swatches(label)[0]);

      convertToCodeBlock(mounted);

      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(mounted.editable);
    },
  );

  it.each([
    ["마우스", openByMouse],
    ["키보드", openByKeyboard],
  ])(
    "%s로 연 메뉴는 선택이 다시 일반 문단으로 돌아와도 되살아나지 않는다",
    (_how, open) => {
      const mounted = mountToolbarWithEditor();
      open("Text color");
      convertToCodeBlock(mounted);
      expect(screen.queryByRole("menu")).toBeNull();

      convertToParagraph(mounted);

      expect(screen.queryByRole("menu")).toBeNull();
      expect(colorTrigger("Text color").getAttribute("aria-expanded")).toBe(
        "false",
      );
    },
  );

  it("포커스가 메뉴·편집기 밖의 다른 요소에 있으면 메뉴만 닫고 포커스를 옮기지 않는다", () => {
    const mounted = mountToolbarWithEditor();
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      openByMouse("Text color");
      outside.focus();

      convertToCodeBlock(mounted);

      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it("mark 적용이 가능한 상태가 유지되면 열린 메뉴와 스와치 포커스를 건드리지 않는다", () => {
    const mounted = mountToolbarWithEditor();
    openByKeyboard("Text color");
    const swatch = document.activeElement;

    act(() => {
      mounted.editor.commands.setBlockType("block-1", {
        type: "heading",
        level: 1,
      });
    });

    expect(screen.getByRole("menu", { name: "Text color" })).not.toBeNull();
    expect(document.activeElement).toBe(swatch);
  });
});
