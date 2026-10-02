/**
 * 확정한 Enter의 자동 반복이 포커스가 옮겨 간 편집기에 닿지 않게 한다.
 *
 * 버튼은 keydown Enter마다 click을 낸다. 메뉴 항목을 Enter로 확정하면 메뉴가
 * 닫히고 포커스가 편집기로 돌아간다. 키를 떼기 전에 반복이 오면 편집기가
 * 그 Enter를 받아 선택 범위를 줄바꿈으로 바꾼다.
 *
 * 처음 누른 Enter의 keydown 핸들러에서 부른다. 문서 capture 단계에서 반복
 * Enter만 삼킨다. 다음 중 하나가 오면 스스로 푼다.
 * - Enter keyup.
 * - 반복이 아닌 keydown. 키를 새로 눌렀다는 뜻이다.
 * 이미 걸려 있으면 새 keydown이 먼저 풀고 새로 건다.
 */
export const suppressEnterRepeat = (ownerDocument: Document): void => {
  const release = () => {
    ownerDocument.removeEventListener("keydown", onKeyDown, true);
    ownerDocument.removeEventListener("keyup", onKeyUp, true);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    release();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Enter") release();
  };
  ownerDocument.addEventListener("keydown", onKeyDown, true);
  ownerDocument.addEventListener("keyup", onKeyUp, true);
};

/** `handleMenuEnterKeyDown`이 읽는 keydown의 최소 구조. React·DOM 이벤트가 모두 맞는다. */
type MenuEnterKeyDownEvent = {
  key: string;
  repeat: boolean;
  preventDefault(): void;
  currentTarget: { ownerDocument: Document };
};

/**
 * 메뉴 안 keydown의 Enter를 처리한다. 처리했으면 `true`다.
 * Enter가 아니면 `false`다. 호출부가 나머지 키 처리를 이어 간다.
 *
 * 옵션·스와치 버튼은 keydown Enter마다 click을 낸다.
 * - 반복 Enter: 트리거에서 Enter를 누른 채 있으면 반복이 첫 항목을 확정한다.
 *   `preventDefault`로 click을 막는다.
 * - 처음 Enter: 확정이 포커스를 편집기로 돌린다. 그 뒤의 반복이 편집기에
 *   닿지 않게 `suppressEnterRepeat`를 건다. 처음 Enter는 막지 않는다.
 *   막으면 click이 나지 않아 확정되지 않는다.
 *
 * 수식 키 가드보다 앞서 부른다. 뒤에 두면 `Ctrl+Enter` 반복이 새어 나간다.
 */
export const handleMenuEnterKeyDown = (
  event: MenuEnterKeyDownEvent,
): boolean => {
  if (event.key !== "Enter") return false;
  if (event.repeat) {
    event.preventDefault();
    return true;
  }
  suppressEnterRepeat(event.currentTarget.ownerDocument);
  return true;
};
