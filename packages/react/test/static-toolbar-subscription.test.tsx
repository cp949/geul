// @vitest-environment jsdom

/**
 * StaticToolbar가 DOM 이벤트가 아니라 `EditorController.subscribe` 통지로
 * 상태를 갱신하는 계약을 확인한다(RD-001-DELTA-03, Issue #218).
 * fake로는 등록·해제·재렌더 생략·클릭 시점 조회를, 실제 편집기로는
 * 명령 호출만으로 표시가 바뀌는 경로(external ownership)를 본다.
 * 빠른 클릭 순서 문제 자체는 브라우저에서만 재현되어 e2e가 소유한다.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { BlockTypeDescriptor } from "@cp949/geul-core";
import { Profiler } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaticToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { mountBlockEditor } from "./mount-editor.js";
import { fakeStaticToolbarController } from "./static-toolbar-test-support.js";

afterEach(cleanup);

/** 현재 블록 타입을 돌려주는 조회 mock을 만든다. */
const blockTypeQuery = (blockId: string, blockType: BlockTypeDescriptor) =>
  vi.fn(() => ({ blockId, blockType }));

describe("StaticToolbar 구독 기반 상태 갱신", () => {
  it("마운트하면 subscribe로 listener를 1개 등록한다", () => {
    const controller = fakeStaticToolbarController();
    render(withProvider(controller, <StaticToolbar />));

    expect(controller.listenerCount()).toBe(1);
  });

  it("통지를 받으면 DOM 이벤트 없이 새 블록 상태를 표시한다", () => {
    const query = blockTypeQuery("block-1", { type: "paragraph" });
    const controller = fakeStaticToolbarController(undefined, query);
    render(withProvider(controller, <StaticToolbar />));
    const quote = screen.getByRole("button", { name: "Quote" });
    expect(quote.getAttribute("aria-pressed")).toBe("false");

    query.mockReturnValue({ blockId: "block-2", blockType: { type: "quote" } });
    controller.emit();

    expect(quote.getAttribute("aria-pressed")).toBe("true");
  });

  it("상태가 같은 통지는 재렌더하지 않는다", () => {
    const controller = fakeStaticToolbarController();
    const onRender = vi.fn();
    render(
      withProvider(
        controller,
        <Profiler id="static-toolbar" onRender={onRender}>
          <StaticToolbar />
        </Profiler>,
      ),
    );
    const renderCount = onRender.mock.calls.length;

    controller.emit();
    controller.emit();

    expect(onRender).toHaveBeenCalledTimes(renderCount);
  });

  it("unmount하면 구독을 해제한다", () => {
    const controller = fakeStaticToolbarController();
    const { unmount } = render(withProvider(controller, <StaticToolbar />));

    unmount();

    expect(controller.listenerCount()).toBe(0);
  });

  it("editor가 바뀌면 이전 editor의 구독을 해제하고 새 editor에 등록한다", () => {
    const first = fakeStaticToolbarController();
    const second = fakeStaticToolbarController();
    const { rerender } = render(withProvider(first, <StaticToolbar />));

    rerender(withProvider(second, <StaticToolbar />));

    expect(first.listenerCount()).toBe(0);
    expect(second.listenerCount()).toBe(1);
  });

  it("변환 대상 블록은 렌더 시점 상태가 아니라 클릭 시점 selection에서 읽는다", () => {
    const query = blockTypeQuery("block-1", { type: "paragraph" });
    const controller = fakeStaticToolbarController(undefined, query);
    render(withProvider(controller, <StaticToolbar />));

    // 통지 없이 selection만 옮겨진 상태 — React 상태는 아직 block-1이다.
    query.mockReturnValue({
      blockId: "block-2",
      blockType: { type: "paragraph" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Quote" }));

    expect(controller.commands.setBlockType).toHaveBeenCalledWith("block-2", {
      type: "quote",
    });
  });

  it("Callout 버튼이 svg 아이콘을 렌더한다", () => {
    const controller = fakeStaticToolbarController();
    render(withProvider(controller, <StaticToolbar />));

    const callout = screen.getByRole("button", { name: "Callout" });

    expect(callout.querySelector("svg")).not.toBeNull();
  });

  describe("실제 편집기(external ownership)", () => {
    it("editor.commands.setBlockType으로 바꾸면 DOM 이벤트 없이 Quote 버튼이 눌림 상태가 된다", () => {
      const { editor, blockIds } = mountBlockEditor({
        blockIds: ["block-1", "block-2"],
        children: <StaticToolbar />,
      });
      const quote = screen.getByRole("button", { name: "Quote" });
      expect(quote.getAttribute("aria-pressed")).toBe("false");

      act(() => {
        editor.commands.setBlockType(blockIds[0] ?? "", { type: "quote" });
      });

      expect(quote.getAttribute("aria-pressed")).toBe("true");
    });
  });
});
