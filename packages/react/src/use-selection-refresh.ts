import { useEffect } from "react";

type UseSelectionRefreshOptions = {
  element: HTMLElement | null;
  /**
   * selectionchange/mouseup/keyup/scroll(capture)/resize 중 하나가 발생하면
   * 호출한다. 등록 직후에도 한 번 호출해 마운트 시점 상태를 즉시 반영한다.
   * 호출부가 `useCallback`으로 안정된 참조를 넘겨야 한다 — 매 렌더 새
   * 함수면 이 훅의 effect가 리스너를 매 렌더 떼었다 다시 붙인다(다른 공유
   * 훅들과 같은 계약, use-pointer-hover-target.ts 참고).
   */
  onUpdate: () => void;
};

/**
 * "selectionchange 등 네이티브 이벤트가 발생하면 selection을 다시 읽어
 * 로컬 state를 갱신한다"는 배선 공용 훅. media-toolbar.tsx, file-panel.tsx,
 * formatting-toolbar.tsx, link-toolbar.tsx, table-selection-toolbar.tsx가
 * 각자 손으로 복제해온 selectionchange/mouseup/keyup/scroll(capture)/resize
 * 리스너 등록·해제와 마운트 시 초기 1회 호출을 하나로 모은다(아키텍처
 * 리뷰 C2, `_tmp/arch-review/01.html`).
 *
 * element가 아니라 element.ownerDocument/ownerWindow에 리스너를 건다 —
 * selectionchange는 document 레벨 이벤트고, scroll/resize는 중첩 scroll
 * container에서도 앵커가 움직일 수 있어 capture로 window에서 듣는다
 * (G-UI-001).
 *
 * media-resize-handles.tsx(초기 호출 없이 렌더 카운터만 증가하는 다른
 * 계약)와 block-selection-toolbar.tsx(pointerup 6번째 리스너가 붙어 있고,
 * 그 리스너는 등록 순서 경쟁 수정 이력이 있어 이 훅과 계약이 다르다)는
 * 그릴링 결과 이 훅을 쓰지 않는다 — 대상 스코프에서 의도적으로 제외했다.
 */
export const useSelectionRefresh = ({
  element,
  onUpdate,
}: UseSelectionRefreshOptions): void => {
  useEffect(() => {
    const ownerDocument = element?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    ownerDocument?.addEventListener("selectionchange", onUpdate);
    ownerDocument?.addEventListener("mouseup", onUpdate);
    ownerDocument?.addEventListener("keyup", onUpdate);
    ownerWindow?.addEventListener("scroll", onUpdate, true);
    ownerWindow?.addEventListener("resize", onUpdate);
    onUpdate();
    return () => {
      ownerDocument?.removeEventListener("selectionchange", onUpdate);
      ownerDocument?.removeEventListener("mouseup", onUpdate);
      ownerDocument?.removeEventListener("keyup", onUpdate);
      ownerWindow?.removeEventListener("scroll", onUpdate, true);
      ownerWindow?.removeEventListener("resize", onUpdate);
    };
  }, [element, onUpdate]);
};
