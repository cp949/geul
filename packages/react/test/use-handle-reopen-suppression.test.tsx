/**
 * useHandleReopenSuppression의 클릭 판정(suppressed/close/open)이 pointerdown
 * 스냅샷, 드래그 종료 시 markSuppressed, 라이브 상태(isCurrentlyOpen)를
 * 올바르게 조합하는지 확인한다. consumeClick이 내부 ref를 호출마다
 * 리셋하는지도 함께 본다 — 리셋하지 않으면 다음 클릭이 같은 판정을 재사용해
 * Issue #52류 재발로 이어진다. resolveReopenAwareClick의 outcome별 3분기
 * 디스패치(어느 콜백을 부르는지)도 여기서 함께 검증한다 — DOM에 의존하지
 * 않는 순수 로직이라 마운트 없이 consumeClick 스텁만으로 확인한다.
 */
// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type HandleClickOutcome,
  resolveReopenAwareClick,
  useHandleReopenSuppression,
} from "../src/use-handle-reopen-suppression.js";

afterEach(cleanup);

type ClickOptions = {
  isPointerClick: boolean;
  suppressionKey: string;
  reopenKey: string;
  isCurrentlyOpen: boolean;
};

type ProbeProps = {
  onOutcome: (outcome: HandleClickOutcome) => void;
  clickOptions: ClickOptions;
};

/**
 * useHandleReopenSuppression을 구동하는 테스트용 컨트롤 패널. 실제 호출부의
 * 순서(pointerdown → 필요하면 드래그 종료 markSuppressed → click)를 버튼
 * 세 개로 흉내 낸다. clickOptions는 시나리오마다 바뀌므로 prop으로 받는다.
 */
const Probe = ({ onOutcome, clickOptions }: ProbeProps) => {
  const { onPointerDown, markSuppressed, consumeClick } =
    useHandleReopenSuppression();
  return (
    <div>
      <button
        data-testid="pointerdown-snapshot-open"
        onClick={() => onPointerDown(clickOptions.reopenKey)}
        type="button"
      >
        pointerdown-snapshot-open
      </button>
      <button
        data-testid="pointerdown-snapshot-null"
        onClick={() => onPointerDown(null)}
        type="button"
      >
        pointerdown-snapshot-null
      </button>
      <button
        data-testid="drag-end-suppress"
        onClick={() => markSuppressed(clickOptions.suppressionKey)}
        type="button"
      >
        drag-end-suppress
      </button>
      <button
        data-testid="click"
        onClick={() => onOutcome(consumeClick(clickOptions))}
        type="button"
      >
        click
      </button>
    </div>
  );
};

const baseClickOptions: ClickOptions = {
  isPointerClick: true,
  suppressionKey: "row-a",
  reopenKey: "row-a",
  isCurrentlyOpen: false,
};

