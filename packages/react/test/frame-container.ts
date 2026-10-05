/**
 * iframe 문서에 렌더 container를 만드는 공용 테스트 헬퍼(Issue #271).
 *
 * iframe 문서의 container에 React가 그린 노드는 iframe realm 인스턴스다.
 * 메인 문서 테스트로는 realm 차이를 재현하지 못한다. 그래서 테스트가 진짜
 * iframe 문서를 만든다. iframe 생성·container 준비·iframe 정리는 이 모듈이
 * 단독 소유한다(G-TST-002).
 *
 * 정리는 iframe을 붙인 테스트의 `onTestFinished`가 한다(G-TST-003).
 * - 모듈 최상위 hook을 두지 않는다. `--no-isolate`에서는 모듈이 캐시돼 첫
 *   테스트 파일에만 등록된다.
 * - Vitest는 `onTestFinished`를 모든 afterEach 뒤에 돌린다. 그래서 테스트
 *   파일의 React `cleanup`과 editor `destroy()`가 iframe 제거보다 먼저 돈다.
 */
import { onTestFinished } from "vitest";

/**
 * iframe을 메인 문서 body에 붙이고 그 문서 body에 렌더 container(div)를
 * 만든다. iframe은 호출한 테스트가 끝나면 뗀다.
 *
 * test 본문이나 beforeEach 안에서만 부른다. 그 밖에서는 `onTestFinished`가
 * 던진다.
 *
 * frame realm `Element.prototype`에 pointer capture 빈 구현을 둔다. jsdom
 * iframe 문서 Element에는 이 메서드가 없다. prototype은 iframe마다 따로라
 * iframe을 떼면 함께 사라진다.
 */
export const mountFrameContainer = (): HTMLElement => {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  onTestFinished(() => iframe.remove());
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
