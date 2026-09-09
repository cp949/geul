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
  onOutsideTargetClick?: () => void;
};

const Probe = ({
  active,
  allowSelectors,
  onOutsideDismiss,
  onEscapeDismiss,
  onOutsideTargetClick,
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
      <button data-geul-allowed="" type="button">
        allowed target
      </button>
      <button data-geul-outside="" onClick={onOutsideTargetClick} type="button">
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
        allowSelectors={["[data-geul-allowed]"]}
        onOutsideDismiss={onOutsideDismiss}
        onEscapeDismiss={onEscapeDismiss}
      />,
    );

    document
      .querySelector("[data-geul-outside]")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(onOutsideDismiss).toHaveBeenCalledTimes(1);
    expect(onEscapeDismiss).not.toHaveBeenCalled();
  });

  // Issue #155 계약 테스트. 단발 pointerdown dispatch가 아니라 실제
  // 브라우저가 만드는 pointerdown → mouseup → click 순서를 그대로
  // 재현한다(G-TST-001) — 대상(outside target) 자신의 onClick이 dismiss와
  // 함께 실행돼야 한다는 ADR-0013 계약을 고정한다.
  //
  // 주의: jsdom에는 layout·hit-test 엔진이 없다(모든 요소의
  // getBoundingClientRect가 0이고, dispatchEvent의 target은 좌표가 아니라
  // 호출한 노드로 고정된다). Issue #155의 실제 근본 원인 — 바깥 pointerdown이
  // 커밋하는 dismiss state가 페이지 layout(scrollHeight)을 바꿔, 뒤이은
  // 같은 물리적 클릭의 mouseup/click이 pointerdown 때와 다른 엘리먼트로
  // hit-test되는 문제 — 는 이 사실 때문에 jsdom에서 재현 불가능하다(원인
  // 수정 전 코드로 직접 실측 확인함, 반환문 "진단한 근본 원인" 참고). 이
  // 테스트는 수정 전/후 모두 GREEN이다 — 계약을 고정하는 회귀 테스트이지,
  // Issue #155의 RED 재현 테스트가 아니다. 실제 RED/GREEN 증거는
  // e2e/media-toolbar.spec.ts·table-handle.spec.ts·slash-menu.spec.ts가
  // 실제 브라우저(Chromium) hit-test로 제공한다.
  it("바깥 클릭은 onOutsideDismiss와 클릭 대상 자신의 onClick을 모두 실행한다(Issue #155)", () => {
    const onOutsideDismiss = vi.fn();
    const onOutsideTargetClick = vi.fn();
    render(
      <Probe
        active
        allowSelectors={["[data-geul-allowed]"]}
        onOutsideDismiss={onOutsideDismiss}
        onEscapeDismiss={vi.fn()}
        onOutsideTargetClick={onOutsideTargetClick}
      />,
    );

    const outsideTarget = document.querySelector("[data-geul-outside]");
    outsideTarget?.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    outsideTarget?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    outsideTarget?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onOutsideDismiss).toHaveBeenCalledTimes(1);
    expect(onOutsideTargetClick).toHaveBeenCalledTimes(1);
  });

  it("허용 셀렉터 안의 pointerdown이면 onOutsideDismiss를 호출하지 않는다", () => {
    const onOutsideDismiss = vi.fn();
    render(
      <Probe
        active
        allowSelectors={["[data-geul-allowed]"]}
        onOutsideDismiss={onOutsideDismiss}
        onEscapeDismiss={vi.fn()}
      />,
    );

    document
      .querySelector("[data-geul-allowed]")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(onOutsideDismiss).not.toHaveBeenCalled();
  });

  it("Escape keydown이면 preventDefault 후 onEscapeDismiss만 호출한다", () => {
    const onOutsideDismiss = vi.fn();
    const onEscapeDismiss = vi.fn();
    render(
      <Probe
        active
        allowSelectors={["[data-geul-allowed]"]}
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
        allowSelectors={["[data-geul-allowed]"]}
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
        allowSelectors={["[data-geul-allowed]"]}
        onOutsideDismiss={onOutsideDismiss}
        onEscapeDismiss={vi.fn()}
      />,
    );

    document
      .querySelector("[data-geul-outside]")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onOutsideDismiss).not.toHaveBeenCalled();
  });

  it("언마운트하면 리스너를 제거한다", () => {
    const onOutsideDismiss = vi.fn();
    const { unmount } = render(
      <Probe
        active
        allowSelectors={["[data-geul-allowed]"]}
        onOutsideDismiss={onOutsideDismiss}
        onEscapeDismiss={vi.fn()}
      />,
    );

    unmount();
    document
      .querySelector("[data-geul-outside]")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(onOutsideDismiss).not.toHaveBeenCalled();
  });
});
