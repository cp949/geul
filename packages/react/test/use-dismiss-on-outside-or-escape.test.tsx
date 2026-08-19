// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDismissOnOutsideOrEscape } from "../src/use-dismiss-on-outside-or-escape.js";

afterEach(cleanup);

type ProbeProps = {
  active: boolean;
  allowSelectors: readonly string[];
  onOutsideDismiss: () => void;
  onEscapeDismiss: () => void;
};

const Probe = ({
  active,
  allowSelectors,
  onOutsideDismiss,
  onEscapeDismiss,
}: ProbeProps) => {
  useDismissOnOutsideOrEscape({
    active,
    element: document.body,
    allowSelectors,
    onOutsideDismiss,
    onEscapeDismiss,
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
  it("허용 셀렉터 바깥의 pointerdown이면 onOutsideDismiss를 호출한다", () => {
    const onOutsideDismiss = vi.fn();
    const onEscapeDismiss = vi.fn();
    render(
      <Probe
        active
        allowSelectors={["[data-be-allowed]"]}
        onOutsideDismiss={onOutsideDismiss}
        onEscapeDismiss={onEscapeDismiss}
      />,
    );

    document
      .querySelector("[data-be-outside]")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(onOutsideDismiss).toHaveBeenCalledTimes(1);
    expect(onEscapeDismiss).not.toHaveBeenCalled();
  });

  it("허용 셀렉터 안의 pointerdown이면 onOutsideDismiss를 호출하지 않는다", () => {
    const onOutsideDismiss = vi.fn();
    render(
      <Probe
        active
        allowSelectors={["[data-be-allowed]"]}
        onOutsideDismiss={onOutsideDismiss}
        onEscapeDismiss={vi.fn()}
      />,
    );

    document
      .querySelector("[data-be-allowed]")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(onOutsideDismiss).not.toHaveBeenCalled();
  });

  it("Escape keydown이면 preventDefault 후 onEscapeDismiss만 호출한다", () => {
    const onOutsideDismiss = vi.fn();
    const onEscapeDismiss = vi.fn();
    render(
      <Probe
        active
        allowSelectors={["[data-be-allowed]"]}
        onOutsideDismiss={onOutsideDismiss}
        onEscapeDismiss={onEscapeDismiss}
      />,
    );

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(onEscapeDismiss).toHaveBeenCalledTimes(1);
    expect(onOutsideDismiss).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("Escape가 아닌 키는 무시하고 preventDefault하지 않는다", () => {
    const onEscapeDismiss = vi.fn();
    render(
      <Probe
        active
        allowSelectors={["[data-be-allowed]"]}
        onOutsideDismiss={vi.fn()}
        onEscapeDismiss={onEscapeDismiss}
      />,
    );

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(onEscapeDismiss).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("active가 false면 리스너를 등록하지 않는다", () => {
    const onOutsideDismiss = vi.fn();
    render(
      <Probe
        active={false}
        allowSelectors={["[data-be-allowed]"]}
        onOutsideDismiss={onOutsideDismiss}
        onEscapeDismiss={vi.fn()}
      />,
    );

    document
      .querySelector("[data-be-outside]")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onOutsideDismiss).not.toHaveBeenCalled();
  });

  it("언마운트하면 리스너를 제거한다", () => {
    const onOutsideDismiss = vi.fn();
    const { unmount } = render(
      <Probe
        active
        allowSelectors={["[data-be-allowed]"]}
        onOutsideDismiss={onOutsideDismiss}
        onEscapeDismiss={vi.fn()}
      />,
    );

    unmount();
    document
      .querySelector("[data-be-outside]")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(onOutsideDismiss).not.toHaveBeenCalled();
  });
});
