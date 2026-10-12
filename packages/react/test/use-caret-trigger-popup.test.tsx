// @vitest-environment jsdom

/**
 * useCaretTriggerPopup의 계약을 실제 편집기에서 하나씩 고정한다.
 *
 * 훅이 소유하는 것: 열림 판정(selectionchange 이중 읽기, input, codeBlock 제외),
 * 재오픈 억제(dismiss/close), 명시 열기(open), 확정 전 DOM 캐럿 검사, keydown
 * 배선, Escape·바깥 클릭 닫기. 소비자가 소유하는 것(후보, 렌더, 이동 규칙)은
 * 이 파일의 Probe가 최소 구현으로 대신한다.
 *
 * 편집기는 mountBlockEditor로 마운트하고 캐럿 배치·selectionchange는 공용
 * helper를 쓴다(G-TST-001, G-TST-002).
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { act, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type CaretTriggerPopupState,
  useCaretTriggerPopup,
} from "../src/use-caret-trigger-popup.js";
import { releaseEnterRepeatSuppression } from "./menu-keyboard-test-support.js";
import {
  focusOutsideEditor,
  mountBlockEditor,
  moveCaretWithSingleEvent,
  paragraphOf,
  placeCaret,
} from "./mount-editor.js";
import { fireSelectionChange } from "./selection-events.js";
import { typeIntoBlock } from "./slash-menu/slash-menu-test-support.js";

afterEach(() => {
  cleanup();
  releaseEnterRepeatSuppression();
  vi.restoreAllMocks();
});

const PROBE_ALLOW_SELECTORS = [".probe-popup"] as const;
const PROBE_ITEM_COUNT = 5;

const parseSlashQuery = (text: string): string | null => {
  const match = /^\/(\S*)$/.exec(text);
  return match === null ? null : (match[1] ?? "");
};

type Popup = ReturnType<typeof useCaretTriggerPopup>;

type ProbeHandle = {
  popup: Popup;
  setItemCount: (count: number) => void;
};

/**
 * 훅을 쓰는 최소 소비자. 상태를 DOM에 찍고, 매 렌더 새 함수로 옵션을 넘긴다.
 * `itemCount`는 state라 렌더마다 옵션 클로저가 바뀐다.
 */
const Probe = ({
  expose,
  onActivate,
}: {
  expose: (handle: ProbeHandle) => void;
  onActivate: (state: CaretTriggerPopupState) => void;
}) => {
  const [itemCount, setItemCount] = useState(PROBE_ITEM_COUNT);
  const renders = useRef(0);
  renders.current += 1;
  const popup = useCaretTriggerPopup({
    parseQuery: (text) => parseSlashQuery(text),
    getItemCount: () => itemCount,
    navigate: (key, state) => {
      if (key !== "ArrowDown" && key !== "ArrowUp") return null;
      const step = key === "ArrowDown" ? 1 : -1;
      const count = Math.max(itemCount, 1);
      return (state.highlightedIndex + step + count) % count;
    },
    onActivate: (state) => onActivate(state),
    allowSelectors: PROBE_ALLOW_SELECTORS,
  });
  expose({ popup, setItemCount });
  return (
    <>
      <output data-testid="state">{JSON.stringify(popup.state)}</output>
      <output data-testid="renders">{renders.current}</output>
      <button data-testid="outside" type="button">
        바깥
      </button>
      {popup.state !== null && <div className="probe-popup">popup</div>}
    </>
  );
};

const mountProbe = (options?: { blockIds?: readonly string[] }) => {
  let latest: ProbeHandle | null = null;
  const onActivate = vi.fn<(state: CaretTriggerPopupState) => void>();
  const rendered = mountBlockEditor({
    ...options,
    children: (
      <Probe
        expose={(handle) => {
          latest = handle;
        }}
        onActivate={onActivate}
      />
    ),
  });
  rendered.editable.focus();
  const handle = (): ProbeHandle => {
    if (latest === null) throw new Error("Probe가 렌더되지 않았다");
    return latest;
  };
  return { ...rendered, onActivate, handle };
};

const readState = (): CaretTriggerPopupState | null => {
  const text = screen.getByTestId("state").textContent ?? "null";
  return JSON.parse(text) as CaretTriggerPopupState | null;
};

const readRenders = (): number =>
  Number(screen.getByTestId("renders").textContent);

/**
 * PM state를 건드리지 않고 DOM 캐럿만 옮긴다. 이벤트는 쏘지 않는다.
 * 키보드 이동 직후 PM state가 낡은 구간을 재현한다(Issue #258).
 */
