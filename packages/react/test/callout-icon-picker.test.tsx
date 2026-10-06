// @vitest-environment jsdom

/**
 * CalloutIconPicker(Issue #209 RD-004 DELTA-02): callout 블록 hover 시
 * 아이콘 클릭 트리거가 실측 위치(readPageRect)에 뜨고, 클릭하면
 * EmojiGrid 팝업이 열리며, 항목을 선택하면 setCalloutIcon이 호출되고
 * undo 1회로 복원됨을 검증한다. media-handle-overlays.test.tsx의 hover
 * 시뮬레이션 관례(fireEvent.pointerMove)를 그대로 따른다.
 *
 * 추가 주제(Issue #235): 트리거는 page 좌표 absolute라 안쪽 스크롤 컨테이너가
 * 스크롤돼도 제자리에 남는다. scroll에서 위치를 다시 읽고, 에디터 host가 자르는
 * 영역 밖이면 숨기며, 선택기가 열린 동안에는 숨기지 않는다. 실제 안쪽 스크롤은
 * jsdom이 만들 수 없어 stubRect로 rect를 주입한다. 위치 증명은 Chromium e2e가 한다.
 *
 * 추가 주제(Issue #280): 접힌 toggle이 가린 callout(`data-geul-collapsed-hidden`
 * 조상)은 트리거를 그리지 않는다. hover 중인 callout이 가려지면 재평가 뒤 트리거가
 * 사라지고, 열린 선택기는 대상 callout이 가려지면 닫힌다. 표식은 core
 * 접힘 decoration이 실제로 붙인다.
 *
 * 추가 주제(Issue #288): hover 중인 callout이 호스트 API로 접히면 DOM 이벤트 없이
 * 트리거가 사라진다. 열린 선택기의 대상 callout이 삭제되면 `invalidated`로 닫힌다.
 */

import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CalloutIconPicker } from "../src/callout-icon-picker.js";
import { toggleCollapseByHostApi } from "./collapsed-toggle-test-support.js";
import {
  makeScrollContainer,
  mountBlockEditor,
  stubRect,
} from "./mount-editor.js";
import { watchWindowScrollCapture } from "./scroll-listener-probe.js";

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

