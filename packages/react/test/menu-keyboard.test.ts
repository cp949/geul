// @vitest-environment jsdom

/**
 * handleMenuKeyDown: 메뉴·트리거·입력창 keydown의 처리 순서 계약을 고정한다
 * (Issue #230). 순서는 IME → Escape → Enter 반복 → 수식 키 → Tab·화살표
 * 처리다. 순서 계약 describe의 번호 1~13은 이 파일 안의 케이스 번호다.
 * module 머리 주석의 순서 목록 번호와 별개다.
 *
 * 입력은 keydown 최소 구조의 가짜 이벤트로 만든다. 순서 계약은 키 필드와
 * 콜백 호출만 본다. 반복 억제는 문서 capture 리스너라 실제 KeyboardEvent를
 * 문서에 보내 관찰한다. React 합성 이벤트 모양(nativeEvent.isComposing)도
 * 한 건 둔다.
 *
 * 중복 설치 방지는 이벤트 동작으로는 구별되지 않는다. 두 번 설치해도 keyup
 * 한 번에 둘 다 풀리기 때문이다. 문서에 남은 capture 리스너 수로 증명한다.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type MenuKeyboardEvent,
  handleMenuKeyDown,
} from "../src/menu-keyboard.js";
import { COMMAND_MODIFIERS } from "./command-modifiers-test-support.js";
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
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
};

/** 수식 키 없음과 Ctrl·Alt·Meta 각각을 이름과 함께 돌려주는 케이스 목록. */
const MODIFIER_CASES: ReadonlyArray<{ name: string; init: Partial<KeyInit> }> =
  [{ name: "수식 키 없음", init: {} }, ...COMMAND_MODIFIERS];

/**
 * keydown 최소 구조의 가짜 이벤트와 `preventDefault` 호출 여부를 만든다.
 * `currentTarget`은 문서 안 노드다. 반복 억제가 이 노드의 문서에 건다.
 */
const createKeyEvent = (init: KeyInit) => {
  let defaultPrevented = false;
  const event: MenuKeyboardEvent = {
    key: init.key,
    repeat: init.repeat ?? false,
    ctrlKey: init.ctrlKey ?? false,
    altKey: init.altKey ?? false,
    metaKey: init.metaKey ?? false,
    isComposing: init.isComposing ?? false,
    preventDefault: () => {
      defaultPrevented = true;
    },
    currentTarget: document.body,
  };
  return { event, wasPrevented: () => defaultPrevented };
};

/** 모든 콜백을 spy로 채운 handlers. `navigate`는 기본으로 `false`를 돌려준다. */
const createHandlers = (navigateResult = false) => ({
  activate: vi.fn(),
  navigate: vi.fn<(key: string) => boolean>(() => navigateResult),
  escape: vi.fn(),
  tab: vi.fn(),
});

afterEach(() => {
  releaseEnterRepeatSuppression();
  vi.restoreAllMocks();
});

