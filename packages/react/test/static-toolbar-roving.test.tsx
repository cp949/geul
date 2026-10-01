// @vitest-environment jsdom

/**
 * StaticToolbar의 roving tabindex와 키보드 이동을 확인한다
 * (RD-003-DELTA-03, Issue #218 결함 6, spec §5).
 * - Tab 정지점은 1개이고 포커스가 가는 컨트롤을 따라간다.
 * - ArrowLeft/ArrowRight는 순환, Home/End는 처음·끝으로 이동한다.
 * - `aria-disabled` 컨트롤도 순서에 들어간다.
 * - Escape는 편집기로 포커스를 돌린다.
 * 실제 Tab 키가 정지점 하나만 거치는지는 브라우저만 증명하므로
 * e2e(showcase-static-toolbar-keyboard.spec.ts)가 소유한다.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaticToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { mountBlockEditor, placeCaret } from "./mount-editor.js";
import {
  fakeStaticToolbarController,
  press,
} from "./static-toolbar-test-support.js";

afterEach(cleanup);

/** 툴바 직계 컨트롤을 화면 순서대로 돌려준다. */
const controls = () =>
  Array.from(
    screen.getByRole("toolbar", { name: "Toolbar" }).children,
  ) as HTMLButtonElement[];

/** 컨트롤을 accessible name으로 찾는다. */
const control = (name: string) => screen.getByRole("button", { name });

/** 대상 블록이 없는(`blockSelection === null`) fake controller를 만든다. */
const noTargetController = () =>
  fakeStaticToolbarController(
    undefined,
    vi.fn(() => null),
  );

describe("StaticToolbar roving tabindex", () => {
  it("Tab 정지점은 첫 컨트롤 하나뿐이다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

    const items = controls();
    expect(items.length).toBe(17);
    expect(items.filter((item) => item.tabIndex === 0)).toEqual([items[0]]);
    expect(items.slice(1).every((item) => item.tabIndex === -1)).toBe(true);
  });

  it("대상 블록이 없어도 정지점은 하나다", () => {
    render(withProvider(noTargetController(), <StaticToolbar />));

    expect(controls().filter((item) => item.tabIndex === 0).length).toBe(1);
  });

  it("컨트롤에 포커스가 가면 정지점이 그 컨트롤로 옮겨진다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

    // 포커스 이벤트가 낳는 상태 갱신을 act로 flush한다.
    act(() => control("Italic").focus());

    const items = controls();
    expect(items.filter((item) => item.tabIndex === 0)).toEqual([
      control("Italic"),
    ]);
  });

  it("ArrowRight는 다음 컨트롤로, ArrowLeft는 이전 컨트롤로 포커스를 옮긴다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    const items = controls();
    items[0]?.focus();

    press("ArrowRight");
    expect(document.activeElement).toBe(items[1]);
    press("ArrowRight");
    expect(document.activeElement).toBe(items[2]);
    press("ArrowLeft");
    expect(document.activeElement).toBe(items[1]);
  });

  it("마지막에서 ArrowRight는 처음으로, 처음에서 ArrowLeft는 마지막으로 순환한다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    const items = controls();
    const first = items[0];
    const last = items[items.length - 1];
    last?.focus();

    press("ArrowRight");
    expect(document.activeElement).toBe(first);
    press("ArrowLeft");
    expect(document.activeElement).toBe(last);
  });

  it("Home은 처음 컨트롤로, End는 마지막 컨트롤로 이동한다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    const items = controls();
    control("Strikethrough").focus();

    press("End");
    expect(document.activeElement).toBe(items[items.length - 1]);
    press("Home");
    expect(document.activeElement).toBe(items[0]);
  });

  it("이동한 뒤에도 정지점은 하나이고 포커스된 컨트롤이다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    controls()[0]?.focus();

    press("ArrowRight");
    press("ArrowRight");

    const stops = controls().filter((item) => item.tabIndex === 0);
    expect(stops).toEqual([document.activeElement]);
  });

  it("aria-disabled 컨트롤도 이동 순서에 들어가 포커스를 받는다", () => {
    render(withProvider(noTargetController(), <StaticToolbar />));
    control("Block type").focus();

    press("ArrowRight");

    expect(document.activeElement).toBe(control("Quote"));
    expect(control("Quote").getAttribute("aria-disabled")).toBe("true");
  });

  it("ArrowUp·ArrowDown은 툴바 컨트롤 사이를 이동하지 않는다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    control("Quote").focus();

    press("ArrowUp");
    press("ArrowDown");

    expect(document.activeElement).toBe(control("Quote"));
  });

  it("수식 키를 함께 누르면 이동하지 않는다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));
    control("Quote").focus();

    for (const init of [
      { shiftKey: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
    ]) {
      press("ArrowRight", init);
      press("Home", init);
    }

    expect(document.activeElement).toBe(control("Quote"));
  });

  it("비활성 컨트롤은 네이티브 disabled가 없고 focus()를 받는다", () => {
    render(withProvider(noTargetController(), <StaticToolbar />));

    for (const item of controls()) {
      item.focus();
      expect(item.disabled).toBe(false);
      expect(document.activeElement).toBe(item);
    }
  });

  it("component override 경로는 roving을 적용하지 않는다", () => {
    render(
      withProvider(
        fakeStaticToolbarController(),
        <StaticToolbar
          component={() => <button type="button">custom</button>}
        />,
      ),
    );

    const custom = screen.getByRole("button", { name: "custom" });
    expect(custom.tabIndex).toBe(0);
    custom.focus();
    fireEvent.keyDown(custom, { key: "ArrowRight" });
    expect(document.activeElement).toBe(custom);
  });
});

describe("StaticToolbar 툴바 Escape", () => {
  /** 실제 편집기와 StaticToolbar를 마운트하고 첫 문단에 캐럿을 놓는다. */
  const mountWithEditor = () => {
    const mounted = mountBlockEditor({
      blockIds: ["block-1"],
      children: <StaticToolbar />,
    });
    const paragraph =
      mounted.blocks[0]?.querySelector("p") ?? mounted.blocks[0];
    if (paragraph === undefined) throw new Error("문단을 찾지 못했다");
    placeCaret(paragraph);
    return mounted;
  };

  it("툴바 컨트롤에서 Escape를 누르면 편집기가 포커스를 받는다", () => {
    const { editable } = mountWithEditor();
    control("Bold").focus();
    expect(document.activeElement).not.toBe(editable);

    press("Escape");

    expect(document.activeElement).toBe(editable);
  });

  it("비활성 컨트롤에서도 Escape는 편집기로 포커스를 돌린다", () => {
    const { editable } = mountWithEditor();
    control("Quote").focus();

    press("Escape");

    expect(document.activeElement).toBe(editable);
  });
});
