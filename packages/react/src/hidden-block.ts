// 접힌 toggle이 가린 블록 판정이다. core의 접힘 decoration은 숨은 blockGroup에
// `display: none`과 이 표식을 함께 붙인다(toggle-collapse-visibility-extension.ts).
// 숨은 블록은 표식 붙은 blockGroup의 자손이다.
// 숨은 블록의 getBoundingClientRect()는 0x0이다. 앵커·측정·드롭 후보로 쓰지
// 않는다(Issue #280). 0x0 rect 대신 표식으로 판정한다. 레이아웃에 의존하지 않는다.
// MutationObserver가 이 표식 변화를 볼 때도 이 상수를 쓴다.
// instanceof를 쓰지 않는다. iframe realm에서는 Element 생성자가 달라진다(#271·#272).
export const COLLAPSED_HIDDEN_ATTRIBUTE = "data-geul-collapsed-hidden";

/**
 * 요소가 접힌 toggle 안에 숨은 블록이면 true다. 조상 중 하나라도 표식이 있으면
 * 숨은 것이다(중첩 접힘 포함). 접힌 toggle의 라벨 블록은 표식 붙은 blockGroup의
 * 조상이라 false다.
 */
export const isHiddenBlockElement = (el: Element): boolean =>
  el.closest(`[${COLLAPSED_HIDDEN_ATTRIBUTE}]`) !== null;
