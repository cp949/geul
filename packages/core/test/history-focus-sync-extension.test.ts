/**
 * history transaction 뒤 에디터 밖 요소에 포커스가 있을 때 DOM selection을
 * 재동기화하고 포커스 유실을 복구하는 확장을 검증한다(Issue #221,
 * G-EDT-004).
 *
 * 마운트한 편집기에서 한 가지 시나리오를 공유한다. 문단 `abc`의 `bc`를
 * `X`로 바꾼 뒤 `view.dom` 밖 버튼에 포커스를 두고 undo·redo한다. history가
 * `bc` 범위 selection을 복원한다.
 * - 재동기화: 가드 조건을 하나씩 깨뜨려 재동기화가 일어나는지 본다.
 *   재동기화 여부는 DOM selection 문자열과 `contenteditable` 토글 기록으로
 *   확인한다.
 * - 포커스 복구: 포커스된 버튼이 제거됐을 때 `view.focus()`가 호출되는지,
 *   감시 해제 조건과 destroy 정리가 지켜지는지 본다.
 *
 * 브라우저가 이 DOM selection 변경 뒤 포커스를 어디로 옮기는지와 툴바가
 * 언제 unmount되는지는 jsdom이 증명하지 못한다 —
 * e2e/toolbar-focus-undo-redo.spec.ts가 소유한다(ADR-0007).
 */
import { redo, undo } from "@tiptap/pm/history";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";
import { contentTextStart } from "./block-test-support.js";
import {
  dividerBetweenParagraphsDocument,
  documentOf,
  mounted,
  paragraphBlock,
  selectBlockNode,
} from "./editor-controller-support.js";
import {
  placeDomSelectionInFirstParagraph,
  runCleanups,
  withoutScrollCrash,
} from "./native-selection-test-support.js";

const BASE_TEXT = "abc";
const REPLACEMENT = "X";
/** history가 복원하는 범위 selection의 텍스트. */
const RESTORED_TEXT = "bc";

type Mounted = ReturnType<typeof mounted>;

type Scenario = Mounted & {
  /** `view.dom` 밖에 붙인 평범한 버튼. 툴바 컨트롤을 대신한다. */
  button: HTMLButtonElement;
};

/** 한 macrotask를 양보한다. MutationObserver 콜백이 먼저 실행된다. */
const flushObservers = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/** 편집기 컨테이너를 문서에 붙이고 컨테이너를 돌려준다. */
const attachContainer = (mount: Mounted): HTMLElement => {
  const container = mount.editable.parentElement;
  if (container === null) throw new Error("편집기 컨테이너 조회 실패");
  document.body.append(container);
  return container;
};

/** 정리 대상이 없을 때도 안전하게 DOM selection을 비운다. */
const clearDomSelection = () => document.getSelection()?.removeAllRanges();

/**
 * 문단 `abc`에서 `bc`를 `X`로 바꾸고 버튼에 포커스를 둔 시나리오를 만든 뒤
 * fn을 실행한다. 반환 시점에 undo가 `bc` 범위를 복원할 수 있다.
 * `backward`이면 복원할 selection이 anchor가 head보다 뒤인 역방향이다.
 * DOM selection은 문단 앞에 접혀 있어 재동기화 여부가 드러난다. DOM과
 * Editor는 항상 정리한다(G-TST-003).
 */
