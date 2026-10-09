/**
 * `CreateEditorOptions.keyboardShortcuts`가 undo·redo 폴백(history-keydown-
 * fallback) 경로에서도 내장 동작보다 먼저 실행되는지 검증한다(Issue #319,
 * spec §5 EXT-005, G-EDT-004).
 *
 * - 툴바 버튼처럼 `view.dom` 밖에 포커스가 있어도 등록 handler가 먼저 호출된다.
 * - handler가 `true`를 반환하면 내장 undo·redo를 건너뛴다.
 * - handler가 `false`를 반환하면 내장 undo·redo가 이어진다.
 * - 호출 대상은 폴백이 undo·redo로 판정한 세 키(`Mod-z`·`Mod-Shift-z`·
 *   `Mod-y`)뿐이다.
 * - 폴백의 가로채기 조건(읽기 전용·조합 입력·입력 컨트롤·selection 위치)을
 *   통과하지 못한 keydown에서는 호출되지 않는다.
 *
 * 편집기 안 keydown은 기존 keymap 경로(#307)다. 같은 표에 넣어 두 포커스
 * 위치의 결과가 같음을 함께 고정한다. 브라우저가 keydown을 어디로 보내는지는
 * jsdom이 증명하지 못한다 — e2e/toolbar-focus-redo.spec.ts와
 * e2e/showcase-static-toolbar-focus.spec.ts가 내장 경로를 지킨다(ADR-0007).
 */
