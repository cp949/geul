import { useEffect } from "react";

type UsePointerHoverTargetOptions = {
  element: HTMLElement | null;
  /**
   * pointermove 대상이 이 셀렉터 중 하나에 `closest()`로 걸리면 무시한다
   * (핸들·메뉴·리사이즈 스트립 등 자기 자신의 오버레이). 호출부의 모듈
   * 스코프 상수로 넘긴다 — 매 렌더 새 배열을 넘기면 이 훅의 effect가 매
   * 렌더 리스너를 떼었다 다시 붙인다.
   */
  ignoreSelectors: readonly string[];
  /** pointermove 대상에서 `closest()`로 찾을 hover 후보 엘리먼트 셀렉터. */
  entitySelector: string;
  /**
   * 후보를 찾을 때마다(또는 못 찾을 때마다) 호출한다. candidate는
   * entitySelector로 찾았고 element에 포함된 엘리먼트, 아니면 null —
   * null에서 id를 추출할지, 곧장 지울지, 여백 히스테리시스로 유지할지는
   * 호출부가 정한다(table-handles.tsx의 HANDLE_HOVER_MARGIN처럼).
   */
  onCandidateChange: (
    candidate: HTMLElement | null,
    event: PointerEvent,
  ) => void;
};

/**
 * gutter형 오버레이(표 행/열 핸들, 블록 사이드 메뉴)의 hover 대상 추적 공용
 * 훅. table-handles.tsx, block-side-menu.tsx가 각자 손으로 복제해온
 * ownerDocument pointermove 리스너 등록/해제·ignore-selector 판정·엘리먼트
 * 조회 로직을 하나로 모은다.
 *
 * element 안쪽이 아니라 element.ownerDocument에 리스너를 건다 — 오버레이가
 * element 바깥에 fixed로 떠 있어, element 안쪽에서만 들으면 포인터가
 * 오버레이로 이동하는 순간 hover가 풀린다.
 */
export const usePointerHoverTarget = ({
  element,
  ignoreSelectors,
  entitySelector,
  onCandidateChange,
}: UsePointerHoverTargetOptions): void => {
  useEffect(() => {
    if (element === null) return;
    const ownerDocument = element.ownerDocument;

    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        ignoreSelectors.some((selector) => target.closest(selector) !== null)
      ) {
        return;
      }

      const candidate = target.closest<HTMLElement>(entitySelector);
      onCandidateChange(
        candidate !== null && element.contains(candidate) ? candidate : null,
        event,
      );
    };

    ownerDocument.addEventListener("pointermove", handlePointerMove);
    return () =>
      ownerDocument.removeEventListener("pointermove", handlePointerMove);
  }, [element, ignoreSelectors, entitySelector, onCandidateChange]);
};