const withReplacedTextScenario = async (
  fn: (scenario: Scenario) => void | Promise<void>,
  options: { backward?: boolean } = {},
) => {
  const mount = mounted(documentOf(paragraphBlock("sync-block", BASE_TEXT)));
  const container = attachContainer(mount);
  const button = document.createElement("button");
  document.body.append(button);
  let scrollSpy: { mockRestore(): void } | undefined;
  try {
    const { tiptap } = mount;
    const start = contentTextStart(tiptap, "sync-block");
    const from = start + 1;
    const to = start + BASE_TEXT.length;
    const { doc } = tiptap.state;
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        options.backward === true
          ? TextSelection.create(doc, to, from)
          : TextSelection.create(doc, from, to),
      ),
    );
    tiptap.view.dispatch(tiptap.state.tr.insertText(REPLACEMENT, from, to));
    expect(tiptap.state.doc.textContent).toBe(`a${REPLACEMENT}`);
    button.focus();
    expect(document.activeElement).toBe(button);
    placeDomSelectionInFirstParagraph(mount.editable, 0);
    // fn이 비동기라 withoutScrollCrash(동기 범위)를 쓰지 않고 fn 전체 동안
    // scrollToSelection을 막는다.
    scrollSpy = vi
      .spyOn(
        tiptap.view as typeof tiptap.view & { scrollToSelection(): void },
        "scrollToSelection",
      )
      .mockImplementation(() => {});
    await fn({ ...mount, button });
  } finally {
    runCleanups(
      [
        () => scrollSpy?.mockRestore(),
        clearDomSelection,
        () => button.remove(),
        () => container.remove(),
        () => mount.editor.destroy(),
      ],
      "history 포커스 동기화 시나리오 정리 실패",
    );
  }
};

/** history undo를 dispatch한다. 명령이 실행됐음을 단언한다. */
const dispatchUndo = ({ tiptap }: Pick<Scenario, "tiptap">) => {
  expect(undo(tiptap.state, tiptap.view.dispatch)).toBe(true);
};

/** history redo를 dispatch한다. 명령이 실행됐음을 단언한다. */
const dispatchRedo = ({ tiptap }: Pick<Scenario, "tiptap">) => {
  expect(redo(tiptap.state, tiptap.view.dispatch)).toBe(true);
};

/**
 * `contenteditable` attribute 변경 기록을 모은다. `takeRecords()`는 동기라
 * dispatch 직후 토글 횟수를 읽을 수 있다. 재동기화는 값을 `"false"`로 두었다가
 * 되돌리므로 일어났다면 2건이다.
 */
const watchContentEditable = (editable: HTMLElement) => {
  const observer = new MutationObserver(() => {});
  observer.observe(editable, {
    attributes: true,
    attributeFilter: ["contenteditable"],
  });
  return {
    toggleCount: () => observer.takeRecords().length,
    stop: () => observer.disconnect(),
  };
};

/** 현재 DOM selection이 선택한 텍스트. */
const domSelectionText = () => document.getSelection()?.toString() ?? "";

/**
 * 포커스된 요소(버튼·입력 컨트롤)를 제거하고 관찰자가 돌 때까지 기다린 뒤
 * `view.focus()` 호출 횟수를 돌려준다. spy를 넘기지 않으면 새로 건다.
 */
const removeButtonAndCountFocus = async (
  { tiptap, button }: { tiptap: Scenario["tiptap"]; button: HTMLElement },
  focusSpy: { mock: { calls: unknown[] } } = vi.spyOn(tiptap.view, "focus"),
) => {
  button.remove();
  await flushObservers();
  return focusSpy.mock.calls.length;
};

