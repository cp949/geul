/**
 * 에디터 밖 비편집 요소(툴바 버튼 등)에 포커스가 있을 때 `Mod-z`를 undo로,
 * `Mod-Shift-z`·`Mod-y`를 redo로 라우팅하는 확장을 검증한다(Issue #219,
 * Issue #222, G-EDT-004).
 *
 * 두 층으로 나눈다. undo와 redo가 같은 층을 각각 가진다.
 * - 키 판별 순수 함수: 플랫폼별 `Mod` 분기, 정확 일치, 비ASCII 키 폴백.
 * - 마운트 편집기 라우팅: 실제 `createEditor()`를 마운트하고 `view.dom` 밖
 *   요소에서 keydown을 보내 가로채기 조건 7개와 실행 동작을 하나씩 깨뜨린다.
 *
 * 브라우저가 이 keydown을 어디로 보내는지는 jsdom이 증명하지 못한다 —
 * redo는 e2e/toolbar-focus-redo.spec.ts가, undo는
 * e2e/showcase-static-toolbar-focus.spec.ts가 소유한다(ADR-0007).
 */
import { closeHistory, redoDepth, undoDepth } from "@tiptap/pm/history";
import { describe, expect, it } from "vitest";
import {
  isHistoryRedoShortcut,
  isHistoryUndoShortcut,
} from "../src/history-keydown-fallback-extension.js";
import { contentTextStart, typeNativeText } from "./block-test-support.js";
import {
  documentOf,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";
import { withoutScrollCrash } from "./native-selection-test-support.js";

/** 키 판별 함수에 넘길 최소 keydown 필드를 KeyboardEvent로 만든다. */
const keydown = (init: KeyboardEventInit): KeyboardEvent =>
  new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });

describe("isHistoryRedoShortcut — 비Apple 플랫폼", () => {
  it("Ctrl+Shift+z는 redo 단축키다", () => {
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "z", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(true);
  });

  it("Shift가 눌린 대문자 Z도 redo 단축키다", () => {
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "Z", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(true);
  });

  it("Ctrl+y는 redo 단축키다", () => {
    expect(
      isHistoryRedoShortcut(keydown({ key: "y", ctrlKey: true }), false),
    ).toBe(true);
  });

  it("Ctrl+z(Shift 없음)는 undo라 redo 단축키가 아니다", () => {
    expect(
      isHistoryRedoShortcut(keydown({ key: "z", ctrlKey: true }), false),
    ).toBe(false);
  });

  it("Ctrl+Shift+y는 redo 단축키가 아니다", () => {
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "y", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(false);
  });

  it("Meta+Shift+z는 Mod가 아니라 redo 단축키가 아니다", () => {
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "z", metaKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(false);
  });

  it("modifier 없이 누른 z·y는 redo 단축키가 아니다", () => {
    expect(isHistoryRedoShortcut(keydown({ key: "z" }), false)).toBe(false);
    expect(isHistoryRedoShortcut(keydown({ key: "y" }), false)).toBe(false);
  });

  it("다른 키는 Mod+Shift가 눌려도 redo 단축키가 아니다", () => {
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "x", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(false);
  });
});

describe("isHistoryRedoShortcut — Apple 플랫폼", () => {
  it("Meta+Shift+z는 redo 단축키다", () => {
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "z", metaKey: true, shiftKey: true }),
        true,
      ),
    ).toBe(true);
  });

  it("Meta+y는 redo 단축키다", () => {
    expect(
      isHistoryRedoShortcut(keydown({ key: "y", metaKey: true }), true),
    ).toBe(true);
  });

  it("Ctrl+Shift+z는 Mod가 아니라 redo 단축키가 아니다", () => {
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "z", ctrlKey: true, shiftKey: true }),
        true,
      ),
    ).toBe(false);
  });

  it("Ctrl+y는 Mod가 아니라 redo 단축키가 아니다", () => {
    expect(
      isHistoryRedoShortcut(keydown({ key: "y", ctrlKey: true }), true),
    ).toBe(false);
  });

  it("Meta+z(Shift 없음)는 undo라 redo 단축키가 아니다", () => {
    expect(
      isHistoryRedoShortcut(keydown({ key: "z", metaKey: true }), true),
    ).toBe(false);
  });
});

