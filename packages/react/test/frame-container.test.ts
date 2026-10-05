// @vitest-environment jsdom
/**
 * 공용 iframe container 헬퍼(mountFrameContainer)의 계약을 고정한다.
 *
 * - container는 iframe 문서 소속이고 iframe realm 인스턴스다.
 * - frame realm 요소에 pointer capture 빈 구현이 있다.
 * - 붙인 iframe은 테스트가 끝나면 모듈의 afterEach가 뗀다.
 *
 * 이 계약이 깨지면 iframe 회귀 테스트가 메인 realm에서 돌아 realm 결함을
 * 재현하지 못한다.
 */
import { describe, expect, it } from "vitest";

import { mountFrameContainer } from "./frame-container.js";

describe("iframe container 헬퍼", () => {
  it("container는 iframe 문서 소속의 iframe realm 요소다", () => {
    const container = mountFrameContainer();
    const frameWindow = container.ownerDocument.defaultView as
      (Window & typeof globalThis) | null;

    expect(container.ownerDocument).not.toBe(document);
    expect(container instanceof Element).toBe(false);
    expect(frameWindow).not.toBeNull();
    expect(container instanceof frameWindow!.Element).toBe(true);
  });

  it("frame realm 요소에 pointer capture 빈 구현을 둔다", () => {
    const container = mountFrameContainer();

    expect(() => container.setPointerCapture(1)).not.toThrow();
    expect(() => container.releasePointerCapture(1)).not.toThrow();
  });

  it("앞 테스트가 붙인 iframe은 다음 테스트 전에 떨어져 있다", () => {
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
  });
});