const moveDomCaretSilently = (target: HTMLElement) => {
  const selection = document.getSelection();
  if (selection === null) throw new Error("DOM 선택을 얻지 못했다");
  const range = document.createRange();
  range.setStart(target, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

describe("useCaretTriggerPopup 열림 판정", () => {
  it("state는 처음에 null이고 parseQuery가 맞으면 { blockId, query, highlightedIndex }가 된다", () => {
    const rendered = mountProbe({ blockIds: ["alpha"] });
    expect(readState()).toBeNull();

    typeIntoBlock(rendered, 0, "/ab");

    expect(readState()).toEqual({
      blockId: "alpha",
      query: "ab",
      highlightedIndex: 0,
    });
  });

  it("parseQuery가 null을 돌려주면 닫는다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");
    expect(readState()).not.toBeNull();

    typeIntoBlock(rendered, 0, "hello");

    expect(readState()).toBeNull();
  });

  it("캐럿이 codeBlock 안이면 텍스트가 질의 모양이어도 열지 않는다", () => {
    const rendered = mountProbe();
    const blockId = typeIntoBlock(rendered, 0, "/code");
    expect(readState()).not.toBeNull();
    const converted = rendered.editor.commands.setBlockType(blockId, {
      type: "codeBlock",
    });
    if (!converted.ok) throw new Error("코드 블록 fixture 준비 실패");
    const code = rendered.host.querySelector<HTMLElement>(
      "[data-geul-code-block] code",
    );
    if (code === null) throw new Error("코드 편집 DOM을 찾지 못했다");

    placeCaret(code);
    // 전제: 컨트롤러가 이 캐럿을 codeBlock으로 본다.
    expect(rendered.editor.getCaretBlockContext()?.blockType.type).toBe(
      "codeBlock",
    );
    fireSelectionChange();

    expect(readState()).toBeNull();
  });

  it("캐럿이 다른 블록으로 옮겨가면 selectionchange 한 번만으로 닫는다(Issue #229)", async () => {
    const rendered = mountProbe({ blockIds: ["alpha", "beta", "gamma"] });
    typeIntoBlock(rendered, 1, "/head");
    expect(readState()?.blockId).toBe("beta");

    await moveCaretWithSingleEvent(paragraphOf(rendered.blocks[2]));

    expect(rendered.editor.getCaretBlockContext()?.blockId).toBe("gamma");
    expect(readState()).toBeNull();
  });

  it("후보 수가 줄면 highlightedIndex를 마지막 후보로 줄인다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");
    act(() => rendered.handle().popup.setHighlightedIndex(4));
    expect(readState()?.highlightedIndex).toBe(4);

    act(() => rendered.handle().setItemCount(2));
    fireSelectionChange();

    expect(readState()?.highlightedIndex).toBe(1);
  });

  it("refresh()도 후보 수가 줄었으면 highlightedIndex를 마지막 후보로 줄인다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");
    act(() => rendered.handle().popup.setHighlightedIndex(4));
    act(() => rendered.handle().setItemCount(2));
    // 전제: 후보 수만 바뀌었고 아직 아무도 다시 읽지 않았다.
    expect(readState()?.highlightedIndex).toBe(4);

    act(() => rendered.handle().popup.refresh());

    expect(readState()).toEqual({
      blockId: rendered.blockIds[0],
      query: "ab",
      highlightedIndex: 1,
    });
  });

  it("refresh()는 후보가 0건이면 highlightedIndex를 0으로 줄이고 후보가 늘어도 키우지 않는다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");
    act(() => rendered.handle().popup.setHighlightedIndex(3));

    act(() => rendered.handle().setItemCount(0));
    act(() => rendered.handle().popup.refresh());
    expect(readState()?.highlightedIndex).toBe(0);

    act(() => rendered.handle().popup.setHighlightedIndex(1));
    act(() => rendered.handle().setItemCount(5));
    act(() => rendered.handle().popup.refresh());
    expect(readState()?.highlightedIndex).toBe(1);
  });
});