describe("historyFocusSync — 재동기화", () => {
  it("버튼 포커스에서 undo하면 복원된 범위 selection이 DOM에 반영된다", async () => {
    await withReplacedTextScenario((scenario) => {
      expect(domSelectionText()).toBe("");

      dispatchUndo(scenario);

      expect(scenario.tiptap.state.doc.textContent).toBe(BASE_TEXT);
      expect(domSelectionText()).toBe(RESTORED_TEXT);
      expect(document.activeElement).toBe(scenario.button);
    });
  });

  it("redo 뒤에도 복원된 selection을 DOM에 반영한다", async () => {
    await withReplacedTextScenario((scenario) => {
      dispatchUndo(scenario);
      document.getSelection()?.removeAllRanges();
      placeDomSelectionInFirstParagraph(scenario.editable, 0);

      dispatchRedo(scenario);

      expect(scenario.tiptap.state.doc.textContent).toBe(`a${REPLACEMENT}`);
      // redo가 복원한 selection은 접힌 caret이다. 시작 caret(offset 0)과
      // 다른 위치라 재동기화가 일어났음이 드러난다. domAtPos는 텍스트 끝을
      // 문단 노드 기준으로 줄 수 있어 문단 시작부터 focus까지의 텍스트
      // 길이로 비교한다.
      const { head } = scenario.tiptap.state.selection;
      const expectedOffset =
        head - contentTextStart(scenario.tiptap, "sync-block");
      const selection = document.getSelection();
      const paragraph = scenario.editable.querySelector("p");
      if (paragraph === null || selection?.focusNode == null) {
        throw new Error("문단 또는 DOM selection 조회 실패");
      }
      const toFocus = document.createRange();
      toFocus.setStart(paragraph, 0);
      toFocus.setEnd(selection.focusNode, selection.focusOffset);
      expect(expectedOffset).toBeGreaterThan(0);
      expect(selection.isCollapsed).toBe(true);
      expect(toFocus.toString().length).toBe(expectedOffset);
    });
  });

  it("역방향 selection의 anchor와 head 방향을 보존한다", async () => {
    await withReplacedTextScenario(
      (scenario) => {
        dispatchUndo(scenario);

        // head(focus)가 범위 앞에 있고 선택 텍스트가 `bc`면 역방향이다.
        // anchor는 문단 끝이라 domAtPos가 텍스트 노드 대신 문단 노드를 줄 수
        // 있어 offset으로 비교하지 않는다.
        const selection = document.getSelection();
        expect(domSelectionText()).toBe(RESTORED_TEXT);
        expect(selection?.focusNode?.nodeType).toBe(Node.TEXT_NODE);
        expect(selection?.focusOffset).toBe(1);
      },
      { backward: true },
    );
  });

  it("재동기화는 setBaseAndExtent 동안만 contenteditable을 false로 두고 되돌린다", async () => {
    await withReplacedTextScenario((scenario) => {
      const selection = document.getSelection();
      if (selection === null) throw new Error("selection 조회 실패");
      const original = selection.setBaseAndExtent.bind(selection);
      const valuesDuringCall: (string | null)[] = [];
      const spy = vi
        .spyOn(selection, "setBaseAndExtent")
        .mockImplementation((...args) => {
          valuesDuringCall.push(
            scenario.editable.getAttribute("contenteditable"),
          );
          original(...args);
        });
      try {
        dispatchUndo(scenario);
      } finally {
        spy.mockRestore();
      }

      expect(valuesDuringCall).toEqual(["false"]);
      expect(scenario.editable.getAttribute("contenteditable")).toBe("true");
    });
  });

  it("setBaseAndExtent가 던져도 contenteditable을 되돌리고 undo는 끝난다", async () => {
    await withReplacedTextScenario((scenario) => {
      const selection = document.getSelection();
      if (selection === null) throw new Error("selection 조회 실패");
      const spy = vi
        .spyOn(selection, "setBaseAndExtent")
        .mockImplementation(() => {
          throw new Error("setBaseAndExtent 실패");
        });
      try {
        expect(() => dispatchUndo(scenario)).not.toThrow();
      } finally {
        spy.mockRestore();
      }

      expect(scenario.tiptap.state.doc.textContent).toBe(BASE_TEXT);
      expect(scenario.editable.getAttribute("contenteditable")).toBe("true");
    });
  });

  it("[가드] history가 아닌 transaction은 재동기화하지 않는다", async () => {
    await withReplacedTextScenario((scenario) => {
      const { tiptap } = scenario;
      const watch = watchContentEditable(scenario.editable);
      try {
        tiptap.view.dispatch(
          tiptap.state.tr.setSelection(
            TextSelection.create(tiptap.state.doc, 1, 2),
          ),
        );

        expect(watch.toggleCount()).toBe(0);
        expect(domSelectionText()).toBe("");
      } finally {
        watch.stop();
      }
    });
  });

  it("[가드] 편집 불가 편집기는 재동기화하지 않는다", async () => {
    await withReplacedTextScenario((scenario) => {
      scenario.tiptap.setEditable(false);
      expect(scenario.tiptap.view.editable).toBe(false);
      const watch = watchContentEditable(scenario.editable);
      try {
        dispatchUndo(scenario);

        expect(watch.toggleCount()).toBe(0);
        expect(domSelectionText()).toBe("");
      } finally {
        watch.stop();
      }
    });
  });

  it("[가드] 편집기가 포커스를 가지면 재동기화하지 않는다", async () => {
    await withReplacedTextScenario((scenario) => {
      const hasFocus = vi
        .spyOn(scenario.tiptap.view, "hasFocus")
        .mockReturnValue(true);
      const watch = watchContentEditable(scenario.editable);
      try {
        dispatchUndo(scenario);

        expect(watch.toggleCount()).toBe(0);
      } finally {
        watch.stop();
        hasFocus.mockRestore();
      }
    });
  });

  it("[가드] DOM selection이 view.dom 밖이면 재동기화하지 않는다", async () => {
    await withReplacedTextScenario((scenario) => {
      const outside = document.createElement("p");
      outside.textContent = "outside";
      document.body.append(outside);
      const watch = watchContentEditable(scenario.editable);
      try {
        const text = outside.firstChild;
        if (text === null) throw new Error("바깥 텍스트 노드 조회 실패");
        document.getSelection()?.setBaseAndExtent(text, 0, text, 3);

        dispatchUndo(scenario);

        expect(watch.toggleCount()).toBe(0);
        expect(domSelectionText()).toBe("out");
      } finally {
        watch.stop();
        outside.remove();
      }
    });
  });

  it("[가드] DOM selection이 없으면 재동기화하지 않는다", async () => {
    await withReplacedTextScenario((scenario) => {
      document.getSelection()?.removeAllRanges();
      const watch = watchContentEditable(scenario.editable);
      try {
        dispatchUndo(scenario);

        expect(watch.toggleCount()).toBe(0);
        expect(document.getSelection()?.rangeCount).toBe(0);
      } finally {
        watch.stop();
      }
    });
  });

  it("[가드] 복원된 selection이 TextSelection이 아니면 재동기화하지 않는다", async () => {
    const mount = mounted(dividerBetweenParagraphsDocument());
    const container = attachContainer(mount);
    const button = document.createElement("button");
    document.body.append(button);
    const watch = watchContentEditable(mount.editable);
    try {
      const { tiptap } = mount;
      selectBlockNode(tiptap, "d-1");
      const at = contentTextStart(tiptap, "block-1");
      tiptap.view.dispatch(tiptap.state.tr.insertText(REPLACEMENT, at, at));
      expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
      button.focus();
      placeDomSelectionInFirstParagraph(mount.editable, 0);
      watch.toggleCount();

      withoutScrollCrash(tiptap, () => dispatchUndo({ tiptap }));

      expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
      expect(watch.toggleCount()).toBe(0);
      expect(document.getSelection()?.isCollapsed).toBe(true);
    } finally {
      runCleanups(
        [
          () => watch.stop(),
          clearDomSelection,
          () => button.remove(),
          () => container.remove(),
          () => mount.editor.destroy(),
        ],
        "NodeSelection 시나리오 정리 실패",
      );
    }
  });

  it.each([
    ["input", () => document.createElement("input")],
    ["textarea", () => document.createElement("textarea")],
    ["select", () => document.createElement("select")],
  ] as const)(
    "[가드] %s에 포커스가 있으면 재동기화하지 않는다",
    async (_label, make) => {
      await withReplacedTextScenario((scenario) => {
        const control = make();
        document.body.append(control);
        const watch = watchContentEditable(scenario.editable);
        try {
          control.focus();
          expect(document.activeElement).toBe(control);
          // 브라우저와 jsdom은 입력 컨트롤 포커스 때 DOM selection을 컨트롤로
          // 옮긴다. 컨트롤 가드를 selection 가드와 따로 검증하도록 selection을
          // 편집기 안으로 되돌린다.
          placeDomSelectionInFirstParagraph(scenario.editable, 0);

          dispatchUndo(scenario);

          expect(watch.toggleCount()).toBe(0);
          expect(domSelectionText()).toBe("");
        } finally {
          watch.stop();
          control.remove();
        }
      });
    },
  );

  it("[가드] 다른 편집 영역(contenteditable)에 포커스가 있으면 재동기화하지 않는다", async () => {
    await withReplacedTextScenario((scenario) => {
      const other = document.createElement("div");
      other.setAttribute("contenteditable", "true");
      other.tabIndex = 0;
      // jsdom은 isContentEditable을 구현하지 않아 production 코드가 읽는 값을
      // 직접 정의한다. attribute는 setAttribute로 이미 설정했다(G-TST-001).
      Object.defineProperty(other, "isContentEditable", { value: true });
      document.body.append(other);
      const watch = watchContentEditable(scenario.editable);
      try {
        other.focus();
        expect(document.activeElement).toBe(other);
        placeDomSelectionInFirstParagraph(scenario.editable, 0);

        dispatchUndo(scenario);

        expect(watch.toggleCount()).toBe(0);
        expect(domSelectionText()).toBe("");
      } finally {
        watch.stop();
        other.remove();
      }
    });
  });
});

