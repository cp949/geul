// @vitest-environment jsdom

/**
 * IframeLoadStatus 컴포넌트(roadmap Issue #212 RD-004 DELTA-05): src가 있는
 * iframe이 일정 시간 안에 `load`를 내지 않으면 wrapper에
 * data-geul-iframe-load-status="timeout" + 사유 label을 세팅하고, 뒤늦게
 * load가 발생하거나 src가 교체되면 판정을 다시 시작한다. 렌더 출력이 없는
 * 순수 side-effect 컴포넌트라(`return null`) DOM attribute만 단언한다 —
 * `MediaHandleOverlays`처럼 `mountBlockEditor`로 실제 편집기를 마운트해
 * core의 진짜 renderHTML이 만든 `<iframe>`을 그대로 쓴다(G-TST-001).
 * index.ts에 공개 export하지 않는다(SlashMenu가 자동 마운트할 대상이라
 * MediaHandleOverlays/TableHandles와 같은 이유) — 이 테스트도
 * `../src/iframe-load-status.js`에서 직접 import한다.
 */

import { DEFAULT_DICTIONARY } from "@cp949/geul-core";
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IframeLoadStatus } from "../src/iframe-load-status.js";
import { mountBlockEditor } from "./mount-editor.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const IFRAME_LOAD_TIMEOUT_MS = 5000;
const timeoutLabel = DEFAULT_DICTIONARY.status.iframeLoadTimeout;

const renderIframeStatus = (url: string) =>
  mountBlockEditor({
    initialBlocks: [{ id: "iframe-1", type: "iframe", url }],
    children: <IframeLoadStatus />,
  });

describe("iframe onLoad 미발생 타임아웃 휴리스틱(완료 조건, roadmap Issue #212 RD-004 DELTA-05)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("타임아웃 전에 load가 발생하면 문구가 뜨지 않는다", () => {
    const rendered = renderIframeStatus("https://example.com/embed");
    const iframe = rendered.blocks[0]?.querySelector("iframe");
    if (iframe === null || iframe === undefined)
      throw new Error("iframe 요소가 없다");

    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });
    act(() => {
      vi.advanceTimersByTime(IFRAME_LOAD_TIMEOUT_MS);
    });

    const wrapper = rendered.blocks[0] as HTMLElement;
    expect(wrapper.getAttribute("data-geul-iframe-load-status")).toBeNull();
  });

  it("load 없이 타임아웃이 지나면 wrapper에 사유 문구가 붙는다", () => {
    const rendered = renderIframeStatus("https://example.com/embed");

    act(() => {
      vi.advanceTimersByTime(IFRAME_LOAD_TIMEOUT_MS);
    });

    const wrapper = rendered.blocks[0] as HTMLElement;
    expect(wrapper.getAttribute("data-geul-iframe-load-status")).toBe(
      "timeout",
    );
    expect(wrapper.getAttribute("data-geul-iframe-load-status-label")).toBe(
      timeoutLabel,
    );
  });

  it("타임아웃 문구가 뜬 뒤 뒤늦게 load가 발생하면 문구가 사라진다(오탐 정정)", () => {
    const rendered = renderIframeStatus("https://example.com/embed");
    const iframe = rendered.blocks[0]?.querySelector("iframe");
    if (iframe === null || iframe === undefined)
      throw new Error("iframe 요소가 없다");

    act(() => {
      vi.advanceTimersByTime(IFRAME_LOAD_TIMEOUT_MS);
    });
    const wrapper = rendered.blocks[0] as HTMLElement;
    expect(wrapper.getAttribute("data-geul-iframe-load-status")).toBe(
      "timeout",
    );

    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });

    expect(wrapper.getAttribute("data-geul-iframe-load-status")).toBeNull();
    expect(
      wrapper.getAttribute("data-geul-iframe-load-status-label"),
    ).toBeNull();
  });

  it("src가 다른 URL로 바뀌면 이전 타이머를 재사용하지 않고 새로 5000ms를 센다", async () => {
    const rendered = renderIframeStatus("https://example.com/embed");
    const iframe = rendered.blocks[0]?.querySelector("iframe");
    if (iframe === null || iframe === undefined)
      throw new Error("iframe 요소가 없다");
    const wrapper = rendered.blocks[0] as HTMLElement;

    // 원래 타이머가 끝나기 전(3000ms < 5000ms)에 src를 바꾼다. 편집기
    // 커맨드(setIframeSrc)를 거치지 않고 DOM만 직접 바꿔 이 컴포넌트가
    // 실제로 관찰하는 신호(src attribute 변화)만 격리해 검증한다.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    await act(async () => {
      iframe.setAttribute("src", "https://example.com/other");
      await Promise.resolve();
    });

    // src 비교 없이 "이미 추적 중"이라고 옛 타이머를 그대로 뒀다면, 옛
    // 타이머는 절대시각 5000ms(= 지금부터 2000ms 뒤)에 그대로 발화한다.
    // 새 URL은 교체 시점부터 자기 몫의 5000ms를 받아야 하므로, 교체 후
    // 3000ms(합계 6000ms) 시점에는 아직 문구가 뜨면 안 된다.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(wrapper.getAttribute("data-geul-iframe-load-status")).toBeNull();

    // 교체 시점 기준 5000ms를 마저 채우면 새 URL 판정이 뜬다.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(wrapper.getAttribute("data-geul-iframe-load-status")).toBe(
      "timeout",
    );
  });

  it("빈 iframe(placeholder, src 없음)에는 attribute를 붙이지 않는다(회귀 없음)", () => {
    const rendered = mountBlockEditor({
      initialBlocks: [{ id: "iframe-1", type: "iframe" }],
      children: <IframeLoadStatus />,
    });

    act(() => {
      vi.advanceTimersByTime(IFRAME_LOAD_TIMEOUT_MS);
    });

    const wrapper = rendered.blocks[0] as HTMLElement;
    expect(wrapper.getAttribute("data-geul-iframe-load-status")).toBeNull();
    expect(wrapper.querySelector("iframe")).toBeNull();
  });

  it("언마운트 후에는 남은 타이머가 DOM을 건드리지 않는다(누수 방지)", () => {
    const rendered = renderIframeStatus("https://example.com/embed");
    const wrapper = rendered.blocks[0] as HTMLElement;

    cleanup();

    // 언마운트가 타이머까지 정리했다면, 이 시점에 시간을 흘려보내도 이미
    // React 트리에서 떨어져 나간 wrapper는 더 이상 바뀌지 않는다.
    act(() => {
      vi.advanceTimersByTime(IFRAME_LOAD_TIMEOUT_MS);
    });
    expect(wrapper.getAttribute("data-geul-iframe-load-status")).toBeNull();
  });
});
