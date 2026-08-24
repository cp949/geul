import { useEffect } from "react";

type UseDismissOnOutsideOrEscapeOptions = {
  /** false면 리스너를 걸지 않는다(오버레이가 닫혀 있을 때 문서 리스너를 유지할 이유가 없다). */
  active: boolean;
  element: HTMLElement | null;
  /**
   * pointerdown 대상이 이 셀렉터 중 하나에 `closest()`로 걸리면 바깥 클릭으로
   * 취급하지 않는다. 호출부의 모듈 스코프 상수로 넘긴다 — 매 렌더 새 배열을
   * 넘기면 이 훅의 effect가 매 렌더 리스너를 떼었다 다시 붙인다.
   */
  allowSelectors: readonly string[];
  /** 바깥 pointerdown. 클릭 대상이 자연히 초점을 받으므로 여기서 초점을 옮기지 않는다. */
  onOutsideDismiss: () => void;
  /** Escape. 돌아갈 클릭 대상이 없으므로 보통 편집기로 초점을 되돌린다(호출부 책임). */
  onEscapeDismiss: () => void;
};

/**
 * 오버레이(메뉴, 툴바 등)를 바깥 pointerdown 또는 Escape로 닫는 공용 훅.
 * table-handles.tsx, table-selection-toolbar.tsx가 각자 손으로 복제해온
 * 리스너 등록/해제 로직을 하나로 모은다(Issue #20).
 * G-TST-001: 이 훅으로 만든 Escape 닫기 e2e는 반드시 `--workers` 병렬로도
 * 반복 실행해 selectionchange 재오픈 레이스가 없는지 확인한다.
 */
export const useDismissOnOutsideOrEscape = ({
  active,
  element,
  allowSelectors,
  onOutsideDismiss,
  onEscapeDismiss,
}: UseDismissOnOutsideOrEscapeOptions): void => {
  useEffect(() => {
    if (!active || element === null) return;
    const ownerDocument = element.ownerDocument;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        allowSelectors.some((selector) => target.closest(selector) !== null)
      ) {
        return;
      }
      onOutsideDismiss();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onEscapeDismiss();
    };

    ownerDocument.addEventListener("pointerdown", handlePointerDown);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, element, allowSelectors, onOutsideDismiss, onEscapeDismiss]);
};
