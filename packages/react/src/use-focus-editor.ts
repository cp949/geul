import { useCallback } from "react";

/**
 * 편집기 오버레이(표 핸들, 표 선택 툴바, 블록 사이드 메뉴, 슬래시 메뉴, 링크
 * 툴바)가 메뉴·툴바를 닫으며 초점을 편집기로 되돌릴 때 쓰는 공용 훅.
 * table-handles.tsx, table-selection-toolbar.tsx, block-side-menu.tsx,
 * slash-menu.tsx 네 파일에 바이트 단위로 반복되던 콜백과, link-toolbar.tsx의
 * closeAndRestoreFocus 안에 인라인돼 있던 같은 조회 로직을 하나로 모은다.
 *
 * 반환하는 함수는 useCallback으로 감싸 element가 바뀌지 않는 한 참조가
 * 안정적이다 — 호출부 대부분이 이 함수를 다른 useCallback의 dependency로
 * 쓰므로(예: closeMenu), 매 렌더 새 함수를 반환하면 그 콜백들도 매 렌더
 * 재생성되는 회귀가 생긴다.
 */
export const useFocusEditor = (element: HTMLElement | null): (() => void) =>
  useCallback(() => {
    element?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
  }, [element]);
