import { useEffect, useLayoutEffect, useRef } from "react";

export type UsePointerDragGestureOptions = {
  /** false면 리스너를 걸지 않는다(제스처가 진행 중이 아닐 때 문서 리스너를 유지할 이유가 없다). */
  active: boolean;
  element: HTMLElement | null;
  /**
   * active인 동안 이 pointerId와 일치하는 이벤트만 onMove/onUp/onCancel로
   * 넘긴다. 게이트를 훅이 소유해, pointerId 오판정 버그를 고치는 지점이
   * 호출부 3곳에서 여기 한 곳으로 줄어든다. 훅 내부에서는 이 값을 ref로
   * 미러링해 매 렌더 최신값으로 게이트한다(아래 pointerIdRef 참고) — 한
   * 상태 슬롯이 다음 렌더가 반영되기 전에(예: 멀티터치로 같은 슬롯을 다른
   * pointerId가 덮어씀) 바뀌어도 낡은 리스너 인스턴스가 새 pointerId의
   * 이벤트를 걸러내지 못하는 구멍을 막는다.
   */
  pointerId: number | null;
  /**
   * onMove/onUp/onCancel/onEscape는 참조 안정성이 있어야 한다(예:
   * useCallback으로 의존성을 최소화해 안정화). 이 값들은 훅의 effect
   * 의존성 배열에 들어가므로, 매 렌더 새 함수를 넘기면 제스처가 진행되는
   * 동안(pointermove가 갱신하는 상태를 그대로 넘기는 등) 매 렌더마다
   * document 리스너 4개를 떼었다 다시 붙인다 — table-handles.tsx의
   * 10,000셀 표 드래그 프레임 예산(spec 13)을 갉아먹는다.
   */
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
  // pointerId를 매 커밋마다 최신값으로 미러링하는 ref. 아래 effect의
  // pointermove/up/cancel 핸들러는 effect가 설치될 때 캡처한 pointerId
  // 인자가 아니라 이 ref를 읽어 게이트한다 — 그러지 않으면, 같은 상태
  // 슬롯이 다음 렌더(및 이 훅의 effect 재실행)가 반영되기 전에 다른
  // pointerId로 덮어써질 때(예: 멀티터치로 첫 제스처가 아직 안 끝난
  // 상태에서 두 번째 손가락이 새 pointerdown을 시작) 아직 떼어지지 않은
  // 낡은 리스너 인스턴스가 새 pointerId의 이벤트를 걸러내 못 넘긴다.
  // useLayoutEffect라 커밋 직후 페인트 전에 동기로 반영되므로, 그 사이
  // 브라우저가 pointer 이벤트를 보낼 수 없다 — effect 재실행(비동기, 다음
  // 페인트 이후)을 기다릴 필요가 없다.
  const pointerIdRef = useRef(pointerId);
  useLayoutEffect(() => {
    pointerIdRef.current = pointerId;
  });

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
      ownerDocument.removeEventListener("keydown", handleKeyDown, true);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current || suppressed) return;
      onMove(event);
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current) return;
      onUp(event);
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current) return;
      onCancel(event);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // capture phase에서 잡아 stopPropagation한다 — 활성 제스처가 있는
      // 동안은 이 훅이 Escape를 독점한다. 그러지 않으면 media 리사이즈
      // 드래그처럼 형제 selection 기반 오버레이(MediaToolbar)가 등록만
      // 먼저 해 둔 별도 bubble-phase Escape 리스너가 같은 keydown에서
      // 함께 발화해, "리사이즈만 취소"할 의도로 누른 Escape가 관계없는
      // toolbar까지 닫아버린다(RD-001 DELTA-03 e2e 실측 — 등록 순서상
      // MediaToolbar의 리스너가 이 훅보다 먼저 붙어 bubble에서는 이길
      // 수 없다, capture만이 순서와 무관하게 우선한다).
      event.stopPropagation();
      if (onEscape(event) === null) {
        detach();
        return;
      }
      suppressed = true;
    };

    ownerDocument.addEventListener("pointermove", handlePointerMove);
    ownerDocument.addEventListener("pointerup", handlePointerUp);
    ownerDocument.addEventListener("pointercancel", handlePointerCancel);
    ownerDocument.addEventListener("keydown", handleKeyDown, true);
    return detach;
  }, [active, element, pointerId, onMove, onUp, onCancel, onEscape]);
};
