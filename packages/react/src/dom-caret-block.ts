/**
 * 브라우저 DOM selection이 접힌 캐럿일 때 그 캐럿이 속한 블록의 id. 편집기 밖,
 * 범위 선택, 블록 컨테이너 밖(atom 블록 선택 등)이면 `null`이다.
 *
 * `editor.getCaretBlockContext()`는 쓰지 않는다. 키보드로 블록을 옮긴 직후에는
 * ProseMirror가 `selectionchange`를 비동기로 반영해 이전 블록을 돌려준다.
 * DOM selection은 그때 이미 새 위치를 가리킨다. 블록 id는 `renderHTML`이 내는
 * `data-geul-block-id`로 읽는다(G-EDT-003). 이 함수는 읽기만 한다.
 *
 * 내부 헬퍼다. `index.ts`에서 내보내지 않는다.
 */
export const readDomCaretBlockId = (element: HTMLElement): string | null => {
  const selection = element.ownerDocument.getSelection();
  if (selection === null || !selection.isCollapsed) return null;
  const anchorNode = selection.anchorNode;
  if (anchorNode === null || !element.contains(anchorNode)) return null;
  const anchorElement =
    anchorNode.nodeType === Node.ELEMENT_NODE
      ? (anchorNode as Element)
      : anchorNode.parentElement;
  return (
    anchorElement
      ?.closest("[data-geul-block-id]")
      ?.getAttribute("data-geul-block-id") ?? null
  );
};
