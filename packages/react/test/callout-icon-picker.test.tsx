// @vitest-environment jsdom

/**
 * CalloutIconPicker(Issue #209 RD-004 DELTA-02): callout 블록 hover 시
 * 아이콘 클릭 트리거가 실측 위치(readPageRect)에 뜨고, 클릭하면
 * EmojiGrid 팝업이 열리며, 항목을 선택하면 setCalloutIcon이 호출되고
 * undo 1회로 복원됨을 검증한다. media-handle-overlays.test.tsx의 hover
 * 시뮬레이션 관례(fireEvent.pointerMove)를 그대로 따른다.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CalloutIconPicker } from "../src/callout-icon-picker.js";
import { mountBlockEditor, stubRect } from "./mount-editor.js";

afterEach(cleanup);

/**
 * callout 콘텐츠 노드([data-geul-callout])는 blockContainer의 자식이라
 * mountBlockEditor의 restubGeometry(최상위 [data-geul-block-id]에만 적용)가
 * 자동으로 rect를 씌우지 않는다 — 이 요소에는 직접 stubRect를 건다.
 */
const renderCalloutPicker = (
  rect: { left: number; top: number; width: number; height: number } = {
    left: 0,
    top: 0,
    width: 600,
    height: 20,
  },
) => {
  const rendered = mountBlockEditor({
    initialBlocks: [
      { id: "callout-1", type: "callout", content: [{ text: "안내" }] },
      { id: "tail", type: "paragraph", content: [{ text: "꼬리" }] },
    ],
    children: <CalloutIconPicker />,
  });
  const calloutElement = rendered.host.querySelector<HTMLElement>(
    "[data-geul-callout]",
  );
  if (calloutElement === null) throw new Error("callout 요소를 찾지 못했다");
  stubRect(calloutElement, rect);
  return { ...rendered, calloutElement };
};

describe("callout hover 시 아이콘 트리거", () => {
  it("callout 콘텐츠를 hover하면 트리거가 실측 위치에 뜨고, 벗어나면 사라진다", () => {
    const { calloutElement } = renderCalloutPicker({
      left: 40,
      top: 80,
      width: 600,
      height: 20,
    });

    expect(screen.queryByLabelText("Change callout icon")).toBeNull();

    fireEvent.pointerMove(calloutElement);
    const trigger = screen.getByLabelText("Change callout icon");
    expect(trigger.style.left).toBe("40px");
    expect(trigger.style.top).toBe("80px");

    fireEvent.pointerMove(document.body);
    expect(screen.queryByLabelText("Change callout icon")).toBeNull();
  });

  it("paragraph를 hover해도 트리거가 뜨지 않는다(callout 전용)", () => {
    const rendered = mountBlockEditor({
      initialBlocks: [
        { id: "callout-1", type: "callout", content: [{ text: "안내" }] },
        { id: "tail", type: "paragraph", content: [{ text: "꼬리" }] },
      ],
      children: <CalloutIconPicker />,
    });
    const paragraphElement = rendered.blocks.find(
      (block) => block.getAttribute("data-geul-block-id") === "tail",
    );
    if (paragraphElement === undefined) throw new Error("paragraph 없음");

    fireEvent.pointerMove(paragraphElement);
    expect(screen.queryByLabelText("Change callout icon")).toBeNull();
  });
});

describe("아이콘 교체", () => {
  it("트리거 클릭 시 그리드가 열리고, 항목 선택 시 icon이 바뀌며 undo 1회로 복원된다", () => {
    const { editor, calloutElement } = renderCalloutPicker();
    fireEvent.pointerMove(calloutElement);
    fireEvent.click(screen.getByLabelText("Change callout icon"));

    const listbox = screen.getByRole("listbox", {
      name: "Callout icon picker",
    });
    const firstOption = listbox.querySelector<HTMLElement>('[role="option"]');
    if (firstOption === null) throw new Error("이모지 옵션이 없다");
    const char = firstOption.textContent;

    fireEvent.click(firstOption);

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(editor.getDocument().blocks[0]).toMatchObject({
      id: "callout-1",
      type: "callout",
      icon: char,
    });

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      id: "callout-1",
      type: "callout",
    });
    expect(
      (editor.getDocument().blocks[0] as { icon?: string }).icon,
    ).toBeUndefined();
  });

  it("Escape로 그리드를 닫고 편집기로 초점을 되돌린다", () => {
    const { editable, calloutElement } = renderCalloutPicker();
    fireEvent.pointerMove(calloutElement);
    fireEvent.click(screen.getByLabelText("Change callout icon"));
    expect(screen.getByRole("listbox")).not.toBeNull();

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });
});

describe("그리드 닫힘이 useDismissibleOverlay 규칙을 따른다(Issue #233 RD-003 DELTA-05)", () => {
  /** callout을 hover해 아이콘 그리드를 연다. 편집 영역과 트리거를 돌려준다. */
  const openGrid = () => {
    const { editable, calloutElement } = renderCalloutPicker();
    fireEvent.pointerMove(calloutElement);
    const trigger = screen.getByLabelText("Change callout icon");
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).not.toBeNull();
    return { editable, trigger };
  };

  it("바깥 클릭 때 초점이 트리거에 있으면 그리드를 닫고 편집기로 옮긴다", () => {
    const { editable, trigger } = openGrid();
    trigger.focus();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("편집기 밖에서 이미 preventDefault된 Escape는 그리드를 닫지 않는다", () => {
    openGrid();
    const outside = document.createElement("input");
    document.body.append(outside);
    try {
      outside.focus();
      outside.addEventListener("keydown", (event) => event.preventDefault());

      fireEvent.keyDown(outside, { key: "Escape" });

      expect(screen.queryByRole("listbox")).not.toBeNull();
    } finally {
      outside.remove();
    }
  });

  it("IME 조합 중 Escape는 그리드를 닫지 않고 조합이 끝난 뒤 Escape는 닫는다", () => {
    openGrid();

    fireEvent.keyDown(document, { key: "Escape", isComposing: true });
    expect(screen.queryByRole("listbox")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