describe("historyFocusSync — 편집기 두 인스턴스", () => {
  it("selection이 없는 편집기의 history는 그 편집기를 건드리지 않는다", async () => {
    await withReplacedTextScenario((first) => {
      const second = mounted(
        documentOf(paragraphBlock("other-block", BASE_TEXT)),
      );
      const secondContainer = attachContainer(second);
      const watchSecond = watchContentEditable(second.editable);
      try {
        const start = contentTextStart(second.tiptap, "other-block");
        second.tiptap.view.dispatch(
          second.tiptap.state.tr.insertText(
            REPLACEMENT,
            start + 1,
            start + BASE_TEXT.length,
          ),
        );
        watchSecond.toggleCount();

        withoutScrollCrash(second.tiptap, () => dispatchUndo(second));

        expect(watchSecond.toggleCount()).toBe(0);
        expect(
          first.editable.contains(document.getSelection()?.focusNode ?? null),
        ).toBe(true);
        expect(domSelectionText()).toBe("");
      } finally {
        runCleanups(
          [
            () => watchSecond.stop(),
            () => secondContainer.remove(),
            () => second.editor.destroy(),
          ],
          "두 번째 편집기 정리 실패",
        );
      }
    });
  });
});

describe("historyFocusSync — 포커스 복구", () => {
  it("포커스된 버튼이 제거되고 포커스가 BODY로 가면 view.focus()를 호출한다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      const focus = vi.spyOn(scenario.tiptap.view, "focus");
      dispatchUndo(scenario);
      expect(focus).not.toHaveBeenCalled();

      scenario.button.remove();
      await flushObservers();

      expect(focus).toHaveBeenCalledTimes(1);
    });
  });

  it("버튼이 제거되기 전에는 포커스가 BODY로 가 있어도 복구하지 않는다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      const focus = vi.spyOn(scenario.tiptap.view, "focus");
      dispatchUndo(scenario);
      scenario.button.blur();
      expect(document.activeElement).toBe(document.body);
      const unrelated = document.createElement("div");
      document.body.append(unrelated);
      unrelated.remove();
      await flushObservers();

      expect(scenario.button.isConnected).toBe(true);
      expect(focus).not.toHaveBeenCalled();
    });
  });

  it("제거 시점의 activeElement가 BODY도 null도 아니면 복구하지 않는다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      const focus = vi.spyOn(scenario.tiptap.view, "focus");
      dispatchUndo(scenario);
      const other = document.createElement("div");
      document.body.append(other);
      const active = vi
        .spyOn(document, "activeElement", "get")
        .mockReturnValue(other);
      try {
        scenario.button.remove();
        await flushObservers();

        expect(focus).not.toHaveBeenCalled();
      } finally {
        active.mockRestore();
        other.remove();
      }
    });
  });

  it("제거 시점의 activeElement가 null이면 복구한다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      const focus = vi.spyOn(scenario.tiptap.view, "focus");
      dispatchUndo(scenario);
      const active = vi
        .spyOn(document, "activeElement", "get")
        .mockReturnValue(null);
      try {
        scenario.button.remove();
        await flushObservers();

        expect(focus).toHaveBeenCalledTimes(1);
      } finally {
        active.mockRestore();
      }
    });
  });

  it("포커스가 다른 요소로 옮겨진 뒤 기억한 버튼이 제거되면 복구하지 않는다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      const focus = vi.spyOn(scenario.tiptap.view, "focus");
      dispatchUndo(scenario);
      // 두 버튼을 한 래퍼째 제거한다. 포커스가 옮겨졌다는 사실로만 복구가
      // 막힌다 — 제거 시점 activeElement는 BODY다.
      const wrapper = document.createElement("div");
      const other = document.createElement("button");
      wrapper.append(other);
      document.body.append(wrapper);
      try {
        other.focus();
        expect(document.activeElement).toBe(other);
        scenario.button.remove();
        wrapper.remove();
        await flushObservers();

        expect(document.activeElement).toBe(document.body);
        expect(focus).not.toHaveBeenCalled();
      } finally {
        wrapper.remove();
      }
    });
  });

  it("포커스가 BODY인 채 사용자가 클릭하면 감시를 해제해 이후 제거에서 복구하지 않는다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      const focus = vi.spyOn(scenario.tiptap.view, "focus");
      dispatchUndo(scenario);
      // 에디터 밖 비포커스 영역 클릭: 포커스가 BODY로 가지만 focusin은 없다.
      scenario.button.blur();
      expect(document.activeElement).toBe(document.body);
      document.body.dispatchEvent(
        new Event("pointerdown", { bubbles: true, cancelable: true }),
      );

      scenario.button.remove();
      await flushObservers();

      expect(focus).not.toHaveBeenCalled();
    });
  });

  it("다음 history transaction이 새 포커스 요소로 감시를 다시 건다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      const focus = vi.spyOn(scenario.tiptap.view, "focus");
      dispatchUndo(scenario);
      const second = document.createElement("button");
      document.body.append(second);
      try {
        second.focus();
        expect(document.activeElement).toBe(second);
        document.getSelection()?.removeAllRanges();
        placeDomSelectionInFirstParagraph(scenario.editable, 0);

        dispatchRedo(scenario);
        second.remove();
        await flushObservers();

        expect(focus).toHaveBeenCalledTimes(1);
      } finally {
        second.remove();
      }
    });
  });

  it("같은 요소에 감시를 두 번 걸어도 복구는 한 번이다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      const focus = vi
        .spyOn(scenario.tiptap.view, "focus")
        .mockImplementation(() => {});
      dispatchUndo(scenario);
      document.getSelection()?.removeAllRanges();
      placeDomSelectionInFirstParagraph(scenario.editable, 0);
      dispatchRedo(scenario);

      scenario.button.remove();
      await flushObservers();

      expect(focus).toHaveBeenCalledTimes(1);

      // 앞선 감시가 남아 있으면 다음 변이 때 다시 호출한다.
      const unrelated = document.createElement("div");
      document.body.append(unrelated);
      unrelated.remove();
      await flushObservers();

      expect(focus).toHaveBeenCalledTimes(1);
    });
  });

  it("복구는 한 번만 한다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      // jsdom에서 view.focus()가 실제로 포커스를 옮기지 않도록 막아, 두 번째
      // 변이 때 감시가 남아 있으면 포커스가 BODY인 채로 다시 호출되게 한다.
      const focus = vi
        .spyOn(scenario.tiptap.view, "focus")
        .mockImplementation(() => {});
      dispatchUndo(scenario);

      scenario.button.remove();
      await flushObservers();
      const unrelated = document.createElement("div");
      document.body.append(unrelated);
      unrelated.remove();
      await flushObservers();

      expect(focus).toHaveBeenCalledTimes(1);
    });
  });

  it("복원된 selection이 NodeSelection이어도 포커스 복구는 건다", async () => {
    const mount = mounted(dividerBetweenParagraphsDocument());
    const container = attachContainer(mount);
    const button = document.createElement("button");
    document.body.append(button);
    try {
      const { tiptap } = mount;
      selectBlockNode(tiptap, "d-1");
      const at = contentTextStart(tiptap, "block-1");
      tiptap.view.dispatch(tiptap.state.tr.insertText(REPLACEMENT, at, at));
      button.focus();
      placeDomSelectionInFirstParagraph(mount.editable, 0);
      const focus = vi.spyOn(tiptap.view, "focus");

      withoutScrollCrash(tiptap, () => dispatchUndo({ tiptap }));
      const calls = await removeButtonAndCountFocus({ tiptap, button }, focus);

      expect(calls).toBe(1);
    } finally {
      runCleanups(
        [
          clearDomSelection,
          () => button.remove(),
          () => container.remove(),
          () => mount.editor.destroy(),
        ],
        "NodeSelection 복구 시나리오 정리 실패",
      );
    }
  });

  it("[가드] history가 아닌 transaction은 감시를 걸지 않는다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      const { tiptap } = scenario;
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(
          TextSelection.create(tiptap.state.doc, 1, 2),
        ),
      );

      expect(await removeButtonAndCountFocus(scenario)).toBe(0);
    });
  });

  it("[가드] 편집 불가 편집기는 감시를 걸지 않는다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      scenario.tiptap.setEditable(false);
      dispatchUndo(scenario);

      expect(await removeButtonAndCountFocus(scenario)).toBe(0);
    });
  });

  it("[가드] 편집기가 포커스를 가지면 감시를 걸지 않는다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      const hasFocus = vi
        .spyOn(scenario.tiptap.view, "hasFocus")
        .mockReturnValue(true);
      try {
        dispatchUndo(scenario);
      } finally {
        hasFocus.mockRestore();
      }

      expect(await removeButtonAndCountFocus(scenario)).toBe(0);
    });
  });

  it("[가드] DOM selection이 view.dom 밖이면 감시를 걸지 않는다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      const outside = document.createElement("p");
      outside.textContent = "outside";
      document.body.append(outside);
      try {
        const text = outside.firstChild;
        if (text === null) throw new Error("바깥 텍스트 노드 조회 실패");
        document.getSelection()?.setBaseAndExtent(text, 0, text, 3);
        dispatchUndo(scenario);

        expect(await removeButtonAndCountFocus(scenario)).toBe(0);
      } finally {
        outside.remove();
      }
    });
  });

  it.each([
    ["input", () => document.createElement("input")],
    ["textarea", () => document.createElement("textarea")],
    ["select", () => document.createElement("select")],
  ] as const)(
    "[가드] %s에 포커스가 있으면 감시를 걸지 않는다",
    async (_label, make) => {
      await withReplacedTextScenario(async (scenario) => {
        const control = make();
        document.body.append(control);
        try {
          control.focus();
          placeDomSelectionInFirstParagraph(scenario.editable, 0);
          dispatchUndo(scenario);

          expect(
            await removeButtonAndCountFocus({
              tiptap: scenario.tiptap,
              button: control,
            }),
          ).toBe(0);
        } finally {
          control.remove();
        }
      });
    },
  );

  it("[가드] 포커스가 BODY이면 기억할 요소가 없어 감시를 걸지 않는다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      scenario.button.blur();
      expect(document.activeElement).toBe(document.body);
      dispatchUndo(scenario);
      const lateButton = document.createElement("button");
      document.body.append(lateButton);
      try {
        expect(
          await removeButtonAndCountFocus({
            tiptap: scenario.tiptap,
            button: lateButton,
          }),
        ).toBe(0);
      } finally {
        lateButton.remove();
      }
    });
  });
});

describe("historyFocusSync — destroy 정리", () => {
  it("destroy 뒤에는 버튼이 제거돼도 view.focus()를 호출하지 않는다", async () => {
    await withReplacedTextScenario(async (scenario) => {
      const focus = vi.spyOn(scenario.tiptap.view, "focus");
      dispatchUndo(scenario);

      scenario.editor.destroy();
      scenario.button.remove();
      await flushObservers();

      expect(focus).not.toHaveBeenCalled();
    });
  });

  it("destroy가 focusin·pointerdown 리스너를 제거한다", async () => {
    await withReplacedTextScenario((scenario) => {
      dispatchUndo(scenario);
      const remove = vi.spyOn(document, "removeEventListener");
      try {
        scenario.editor.destroy();

        expect(remove).toHaveBeenCalledWith(
          "focusin",
          expect.any(Function),
          expect.anything(),
        );
        expect(remove).toHaveBeenCalledWith(
          "pointerdown",
          expect.any(Function),
          expect.anything(),
        );
      } finally {
        remove.mockRestore();
      }
    });
  });
});