describe("useCaretTriggerPopup dismiss·close·open", () => {
  it("dismiss() 뒤 같은 blockId와 텍스트면 다시 열지 않고 텍스트가 바뀌면 다시 연다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");
    expect(readState()).not.toBeNull();

    act(() => rendered.handle().popup.dismiss());
    expect(readState()).toBeNull();
    fireSelectionChange();
    expect(readState()).toBeNull();

    typeIntoBlock(rendered, 0, "/abc");
    expect(readState()?.query).toBe("abc");
  });

  it("close()는 재오픈 방지 기록을 남기지 않아 같은 텍스트로 다시 열 수 있다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");
    expect(readState()).not.toBeNull();

    act(() => rendered.handle().popup.close());
    expect(readState()).toBeNull();
    fireSelectionChange();

    expect(readState()?.query).toBe("ab");
  });

  it('open(blockId, "")는 빈 텍스트 블록에서 열림을 유지하고 텍스트가 질의가 아니게 되면 닫는다', () => {
    const rendered = mountProbe({ blockIds: ["alpha", "beta"] });
    const blockId = rendered.blockIds[0];
    const block = rendered.blocks[0];
    if (blockId === undefined || block === undefined) {
      throw new Error("블록을 찾지 못했다");
    }
    const cleared = rendered.editor.commands.setText(blockId, "");
    if (!cleared.ok) throw new Error("빈 블록 fixture 준비 실패");
    placeCaret(block);
    fireSelectionChange();
    // 전제: 명시 열기 없이는 빈 텍스트에서 열리지 않는다.
    expect(readState()).toBeNull();

    act(() => rendered.handle().popup.open(blockId, ""));
    expect(readState()).toEqual({ blockId, query: "", highlightedIndex: 0 });
    fireSelectionChange();
    expect(readState()).toEqual({ blockId, query: "", highlightedIndex: 0 });

    const typed = rendered.editor.commands.setText(blockId, "x");
    if (!typed.ok) throw new Error("텍스트 fixture 준비 실패");
    placeCaret(block);
    fireSelectionChange();
    expect(readState()).toBeNull();
  });

  it('close()는 open(blockId, "")의 명시 열기 기록도 지워 빈 텍스트 블록에서 다시 열리지 않는다', () => {
    const rendered = mountProbe({ blockIds: ["alpha", "beta"] });
    const blockId = rendered.blockIds[0];
    const block = rendered.blocks[0];
    if (blockId === undefined || block === undefined) {
      throw new Error("블록을 찾지 못했다");
    }
    const cleared = rendered.editor.commands.setText(blockId, "");
    if (!cleared.ok) throw new Error("빈 블록 fixture 준비 실패");
    placeCaret(block);
    act(() => rendered.handle().popup.open(blockId, ""));
    expect(readState()).not.toBeNull();

    act(() => rendered.handle().popup.close());
    expect(readState()).toBeNull();
    fireSelectionChange();

    expect(readState()).toBeNull();
  });

  it("refresh()는 열려 있을 때 새 state 객체를 커밋해 다시 렌더하고 닫혀 있으면 아무것도 하지 않는다", () => {
    const rendered = mountProbe();
    const closedRenders = readRenders();
    act(() => rendered.handle().popup.refresh());
    expect(readRenders()).toBe(closedRenders);

    typeIntoBlock(rendered, 0, "/ab");
    const before = rendered.handle().popup.state;
    const openRenders = readRenders();

    act(() => rendered.handle().popup.refresh());

    const after = rendered.handle().popup.state;
    expect(after).toEqual(before);
    expect(after).not.toBe(before);
    expect(readRenders()).toBe(openRenders + 1);
  });
});

