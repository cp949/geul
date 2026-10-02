/**
 * 진입점과 무관하게 undo·redo가 `DocumentChangeEvent.reason`을 `"undo"`·
 * `"redo"`로 보고하는지 검증한다(Issue #231, G-EDT-004).
 *
 * 두 층으로 나눈다.
 * - `historyReasonOf` 단위: 실제 `prosemirror-history`가 만든 transaction으로
 *   history 여부와 undo·redo 구분을 확인한다. `"history$"` meta 키 의존도
 *   여기서 감시한다.
 * - 진입점 표: 실제 `createEditor()`를 마운트하고 키보드·폴백·공개 command로
 *   undo·redo한다. 각 행은 `onBeforeChange`와 `onChange`의 reason을 둘 다
 *   단언한다. 판정은 세션이 transaction meta로 하므로 진입점 코드는 reason을
 *   모른 채 같은 결과를 내야 한다.
 *
 * 네이티브 beforeinput이 브라우저에서 실제로 어디로 가는지는 jsdom이
 * 증명하지 못한다. 그 라우팅은 기존 e2e가 소유한다.
 */
import { redo, undo } from "@tiptap/pm/history";
import type { Transaction } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { historyReasonOf } from "../src/history-change-reason.js";
import {
  createEditor,
  type DocumentChangeEvent,
  type EditorController,
} from "../src/index.js";
import { contentTextStart, typeNativeText } from "./block-test-support.js";
import {
  documentOf,
  mountTiptapEditor,
  paragraphBlock,
  sequentialIds,
} from "./editor-controller-support.js";
import {
  placeDomSelectionInFirstParagraph,
  runCleanups,
  withoutScrollCrash,
} from "./native-selection-test-support.js";

const BLOCK_ID = "history-block";
const BASE_TEXT = "abc";
const TYPED_TEXT = "X";

type Reason = DocumentChangeEvent["reason"];
type Mount = ReturnType<typeof mountTiptapEditor>;

/** 진입점이 undo·redo를 실행하는 동안 모은 reason 기록. */
type Recorded = {
  /** `onChange`가 받은 reason. */
  change: Reason[];
  /** `onBeforeChange`가 받은 reason. */
  beforeChange: Reason[];
};

/** 시나리오가 fn에 넘기는 마운트 편집기와 보조 요소. */
type Scenario = Mount & {
  editor: EditorController;
  recorded: Recorded;
  /** `view.dom` 밖에 붙은 평범한 버튼. 툴바 컨트롤을 대신한다. */
  button: HTMLButtonElement;
};

/**
 * `view.dom`에 보낼 keydown을 만든다. ProseMirror keymap은 `key`와 함께
 * `keyCode`로 Shift 조합을 푼다.
 */
const keydown = (init: KeyboardEventInit): KeyboardEvent =>
  new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

/** `historyUndo`·`historyRedo` 같은 beforeinput 이벤트를 만든다. */
const beforeInput = (inputType: string): InputEvent =>
  new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    inputType,
  });

const CTRL_Z = { key: "z", keyCode: 90, ctrlKey: true } as const;
const CTRL_SHIFT_Z = {
  key: "Z",
  keyCode: 90,
  ctrlKey: true,
  shiftKey: true,
} as const;
const CTRL_Y = { key: "y", keyCode: 89, ctrlKey: true } as const;

/**
 * 한 글자를 입력해 undo 스택을 만든 마운트 편집기 시나리오를 실행한다.
 * `redoable`이면 입력을 한 번 undo해 redo 스택도 만든다. 준비 단계의 reason
 * 기록은 비우고 fn에는 진입점 실행분만 남긴다. DOM 노드와 selection과 Editor는
 * 항상 정리한다(G-TST-003).
 */
