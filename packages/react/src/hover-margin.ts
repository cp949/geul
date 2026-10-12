// 오버레이 hover 유지 여백 판정이다. 핸들은 대상 요소 바깥에 떠 있다.
// 포인터가 핸들로 이동하는 동안 요소 밖이어도 여백 안이면 hover를 유지한다.
// 즉시 해제하면 핸들에 닿기 전에 핸들이 사라진다.
// 여백 값은 호출부가 소유한다. 방향마다 다르고 호출부별로 독립이어야 한다
// (block-side-menu.tsx의 BLOCK_GUTTER_HOVER_MARGIN 선언부 참고).
// 여백 밖이면 무엇을 지우는지도 호출부가 정한다.

export type HoverMargins = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type HoverRect = Pick<
  DOMRect,
  "left" | "right" | "top" | "bottom" | "width" | "height"
>;

/**
 * 포인터가 rect를 여백만큼 넓힌 영역 안(경계 포함)이면 true다.
 * rect가 없거나 폭·높이가 0이면 false다. 숨은 블록의 0x0 rect가 여백에
 * 걸려 hover를 붙잡지 않게 한다(Issue #280).
 */
export const isPointerWithinHoverMargins = (
  rect: HoverRect | null | undefined,
  point: { clientX: number; clientY: number },
  margins: HoverMargins,
): boolean =>
  rect !== null &&
  rect !== undefined &&
  rect.width > 0 &&
  rect.height > 0 &&
  point.clientX >= rect.left - margins.left &&
  point.clientX <= rect.right + margins.right &&
  point.clientY >= rect.top - margins.top &&
  point.clientY <= rect.bottom + margins.bottom;
