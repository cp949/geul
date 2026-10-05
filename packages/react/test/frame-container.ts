/**
 * iframe 문서에 렌더 container를 만드는 공용 테스트 헬퍼(Issue #271).
 *
 * iframe 문서의 container에 React가 그린 노드는 iframe realm 인스턴스다.
 * 메인 문서 테스트로는 realm 차이를 재현하지 못한다. 그래서 테스트가 진짜
 * iframe 문서를 만든다. iframe 생성·container 준비·iframe 정리는 이 모듈이
 * 단독 소유한다(G-TST-002).
 *
 * 정리는 이 모듈의 afterEach가 한다(G-TST-003). Vitest는 afterEach를 등록
 * 역순으로 돈다. 그래서 테스트 파일의 React `cleanup`이 iframe 제거보다 먼저
 * 돈다.
 */
import { afterEach } from "vitest";

const mountedFrames = new Set<HTMLIFrameElement>();

/**
 * 붙인 iframe을 모두 뗀다. 하나가 던져도 나머지를 떼고 실패를 모아 던진다.
 * 던져도 집합은 비운다. 안 비우면 다음 테스트의 정리가 같은 iframe에서 다시
 * 던진다.
 */
export const removeMountedFrames = (): void => {
  const errors: unknown[] = [];
  for (const frame of mountedFrames) {
    try {
      frame.remove();
    } catch (error) {
      errors.push(error);
    }
  }
  mountedFrames.clear();
  if (errors.length > 0) throw new AggregateError(errors, "iframe 정리 실패");
};

afterEach(removeMountedFrames);

/**
 * iframe을 메인 문서 body에 붙이고 그 문서 body에 렌더 container(div)를
 * 만든다. iframe은 afterEach가 뗀다.
 *
 * frame realm `Element.prototype`에 pointer capture 빈 구현을 둔다. jsdom
 * iframe 문서 Element에는 이 메서드가 없다. prototype은 iframe마다 따로라
 * iframe을 떼면 함께 사라진다.
 */
export const mountFrameContainer = (): HTMLElement => {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  mountedFrames.add(iframe);
  const frameDocument = iframe.contentDocument;
  const frameWindow = iframe.contentWindow as
    (Window & typeof globalThis) | null;
  if (frameDocument === null || frameWindow === null) {
    throw new Error("iframe 문서가 없다");
  }
  frameWindow.Element.prototype.setPointerCapture = () => {};
  frameWindow.Element.prototype.releasePointerCapture = () => {};
  const container = frameDocument.createElement("div");
  frameDocument.body.append(container);
  return container;
};
