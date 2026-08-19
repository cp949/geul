// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDismissOnOutsideOrEscape } from "../src/use-dismiss-on-outside-or-escape.js";

afterEach(cleanup);

type ProbeProps = {
  active: boolean;
  allowSelectors: readonly string[];
  onDismiss: () => void;
  onEscape: () => void;
};

const Probe = ({ active, allowSelectors, onDismiss, onEscape }: ProbeProps) => {
  useDismissOnOutsideOrEscape({
    active,
    element: document.body,
    allowSelectors,
    onDismiss,
    onEscape,
  });
  return (
    <div>
      <button data-be-allowed="" type="button">
        allowed target
      </button>
      <button data-be-outside="" type="button">
        outside target
      </button>
    </div>
  );
};

describe("useDismissOnOutsideOrEscape", () => {
  it("허용 셀렉터 바깥의 pointerdown이면 onDismiss를 호출한다", () => {
    const onDismiss = vi.fn();
    const onEscape = vi.fn();
    render(
      <Probe
        active
        allowSelectors={["[data-be-allowed]"]}
        onDismiss={onDismiss}
        onEscape={onEscape}
      />,
    );

    document
      .querySelector("[data-be-outside]")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("허용 셀렉터 안의 pointerdown이면 onDismiss를 호출하지 않는다", () => {
    const onDismiss = vi.fn();
    render(
      <Probe
        active
        allowSelectors={["[data-be-allowed]"]}
        onDismiss={onDismiss}
        onEscape={vi.fn()}
      />,
    );

    document
      .querySelector("[data-be-allowed]")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("Escape keydown이면 preventDefault 후 onEscape만 호출한다", () => {
    const onDismiss = vi.fn();
    const onEscape = vi.fn();
    render(
      <Probe
        active
        allowSelectors={["[data-be-allowed]"]}
        onDismiss={onDismiss}
        onEscape={onEscape}
      />,
    );

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("Escape가 아닌 키는 무시하고 preventDefault하지 않는다", () => {
    const onEscape = vi.fn();
    render(
      <Probe
        active
        allowSelectors={["[data-be-allowed]"]}
        onDismiss={vi.fn()}
        onEscape={onEscape}
      />,
    );

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(onEscape).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("active가 false면 리스너를 등록하지 않는다", () => {
    const onDismiss = vi.fn();
    render(
      <Probe
        active={false}
        allowSelectors={["[data-be-allowed]"]}
        onDismiss={onDismiss}
        onEscape={vi.fn()}
      />,
    );

    document
      .querySelector("[data-be-outside]")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("언마운트하면 리스너를 제거한다", () => {
    const onDismiss = vi.fn();
    const { unmount } = render(
      <Probe
        active
        allowSelectors={["[data-be-allowed]"]}
        onDismiss={onDismiss}
        onEscape={vi.fn()}
      />,
    );

    unmount();
    document
      .querySelector("[data-be-outside]")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
