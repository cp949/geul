/** 화면 좌표(viewport 기준) 한 점. 팝업 배치의 앵커로 쓴다. */
export type MenuPosition = { left: number; top: number };

/**
 * 편집기 안 DOM 캐럿의 아래쪽 좌표. 캐럿이 편집기 밖이거나 선택이 없으면
 * `null`이다.
 *
 * 슬래시 메뉴·이모지 picker 같은 캐럿 트리거 popup이 배치 앵커로 쓴다.
 * `getBoundingClientRect`를 구현하지 않는 환경은 0 rect로 본다.
 */
export const readCaretBounds = (element: HTMLElement): MenuPosition | null => {
  const selection = element.ownerDocument.getSelection();
  if (
    selection === null ||
    selection.rangeCount === 0 ||
    selection.anchorNode === null ||
    !element.contains(selection.anchorNode)
  ) {
    return null;
  }
  const bounds = selection.getRangeAt(0).getBoundingClientRect?.() ?? {
    left: 0,
    top: 0,
    height: 0,
  };
  // 캐럿이 빈 블록(자식이 <br class="ProseMirror-trailingBreak"> 하나뿐인
  // 문단) 안에 있으면 Range의 경계가 텍스트 노드가 아니라 엘리먼트+offset이라
  // Chromium이 getBoundingClientRect()로 (0,0,0,0)을 돌려준다 — 실측 확인,
  // QA-086. 이때는 캐럿을 담은 엘리먼트 자신의 rect(항상 레이아웃된 실제
  // 위치)로 대체한다.
  if (bounds.height === 0) {
    const anchorElement =
      selection.anchorNode.nodeType === Node.ELEMENT_NODE
        ? (selection.anchorNode as Element)
        : selection.anchorNode.parentElement;
    const elementRect = anchorElement?.getBoundingClientRect();
    if (elementRect !== undefined && elementRect.height > 0) {
      return { left: elementRect.left, top: elementRect.bottom };
    }
  }
  return { left: bounds.left, top: bounds.top + bounds.height };
};
