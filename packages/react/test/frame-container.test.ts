// @vitest-environment jsdom
/**
 * 공용 iframe container 헬퍼(mountFrameContainer)의 계약을 고정한다.
 *
 * - container는 iframe 문서 소속이고 iframe realm 인스턴스다.
 * - frame realm 요소에 pointer capture 빈 구현이 있다.
 * - 붙인 iframe은 그 테스트가 끝나면 떨어진다.
 * - 테스트 파일의 afterEach가 도는 동안 iframe은 아직 붙어 있다.
 *
 * 정리 단언은 앞 테스트 순서에 기대지 않는다. 테스트 안에서 헬퍼 호출 전에
 * `onTestFinished`를 등록한다. Vitest는 그 핸들러를 등록 역순으로 돌린다.
 * 그래서 이 핸들러는 헬퍼의 정리 뒤에 돈다.
 *
 * 이 계약이 깨지면 iframe 회귀 테스트가 메인 realm에서 돌아 realm 결함을
 * 재현하지 못한다. 또는 iframe이 다음 테스트 파일로 샌다.
 */
import { afterEach, describe, expect, it, onTestFinished } from "vitest";

import { mountFrameContainer } from "./frame-container.js";

/**
 * container가 속한 iframe 요소를 찾는다. 다른 테스트가 남긴 iframe과
 * 섞이지 않게 문서 쿼리 대신 frame window의 `frameElement`를 쓴다.
 */
const frameOf = (container: HTMLElement): HTMLIFrameElement => {
  const frame = container.ownerDocument.defaultView?.frameElement;
  if (frame === null || frame === undefined) {
    throw new Error("container가 iframe 문서 소속이 아니다");
  }
  return frame as HTMLIFrameElement;
};

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

  it("붙인 iframe은 그 테스트가 끝나면 떨어진다", () => {
    const mounted: { frame?: HTMLIFrameElement } = {};
    onTestFinished(() => {
      expect(mounted.frame?.isConnected).toBe(false);
    });

    mounted.frame = frameOf(mountFrameContainer());

    expect(mounted.frame.isConnected).toBe(true);
  });
});

// 소비 테스트 파일처럼 파일 최상위에 afterEach를 둔다. 중첩 describe의
// afterEach는 hook 순서 설정과 무관하게 파일 최상위 hook보다 먼저 돈다.
let orderFrame: HTMLIFrameElement | undefined;
let connectedInAfterEach: boolean | undefined;

afterEach(() => {
  connectedInAfterEach = orderFrame?.isConnected;
});

describe("iframe container 헬퍼의 정리 순서", () => {
  it("테스트 파일의 afterEach가 도는 동안 iframe은 아직 붙어 있다", () => {
    orderFrame = undefined;
    connectedInAfterEach = undefined;
    onTestFinished(() => {
      expect(connectedInAfterEach).toBe(true);
      expect(orderFrame?.isConnected).toBe(false);
      orderFrame = undefined;
    });

    orderFrame = frameOf(mountFrameContainer());

    expect(orderFrame.isConnected).toBe(true);
  });
});
