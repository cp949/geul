/**
 * useSelectionRefresh가 마운트 시 onUpdate를 한 번 호출하고,
 * selectionchange/mouseup/keyup/scroll(capture)/resize 각 이벤트가 발생할
 * 때마다 다시 호출하는지 확인한다. element가 null인 동안에는 리스너를
 * 걸지 않으면서도 초기 호출은 그대로 하는지(호출부가 스스로 element null을
 * 판정하는 계약), 언마운트 시 리스너를 제거하는지도 함께 본다.
 */
// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSelectionRefresh } from "../src/use-selection-refresh.js";

afterEach(cleanup);

type ProbeProps = {
  onUpdate: () => void;
  mount?: boolean;
};

/**
 * useSelectionRefresh를 구동하는 테스트용 컨테이너. ref 콜백으로 element를
 * state에 담아 훅에 넘긴다 — useEditorMount()도 마운트 후에야 엘리먼트를
 * 내주므로 같은 "처음엔 null" 상황을 재현한다. mount=false면 컨테이너를
 * 아예 렌더하지 않아 element가 계속 null인 상황을 만든다.
 */
const Probe = ({ onUpdate, mount = true }: ProbeProps) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useSelectionRefresh({ element: container, onUpdate });
  return mount ? <div data-testid="container" ref={setContainer} /> : null;
};

describe("useSelectionRefresh", () => {
  it("마운트 시 onUpdate를 호출한다", () => {
    // Probe는 useEditorMount()처럼 첫 렌더에서 element가 null이었다가 ref
    // 콜백으로 실제 DOM이 붙은 뒤에야 갱신된다 — 그 사이 리렌더 한 번이 끼어
    // effect가 element=null(1회)과 element=실제 노드(1회) 두 번 돈다. 두
    // 호출 모두 "마운트 시 초기 호출" 계약이 지켜졌다는 뜻이라 정상이다.
    const onUpdate = vi.fn();
    render(<Probe onUpdate={onUpdate} />);

    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("element가 null이어도 onUpdate를 한 번 호출한다", () => {
    const onUpdate = vi.fn();
    render(<Probe mount={false} onUpdate={onUpdate} />);

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("selectionchange가 발생하면 다시 호출한다", () => {
    const onUpdate = vi.fn();
    render(<Probe onUpdate={onUpdate} />);
    onUpdate.mockClear();

    document.dispatchEvent(new Event("selectionchange"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("mouseup이 발생하면 다시 호출한다", () => {
    const onUpdate = vi.fn();
    render(<Probe onUpdate={onUpdate} />);
    onUpdate.mockClear();

    document.dispatchEvent(new Event("mouseup"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("keyup이 발생하면 다시 호출한다", () => {
    const onUpdate = vi.fn();
    render(<Probe onUpdate={onUpdate} />);
    onUpdate.mockClear();

    document.dispatchEvent(new Event("keyup"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("scroll이 발생하면 다시 호출한다(capture 등록이라 캡처 단계 dispatch로도 잡힌다)", () => {
    const onUpdate = vi.fn();
    render(<Probe onUpdate={onUpdate} />);
    onUpdate.mockClear();

    window.dispatchEvent(new Event("scroll"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("resize가 발생하면 다시 호출한다", () => {
    const onUpdate = vi.fn();
    render(<Probe onUpdate={onUpdate} />);
    onUpdate.mockClear();

    window.dispatchEvent(new Event("resize"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("언마운트하면 리스너를 제거한다", () => {
    const onUpdate = vi.fn();
    const { unmount } = render(<Probe onUpdate={onUpdate} />);
    onUpdate.mockClear();

    unmount();
    document.dispatchEvent(new Event("selectionchange"));
    window.dispatchEvent(new Event("resize"));

    expect(onUpdate).not.toHaveBeenCalled();
  });
});
