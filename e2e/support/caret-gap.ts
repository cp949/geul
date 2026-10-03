import { expect, type Locator, type Page } from "@playwright/test";

/**
 * 메뉴 상단과 DOM selection 캐럿 하단 사이 간격(px)과 캐럿의 viewport y를 잰다.
 * 캐럿 메뉴(slash, emoji)는 캐럿 rect 하단에 붙어 열린다.
 */
export const readCaretMenuGap = async (page: Page, menu: Locator) => {
  const caret = await page.evaluate(() => {
    const rect = document.getSelection()?.getRangeAt(0).getBoundingClientRect();
    return rect === undefined ? null : { y: rect.y, bottom: rect.bottom };
  });
  const box = await menu.boundingBox();
  if (caret === null || box === null) {
    throw new Error("캐럿이나 메뉴의 위치를 얻지 못했다");
  }
  return { caretY: caret.y, gap: box.y - caret.bottom };
};

/**
 * 열린 캐럿 메뉴가 window 스크롤 뒤에도 캐럿 하단에 붙어 있는지 단언한다.
 * 페이지에 스크롤 여지를 만들어 80px 민다. 캐럿이 실제로 움직였는지 먼저
 * 확인한다. 안 움직이면 단언이 공허하다.
 */
export const expectCaretMenuFollowsCaret = async (
  page: Page,
  menu: Locator,
) => {
  await page.evaluate(() => {
    document.body.style.paddingBottom = "2000px";
  });
  const before = await readCaretMenuGap(page, menu);
  expect(before.gap).toBeCloseTo(0, 0);
  await page.evaluate(() => window.scrollBy(0, 80));
  await expect
    .poll(async () => (await readCaretMenuGap(page, menu)).caretY)
    .not.toBe(before.caretY);
  await expect
    .poll(async () => Math.abs((await readCaretMenuGap(page, menu)).gap))
    .toBeLessThan(1);
};