describe("isHistoryRedoShortcut — 정확 일치", () => {
  it.each([
    ["Alt", { altKey: true }],
    ["반대쪽 Meta", { metaKey: true }],
  ] as const)("비Apple에서 잉여 %s가 있으면 거절한다", (_label, extra) => {
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "z", ctrlKey: true, shiftKey: true, ...extra }),
        false,
      ),
    ).toBe(false);
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "y", ctrlKey: true, ...extra }),
        false,
      ),
    ).toBe(false);
  });

  it.each([
    ["Alt", { altKey: true }],
    ["반대쪽 Ctrl", { ctrlKey: true }],
  ] as const)("Apple에서 잉여 %s가 있으면 거절한다", (_label, extra) => {
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "z", metaKey: true, shiftKey: true, ...extra }),
        true,
      ),
    ).toBe(false);
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "y", metaKey: true, ...extra }),
        true,
      ),
    ).toBe(false);
  });
});

describe("isHistoryRedoShortcut — 비ASCII 키 폴백", () => {
  it("한글 두벌식 ㅋ(KeyZ)은 z로 취급한다", () => {
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "ㅋ", code: "KeyZ", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(true);
  });

  it("한글 두벌식 ㅛ(KeyY)은 y로 취급한다", () => {
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "ㅛ", code: "KeyY", ctrlKey: true }),
        false,
      ),
    ).toBe(true);
  });

  it("비ASCII 키라도 code가 KeyZ·KeyY가 아니면 거절한다", () => {
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "ㅌ", code: "KeyX", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(false);
  });

  it("ASCII 키는 code와 달라도 key를 따른다", () => {
    // Dvorak처럼 물리 키(code)와 문자(key)가 갈리는 배열에서 key가 기준이다.
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "z", code: "KeyY", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(true);
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "x", code: "KeyZ", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(false);
  });

  it("비ASCII 폴백에서도 modifier 정확 일치를 지킨다", () => {
    expect(
      isHistoryRedoShortcut(
        keydown({ key: "ㅋ", code: "KeyZ", ctrlKey: true }),
        false,
      ),
    ).toBe(false);
    expect(
      isHistoryRedoShortcut(
        keydown({
          key: "ㅋ",
          code: "KeyZ",
          ctrlKey: true,
          shiftKey: true,
          altKey: true,
        }),
        false,
      ),
    ).toBe(false);
  });
});

/** 한 번 입력한 뒤 undo해 redo 스택이 1인 마운트 편집기 시나리오. */
type RedoScenario = {
  editor: ReturnType<typeof mounted>["editor"];
  tiptap: ReturnType<typeof mounted>["tiptap"];
  editable: HTMLElement;
  /** `view.dom` 밖에 붙은 평범한 버튼. 툴바 컨트롤을 대신한다. */
  button: HTMLButtonElement;
};

const BASE_TEXT = "abc";
const TYPED_TEXT = "X";

/**
 * 편집기에 TYPED_TEXT를 입력한 뒤 undo해 redo 스택을 하나 만든다.
 * 입력 직후 문서는 `abc` + `X`, undo 뒤는 `abc`다. 편집기와 같은 문서에
 * 붙은 컨테이너를 만든다.
 */