const withHistoryScenario = (
  redoable: boolean,
  fn: (scenario: Scenario) => void,
): void => {
  const recorded: Recorded = { change: [], beforeChange: [] };
  const editor = createEditor({
    initialDocument: documentOf(paragraphBlock(BLOCK_ID, BASE_TEXT)),
    createId: sequentialIds("id"),
    onChange: (event) => recorded.change.push(event.reason),
    onBeforeChange: ({ changes }) => {
      recorded.beforeChange.push(changes.reason);
    },
  });
  const mount = mountTiptapEditor(editor);
  const container = mount.editable.parentElement;
  if (container === null) throw new Error("편집기 컨테이너 조회 실패");
  const button = document.createElement("button");
  try {
    mount.tiptap.commands.setTextSelection(
      contentTextStart(mount.tiptap, BLOCK_ID) + BASE_TEXT.length,
    );
    typeNativeText(mount.tiptap, TYPED_TEXT);
    expect(mount.tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
    if (redoable) {
      expect(editor.commands.undo().ok).toBe(true);
      expect(mount.tiptap.state.doc.textContent).toBe(BASE_TEXT);
    }
    recorded.change.length = 0;
    recorded.beforeChange.length = 0;

    // DOM에는 준비 뒤에 붙인다. 문서를 바꾸는 transaction이 붙은 뷰에서
    // scrollToSelection을 실행하면 jsdom에는 없는 geometry API를 부른다.
    document.body.append(container, button);
    placeDomSelectionInFirstParagraph(
      mount.editable,
      redoable ? BASE_TEXT.length : (BASE_TEXT + TYPED_TEXT).length,
    );
    withoutScrollCrash(mount.tiptap, () =>
      fn({ ...mount, editor, recorded, button }),
    );
  } finally {
    runCleanups(
      [
        () => document.getSelection()?.removeAllRanges(),
        () => button.remove(),
        () => container.remove(),
        () => editor.destroy(),
      ],
      "history reason 시나리오 정리 실패",
    );
  }
};

/** 진입점 1회가 onBeforeChange와 onChange에 같은 reason을 정확히 1번씩 냈는지 본다. */
const expectReported = (recorded: Recorded, expected: Reason): void => {
  expect(recorded.beforeChange).toEqual([expected]);
  expect(recorded.change).toEqual([expected]);
};

describe("historyReasonOf", () => {
  /** 입력 한 번 + undo 한 번을 거친 편집기 state에서 실제 history transaction을 뽑는다. */
  const withHistoryTransactions = (
    fn: (transactions: {
      undoTr: Transaction;
      redoTr: Transaction;
      plainTr: Transaction;
    }) => void,
  ): void => {
    withHistoryScenario(false, ({ tiptap }) => {
      let undoTr: Transaction | null = null;
      let redoTr: Transaction | null = null;
      expect(
        undo(tiptap.state, (tr) => {
          undoTr = tr;
        }),
      ).toBe(true);
      if (undoTr === null) throw new Error("undo transaction 조회 실패");
      const afterUndo = tiptap.state.apply(undoTr);
      expect(
        redo(afterUndo, (tr) => {
          redoTr = tr;
        }),
      ).toBe(true);
      if (redoTr === null) throw new Error("redo transaction 조회 실패");
      fn({
        undoTr,
        redoTr,
        plainTr: tiptap.state.tr.insertText("Z"),
      });
    });
  };

  it("history가 만든 undo transaction은 undo다", () => {
    withHistoryTransactions(({ undoTr }) => {
      expect(historyReasonOf(undoTr)).toBe("undo");
    });
  });

  it("history가 만든 redo transaction은 redo다", () => {
    withHistoryTransactions(({ redoTr }) => {
      expect(historyReasonOf(redoTr)).toBe("redo");
    });
  });

  it("history가 아닌 transaction은 null이다", () => {
    withHistoryTransactions(({ plainTr }) => {
      expect(historyReasonOf(plainTr)).toBeNull();
    });
  });

  it("history meta에 redo가 없으면 undo다", () => {
    withHistoryScenario(false, ({ tiptap }) => {
      const tr = tiptap.state.tr.setMeta("history$", {});
      expect(historyReasonOf(tr)).toBe("undo");
    });
  });

  it("history meta의 redo가 false이면 undo다", () => {
    withHistoryScenario(false, ({ tiptap }) => {
      const tr = tiptap.state.tr.setMeta("history$", { redo: false });
      expect(historyReasonOf(tr)).toBe("undo");
    });
  });
});

describe("history 진입점별 DocumentChangeEvent.reason", () => {
  describe("StarterKit keymap(view.dom 안 keydown)", () => {
    it("Mod-z는 undo로 보고한다", () => {
      withHistoryScenario(false, ({ tiptap, editable, recorded }) => {
        const event = keydown(CTRL_Z);
        editable.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
        expectReported(recorded, "undo");
      });
    });

    it("Mod-Shift-z는 redo로 보고한다", () => {
      withHistoryScenario(true, ({ tiptap, editable, recorded }) => {
        const event = keydown(CTRL_SHIFT_Z);
        editable.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
        expectReported(recorded, "redo");
      });
    });

    it("Mod-y는 redo로 보고한다", () => {
      withHistoryScenario(true, ({ tiptap, editable, recorded }) => {
        const event = keydown(CTRL_Y);
        editable.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
        expectReported(recorded, "redo");
      });
    });
  });

  describe("keydown 폴백(view.dom 밖 버튼 포커스)", () => {
    it("Mod-z는 undo로 보고한다", () => {
      withHistoryScenario(false, ({ tiptap, button, recorded }) => {
        const event = keydown(CTRL_Z);
        button.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
        expectReported(recorded, "undo");
      });
    });

    it("Mod-Shift-z는 redo로 보고한다", () => {
      withHistoryScenario(true, ({ tiptap, button, recorded }) => {
        const event = keydown(CTRL_SHIFT_Z);
        button.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
        expectReported(recorded, "redo");
      });
    });
  });

  describe("keydown 폴백 Mod-y", () => {
    it("Mod-y는 redo로 보고한다", () => {
      withHistoryScenario(true, ({ tiptap, button, recorded }) => {
        const event = keydown(CTRL_Y);
        button.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
        expectReported(recorded, "redo");
      });
    });
  });

  describe("beforeinput 폴백(view.dom 밖 target, selection은 view.dom 안)", () => {
    it("historyUndo는 undo로 보고한다", () => {
      withHistoryScenario(false, ({ tiptap, button, recorded }) => {
        const event = beforeInput("historyUndo");
        button.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
        expectReported(recorded, "undo");
      });
    });

    it("historyRedo는 redo로 보고한다", () => {
      withHistoryScenario(true, ({ tiptap, button, recorded }) => {
        const event = beforeInput("historyRedo");
        button.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
        expectReported(recorded, "redo");
      });
    });
  });

  describe("beforeinput(view.dom 안 target, prosemirror-history 자체 경로)", () => {
    it("historyUndo는 undo로 보고한다", () => {
      withHistoryScenario(false, ({ tiptap, editable, recorded }) => {
        const event = beforeInput("historyUndo");
        editable.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
        expectReported(recorded, "undo");
      });
    });

    it("historyRedo는 redo로 보고한다", () => {
      withHistoryScenario(true, ({ tiptap, editable, recorded }) => {
        const event = beforeInput("historyRedo");
        editable.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
        expectReported(recorded, "redo");
      });
    });
  });

  describe("공개 command(회귀 방지)", () => {
    it("editor.commands.undo()는 undo로 보고한다", () => {
      withHistoryScenario(false, ({ editor, tiptap, recorded }) => {
        expect(editor.commands.undo().ok).toBe(true);

        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
        expectReported(recorded, "undo");
      });
    });

    it("editor.commands.redo()는 redo로 보고한다", () => {
      withHistoryScenario(true, ({ editor, tiptap, recorded }) => {
        expect(editor.commands.redo().ok).toBe(true);

        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
        expectReported(recorded, "redo");
      });
    });
  });

  describe("대조군", () => {
    it("네이티브 글자 입력은 local로 보고한다", () => {
      withHistoryScenario(false, ({ tiptap, recorded }) => {
        typeNativeText(tiptap, "Y");

        expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT + "Y");
        expectReported(recorded, "local");
      });
    });
  });
});