describe("handleMenuKeyDown 순서 계약", () => {
  describe("1. IME 조합 중", () => {
    for (const key of ["Escape", "Enter", "ArrowDown", "Tab"]) {
      it(`${key}는 false를 돌려주고 막지 않으며 콜백과 반복 억제를 건너뛴다`, () => {
        const handlers = createHandlers(true);
        const { event, wasPrevented } = createKeyEvent({
          key,
          isComposing: true,
        });

        const consumed = handleMenuKeyDown(event, handlers);

        expect(consumed).toBe(false);
        expect(wasPrevented()).toBe(false);
        expect(handlers.activate).not.toHaveBeenCalled();
        expect(handlers.navigate).not.toHaveBeenCalled();
        expect(handlers.escape).not.toHaveBeenCalled();
        expect(handlers.tab).not.toHaveBeenCalled();
        expect(isRepeatEnterSwallowed()).toBe(false);
      });
    }

    it("React 합성 이벤트 모양은 nativeEvent.isComposing으로 판정한다", () => {
      const handlers = createHandlers();
      let prevented = false;
      const syntheticEvent: MenuKeyboardEvent = {
        key: "Enter",
        repeat: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        nativeEvent: { isComposing: true },
        preventDefault: () => {
          prevented = true;
        },
        currentTarget: document.body,
      };

      const consumed = handleMenuKeyDown(syntheticEvent, handlers);

      expect(consumed).toBe(false);
      expect(prevented).toBe(false);
      expect(handlers.activate).not.toHaveBeenCalled();
    });
  });

  describe("2. Escape + escape 있음", () => {
    for (const { name, init } of MODIFIER_CASES) {
      it(`${name}: true를 돌려주고 막으며 escape를 1회 부른다`, () => {
        const handlers = createHandlers();
        const { event, wasPrevented } = createKeyEvent({
          key: "Escape",
          ...init,
        });

        const consumed = handleMenuKeyDown(event, handlers);

        expect(consumed).toBe(true);
        expect(wasPrevented()).toBe(true);
        expect(handlers.escape).toHaveBeenCalledTimes(1);
      });
    }
  });

  describe("3. Escape + escape 없음", () => {
    it("false를 돌려주고 막지 않으며 navigate를 부르지 않는다", () => {
      const handlers = createHandlers(true);
      const { event, wasPrevented } = createKeyEvent({ key: "Escape" });

      const consumed = handleMenuKeyDown(event, {
        navigate: handlers.navigate,
        tab: handlers.tab,
        activate: handlers.activate,
      });

      expect(consumed).toBe(false);
      expect(wasPrevented()).toBe(false);
      expect(handlers.navigate).not.toHaveBeenCalled();
    });
  });

  describe("4. Enter + repeat", () => {
    for (const { name, init } of MODIFIER_CASES) {
      it(`${name}: true를 돌려주고 막으며 activate를 부르지 않는다`, () => {
        const handlers = createHandlers();
        const { event, wasPrevented } = createKeyEvent({
          key: "Enter",
          repeat: true,
          ...init,
        });

        const consumed = handleMenuKeyDown(event, handlers);

        expect(consumed).toBe(true);
        expect(wasPrevented()).toBe(true);
        expect(handlers.activate).not.toHaveBeenCalled();
      });
    }

    it("activate가 없어도 반복 Enter는 막는다", () => {
      const { event, wasPrevented } = createKeyEvent({
        key: "Enter",
        repeat: true,
      });

      expect(handleMenuKeyDown(event, {})).toBe(true);
      expect(wasPrevented()).toBe(true);
    });
  });

  describe("5. 처음 Enter + activate 없음", () => {
    for (const { name, init } of MODIFIER_CASES) {
      it(`${name}: true를 돌려주고 막지 않으며 반복 억제를 건다`, () => {
        const { event, wasPrevented } = createKeyEvent({
          key: "Enter",
          ...init,
        });

        const consumed = handleMenuKeyDown(event, {});

        expect(consumed).toBe(true);
        expect(wasPrevented()).toBe(false);
        expect(isRepeatEnterSwallowed()).toBe(true);
      });
    }
  });

  describe("6. 처음 Enter + activate 있음 + 수식 키 없음", () => {
    it("true를 돌려주고 막으며 반복 억제를 걸고 activate를 1회 부른다", () => {
      const handlers = createHandlers();
      const { event, wasPrevented } = createKeyEvent({ key: "Enter" });

      const consumed = handleMenuKeyDown(event, handlers);

      expect(consumed).toBe(true);
      expect(wasPrevented()).toBe(true);
      expect(handlers.activate).toHaveBeenCalledTimes(1);
      expect(isRepeatEnterSwallowed()).toBe(true);
    });
  });

  describe("7. 처음 Enter + activate 있음 + 수식 키", () => {
    for (const { name, init } of COMMAND_MODIFIERS) {
      it(`${name}: false를 돌려주고 막지 않으며 activate를 부르지 않는다`, () => {
        const handlers = createHandlers();
        const { event, wasPrevented } = createKeyEvent({
          key: "Enter",
          ...init,
        });

        const consumed = handleMenuKeyDown(event, handlers);

        expect(consumed).toBe(false);
        expect(wasPrevented()).toBe(false);
        expect(handlers.activate).not.toHaveBeenCalled();
      });
    }
  });

  describe("8. 그 밖 키 + 수식 키", () => {
    for (const { name, init } of COMMAND_MODIFIERS) {
      for (const key of ["ArrowDown", "Tab", "a"]) {
        it(`${name} + ${key}: false를 돌려주고 막지 않으며 tab·navigate를 부르지 않는다`, () => {
          const handlers = createHandlers(true);
          const { event, wasPrevented } = createKeyEvent({ key, ...init });

          const consumed = handleMenuKeyDown(event, handlers);

          expect(consumed).toBe(false);
          expect(wasPrevented()).toBe(false);
          expect(handlers.tab).not.toHaveBeenCalled();
          expect(handlers.navigate).not.toHaveBeenCalled();
        });
      }
    }
  });

  describe("9. Shift + 화살표", () => {
    it("Shift는 수식 키가 아니므로 navigate가 호출되고 결과를 따른다", () => {
      const handlers = createHandlers(true);
      const { event, wasPrevented } = createKeyEvent({
        key: "ArrowDown",
        shiftKey: true,
      });

      const consumed = handleMenuKeyDown(event, handlers);

      expect(handlers.navigate).toHaveBeenCalledTimes(1);
      expect(handlers.navigate).toHaveBeenCalledWith("ArrowDown");
      expect(consumed).toBe(true);
      expect(wasPrevented()).toBe(true);
    });

    it("navigate가 false를 돌려주면 false다", () => {
      const handlers = createHandlers(false);
      const { event, wasPrevented } = createKeyEvent({
        key: "ArrowDown",
        shiftKey: true,
      });

      expect(handleMenuKeyDown(event, handlers)).toBe(false);
      expect(handlers.navigate).toHaveBeenCalledWith("ArrowDown");
      expect(wasPrevented()).toBe(false);
    });
  });

  describe("10. Tab + tab 있음", () => {
    it("true를 돌려주고 막으며 tab을 1회 부른다", () => {
      const handlers = createHandlers();
      const { event, wasPrevented } = createKeyEvent({ key: "Tab" });

      const consumed = handleMenuKeyDown(event, handlers);

      expect(consumed).toBe(true);
      expect(wasPrevented()).toBe(true);
      expect(handlers.tab).toHaveBeenCalledTimes(1);
    });

    it("Shift + Tab도 같다(메뉴에서 Shift+Tab은 닫기 키다)", () => {
      const handlers = createHandlers();
      const { event, wasPrevented } = createKeyEvent({
        key: "Tab",
        shiftKey: true,
      });

      expect(handleMenuKeyDown(event, handlers)).toBe(true);
      expect(wasPrevented()).toBe(true);
      expect(handlers.tab).toHaveBeenCalledTimes(1);
    });
  });

  describe("11. Tab + tab 없음", () => {
    it("false를 돌려주고 막지 않는다", () => {
      const { event, wasPrevented } = createKeyEvent({ key: "Tab" });

      expect(handleMenuKeyDown(event, {})).toBe(false);
      expect(wasPrevented()).toBe(false);
    });
  });

  describe("12. navigate가 true", () => {
    it("true를 돌려주고 막는다", () => {
      const handlers = createHandlers(true);
      const { event, wasPrevented } = createKeyEvent({ key: "ArrowUp" });

      const consumed = handleMenuKeyDown(event, handlers);

      expect(consumed).toBe(true);
      expect(wasPrevented()).toBe(true);
      expect(handlers.navigate).toHaveBeenCalledWith("ArrowUp");
    });
  });

  describe("13. navigate가 false이거나 없음", () => {
    it("navigate가 false이면 false를 돌려주고 막지 않는다", () => {
      const handlers = createHandlers(false);
      const { event, wasPrevented } = createKeyEvent({ key: "ArrowUp" });

      expect(handleMenuKeyDown(event, handlers)).toBe(false);
      expect(wasPrevented()).toBe(false);
      expect(handlers.navigate).toHaveBeenCalledTimes(1);
    });

    it("navigate가 없으면 false를 돌려주고 막지 않는다", () => {
      const { event, wasPrevented } = createKeyEvent({ key: "ArrowUp" });

      expect(handleMenuKeyDown(event, {})).toBe(false);
      expect(wasPrevented()).toBe(false);
    });
  });
});