const mountRedoableEditor = (blockId: string) => {
  const mount = mounted(documentOf(paragraphBlock(blockId, BASE_TEXT)));
  const container = mount.editable.parentElement;
  if (container === null) throw new Error("편집기 컨테이너 조회 실패");
  mount.tiptap.commands.setTextSelection(
    contentTextStart(mount.tiptap, blockId) + BASE_TEXT.length,
  );
  typeNativeText(mount.tiptap, TYPED_TEXT);
  expect(mount.tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
  expect(mount.editor.commands.undo().ok).toBe(true);
  expect(mount.tiptap.state.doc.textContent).toBe(BASE_TEXT);
  expect(redoDepth(mount.tiptap.state)).toBe(1);
  // DOM에는 undo 뒤에 붙인다. 문서를 바꾸는 transaction이 붙은 뷰에서
  // scrollToSelection을 실행하면 jsdom에는 없는 geometry API를 부른다.
  document.body.append(container);
  return { ...mount, container };
};

/**
 * 편집기 첫 문단의 텍스트 노드 끝에 DOM selection을 둔다. jsdom은
 * ProseMirror selection을 DOM selection에 동기화하지 않으므로(편집기에
 * 포커스가 없다) 직접 만든다. 실제 브라우저에서 툴바 버튼에 포커스가 가도
 * selection이 편집기에 남는 상태를 재현한다.
 */
const placeDomSelectionIn = (editable: HTMLElement) => {
  const paragraph = editable.querySelector("p");
  const text = paragraph?.firstChild;
  if (text === null || text === undefined) {
    throw new Error("편집기 문단 텍스트 노드 조회 실패");
  }
  const selection = document.getSelection();
  expect(selection).not.toBeNull();
  selection?.setBaseAndExtent(text, BASE_TEXT.length, text, BASE_TEXT.length);
  expect(editable.contains(selection?.focusNode ?? null)).toBe(true);
};

/**
 * 정리 함수를 모두 실행한다. 하나가 던져도 나머지를 막지 않고 실패를
 * 모아 AggregateError로 던진다(G-TST-003).
 */
const runCleanups = (cleanups: readonly (() => void)[], message: string) => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, message);
};

/**
 * 시나리오를 만들고 fn을 실행한 뒤 DOM과 selection과 Editor를 항상 정리한다
 * (G-TST-003). 정리 대상 하나의 실패가 나머지 정리를 막지 않는다.
 */
const withRedoScenario = (fn: (scenario: RedoScenario) => void): void => {
  const mount = mountRedoableEditor("redo-block");
  const button = document.createElement("button");
  document.body.append(button);
  try {
    placeDomSelectionIn(mount.editable);
    withoutScrollCrash(mount.tiptap, () =>
      fn({
        editor: mount.editor,
        tiptap: mount.tiptap,
        editable: mount.editable,
        button,
      }),
    );
  } finally {
    runCleanups(
      [
        () => document.getSelection()?.removeAllRanges(),
        () => button.remove(),
        () => mount.container.remove(),
        () => mount.editor.destroy(),
      ],
      "redo 시나리오 정리 실패",
    );
  }
};

