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