describe("useCaretTriggerPopup 키보드", () => {
  it("Enter는 DOM 캐럿이 state 블록의 접힌 캐럿이고 후보가 있으면 onActivate(state)를 부른다", () => {
    const rendered = mountProbe({ blockIds: ["alpha"] });
    typeIntoBlock(rendered, 0, "/ab");

    const notPrevented = fireEvent.keyDown(rendered.editable, { key: "Enter" });

    expect(notPrevented).toBe(false);
    expect(rendered.onActivate).toHaveBeenCalledTimes(1);
    expect(rendered.onActivate).toHaveBeenCalledWith({
      blockId: "alpha",
      query: "ab",
      highlightedIndex: 0,
    });
  });

  it("후보가 0건이면 Enter를 막고 onActivate를 부르지 않으며 닫지도 않는다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");
    act(() => rendered.handle().setItemCount(0));

    const notPrevented = fireEvent.keyDown(rendered.editable, { key: "Enter" });

    expect(notPrevented).toBe(false);
    expect(rendered.onActivate).not.toHaveBeenCalled();
    expect(readState()).not.toBeNull();
  });

  it("DOM 캐럿이 다른 블록이면 Enter에서 닫고 onActivate를 부르지 않는다(Issue #258)", () => {
    const rendered = mountProbe({ blockIds: ["alpha", "beta"] });
    typeIntoBlock(rendered, 0, "/ab");
    expect(readState()?.blockId).toBe("alpha");

    moveDomCaretSilently(paragraphOf(rendered.blocks[1]));
    const notPrevented = fireEvent.keyDown(rendered.editable, { key: "Enter" });

    expect(notPrevented).toBe(false);
    expect(rendered.onActivate).not.toHaveBeenCalled();
    expect(readState()).toBeNull();
  });

  it("navigate가 숫자를 돌려주면 highlightedIndex가 그 값이 되고 키를 막는다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");

    expect(fireEvent.keyDown(rendered.editable, { key: "ArrowDown" })).toBe(
      false,
    );
    expect(fireEvent.keyDown(rendered.editable, { key: "ArrowDown" })).toBe(
      false,
    );
    expect(readState()?.highlightedIndex).toBe(2);

    expect(fireEvent.keyDown(rendered.editable, { key: "ArrowUp" })).toBe(
      false,
    );
    expect(readState()?.highlightedIndex).toBe(1);
  });

  it("한 act 안의 연속 이동 키도 앞 키의 결과 위에서 이동한다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");

    // 한 act는 렌더를 미룬다. 두 번째 키가 렌더 전 state를 보면 1에 머문다.
    act(() => {
      fireEvent.keyDown(rendered.editable, { key: "ArrowDown" });
      fireEvent.keyDown(rendered.editable, { key: "ArrowDown" });
    });

    expect(readState()?.highlightedIndex).toBe(2);
  });

  it("navigate가 null을 돌려주면 키를 막지 않고 state를 바꾸지 않는다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");

    const notPrevented = fireEvent.keyDown(rendered.editable, { key: "a" });

    expect(notPrevented).toBe(true);
    expect(readState()?.highlightedIndex).toBe(0);
  });

  it("닫혀 있으면 어떤 키도 막지 않는다", () => {
    const rendered = mountProbe();

    // Enter는 ProseMirror가 블록 분할로 먼저 막으므로 이동 키로 본다.
    expect(fireEvent.keyDown(rendered.editable, { key: "ArrowDown" })).toBe(
      true,
    );
    fireEvent.keyDown(rendered.editable, { key: "Enter" });
    expect(rendered.onActivate).not.toHaveBeenCalled();
    expect(readState()).toBeNull();
  });
});

describe("useCaretTriggerPopup 닫기", () => {
  it("Escape는 dismiss하고 초점을 편집기로 돌리며 같은 텍스트로 다시 열지 않는다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");
    focusOutsideEditor(screen.getByTestId("outside"));

    fireEvent.keyDown(rendered.host, { key: "Escape" });

    expect(readState()).toBeNull();
    expect(document.activeElement).toBe(rendered.editable);
    fireSelectionChange();
    expect(readState()).toBeNull();
  });

  it("allowSelectors 밖 pointerdown은 dismiss한다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");

    fireEvent.pointerDown(screen.getByTestId("outside"));

    expect(readState()).toBeNull();
    fireSelectionChange();
    expect(readState()).toBeNull();
  });

  it("allowSelectors 안 pointerdown은 닫지 않는다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");
    const popup = document.querySelector<HTMLElement>(".probe-popup");
    if (popup === null) throw new Error("popup 표면을 찾지 못했다");

    fireEvent.pointerDown(popup);

    expect(readState()).not.toBeNull();
  });
});

describe("useCaretTriggerPopup 콜백 안정성", () => {
  it("옵션 콜백이 렌더마다 새 함수여도 리스너를 다시 등록하지 않는다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");
    const documentAdd = vi.spyOn(document, "addEventListener");
    const documentRemove = vi.spyOn(document, "removeEventListener");
    const hostAdd = vi.spyOn(rendered.host, "addEventListener");
    const hostRemove = vi.spyOn(rendered.host, "removeEventListener");
    const rendersBefore = readRenders();

    act(() => rendered.handle().popup.refresh());
    act(() => rendered.handle().popup.setHighlightedIndex(3));
    act(() => rendered.handle().setItemCount(4));

    // 전제: 세 번 다시 렌더됐다. 렌더가 없으면 아래 0건은 공허하다.
    expect(readRenders()).toBeGreaterThanOrEqual(rendersBefore + 3);
    expect(documentAdd).not.toHaveBeenCalled();
    expect(documentRemove).not.toHaveBeenCalled();
    expect(hostAdd).not.toHaveBeenCalled();
    expect(hostRemove).not.toHaveBeenCalled();
  });

  it("리스너를 다시 등록하지 않아도 마지막 렌더의 옵션 콜백을 읽는다", () => {
    const rendered = mountProbe();
    typeIntoBlock(rendered, 0, "/ab");

    act(() => rendered.handle().setItemCount(0));
    fireEvent.keyDown(rendered.editable, { key: "Enter" });
    expect(rendered.onActivate).not.toHaveBeenCalled();

    act(() => rendered.handle().setItemCount(3));
    fireEvent.keyDown(rendered.editable, { key: "Enter" });
    expect(rendered.onActivate).toHaveBeenCalledTimes(1);
  });
});