/** `target`에서 Ctrl+Shift+z keydown을 보내고 이벤트를 돌려준다. */
const pressRedo = (
  target: EventTarget,
  init: KeyboardEventInit = {},
): KeyboardEvent => {
  const event = keydown({
    key: "z",
    ctrlKey: true,
    shiftKey: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

describe("historyKeydownFallback redo — 마운트 편집기 라우팅", () => {
  it("view.dom 밖 버튼의 Ctrl+Shift+z가 redo하고 기본 동작을 막는다", () => {
    withRedoScenario(({ tiptap, button }) => {
      const event = pressRedo(button);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it("view.dom 밖 버튼의 Ctrl+y가 redo한다", () => {
    withRedoScenario(({ tiptap, button }) => {
      const event = keydown({ key: "y", ctrlKey: true });
      button.dispatchEvent(event);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it("한글 두벌식 ㅋ(KeyZ)로 눌러도 redo한다", () => {
    withRedoScenario(({ tiptap, button }) => {
      pressRedo(button, { key: "ㅋ", code: "KeyZ" });

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
    });
  });

  it("redo할 것이 없어도 키 이벤트의 기본 동작은 막는다", () => {
    withRedoScenario(({ editor, tiptap, button }) => {
      expect(editor.commands.redo().ok).toBe(true);
      expect(redoDepth(tiptap.state)).toBe(0);

      const event = pressRedo(button);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it("[조건 1] 이미 기본 동작이 막힌 keydown은 건드리지 않는다", () => {
    withRedoScenario(({ tiptap, button }) => {
      button.addEventListener("keydown", (event) => event.preventDefault());

      pressRedo(button);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
      expect(redoDepth(tiptap.state)).toBe(1);
    });
  });

  it("[조건 2] 편집 불가 편집기는 redo하지 않는다", () => {
    withRedoScenario(({ tiptap, button }) => {
      tiptap.setEditable(false);
      expect(tiptap.view.editable).toBe(false);

      const event = pressRedo(button);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("[조건 3] 조합 입력 중 keydown은 redo하지 않는다", () => {
    withRedoScenario(({ tiptap, button }) => {
      const event = pressRedo(button, { isComposing: true });

      expect(event.isComposing).toBe(true);
      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  // undo 키는 Issue #222부터 같은 리스너가 undo로 라우팅한다. 기본 동작은
  // 막히지만 redo는 일어나지 않는다. undo 스택은 비어 있어 문서가 그대로다.
  it("[조건 4] undo 키(Shift 없는 Ctrl+z)는 redo하지 않는다", () => {
    withRedoScenario(({ tiptap, button }) => {
      const event = pressRedo(button, { shiftKey: false });

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
      expect(redoDepth(tiptap.state)).toBe(1);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it.each([
    ["다른 키(Ctrl+Shift+x)", { key: "x" }],
    ["잉여 Alt", { altKey: true }],
    ["비Apple에서 Meta 조합", { ctrlKey: false, metaKey: true }],
  ] as const)("[조건 4] %s는 redo하지 않는다", (_label, init) => {
    withRedoScenario(({ tiptap, button }) => {
      const event = pressRedo(button, init);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("[조건 1·5] view.dom 안에서 보낸 keydown은 키맵만 처리해 두 번 redo하지 않는다", () => {
    withRedoScenario(({ editor, tiptap, editable }) => {
      // 조건 5(target이 view.dom 밖)는 이 경로에서 조건 1(`defaultPrevented`)
      // 이 먼저 거른다. 키맵이 `preventDefault`하므로 조건 5만 따로 제거해도
      // 이 테스트는 통과한다 — 변이 확인 범위는 조건 1이다.
      // redo 스택을 둘로 만든다. 확장이 키맵과 함께 실행되면 두 단계가
      // 한 번에 복원된다. closeHistory로 두 입력을 별도 history 이벤트로
      // 가른다.
      expect(editor.commands.redo().ok).toBe(true);
      tiptap.view.dispatch(closeHistory(tiptap.state.tr));
      typeNativeText(tiptap, "Y");
      tiptap.view.dispatch(closeHistory(tiptap.state.tr));
      expect(editor.commands.undo().ok).toBe(true);
      expect(editor.commands.undo().ok).toBe(true);
      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
      expect(redoDepth(tiptap.state)).toBe(2);

      pressRedo(editable);

      expect(redoDepth(tiptap.state)).toBe(1);
      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
    });
  });

  it.each([
    ["input", () => document.createElement("input")],
    ["textarea", () => document.createElement("textarea")],
    ["select", () => document.createElement("select")],
  ] as const)(
    "[조건 6] %s에서 보낸 keydown은 redo하지 않는다",
    (_label, make) => {
      withRedoScenario(({ tiptap }) => {
        const control = make();
        document.body.append(control);
        try {
          const event = pressRedo(control);

          expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
          expect(event.defaultPrevented).toBe(false);
        } finally {
          control.remove();
        }
      });
    },
  );

  it("[조건 6] 다른 편집 영역(contenteditable)에서 보낸 keydown은 redo하지 않는다", () => {
    withRedoScenario(({ tiptap }) => {
      const other = document.createElement("div");
      other.setAttribute("contenteditable", "true");
      // jsdom은 isContentEditable을 구현하지 않아 production 코드가 읽는 값을
      // 직접 정의한다. attribute는 setAttribute로 이미 설정했다(G-TST-001).
      Object.defineProperty(other, "isContentEditable", { value: true });
      document.body.append(other);
      try {
        const event = pressRedo(other);

        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
        expect(event.defaultPrevented).toBe(false);
      } finally {
        other.remove();
      }
    });
  });

  it("[조건 7] selection이 없으면 redo하지 않는다", () => {
    withRedoScenario(({ tiptap, button }) => {
      document.getSelection()?.removeAllRanges();

      const event = pressRedo(button);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("[조건 7] selection이 view.dom 밖이면 redo하지 않는다", () => {
    withRedoScenario(({ tiptap, button }) => {
      const outside = document.createElement("p");
      outside.textContent = "outside";
      document.body.append(outside);
      try {
        const text = outside.firstChild;
        if (text === null) throw new Error("바깥 텍스트 노드 조회 실패");
        document.getSelection()?.setBaseAndExtent(text, 0, text, 3);

        const event = pressRedo(button);

        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
        expect(event.defaultPrevented).toBe(false);
      } finally {
        document.getSelection()?.removeAllRanges();
        outside.remove();
      }
    });
  });

  it("편집기를 destroy하면 keydown 리스너가 사라진다", () => {
    withRedoScenario(({ editor, tiptap, button }) => {
      editor.destroy();

      const event = pressRedo(button);

      expect(event.defaultPrevented).toBe(false);
      expect(tiptap.isDestroyed).toBe(true);
    });
  });
});

describe("historyKeydownFallback redo — 편집기 두 인스턴스", () => {
  it("selection이 있는 편집기만 redo한다", () => {
    const first = mountRedoableEditor("first-block");
    const second = mountRedoableEditor("second-block");
    const button = document.createElement("button");
    document.body.append(button);
    try {
      withoutScrollCrash(first.tiptap, () =>
        withoutScrollCrash(second.tiptap, () => {
          placeDomSelectionIn(first.editable);
          pressRedo(button);

          expect(first.tiptap.state.doc.textContent).toBe(
            BASE_TEXT + TYPED_TEXT,
          );
          expect(second.tiptap.state.doc.textContent).toBe(BASE_TEXT);

          // selection을 두 번째 편집기로 옮기면 그쪽만 redo한다.
          placeDomSelectionIn(second.editable);
          pressRedo(button);

          expect(second.tiptap.state.doc.textContent).toBe(
            BASE_TEXT + TYPED_TEXT,
          );
        }),
      );
    } finally {
      runCleanups(
        [
          () => document.getSelection()?.removeAllRanges(),
          () => button.remove(),
          () => first.container.remove(),
          () => second.container.remove(),
          () => first.editor.destroy(),
          () => second.editor.destroy(),
        ],
        "두 인스턴스 시나리오 정리 실패",
      );
    }
  });
});

describe("isHistoryUndoShortcut — 비Apple 플랫폼", () => {
  it("Ctrl+z는 undo 단축키다", () => {
    expect(
      isHistoryUndoShortcut(keydown({ key: "z", ctrlKey: true }), false),
    ).toBe(true);
  });

  it("Ctrl+Shift+z는 redo라 undo 단축키가 아니다", () => {
    expect(
      isHistoryUndoShortcut(
        keydown({ key: "z", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(false);
    expect(
      isHistoryUndoShortcut(
        keydown({ key: "Z", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(false);
  });

  it("Ctrl+y는 redo라 undo 단축키가 아니다", () => {
    expect(
      isHistoryUndoShortcut(keydown({ key: "y", ctrlKey: true }), false),
    ).toBe(false);
  });

  it("Meta+z는 Mod가 아니라 undo 단축키가 아니다", () => {
    expect(
      isHistoryUndoShortcut(keydown({ key: "z", metaKey: true }), false),
    ).toBe(false);
  });

  it("modifier 없이 누른 z는 undo 단축키가 아니다", () => {
    expect(isHistoryUndoShortcut(keydown({ key: "z" }), false)).toBe(false);
  });

  it("다른 키는 Mod가 눌려도 undo 단축키가 아니다", () => {
    expect(
      isHistoryUndoShortcut(keydown({ key: "x", ctrlKey: true }), false),
    ).toBe(false);
  });
});

describe("isHistoryUndoShortcut — Apple 플랫폼", () => {
  it("Meta+z는 undo 단축키다", () => {
    expect(
      isHistoryUndoShortcut(keydown({ key: "z", metaKey: true }), true),
    ).toBe(true);
  });

  it("Meta+Shift+z는 redo라 undo 단축키가 아니다", () => {
    expect(
      isHistoryUndoShortcut(
        keydown({ key: "z", metaKey: true, shiftKey: true }),
        true,
      ),
    ).toBe(false);
  });

  it("Meta+y는 redo라 undo 단축키가 아니다", () => {
    expect(
      isHistoryUndoShortcut(keydown({ key: "y", metaKey: true }), true),
    ).toBe(false);
  });

  it("Ctrl+z는 Mod가 아니라 undo 단축키가 아니다", () => {
    expect(
      isHistoryUndoShortcut(keydown({ key: "z", ctrlKey: true }), true),
    ).toBe(false);
  });
});

describe("isHistoryUndoShortcut — 정확 일치", () => {
  it.each([
    ["Alt", { altKey: true }],
    ["반대쪽 Meta", { metaKey: true }],
  ] as const)("비Apple에서 잉여 %s가 있으면 거절한다", (_label, extra) => {
    expect(
      isHistoryUndoShortcut(
        keydown({ key: "z", ctrlKey: true, ...extra }),
        false,
      ),
    ).toBe(false);
  });

  it.each([
    ["Alt", { altKey: true }],
    ["반대쪽 Ctrl", { ctrlKey: true }],
  ] as const)("Apple에서 잉여 %s가 있으면 거절한다", (_label, extra) => {
    expect(
      isHistoryUndoShortcut(
        keydown({ key: "z", metaKey: true, ...extra }),
        true,
      ),
    ).toBe(false);
  });
});

describe("isHistoryUndoShortcut — 비ASCII 키 폴백", () => {
  it("한글 두벌식 ㅋ(KeyZ)은 z로 취급한다", () => {
    expect(
      isHistoryUndoShortcut(
        keydown({ key: "ㅋ", code: "KeyZ", ctrlKey: true }),
        false,
      ),
    ).toBe(true);
  });

  it("비ASCII 키라도 code가 KeyZ가 아니면 거절한다", () => {
    expect(
      isHistoryUndoShortcut(
        keydown({ key: "ㅛ", code: "KeyY", ctrlKey: true }),
        false,
      ),
    ).toBe(false);
    expect(
      isHistoryUndoShortcut(
        keydown({ key: "ㅌ", code: "KeyX", ctrlKey: true }),
        false,
      ),
    ).toBe(false);
  });

  it("ASCII 키는 code와 달라도 key를 따른다", () => {
    // Dvorak처럼 물리 키(code)와 문자(key)가 갈리는 배열에서 key가 기준이다.
    expect(
      isHistoryUndoShortcut(
        keydown({ key: "z", code: "KeyY", ctrlKey: true }),
        false,
      ),
    ).toBe(true);
    expect(
      isHistoryUndoShortcut(
        keydown({ key: "x", code: "KeyZ", ctrlKey: true }),
        false,
      ),
    ).toBe(false);
  });

  it("비ASCII 폴백에서도 modifier 정확 일치를 지킨다", () => {
    expect(
      isHistoryUndoShortcut(
        keydown({ key: "ㅋ", code: "KeyZ", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(false);
    expect(
      isHistoryUndoShortcut(
        keydown({ key: "ㅋ", code: "KeyZ", ctrlKey: true, altKey: true }),
        false,
      ),
    ).toBe(false);
  });
});

/** 한 번 입력해 undo 스택이 1인 마운트 편집기 시나리오. */
type UndoScenario = RedoScenario;

/**
 * 편집기에 TYPED_TEXT를 입력해 undo 스택을 하나 만든다. 문서는 `abc` + `X`
 * 이고 undo 뒤는 `abc`다. 편집기와 같은 문서에 붙은 컨테이너를 만든다.
 */
const mountUndoableEditor = (blockId: string) => {
  const mount = mounted(documentOf(paragraphBlock(blockId, BASE_TEXT)));
  const container = mount.editable.parentElement;
  if (container === null) throw new Error("편집기 컨테이너 조회 실패");
  mount.tiptap.commands.setTextSelection(
    contentTextStart(mount.tiptap, blockId) + BASE_TEXT.length,
  );
  typeNativeText(mount.tiptap, TYPED_TEXT);
  expect(mount.tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
  expect(undoDepth(mount.tiptap.state)).toBe(1);
  // DOM에는 입력 뒤에 붙인다. 이유는 mountRedoableEditor와 같다.
  document.body.append(container);
  return { ...mount, container };
};

/**
 * undo 시나리오를 만들고 fn을 실행한 뒤 DOM과 selection과 Editor를 항상
 * 정리한다(G-TST-003). 정리 대상 하나의 실패가 나머지 정리를 막지 않는다.
 */
const withUndoScenario = (fn: (scenario: UndoScenario) => void): void => {
  const mount = mountUndoableEditor("undo-block");
  const button = document.createElement("button");
  document.body.append(button);
  try {
    placeDomSelectionIn(mount.editable);
    withoutScrollCrash(mount.tiptap, () =>
      fn({
        editor: mount.editor,
        tiptap: mount.tiptap,
        editable: mount.editable,
        button,
      }),
    );
  } finally {
    runCleanups(
      [
        () => document.getSelection()?.removeAllRanges(),
        () => button.remove(),
        () => mount.container.remove(),
        () => mount.editor.destroy(),
      ],
      "undo 시나리오 정리 실패",
    );
  }
};

/** `target`에서 Ctrl+z keydown을 보내고 이벤트를 돌려준다. */
const pressUndo = (
  target: EventTarget,
  init: KeyboardEventInit = {},
): KeyboardEvent => {
  const event = keydown({ key: "z", ctrlKey: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe("historyKeydownFallback undo — 마운트 편집기 라우팅", () => {
  it("view.dom 밖 버튼의 Ctrl+z가 undo하고 기본 동작을 막는다", () => {
    withUndoScenario(({ tiptap, button }) => {
      const event = pressUndo(button);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it("target이 BODY여도 selection이 view.dom 안이면 undo한다", () => {
    withUndoScenario(({ tiptap }) => {
      const event = pressUndo(document.body);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it("한글 두벌식 ㅋ(KeyZ)로 눌러도 undo한다", () => {
    withUndoScenario(({ tiptap, button }) => {
      pressUndo(button, { key: "ㅋ", code: "KeyZ" });

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
    });
  });

  it("undo할 것이 없어도 키 이벤트의 기본 동작은 막는다", () => {
    withUndoScenario(({ editor, tiptap, button }) => {
      expect(editor.commands.undo().ok).toBe(true);
      expect(undoDepth(tiptap.state)).toBe(0);

      const event = pressUndo(button);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it("[조건 1] 이미 기본 동작이 막힌 keydown은 건드리지 않는다", () => {
    withUndoScenario(({ tiptap, button }) => {
      button.addEventListener("keydown", (event) => event.preventDefault());

      pressUndo(button);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
      expect(undoDepth(tiptap.state)).toBe(1);
    });
  });

  it("[조건 2] 편집 불가 편집기는 undo하지 않는다", () => {
    withUndoScenario(({ tiptap, button }) => {
      tiptap.setEditable(false);
      expect(tiptap.view.editable).toBe(false);

      const event = pressUndo(button);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("[조건 3] 조합 입력 중 keydown은 undo하지 않는다", () => {
    withUndoScenario(({ tiptap, button }) => {
      const event = pressUndo(button, { isComposing: true });

      expect(event.isComposing).toBe(true);
      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it.each([
    ["다른 키(Ctrl+x)", { key: "x" }],
    ["잉여 Alt", { altKey: true }],
    ["비Apple에서 Meta 조합", { ctrlKey: false, metaKey: true }],
  ] as const)("[조건 4] %s는 undo하지 않는다", (_label, init) => {
    withUndoScenario(({ tiptap, button }) => {
      const event = pressUndo(button, init);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("[조건 4] redo 키(Ctrl+Shift+z)는 undo하지 않는다", () => {
    withUndoScenario(({ tiptap, button }) => {
      // 같은 리스너가 이 키를 redo로 라우팅해 기본 동작은 막힌다. redo할
      // 것이 없어 문서는 그대로다.
      pressUndo(button, { shiftKey: true });

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
      expect(undoDepth(tiptap.state)).toBe(1);
    });
  });

  it("[조건 1·5] view.dom 안에서 보낸 keydown은 키맵만 처리해 두 번 undo하지 않는다", () => {
    withUndoScenario(({ tiptap, editable }) => {
      // 조건 5(target이 view.dom 밖)는 이 경로에서 조건 1(`defaultPrevented`)
      // 이 먼저 거른다. 변이 확인 범위는 조건 1이다.
      // undo 스택을 둘로 만든다. 확장이 키맵과 함께 실행되면 두 단계가
      // 한 번에 되돌려진다. closeHistory로 두 입력을 별도 history 이벤트로
      // 가른다.
      tiptap.view.dispatch(closeHistory(tiptap.state.tr));
      typeNativeText(tiptap, "Y");
      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT + "Y");
      expect(undoDepth(tiptap.state)).toBe(2);

      pressUndo(editable);

      expect(undoDepth(tiptap.state)).toBe(1);
      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
    });
  });

  it.each([
    ["input", () => document.createElement("input")],
    ["textarea", () => document.createElement("textarea")],
    ["select", () => document.createElement("select")],
  ] as const)(
    "[조건 6] %s에서 보낸 keydown은 undo하지 않는다",
    (_label, make) => {
      withUndoScenario(({ tiptap }) => {
        const control = make();
        document.body.append(control);
        try {
          const event = pressUndo(control);

          expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
          expect(event.defaultPrevented).toBe(false);
        } finally {
          control.remove();
        }
      });
    },
  );

  it("[조건 6] 다른 편집 영역(contenteditable)에서 보낸 keydown은 undo하지 않는다", () => {
    withUndoScenario(({ tiptap }) => {
      const other = document.createElement("div");
      other.setAttribute("contenteditable", "true");
      // jsdom은 isContentEditable을 구현하지 않아 production 코드가 읽는 값을
      // 직접 정의한다. attribute는 setAttribute로 이미 설정했다(G-TST-001).
      Object.defineProperty(other, "isContentEditable", { value: true });
      document.body.append(other);
      try {
        const event = pressUndo(other);

        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
        expect(event.defaultPrevented).toBe(false);
      } finally {
        other.remove();
      }
    });
  });

  it("[조건 7] selection이 없으면 undo하지 않는다", () => {
    withUndoScenario(({ tiptap, button }) => {
      document.getSelection()?.removeAllRanges();

      const event = pressUndo(button);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("[조건 7] selection이 view.dom 밖이면 undo하지 않는다", () => {
    withUndoScenario(({ tiptap, button }) => {
      const outside = document.createElement("p");
      outside.textContent = "outside";
      document.body.append(outside);
      try {
        const text = outside.firstChild;
        if (text === null) throw new Error("바깥 텍스트 노드 조회 실패");
        document.getSelection()?.setBaseAndExtent(text, 0, text, 3);

        const event = pressUndo(button);

        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
        expect(event.defaultPrevented).toBe(false);
      } finally {
        document.getSelection()?.removeAllRanges();
        outside.remove();
      }
    });
  });

  it("편집기를 destroy하면 undo keydown도 가로채지 않는다", () => {
    withUndoScenario(({ editor, tiptap, button }) => {
      editor.destroy();

      const event = pressUndo(button);

      expect(event.defaultPrevented).toBe(false);
      expect(tiptap.isDestroyed).toBe(true);
    });
  });
});

describe("historyKeydownFallback undo — 편집기 두 인스턴스", () => {
  it("selection이 있는 편집기만 undo한다", () => {
    const first = mountUndoableEditor("first-block");
    const second = mountUndoableEditor("second-block");
    const button = document.createElement("button");
    document.body.append(button);
    try {
      withoutScrollCrash(first.tiptap, () =>
        withoutScrollCrash(second.tiptap, () => {
          placeDomSelectionIn(first.editable);
          pressUndo(button);

          expect(first.tiptap.state.doc.textContent).toBe(BASE_TEXT);
          expect(second.tiptap.state.doc.textContent).toBe(
            BASE_TEXT + TYPED_TEXT,
          );

          // selection을 두 번째 편집기로 옮기면 그쪽만 undo한다.
          placeDomSelectionIn(second.editable);
          pressUndo(button);

          expect(second.tiptap.state.doc.textContent).toBe(BASE_TEXT);
        }),
      );
    } finally {
      runCleanups(
        [
          () => document.getSelection()?.removeAllRanges(),
          () => button.remove(),
          () => first.container.remove(),
          () => second.container.remove(),
          () => first.editor.destroy(),
          () => second.editor.destroy(),
        ],
        "undo 두 인스턴스 시나리오 정리 실패",
      );
    }
  });
});