describe("열린 그리드의 배치(Issue #234)", () => {
  it("그리드는 열린 callout 하단에 뜨고 포인터가 떠나도 스크롤이 callout을 따라간다", () => {
    const { calloutElement } = renderCalloutPicker({
      left: 40,
      top: 80,
      width: 600,
      height: 20,
    });
    fireEvent.pointerMove(calloutElement);
    fireEvent.click(screen.getByLabelText("Change callout icon"));
    const listbox = screen.getByRole("listbox", {
      name: "Callout icon picker",
    });
    expect(listbox.style.left).toBe("40px");
    expect(listbox.style.top).toBe("100px");

    // hover가 풀려도 앵커는 열린 blockId의 callout이다. hoverElement가 아니다.
    fireEvent.pointerMove(document.body);
    expect(screen.queryByLabelText("Change callout icon")).toBeNull();
    stubRect(calloutElement, { left: 40, top: 300, width: 600, height: 20 });
    fireEvent.scroll(calloutElement);

    expect(listbox.style.left).toBe("40px");
    expect(listbox.style.top).toBe("320px");
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

describe("안쪽 스크롤 추종과 clip(Issue #235)", () => {
  const triggerLabel = "Change callout icon";

  it("scroll이 일어나면 트리거가 callout의 새 위치를 다시 읽는다", () => {
    const { calloutElement } = renderCalloutPicker({
      left: 40,
      top: 80,
      width: 600,
      height: 20,
    });
    fireEvent.pointerMove(calloutElement);
    const trigger = screen.getByLabelText(triggerLabel);
    expect(trigger.style.top).toBe("80px");

    // 포인터는 그대로이고 안쪽 스크롤만 callout을 위로 밀어 올린 상황이다.
    stubRect(calloutElement, { left: 40, top: 20, width: 600, height: 20 });
    fireEvent.scroll(calloutElement);

    expect(screen.getByLabelText(triggerLabel).style.top).toBe("20px");
  });

  it("hover 중에만 window scroll capture를 구독한다", () => {
    const watch = watchWindowScrollCapture();
    try {
      const { calloutElement } = renderCalloutPicker();
      const mounted = watch.net();

      fireEvent.pointerMove(calloutElement);
      expect(watch.net()).toBe(mounted + 1);

      fireEvent.pointerMove(document.body);
      expect(watch.net()).toBe(mounted);
    } finally {
      watch.restore();
    }
  });

  it("트리거 박스가 영역 안이면 보이고 밖이면 숨긴다", () => {
    const { host, calloutElement } = renderCalloutPicker();
    makeScrollContainer(host);
    fireEvent.pointerMove(calloutElement);
    const trigger = screen.getByLabelText(triggerLabel);

    stubRect(trigger, { left: 0, top: 10, width: 24, height: 24 });
    fireEvent.scroll(calloutElement);
    expect(trigger.style.visibility).toBe("");

    stubRect(trigger, { left: 0, top: 300, width: 24, height: 24 });
    fireEvent.scroll(calloutElement);
    expect(trigger.style.visibility).toBe("hidden");

    stubRect(trigger, { left: 0, top: 10, width: 24, height: 24 });
    fireEvent.scroll(calloutElement);
    expect(trigger.style.visibility).toBe("");
  });

  it("선택기가 열려 있는 동안에는 영역 밖이어도 트리거를 숨기지 않는다", () => {
    const { host, calloutElement } = renderCalloutPicker();
    makeScrollContainer(host);
    fireEvent.pointerMove(calloutElement);
    const trigger = screen.getByLabelText(triggerLabel);
    stubRect(trigger, { left: 0, top: 300, width: 24, height: 24 });
    fireEvent.scroll(calloutElement);
    expect(trigger.style.visibility).toBe("hidden");

    // 열린 직후 재렌더에서 exempt가 적용된다. 숨은 요소는 초점을 잃는다.
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).not.toBeNull();
    expect(trigger.style.visibility).toBe("");

    fireEvent.scroll(calloutElement);
    expect(trigger.style.visibility).toBe("");
  });

  it("선택기가 열린 callout이 아닌 다른 callout의 트리거는 영역 밖이면 숨는다", () => {
    const { host } = mountBlockEditor({
      initialBlocks: [
        { id: "callout-1", type: "callout", content: [{ text: "안내" }] },
        { id: "callout-2", type: "callout", content: [{ text: "주의" }] },
      ],
      children: <CalloutIconPicker />,
    });
    const [first, second] = Array.from(
      host.querySelectorAll<HTMLElement>("[data-geul-callout]"),
    );
    if (first === undefined || second === undefined) {
      throw new Error("callout 요소를 찾지 못했다");
    }
    stubRect(first, { left: 0, top: 0, width: 600, height: 20 });
    stubRect(second, { left: 0, top: 400, width: 600, height: 20 });
    makeScrollContainer(host);

    fireEvent.pointerMove(first);
    fireEvent.click(screen.getByLabelText(triggerLabel));
    expect(screen.getByRole("listbox")).not.toBeNull();

    // 선택기를 연 채 포인터만 옮겨 다른 callout을 hover한다.
    fireEvent.pointerMove(second);
    const trigger = screen.getByLabelText(triggerLabel);
    stubRect(trigger, { left: 0, top: 400, width: 24, height: 24 });
    fireEvent.scroll(second);
    expect(trigger.style.visibility).toBe("hidden");
  });
});

describe("접힌 toggle 안 숨은 callout은 트리거 대상이 아니다(Issue #280)", () => {
  const triggerLabel = "Change callout icon";

  /**
   * p1, tg(자식 callout c1) 문서를 마운트한다. callout 콘텐츠 노드는
   * 마운트 헬퍼가 스텁하지 않아 직접 rect를 건다. 숨은 callout도 보이는 rect를
   * 가져 표식만이 판정 근거가 된다.
   */
  const mountToggleCallout = (collapsed: boolean) => {
    const rendered = mountBlockEditor({
      initialBlocks: [
        { id: "p1", type: "paragraph", content: [{ text: "문단" }] },
        {
          id: "tg",
          type: "toggleListItem",
          content: [{ text: "toggle" }],
          collapsed,
          children: [
            { id: "c1", type: "callout", content: [{ text: "안내" }] },
          ],
        },
      ],
      children: <CalloutIconPicker />,
    });
    return rendered;
  };

  /** 접힘이 DOM을 다시 그릴 수 있어 callout 콘텐츠 노드를 host에서 새로 찾고 rect를 건다. */
  const calloutOf = (host: HTMLElement): HTMLElement => {
    const callout = host.querySelector<HTMLElement>("[data-geul-callout]");
    if (callout === null) throw new Error("callout 요소를 찾지 못했다");
    stubRect(callout, { left: 40, top: 100, width: 600, height: 20 });
    return callout;
  };

  it("접힌 toggle의 숨은 callout 위에 hover해도 트리거를 그리지 않는다", () => {
    const { host } = mountToggleCallout(true);
    const callout = calloutOf(host);
    expect(callout.closest("[data-geul-collapsed-hidden]")).not.toBeNull();

    fireEvent.pointerMove(callout);

    expect(screen.queryByLabelText(triggerLabel)).toBeNull();
  });

  it("펼친 toggle의 자식 callout 위에서는 트리거를 그린다", () => {
    const { host } = mountToggleCallout(false);

    fireEvent.pointerMove(calloutOf(host));

    expect(screen.getByLabelText(triggerLabel).style.top).toBe("100px");
  });

  it("hover 중인 callout이 접힘에 가려지면 재평가 뒤 트리거가 사라진다", () => {
    const { host, editor } = mountToggleCallout(false);
    fireEvent.pointerMove(calloutOf(host));
    expect(screen.getByLabelText(triggerLabel)).not.toBeNull();

    act(() => {
      editor.commands.toggleListItemCollapse("tg");
    });
    expect(
      calloutOf(host).closest("[data-geul-collapsed-hidden]"),
    ).not.toBeNull();
    // Ctrl+Z 같은 키 입력 뒤 오는 keyup이 useSelectionRefresh를 돈다.
    fireEvent.keyUp(document, { key: "z", ctrlKey: true });

    expect(screen.queryByLabelText(triggerLabel)).toBeNull();
  });

  it("열린 선택기는 대상 callout이 접힘에 가려지면 닫힌다", () => {
    const { host, editor } = mountToggleCallout(false);
    fireEvent.pointerMove(calloutOf(host));
    fireEvent.click(screen.getByLabelText(triggerLabel));
    expect(screen.getByRole("listbox")).not.toBeNull();

    act(() => {
      editor.commands.toggleListItemCollapse("tg");
    });
    expect(
      calloutOf(host).closest("[data-geul-collapsed-hidden]"),
    ).not.toBeNull();

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("접힘 뒤 다시 펼쳐도 닫힌 선택기는 되살아나지 않는다", () => {
    const { host, editor } = mountToggleCallout(false);
    fireEvent.pointerMove(calloutOf(host));
    fireEvent.click(screen.getByLabelText(triggerLabel));

    act(() => {
      editor.commands.toggleListItemCollapse("tg");
    });
    act(() => {
      editor.commands.toggleListItemCollapse("tg");
    });

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("접힘 표식이 없는 callout의 열린 선택기는 문서가 바뀌어도 열려 있다(대조)", () => {
    const { host, editor } = mountToggleCallout(false);
    fireEvent.pointerMove(calloutOf(host));
    fireEvent.click(screen.getByLabelText(triggerLabel));

    act(() => {
      editor.commands.setCalloutIcon("c1", "\u{1F4A1}");
    });

    expect(screen.getByRole("listbox")).not.toBeNull();
  });

  // Issue #288. 아래 두 경로는 DOM 이벤트(keyup·selectionchange·resize)를 보내지
  // 않는다. 호스트 API만으로 문서가 바뀌는 경우다.
  it("hover 중인 callout이 호스트 API로 접히면 DOM 이벤트 없이 트리거가 사라진다(#288)", () => {
    const { host, editor } = mountToggleCallout(false);
    fireEvent.pointerMove(calloutOf(host));
    expect(screen.getByLabelText(triggerLabel)).not.toBeNull();

    toggleCollapseByHostApi(editor);

    expect(
      calloutOf(host).closest("[data-geul-collapsed-hidden]"),
    ).not.toBeNull();
    expect(screen.queryByLabelText(triggerLabel)).toBeNull();
  });

  it("열린 선택기의 대상 callout이 deleteBlock으로 지워지면 invalidated로 닫힌다(#288)", () => {
    const { host, editor } = mountToggleCallout(false);
    fireEvent.pointerMove(calloutOf(host));
    fireEvent.click(screen.getByLabelText(triggerLabel));
    expect(screen.getByRole("listbox")).not.toBeNull();

    act(() => {
      editor.commands.deleteBlock("c1");
    });

    expect(editor.getBlock("c1")).toBeUndefined();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
