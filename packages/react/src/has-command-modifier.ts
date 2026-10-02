/**
 * 브라우저·OS·보조기술 단축키가 쓰는 수식 키가 눌렸는지 돌려준다.
 *
 * Ctrl·Alt·Meta 중 하나라도 눌렸으면 `true`다. 메뉴와 트리거의 keydown은
 * 이 경우 처리를 물리고 `preventDefault`하지 않는다. `Alt+ArrowLeft`(뒤로 가기)
 * 와 `Ctrl+Tab`(탭 전환) 같은 단축키가 막히지 않게 한다.
 *
 * `shiftKey`는 보지 않는다. 메뉴에서 `Shift+Tab`은 닫기 키다.
 */
export const hasCommandModifier = (event: {
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): boolean => event.ctrlKey || event.altKey || event.metaKey;
