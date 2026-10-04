// @vitest-environment jsdom

/**
 * handlePopupButtonKeyDown: 팝업 루트에 위임해 팝업 안 `<button>`의 Enter
 * 반복을 막는 계약을 고정한다(Issue #248).
 *
 * 팝업 루트·버튼·입력창을 실제 DOM으로 만들고, 루트에 달린 React 핸들러가
 * 받는 모양(`target`은 버튼, `currentTarget`은 루트)의 가짜 합성 이벤트를
 * 넘긴다. 반복 억제는 문서 capture 리스너라 실제 KeyboardEvent를 문서에
 * 보내 관찰한다. DOM과 문서 리스너는 `afterEach`에서 정리한다(G-TST-003).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type PopupKeyboardEvent,
  handlePopupButtonKeyDown,
} from "../src/popup-button-keydown.js";
import {
  dispatchKeydown,
  isRepeatEnterSwallowed,
  releaseEnterRepeatSuppression,
  trackCaptureListeners,
} from "./menu-keyboard-test-support.js";

type KeyInit = {
  key: string;
  repeat?: boolean;
  isComposing?: boolean;
  ctrlKey?: boolean;
};

type Fixture = {
  root: HTMLElement;
  button: HTMLButtonElement;
  icon: SVGElement;
  input: HTMLInputElement;
};

let fixture: Fixture;

beforeEach(() => {
  const root = document.createElement("div");
  root.setAttribute("role", "toolbar");
  const button = document.createElement("button");
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  button.append(icon);
  const input = document.createElement("input");
  root.append(button, input);
  document.body.append(root);
  fixture = { root, button, icon, input };
});

afterEach(() => {
  releaseEnterRepeatSuppression();
  fixture.root.remove();
  vi.restoreAllMocks();
});

/** `target`에서 난 keydown이 루트 핸들러에 닿은 모양의 가짜 이벤트. */
const createEvent = (target: EventTarget, init: KeyInit) => {
  let defaultPrevented = false;
  const event: PopupKeyboardEvent = {
    key: init.key,
    repeat: init.repeat ?? false,
    ctrlKey: init.ctrlKey ?? false,
    altKey: false,
    metaKey: false,
    isComposing: init.isComposing ?? false,
    preventDefault: () => {
      defaultPrevented = true;
    },
    target,
    currentTarget: fixture.root,
  };
  return { event, wasPrevented: () => defaultPrevented };
};

describe("handlePopupButtonKeyDown", () => {
  it("버튼 target의 반복 Enter는 막고 true를 돌려준다", () => {
    const { event, wasPrevented } = createEvent(fixture.button, {
      key: "Enter",
      repeat: true,
    });

    expect(handlePopupButtonKeyDown(event)).toBe(true);
    expect(wasPrevented()).toBe(true);
  });

  it("버튼 target의 첫 Enter는 막지 않고 true를 돌려주며 문서 capture 억제를 건다", () => {
    const { event, wasPrevented } = createEvent(fixture.button, {
      key: "Enter",
    });

    expect(handlePopupButtonKeyDown(event)).toBe(true);
    expect(wasPrevented()).toBe(false);
    expect(isRepeatEnterSwallowed()).toBe(true);
  });

  it("억제가 걸린 뒤 문서에 닿은 반복 Enter는 삼켜지고 Enter keyup에서 풀린다", () => {
    handlePopupButtonKeyDown(
      createEvent(fixture.button, { key: "Enter" }).event,
    );

    const swallowed = dispatchKeydown({ key: "Enter", repeat: true });
    expect(swallowed).toEqual({ reachedTarget: false, defaultPrevented: true });

    releaseEnterRepeatSuppression();

    expect(dispatchKeydown({ key: "Enter", repeat: true })).toEqual({
      reachedTarget: true,
      defaultPrevented: false,
    });
  });

  it("억제가 걸린 뒤 반복이 아닌 keydown이 오면 풀리고 그 keydown은 통과한다", () => {
    handlePopupButtonKeyDown(
      createEvent(fixture.button, { key: "Enter" }).event,
    );

    expect(dispatchKeydown({ key: "a" })).toEqual({
      reachedTarget: true,
      defaultPrevented: false,
    });
    expect(isRepeatEnterSwallowed()).toBe(false);
  });

  it("Ctrl+Enter 반복도 막는다", () => {
    const { event, wasPrevented } = createEvent(fixture.button, {
      key: "Enter",
      repeat: true,
      ctrlKey: true,
    });

    expect(handlePopupButtonKeyDown(event)).toBe(true);
    expect(wasPrevented()).toBe(true);
  });

  it("IME 조합 중 Enter는 false를 돌려주고 막지 않으며 억제도 걸지 않는다", () => {
    const { event, wasPrevented } = createEvent(fixture.button, {
      key: "Enter",
      isComposing: true,
    });

    expect(handlePopupButtonKeyDown(event)).toBe(false);
    expect(wasPrevented()).toBe(false);
    expect(isRepeatEnterSwallowed()).toBe(false);
  });

  it("input target의 Enter는 false를 돌려주고 건드리지 않는다", () => {
    for (const repeat of [false, true]) {
      const { event, wasPrevented } = createEvent(fixture.input, {
        key: "Enter",
        repeat,
      });

      expect(handlePopupButtonKeyDown(event)).toBe(false);
      expect(wasPrevented()).toBe(false);
    }
    expect(isRepeatEnterSwallowed()).toBe(false);
  });

  it("루트 자신이 target인 Enter는 건드리지 않는다", () => {
    const { event, wasPrevented } = createEvent(fixture.root, {
      key: "Enter",
      repeat: true,
    });

    expect(handlePopupButtonKeyDown(event)).toBe(false);
    expect(wasPrevented()).toBe(false);
  });

  for (const key of ["Escape", "Tab", "ArrowDown"]) {
    it(`버튼 target의 ${key}는 false를 돌려주고 막지 않는다`, () => {
      const { event, wasPrevented } = createEvent(fixture.button, { key });

      expect(handlePopupButtonKeyDown(event)).toBe(false);
      expect(wasPrevented()).toBe(false);
    });
  }

  it("버튼 안 자식 요소(svg) target의 Enter는 버튼으로 본다", () => {
    const { event, wasPrevented } = createEvent(fixture.icon, {
      key: "Enter",
      repeat: true,
    });

    expect(handlePopupButtonKeyDown(event)).toBe(true);
    expect(wasPrevented()).toBe(true);
  });

  it("같은 keydown을 두 번 불러도 억제는 keydown·keyup 한 쌍만 건다", () => {
    const liveCount = trackCaptureListeners();

    handlePopupButtonKeyDown(
      createEvent(fixture.button, { key: "Enter" }).event,
    );
    handlePopupButtonKeyDown(
      createEvent(fixture.button, { key: "Enter" }).event,
    );

    expect(liveCount()).toBe(2);
    releaseEnterRepeatSuppression();
    expect(liveCount()).toBe(0);
  });
});
