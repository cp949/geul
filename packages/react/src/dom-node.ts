/**
 * realm과 무관한 DOM 노드 판정(Issue #271).
 *
 * 전역 `Element`·`HTMLElement` 생성자의 `instanceof`는 iframe 문서에서 틀린다.
 * - React가 iframe 문서에 렌더한 노드는 iframe realm 인스턴스다.
 * - ProseMirror·core가 만든 노드는 iframe 문서에 붙어도 메인 realm 인스턴스다.
 *
 * 그래서 문서 window의 생성자(`ownerDocument.defaultView.Element`)도 쓰지
 * 않는다. PM 노드에서 거짓이 된다. 판정은 `nodeType`과 `namespaceURI`로 한다.
 */

const ELEMENT_NODE = 1;
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/** 값이 DOM 노드인지. `nodeType`이 숫자인지로 본다. */
export const isNode = (value: unknown): value is Node =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { nodeType?: unknown }).nodeType === "number";

/** 값이 요소 노드인지. 텍스트 노드, 문서, `window`, `null`은 아니다. */
export const isElementNode = (value: unknown): value is Element =>
  isNode(value) && value.nodeType === ELEMENT_NODE;

/**
 * 값이 HTML 요소인지. `tagName`을 주면 그 태그만 참이다.
 * SVG·MathML 요소는 HTML 이름공간이 아니라 거짓이다.
 */
export function isHtmlElement(value: unknown): value is HTMLElement;
export function isHtmlElement<K extends keyof HTMLElementTagNameMap>(
  value: unknown,
  tagName: K,
): value is HTMLElementTagNameMap[K];
export function isHtmlElement(value: unknown, tagName?: string): boolean {
  return (
    isElementNode(value) &&
    value.namespaceURI === HTML_NAMESPACE &&
    (tagName === undefined || value.localName === tagName)
  );
}