import { Editor } from "@tiptap/core";
import { closeHistory, redoDepth, undoDepth } from "@tiptap/pm/history";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CustomKeyboardShortcutsExtension,
  getCustomKeyboardShortcutsStorage,
} from "../src/custom-keyboard-shortcuts-extension.js";
import { HistoryKeydownFallbackExtension } from "../src/history-keydown-fallback-extension.js";
import { contentTextStart, typeNativeText } from "./block-test-support.js";
import {
  documentOf,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";
import {
  placeDomSelectionInFirstParagraph,
  runCleanups,
  withoutScrollCrash,
} from "./native-selection-test-support.js";

const BASE_TEXT = "abc";
const FIRST_TEXT = "X";
const SECOND_TEXT = "Y";

/** 문서 상태별 본문이다. undo 한 번은 `abc`, redo 한 번은 `abcXY`가 된다. */
const AFTER_SETUP = BASE_TEXT + FIRST_TEXT;
const AFTER_UNDO = BASE_TEXT;
const AFTER_REDO = BASE_TEXT + FIRST_TEXT + SECOND_TEXT;

type Handler = (editor: unknown) => boolean;
type MountOptions = Parameters<typeof mounted>[1];

/** 시나리오가 돌려주는 마운트 편집기 한 개의 핸들이다. */
type Scenario = {
  tiptap: ReturnType<typeof mounted>["tiptap"];
  editable: HTMLElement;
  /** `view.dom` 밖에 붙은 평범한 버튼. 툴바 컨트롤을 대신한다. */
  button: HTMLButtonElement;
};

/** 겹침 경고 출력을 막는다. 등록 키가 내장 undo·redo 키와 겹치기 때문이다. */
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** KeyboardEvent를 만든다. */
const keydown = (init: KeyboardEventInit): KeyboardEvent =>
  new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

/**
 * undo 스택 1개와 redo 스택 1개를 가진 마운트 편집기를 만든다.
 * - 설정 직후 본문은 `abcX`다. undo 키는 `abc`로, redo 키는 `abcXY`로 간다.
 * - closeHistory로 두 입력을 별도 history 이벤트로 가른다.
 * DOM에는 설정 뒤에 붙인다. 문서를 바꾸는 transaction이 붙은 뷰에서
 * scrollToSelection을 실행하면 jsdom에 없는 geometry API를 부르기 때문이다.
 */
const mountHistoryEditor = (blockId: string, options: MountOptions = {}) => {
  const mount = mounted(
    documentOf(paragraphBlock(blockId, BASE_TEXT)),
    options,
  );
  const container = mount.editable.parentElement;
  if (container === null) throw new Error("편집기 컨테이너 조회 실패");
  const { tiptap } = mount;
  tiptap.commands.setTextSelection(
    contentTextStart(tiptap, blockId) + BASE_TEXT.length,
  );
  typeNativeText(tiptap, FIRST_TEXT);
  tiptap.view.dispatch(closeHistory(tiptap.state.tr));
  typeNativeText(tiptap, SECOND_TEXT);
  expect(mount.editor.commands.undo().ok).toBe(true);
  expect(tiptap.state.doc.textContent).toBe(AFTER_SETUP);
  expect(undoDepth(tiptap.state)).toBe(1);
  expect(redoDepth(tiptap.state)).toBe(1);
  document.body.append(container);
  return { ...mount, container };
};

/** 편집기 첫 문단 텍스트 끝에 DOM selection을 둔다. */
const placeDomSelectionIn = (editable: HTMLElement): void =>
  placeDomSelectionInFirstParagraph(editable, BASE_TEXT.length);

/**
 * 시나리오를 만들고 fn을 실행한 뒤 DOM과 selection과 Editor를 항상 정리한다
 * (G-TST-003). 정리 대상 하나의 실패가 나머지 정리를 막지 않는다.
 */
const withScenario = (
  options: MountOptions,
  fn: (scenario: Scenario) => void,
): void => {
  const mount = mountHistoryEditor("block", options);
  const button = document.createElement("button");
  document.body.append(button);
  try {
    placeDomSelectionIn(mount.editable);
    withoutScrollCrash(mount.tiptap, () =>
      fn({ tiptap: mount.tiptap, editable: mount.editable, button }),
    );
  } finally {
    runCleanups(
      [
        () => document.getSelection()?.removeAllRanges(),
        () => button.remove(),
        () => mount.container.remove(),
        () => mount.editor.destroy(),
      ],
      "keyboardShortcuts 폴백 시나리오 정리 실패",
    );
  }
};

/** `keyboardShortcuts` 한 개만 등록한 시나리오를 만든다. */
const withShortcut = (
  registeredKey: string,
  handler: Handler,
  fn: (scenario: Scenario) => void,
): void =>
  withScenario({ keyboardShortcuts: { [registeredKey]: handler } }, fn);

/** `target`에서 keydown을 보내고 이벤트를 돌려준다. */
const press = (target: EventTarget, init: KeyboardEventInit): KeyboardEvent => {
  const event = keydown(init);
  target.dispatchEvent(event);
  return event;
};

/**
 * 폴백이 undo·redo로 판정하는 키다. `registeredKey`는 소비자 등록 표기다.
 * - `Mod-Shift-z`와 `Shift-Mod-z`는 같은 키의 표기 변형이다.
 * - `settled`는 handler 개입이 없을 때 내장이 만드는 본문이다.
 */
const HISTORY_KEYS = [
  {
    label: "Mod-z(undo)",
    registeredKey: "Mod-z",
    init: { key: "z", ctrlKey: true },
    settled: AFTER_UNDO,
  },
  {
    label: "Mod-Shift-z(redo)",
    registeredKey: "Mod-Shift-z",
    init: { key: "z", ctrlKey: true, shiftKey: true },
    settled: AFTER_REDO,
  },
  {
    label: "Shift-Mod-z 표기(redo)",
    registeredKey: "Shift-Mod-z",
    init: { key: "z", ctrlKey: true, shiftKey: true },
    settled: AFTER_REDO,
  },
  {
    label: "Mod-y(redo)",
    registeredKey: "Mod-y",
    init: { key: "y", ctrlKey: true },
    settled: AFTER_REDO,
  },
] as const;

const FOCUS_PLACES = ["툴바 버튼", "편집기 안"] as const;

describe("keyboardShortcuts — undo·redo 폴백 소비자 우선", () => {
  describe.each(HISTORY_KEYS)("$label", (spec) => {
    it.each(FOCUS_PLACES)(
      "%s 포커스: handler가 true를 반환하면 한 번 호출되고 내장 동작은 실행되지 않는다",
      (place) => {
        const handler = vi.fn<Handler>(() => true);
        withShortcut(
          spec.registeredKey,
          handler,
          ({ tiptap, editable, button }) => {
            const event = press(
              place === "툴바 버튼" ? button : editable,
              spec.init,
            );

            expect(tiptap.state.doc.textContent).toBe(AFTER_SETUP);
            expect(undoDepth(tiptap.state)).toBe(1);
            expect(redoDepth(tiptap.state)).toBe(1);
            expect(handler).toHaveBeenCalledTimes(1);
            expect(event.defaultPrevented).toBe(true);
          },
        );
      },
    );

    it.each(FOCUS_PLACES)(
      "%s 포커스: handler가 false를 반환하면 한 번 호출된 뒤 내장 동작이 정확히 한 번 이어진다",
      (place) => {
        const handler = vi.fn<Handler>(() => false);
        withShortcut(
          spec.registeredKey,
          handler,
          ({ tiptap, editable, button }) => {
            const event = press(
              place === "툴바 버튼" ? button : editable,
              spec.init,
            );

            expect(handler).toHaveBeenCalledTimes(1);
            expect(tiptap.state.doc.textContent).toBe(spec.settled);
            expect(event.defaultPrevented).toBe(true);
          },
        );
      },
    );
  });

  it("[조건 8] 같은 키에서 등록 handler와 내장 동작의 우선순위는 handler가 위다", () => {
    const order: string[] = [];
    const handler = vi.fn<Handler>(() => {
      order.push("handler");
      return false;
    });
    withShortcut("Mod-z", handler, ({ tiptap, button }) => {
      tiptap.on("update", () => order.push("undo"));

      press(button, { key: "z", ctrlKey: true });

      expect(order).toEqual(["handler", "undo"]);
    });
  });

  it("한글 두벌식 ㅋ(KeyZ)로 눌러도 Mod-z handler가 호출되고 내장 undo는 실행되지 않는다", () => {
    const handler = vi.fn<Handler>(() => true);
    withShortcut("Mod-z", handler, ({ tiptap, button }) => {
      const event = press(button, {
        key: "ㅋ",
        code: "KeyZ",
        keyCode: 90,
        ctrlKey: true,
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(tiptap.state.doc.textContent).toBe(AFTER_SETUP);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it("한글 두벌식 Shift+ㅋ(KeyZ)로 눌러도 Mod-Shift-z handler가 호출된다", () => {
    const handler = vi.fn<Handler>(() => true);
    withShortcut("Mod-Shift-z", handler, ({ tiptap, button }) => {
      press(button, {
        key: "ㅋ",
        code: "KeyZ",
        keyCode: 90,
        ctrlKey: true,
        shiftKey: true,
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(tiptap.state.doc.textContent).toBe(AFTER_SETUP);
    });
  });

  it("handler가 true를 반환한 뒤에도 다음 keydown에서 handler를 다시 부른다", () => {
    const handler = vi.fn<Handler>(() => true);
    withShortcut("Mod-z", handler, ({ button }) => {
      press(button, { key: "z", ctrlKey: true });
      press(button, { key: "z", ctrlKey: true });

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  it("[조건 8] 등록하지 않은 키(Mod-b)는 폴백이 소비자를 부르지 않는다", () => {
    const handler = vi.fn<Handler>(() => true);
    withShortcut("Mod-b", handler, ({ tiptap, button }) => {
      const event = press(button, { key: "b", ctrlKey: true });

      expect(handler).not.toHaveBeenCalled();
      expect(tiptap.state.doc.textContent).toBe(AFTER_SETUP);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("[조건 8] undo·redo 키가 아닌 등록 handler는 undo 키에서 호출되지 않고 내장 undo가 이어진다", () => {
    const handler = vi.fn<Handler>(() => true);
    withShortcut("Mod-b", handler, ({ tiptap, button }) => {
      press(button, { key: "z", ctrlKey: true });

      expect(handler).not.toHaveBeenCalled();
      expect(tiptap.state.doc.textContent).toBe(AFTER_UNDO);
    });
  });

  it("undo 키만 등록하면 redo 키는 handler를 부르지 않고 내장 redo가 이어진다", () => {
    const handler = vi.fn<Handler>(() => true);
    withShortcut("Mod-z", handler, ({ tiptap, button }) => {
      press(button, { key: "y", ctrlKey: true });

      expect(handler).not.toHaveBeenCalled();
      expect(tiptap.state.doc.textContent).toBe(AFTER_REDO);
    });
  });

  it("[조건 2] 읽기 전용 편집기는 handler를 부르지 않는다", () => {
    const handler = vi.fn<Handler>(() => true);
    withShortcut("Mod-z", handler, ({ tiptap, button }) => {
      tiptap.setEditable(false);
      expect(tiptap.view.editable).toBe(false);

      const event = press(button, { key: "z", ctrlKey: true });

      expect(handler).not.toHaveBeenCalled();
      expect(tiptap.state.doc.textContent).toBe(AFTER_SETUP);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("[조건 3] 조합 입력 중 keydown은 handler를 부르지 않는다", () => {
    const handler = vi.fn<Handler>(() => true);
    withShortcut("Mod-z", handler, ({ tiptap, button }) => {
      const event = press(button, {
        key: "z",
        ctrlKey: true,
        isComposing: true,
      });

      expect(event.isComposing).toBe(true);
      expect(handler).not.toHaveBeenCalled();
      expect(tiptap.state.doc.textContent).toBe(AFTER_SETUP);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("[조건 1] 이미 기본 동작이 막힌 keydown은 handler를 부르지 않는다", () => {
    const handler = vi.fn<Handler>(() => true);
    withShortcut("Mod-z", handler, ({ tiptap, button }) => {
      button.addEventListener("keydown", (event) => event.preventDefault());

      press(button, { key: "z", ctrlKey: true });

      expect(handler).not.toHaveBeenCalled();
      expect(tiptap.state.doc.textContent).toBe(AFTER_SETUP);
    });
  });

  it("[조건 6] 입력 컨트롤에서 보낸 keydown은 handler를 부르지 않는다", () => {
    const handler = vi.fn<Handler>(() => true);
    withShortcut("Mod-z", handler, ({ tiptap }) => {
      const input = document.createElement("input");
      document.body.append(input);
      try {
        const event = press(input, { key: "z", ctrlKey: true });

        expect(handler).not.toHaveBeenCalled();
        expect(tiptap.state.doc.textContent).toBe(AFTER_SETUP);
        expect(event.defaultPrevented).toBe(false);
      } finally {
        input.remove();
      }
    });
  });

  it("[조건 7] DOM selection이 편집기 밖이면 handler를 부르지 않는다", () => {
    const handler = vi.fn<Handler>(() => true);
    withShortcut("Mod-z", handler, ({ tiptap, button }) => {
      document.getSelection()?.removeAllRanges();

      const event = press(button, { key: "z", ctrlKey: true });

      expect(handler).not.toHaveBeenCalled();
      expect(tiptap.state.doc.textContent).toBe(AFTER_SETUP);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("편집기가 둘이면 selection이 있는 편집기의 handler만 호출된다", () => {
    const firstHandler = vi.fn<Handler>(() => true);
    const secondHandler = vi.fn<Handler>(() => true);
    const first = mountHistoryEditor("first", {
      keyboardShortcuts: { "Mod-z": firstHandler },
    });
    const button = document.createElement("button");
    document.body.append(button);
    // 두 번째 마운트가 던져도 첫 편집기와 버튼을 정리하도록 try 안에서 만든다.
    let second: ReturnType<typeof mountHistoryEditor> | undefined;
    try {
      second = mountHistoryEditor("second", {
        keyboardShortcuts: { "Mod-z": secondHandler },
      });
      const secondMount = second;
      withoutScrollCrash(first.tiptap, () =>
        withoutScrollCrash(secondMount.tiptap, () => {
          placeDomSelectionIn(first.editable);
          press(button, { key: "z", ctrlKey: true });

          expect(firstHandler).toHaveBeenCalledTimes(1);
          expect(secondHandler).not.toHaveBeenCalled();

          // selection을 두 번째 편집기로 옮기면 그쪽 handler만 호출된다.
          placeDomSelectionIn(secondMount.editable);
          press(button, { key: "z", ctrlKey: true });

          expect(firstHandler).toHaveBeenCalledTimes(1);
          expect(secondHandler).toHaveBeenCalledTimes(1);
          expect(first.tiptap.state.doc.textContent).toBe(AFTER_SETUP);
          expect(secondMount.tiptap.state.doc.textContent).toBe(AFTER_SETUP);
        }),
      );
    } finally {
      runCleanups(
        [
          () => document.getSelection()?.removeAllRanges(),
          () => button.remove(),
          () => first.container.remove(),
          () => second?.container.remove(),
          () => first.editor.destroy(),
          () => second?.editor.destroy(),
        ],
        "두 편집기 시나리오 정리 실패",
      );
    }
  });
});

describe("keyboardShortcuts 없음 — undo·redo 폴백 기존 동작", () => {
  it("keyboardShortcuts를 지정하지 않으면 폴백이 내장 undo·redo를 그대로 실행한다", () => {
    withScenario({}, ({ tiptap, button }) => {
      expect(getCustomKeyboardShortcutsStorage(tiptap)).toBeUndefined();

      const undoEvent = press(button, { key: "z", ctrlKey: true });
      expect(tiptap.state.doc.textContent).toBe(AFTER_UNDO);
      expect(undoEvent.defaultPrevented).toBe(true);

      const redoEvent = press(button, { key: "y", ctrlKey: true });
      expect(tiptap.state.doc.textContent).toBe(AFTER_SETUP);
      expect(redoEvent.defaultPrevented).toBe(true);
    });
  });

  it("빈 keyboardShortcuts({})는 handler 없이 폴백이 내장 동작을 그대로 실행한다", () => {
    withScenario({ keyboardShortcuts: {} }, ({ tiptap, button }) => {
      const event = press(button, { key: "z", ctrlKey: true });

      expect(tiptap.state.doc.textContent).toBe(AFTER_UNDO);
      expect(event.defaultPrevented).toBe(true);
    });
  });
});

describe("CustomKeyboardShortcutsExtension — controllerFacade 없음", () => {
  // createEditor() 경로는 keyboardShortcuts가 있으면 controllerFacade
  // (keyboardShortcutsEditor)를 항상 함께 넘긴다. 이 경로는 확장을 직접
  // 구성해야 만들 수 있다.
  it("controllerFacade가 없으면 handler를 부르지 않고 폴백이 내장 undo를 이어서 실행한다", () => {
    const handler = vi.fn<Handler>(() => true);
    const element = document.createElement("div");
    document.body.append(element);
    const button = document.createElement("button");
    document.body.append(button);
    const tiptap = new Editor({
      element,
      injectCSS: false,
      extensions: [
        StarterKit,
        HistoryKeydownFallbackExtension,
        CustomKeyboardShortcutsExtension.configure({
          keyboardShortcuts: { "Mod-z": handler },
        }),
      ],
      content: `<p>${BASE_TEXT}</p>`,
    });
    try {
      withoutScrollCrash(tiptap, () => {
        tiptap.view.dispatch(
          tiptap.state.tr.insertText(
            FIRST_TEXT,
            tiptap.state.doc.content.size - 1,
          ),
        );
        expect(tiptap.state.doc.textContent).toBe(AFTER_SETUP);
        placeDomSelectionIn(tiptap.view.dom);

        const event = press(button, { key: "z", ctrlKey: true });

        expect(handler).not.toHaveBeenCalled();
        expect(tiptap.state.doc.textContent).toBe(AFTER_UNDO);
        expect(event.defaultPrevented).toBe(true);
      });
    } finally {
      runCleanups(
        [
          () => document.getSelection()?.removeAllRanges(),
          () => button.remove(),
          () => tiptap.destroy(),
          () => element.remove(),
        ],
        "controllerFacade 없음 시나리오 정리 실패",
      );
    }
  });
});