describe("handleMenuKeyDown 반복 억제", () => {
  it("처음 Enter 뒤의 반복 Enter를 문서 capture에서 삼킨다", () => {
    handleMenuKeyDown(createKeyEvent({ key: "Enter" }).event, {});

    const result = dispatchKeydown({ key: "Enter", repeat: true });

    expect(result.reachedTarget).toBe(false);
    expect(result.defaultPrevented).toBe(true);
  });

  it("Enter keyup이 오면 풀린다", () => {
    handleMenuKeyDown(createKeyEvent({ key: "Enter" }).event, {});

    releaseEnterRepeatSuppression();

    expect(dispatchKeydown({ key: "Enter", repeat: true })).toEqual({
      reachedTarget: true,
      defaultPrevented: false,
    });
  });

  it("Enter가 아닌 keyup은 풀지 않는다", () => {
    handleMenuKeyDown(createKeyEvent({ key: "Enter" }).event, {});

    document.dispatchEvent(
      new KeyboardEvent("keyup", { key: "a", bubbles: true }),
    );

    expect(isRepeatEnterSwallowed()).toBe(true);
  });

  it("반복이 아닌 keydown이 오면 풀리고 그 keydown은 통과한다", () => {
    handleMenuKeyDown(createKeyEvent({ key: "Enter" }).event, {});

    const fresh = dispatchKeydown({ key: "a" });

    expect(fresh).toEqual({ reachedTarget: true, defaultPrevented: false });
    expect(isRepeatEnterSwallowed()).toBe(false);
  });

  it("반복이 아닌 Enter keydown도 통과시키고 푼다", () => {
    handleMenuKeyDown(createKeyEvent({ key: "Enter" }).event, {});

    const fresh = dispatchKeydown({ key: "Enter" });

    expect(fresh).toEqual({ reachedTarget: true, defaultPrevented: false });
    expect(isRepeatEnterSwallowed()).toBe(false);
  });

  it("반복이 아닌 keydown이 풀기 전에는 반복 Enter를 여러 번 삼킨다", () => {
    handleMenuKeyDown(createKeyEvent({ key: "Enter" }).event, {});

    expect(isRepeatEnterSwallowed()).toBe(true);
    expect(isRepeatEnterSwallowed()).toBe(true);
    expect(isRepeatEnterSwallowed()).toBe(true);
  });

  describe("같은 문서에 중복 설치하지 않는다", () => {
    it("두 번 불러도 리스너는 keydown·keyup 한 쌍뿐이다", () => {
      const liveCount = trackCaptureListeners();

      handleMenuKeyDown(createKeyEvent({ key: "Enter" }).event, {});
      handleMenuKeyDown(createKeyEvent({ key: "Enter" }).event, {});

      expect(liveCount()).toBe(2);
    });

    it("두 번 불러도 keyup 1회로 모두 풀린다", () => {
      const liveCount = trackCaptureListeners();
      handleMenuKeyDown(createKeyEvent({ key: "Enter" }).event, {});
      handleMenuKeyDown(createKeyEvent({ key: "Enter" }).event, {});

      releaseEnterRepeatSuppression();

      expect(liveCount()).toBe(0);
      expect(isRepeatEnterSwallowed()).toBe(false);
    });

    it("activate 경로에서 두 번 불러도 같다", () => {
      const liveCount = trackCaptureListeners();
      const handlers = createHandlers();
      handleMenuKeyDown(createKeyEvent({ key: "Enter" }).event, handlers);
      handleMenuKeyDown(createKeyEvent({ key: "Enter" }).event, handlers);

      expect(liveCount()).toBe(2);
      releaseEnterRepeatSuppression();
      expect(liveCount()).toBe(0);
    });
  });
});
