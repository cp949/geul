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
 */
export const selectBlockTextAndNotify = (
  block: Locator,
): Promise<SelectionRectJson> =>
  block.evaluate((element) => {
    const text = element.firstChild;
    if (text === null) throw new Error("Block has no text");
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return range.getBoundingClientRect().toJSON();
  });
