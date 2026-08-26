/**
 * usePointerDragGesture가 active+pointerId 게이트로 이벤트를 걸러
 * onMove/onUp/onCancel에 넘기고, Escape 콜백의 반환값(null|true)에 따라
 * 제스처를 즉시 끝내거나(null) 이후 onMove 호출만 억제하는지(true) 확인한다.
 */
// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePointerDragGesture } from "../src/use-pointer-drag-gesture.js";

afterEach(cleanup);

type ProbeProps = {
  active: boolean;
  pointerId: number | null;
  onMove: (event: PointerEvent) => void;
  onUp: (event: PointerEvent) => void;
  onCancel: (event: PointerEvent) => void;
  onEscape: (event: KeyboardEvent) => null | true;
};

const Probe = ({
  active,
  pointerId,
  onMove,
  onUp,
  onCancel,
  onEscape,
}: ProbeProps) => {
  usePointerDragGesture({
    active,
    element: document.body,
    pointerId,
    onMove,
    onUp,
    onCancel,
    onEscape,
  });
  return null;
};

const dispatchPointer = (type: string, pointerId: number) =>
  document.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId }));

const dispatchKey = (key: string) =>
  document.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
  );

describe("usePointerDragGesture", () => {
  it("pointerId가 일치하는 pointermove/up/cancel만 각각 콜백으로 넘긴다", () => {
    const onMove = vi.fn();
    const onUp = vi.fn();
    const onCancel = vi.fn();
    render(
      <Probe
        active
        onCancel={onCancel}
        onEscape={() => null}
        onMove={onMove}
        onUp={onUp}
        pointerId={1}
      />,
    );

    dispatchPointer("pointermove", 2);
    dispatchPointer("pointerup", 2);
    dispatchPointer("pointercancel", 2);
    expect(onMove).not.toHaveBeenCalled();
    expect(onUp).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    dispatchPointer("pointermove", 1);
    dispatchPointer("pointerup", 1);
    dispatchPointer("pointercancel", 1);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onUp).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("active가 false면 리스너를 걸지 않는다", () => {
    const onMove = vi.fn();
    render(
      <Probe
        active={false}
        onCancel={vi.fn()}
        onEscape={() => null}
        onMove={onMove}
        onUp={vi.fn()}
        pointerId={1}
      />,
    );

    dispatchPointer("pointermove", 1);

    expect(onMove).not.toHaveBeenCalled();
  });

  it("pointerId가 null이면 리스너를 걸지 않는다", () => {
    const onMove = vi.fn();
    render(
      <Probe
        active
        onCancel={vi.fn()}
        onEscape={() => null}
        onMove={onMove}
        onUp={vi.fn()}
        pointerId={null}
      />,
    );

    dispatchPointer("pointermove", 1);

    expect(onMove).not.toHaveBeenCalled();
  });

  it("Escape가 아닌 키는 onEscape를 호출하지 않는다", () => {
    const onEscape = vi.fn(() => null);
    render(
      <Probe
        active
        onCancel={vi.fn()}
        onEscape={onEscape}
        onMove={vi.fn()}
        onUp={vi.fn()}
        pointerId={1}
      />,
    );

    dispatchKey("Enter");

    expect(onEscape).not.toHaveBeenCalled();
  });

  it("onEscape에 원본 KeyboardEvent를 그대로 전달한다", () => {
    const onEscape = vi.fn(() => null);
    render(
      <Probe
        active
        onCancel={vi.fn()}
        onEscape={onEscape}
        onMove={vi.fn()}
        onUp={vi.fn()}
        pointerId={1}
      />,
    );

    dispatchKey("Escape");

    expect(onEscape).toHaveBeenCalledWith(expect.any(KeyboardEvent));
  });

  it("Escape가 null을 반환하면 이후 pointermove/up/cancel을 모두 무시한다", () => {
    const onMove = vi.fn();
    const onUp = vi.fn();
    const onCancel = vi.fn();
    render(
      <Probe
        active
        onCancel={onCancel}
        onEscape={() => null}
        onMove={onMove}
        onUp={onUp}
        pointerId={1}
      />,
    );

    dispatchKey("Escape");
    dispatchPointer("pointermove", 1);
    dispatchPointer("pointerup", 1);
    dispatchPointer("pointercancel", 1);

    expect(onMove).not.toHaveBeenCalled();
    expect(onUp).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Escape가 true를 반환하면 이후 onMove만 억제하고 onUp/onCancel은 계속 온다", () => {
    const onMove = vi.fn();
    const onUp = vi.fn();
    const onCancel = vi.fn();
    render(
      <Probe
        active
        onCancel={onCancel}
        onEscape={() => true}
        onMove={onMove}
        onUp={onUp}
        pointerId={1}
      />,
    );

    dispatchKey("Escape");
    dispatchPointer("pointermove", 1);
    expect(onMove).not.toHaveBeenCalled();

    dispatchPointer("pointercancel", 1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    dispatchPointer("pointerup", 1);
    expect(onUp).toHaveBeenCalledTimes(1);
  });

  it("언마운트하면 리스너를 제거한다", () => {
    const onMove = vi.fn();
    const { unmount } = render(
      <Probe
        active
        onCancel={vi.fn()}
        onEscape={() => null}
        onMove={onMove}
        onUp={vi.fn()}
        pointerId={1}
      />,
    );

    unmount();
    dispatchPointer("pointermove", 1);

    expect(onMove).not.toHaveBeenCalled();
  });
});
