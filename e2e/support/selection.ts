/**
 * 클램프 e2e(PIT-0011)가 공용으로 쓰는 selection 헬퍼.
 * FormattingToolbar/LinkToolbar를 특정 블록 위에 띄우는 데 쓴다(#44 항목 5).
 */
import type { Locator } from "@playwright/test";

/** selectBlockTextAndNotify가 반환하는 selection range의 bounding rect. */
export type SelectionRectJson = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * 블록의 텍스트 노드 전체를 selection으로 만들고 selectionchange를
 * 디스패치한다. FormattingToolbar/LinkToolbar가 선택 변경에 반응해 앵커
 * 좌표를 다시 계산하도록 트리거하는 데 쓴다(PIT-0011 뷰포트 경계 시나리오).
 * 반환값은 만들어진 range의 bounding rect(JSON)다.
 *
 * `blockLabel`은 텍스트 노드가 없을 때의 오류 메시지에만 쓴다 — 호출부마다
 * 대상 블록이 달라(마지막 줄/첫 줄) 실패했을 때 어느 블록인지 구분한다.
 */
export const selectBlockTextAndNotify = (
  block: Locator,
  blockLabel: string,
): Promise<SelectionRectJson> =>
  block.evaluate((element, label) => {
    const text = element.firstChild;
    if (text === null) throw new Error(`${label} has no text`);
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return range.getBoundingClientRect().toJSON();
  }, blockLabel);
