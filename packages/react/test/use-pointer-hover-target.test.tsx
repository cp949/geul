/**
 * usePointerHoverTarget이 ownerDocument의 pointermove를 듣다가
 * ignoreSelectors에 걸리면 무시하고, entitySelector로 찾은 후보가
 * element에 포함될 때만 그 엘리먼트로 콜백하는지 확인한다. element가
 * null이거나 언마운트되면 리스너가 동작하지 않는 것도 함께 본다.
 */
// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePointerHoverTarget } from "../src/use-pointer-hover-target.js";

afterEach(cleanup);

type ProbeProps = {
  onCandidateChange: (candidate: HTMLElement | null) => void;
};

/**
 * usePointerHoverTarget을 구동하는 테스트용 컨테이너. ref 콜백으로 element를
 * state에 담아 훅에 넘긴다 — useEditorMount()도 마운트 후에야 엘리먼트를
 * 내주므로 같은 "처음엔 null" 상황을 재현한다. entity 후보 셋을 컨테이너
 * 안/밖에 하나씩 심어 element.contains 판정을 함께 검증할 수 있게 한다.
 */
const Probe = ({ onCandidateChange }: ProbeProps) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  usePointerHoverTarget({
    element: container,
    ignoreSelectors: ["[data-be-ignored]"],
    entitySelector: "[data-be-entity]",
    onCandidateChange,
  });
  return (
    <div>
      <div data-testid="container" ref={setContainer}>
        <button data-be-entity="" data-testid="inside-entity" type="button">
          inside
        </button>
        <button
          data-be-entity=""
          data-be-ignored=""
          data-testid="ignored-entity"
          type="button"
        >
          ignored
        </button>
      </div>
      <button data-be-entity="" data-testid="outside-entity" type="button">
        outside
      </button>
    </div>
  );
};

const move = (target: Element) =>
  target.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));

describe("usePointerHoverTarget", () => {
  it("entitySelector에 걸리고 element에 포함된 대상이면 그 엘리먼트로 콜백한다", () => {
    const onCandidateChange = vi.fn();
    const { getByTestId } = render(
      <Probe onCandidateChange={onCandidateChange} />,
    );

    const inside = getByTestId("inside-entity");
    move(inside);

    expect(onCandidateChange).toHaveBeenCalledTimes(1);
    expect(onCandidateChange).toHaveBeenCalledWith(
      inside,
      expect.any(PointerEvent),
    );
  });

  it("ignoreSelectors에 걸리면 콜백하지 않는다", () => {
    const onCandidateChange = vi.fn();
    const { getByTestId } = render(
      <Probe onCandidateChange={onCandidateChange} />,
    );

    move(getByTestId("ignored-entity"));

    expect(onCandidateChange).not.toHaveBeenCalled();
  });

  it("entitySelector로 찾은 후보가 element 밖이면 null로 콜백한다", () => {
    const onCandidateChange = vi.fn();
    const { getByTestId } = render(
      <Probe onCandidateChange={onCandidateChange} />,
    );

    move(getByTestId("outside-entity"));

    expect(onCandidateChange).toHaveBeenCalledTimes(1);
    expect(onCandidateChange).toHaveBeenCalledWith(
      null,
      expect.any(PointerEvent),
    );
  });

  it("entitySelector에 안 걸리는 대상이면 null로 콜백한다", () => {
    const onCandidateChange = vi.fn();
    const { getByTestId } = render(
      <Probe onCandidateChange={onCandidateChange} />,
    );

    move(getByTestId("container"));

    expect(onCandidateChange).toHaveBeenCalledTimes(1);
    expect(onCandidateChange).toHaveBeenCalledWith(
      null,
      expect.any(PointerEvent),
    );
  });

  it("언마운트하면 리스너를 제거한다", () => {
    const onCandidateChange = vi.fn();
    const { getByTestId, unmount } = render(
      <Probe onCandidateChange={onCandidateChange} />,
    );
    const inside = getByTestId("inside-entity");

    unmount();
    move(inside);

    expect(onCandidateChange).not.toHaveBeenCalled();
  });
});
