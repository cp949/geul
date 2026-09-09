import { startTransition, useEffect } from "react";

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
      // onOutsideDismiss()는 여기서 동기 호출한다(즉시성 계약 — unit test가
      // 이 순서를 그대로 단언한다). 그 안에서 일어나는 state 갱신만
      // `startTransition`으로 낮은 우선순위로 미룬다(Issue #155).
      //
      // 실측 근본 원인(계획의 "React 18 자동 배칭" 가설이 아니다): 바깥
      // pointerdown이 dismiss state를 커밋하면 그 순간 페이지의 실제 layout이
      // 바뀐다(예: media-toolbar.tsx가 `position: fixed` 대신 static으로
      // 렌더돼 있어 닫히면 문서 scrollHeight가 줄고, 스크롤이 이미 바닥
      // 근처였던 브라우저가 scrollTop을 즉시 clamp한다). 같은 물리적 클릭이
      // 이어서 내는 mouseup/click은 pointerdown 시점 좌표를 그대로 재사용해
      // "그 시점의" layout으로 다시 hit-test하므로, 그 사이에 내용이
      // 스크롤돼 버리면 mouseup/click이 완전히 다른 엘리먼트(예: 바깥
      // 액션 버튼이 아니라 그 위 헤더)로 떨어진다 — React 이벤트 위임이나
      // fiber 참조 문제가 아니라 순수 브라우저 hit-test 재평가 문제다.
      // `startTransition`은 dismiss가 만드는 커밋을 discrete 우선순위인
      // click 처리 뒤로 미뤄, 그 물리적 클릭이 끝날 때까지 layout이 바뀌지
      // 않게 한다.
      startTransition(() => {
        onOutsideDismiss();
      });
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