describe("useHandleReopenSuppression", () => {
  it("드래그 종료로 억제된 키에 포인터 click이 오면 suppressed를 반환한다", () => {
    const onOutcome = vi.fn();
    const { getByTestId } = render(
      <Probe clickOptions={baseClickOptions} onOutcome={onOutcome} />,
    );

    fireEvent.click(getByTestId("pointerdown-snapshot-null"));
    fireEvent.click(getByTestId("drag-end-suppress"));
    fireEvent.click(getByTestId("click"));

    expect(onOutcome).toHaveBeenCalledWith("suppressed");
  });

  it("같은 키가 억제돼 있어도 키보드 활성화(detail 0)면 무시하지 않는다", () => {
    const onOutcome = vi.fn();
    const clickOptions = { ...baseClickOptions, isPointerClick: false };
    const { getByTestId } = render(
      <Probe clickOptions={clickOptions} onOutcome={onOutcome} />,
    );

    fireEvent.click(getByTestId("pointerdown-snapshot-null"));
    fireEvent.click(getByTestId("drag-end-suppress"));
    fireEvent.click(getByTestId("click"));

    expect(onOutcome).toHaveBeenCalledWith("open");
  });

  it("pointerdown 스냅샷이 reopenKey와 일치하면 close를 반환한다", () => {
    const onOutcome = vi.fn();
    const { getByTestId } = render(
      <Probe clickOptions={baseClickOptions} onOutcome={onOutcome} />,
    );

    fireEvent.click(getByTestId("pointerdown-snapshot-open"));
    fireEvent.click(getByTestId("click"));

    expect(onOutcome).toHaveBeenCalledWith("close");
  });

  it("스냅샷은 없어도 라이브 상태가 열려 있으면 close를 반환한다", () => {
    const onOutcome = vi.fn();
    const clickOptions = { ...baseClickOptions, isCurrentlyOpen: true };
    const { getByTestId } = render(
      <Probe clickOptions={clickOptions} onOutcome={onOutcome} />,
    );

    fireEvent.click(getByTestId("pointerdown-snapshot-null"));
    fireEvent.click(getByTestId("click"));

    expect(onOutcome).toHaveBeenCalledWith("close");
  });

  it("억제·재오픈·라이브 상태 모두 해당 없으면 open을 반환한다", () => {
    const onOutcome = vi.fn();
    const { getByTestId } = render(
      <Probe clickOptions={baseClickOptions} onOutcome={onOutcome} />,
    );

    fireEvent.click(getByTestId("pointerdown-snapshot-null"));
    fireEvent.click(getByTestId("click"));

    expect(onOutcome).toHaveBeenCalledWith("open");
  });

  it("consumeClick은 호출할 때마다 내부 상태를 리셋한다", () => {
    const onOutcome = vi.fn();
    const { getByTestId } = render(
      <Probe clickOptions={baseClickOptions} onOutcome={onOutcome} />,
    );

    fireEvent.click(getByTestId("pointerdown-snapshot-open"));
    fireEvent.click(getByTestId("click"));
    fireEvent.click(getByTestId("click"));

    expect(onOutcome).toHaveBeenNthCalledWith(1, "close");
    expect(onOutcome).toHaveBeenNthCalledWith(2, "open");
  });
});

/** consumeClick이 항상 지정한 outcome을 반환하는 스텁 — DOM/렌더 없이 resolveReopenAwareClick만 단독으로 구동한다. */
const stubReopenSuppression = (outcome: HandleClickOutcome) => ({
  onPointerDown: vi.fn(),
  markSuppressed: vi.fn(),
  consumeClick: vi.fn(() => outcome),
});

const baseKeys = {
  suppressionKey: "row-a",
  reopenKey: "row-a",
  isCurrentlyOpen: false,
};

describe("resolveReopenAwareClick", () => {
  it("suppressed면 onOpen/onClose 둘 다 호출하지 않는다", () => {
    const reopenSuppression = stubReopenSuppression("suppressed");
    const onOpen = vi.fn();
    const onClose = vi.fn();

    resolveReopenAwareClick(reopenSuppression, { detail: 1 }, baseKeys, {
      onOpen,
      onClose,
    });

    expect(onOpen).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("close면 onClose만 호출한다", () => {
    const reopenSuppression = stubReopenSuppression("close");
    const onOpen = vi.fn();
    const onClose = vi.fn();

    resolveReopenAwareClick(reopenSuppression, { detail: 1 }, baseKeys, {
      onOpen,
      onClose,
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("open이면 onOpen만 호출한다", () => {
    const reopenSuppression = stubReopenSuppression("open");
    const onOpen = vi.fn();
    const onClose = vi.fn();

    resolveReopenAwareClick(reopenSuppression, { detail: 1 }, baseKeys, {
      onOpen,
      onClose,
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("event.detail로 isPointerClick을 계산해 consumeClick에 그대로 넘긴다", () => {
    const reopenSuppression = stubReopenSuppression("open");

    resolveReopenAwareClick(reopenSuppression, { detail: 0 }, baseKeys, {
      onOpen: vi.fn(),
      onClose: vi.fn(),
    });

    expect(reopenSuppression.consumeClick).toHaveBeenCalledWith({
      isPointerClick: false,
      ...baseKeys,
    });
  });
});
