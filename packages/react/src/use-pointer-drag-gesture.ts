import { useEffect } from "react";

export type UsePointerDragGestureOptions = {
  /** false면 리스너를 걸지 않는다(제스처가 진행 중이 아닐 때 문서 리스너를 유지할 이유가 없다). */
  active: boolean;
  element: HTMLElement | null;
  /**
   * active인 동안 이 pointerId와 일치하는 이벤트만 onMove/onUp/onCancel로
   * 넘긴다. 게이트를 훅이 소유해, pointerId 오판정 버그를 고치는 지점이
   * 호출부 3곳에서 여기 한 곳으로 줄어든다.
   */
  pointerId: number | null;
  onMove: (event: PointerEvent) => void;
  onUp: (event: PointerEvent) => void;
  onCancel: (event: PointerEvent) => void;
  /**
   * Escape keydown. `null`을 반환하면 제스처를 그 자리에서 끝내고 훅이 즉시
   * 리스너를 뗀다(리사이즈). `true`를 반환하면 리스너는 그대로 두되 이후
   * onMove 호출만 훅이 대신 억제한다 — pointerup/pointercancel은 계속
   * 온다(재정렬·블록드래그의 cancelled 플래그와 동형). preventDefault 호출
   * 여부와 그 밖의 부수효과(예: 시각 되돌리기)는 이 콜백이 스스로 정한다 —
   * 훅은 반환값만 본다.
   */
  onEscape: (event: KeyboardEvent) => null | true;
};

/**
 * pointerId 게이트 + pointermove/pointerup/pointercancel/keydown(Escape)
 * 4-listener 생명주기를 공유하는 훅. table-handles.tsx(행/열 재정렬, 열
 * 리사이즈)와 block-side-menu.tsx(블록 드래그) 3곳이 각자 복제해온 골격을
 * 하나로 모은다.
 *
 * setPointerCapture를 포함한 pointerdown 시작 로직은 훅 범위 밖이다 — 각
 * 호출부의 버튼 onPointerDown에 그대로 남는다. 이 훅은 그 이후 문서 레벨
 * 생명주기만 맡는다.
 */
export const usePointerDragGesture = ({
  active,
  element,
  pointerId,
  onMove,
  onUp,
  onCancel,
  onEscape,
}: UsePointerDragGestureOptions): void => {
  useEffect(() => {
    if (!active || element === null || pointerId === null) return;
    const ownerDocument = element.ownerDocument;
    // Escape가 true를 반환한 뒤에도 pointerup/pointercancel은 계속
    // 들어야 하므로 리스너를 떼지 않는다 — onMove 호출만 이 플래그로 막는다.
    let suppressed = false;

    const detach = () => {
      ownerDocument.removeEventListener("pointermove", handlePointerMove);
      ownerDocument.removeEventListener("pointerup", handlePointerUp);
      ownerDocument.removeEventListener("pointercancel", handlePointerCancel);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId || suppressed) return;
      onMove(event);
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      onUp(event);
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      onCancel(event);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (onEscape(event) === null) {
        detach();
        return;
      }
      suppressed = true;
    };

    ownerDocument.addEventListener("pointermove", handlePointerMove);
    ownerDocument.addEventListener("pointerup", handlePointerUp);
    ownerDocument.addEventListener("pointercancel", handlePointerCancel);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return detach;
  }, [active, element, pointerId, onMove, onUp, onCancel, onEscape]);
};
