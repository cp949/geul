import { expect, type Locator, type Page } from "@playwright/test";

/** 앵커 하단과 오버레이 상단 사이 간격과 앵커의 viewport y. */
export type AnchorGap = { anchorY: number; gap: number };

/**
 * 앵커 하단과 오버레이 상단 사이 간격(gapY)을 잰다. fixed 오버레이가 열릴 때
 * 정한 좌표에 남는지, 앵커를 따라가는지 판정하는 기준값이다.
 */
export const readAnchorGap = async (
  anchor: Locator,
  overlay: Locator,
): Promise<AnchorGap> => {
  const anchorBox = await anchor.boundingBox();
  const overlayBox = await overlay.boundingBox();
  if (anchorBox === null || overlayBox === null) {
    throw new Error("앵커나 오버레이의 위치를 얻지 못했다");
  }
  return {
    anchorY: anchorBox.y,
    gap: overlayBox.y - (anchorBox.y + anchorBox.height),
  };
};

/**
 * 스크롤 가능한 조상을 모두 `scrollTop=60`으로 밀고 window를 40px 민다.
 * `window`를 주면 window 스크롤만 한다. 안쪽 스크롤 컨테이너와 window가 함께
 * 움직이는 경우와 window만 움직이는 경우를 따로 증명할 때 쓴다.
 */
export const scrollPage = async (
  page: Page,
  scope: "window" | "all" = "all",
) => {
  await page.evaluate((target) => {
    if (target === "all") {
      for (const element of document.querySelectorAll<HTMLElement>("*")) {
        const scrollable =
          element.scrollHeight > element.clientHeight + 5 &&
          getComputedStyle(element).overflowY !== "visible";
        if (scrollable) element.scrollTop = 60;
      }
    }
    window.scrollBy(0, 40);
  }, scope);
};

/** `scrollPage`로 민 스크롤을 모두 처음으로 되돌린다. 한 테스트에서 오버레이 여러 개를 잴 때 쓴다. */
export const resetPageScroll = async (page: Page) => {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>("*")) {
      if (element.scrollTop !== 0) element.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  });
};

/**
 * 열린 오버레이가 스크롤 뒤에도 앵커 아래 같은 간격을 유지하는지 단언한다.
 * 전제로 앵커가 실제로 움직였는지 먼저 확인한다. 안 움직이면 단언이 공허하다.
 */
export const expectOverlayFollowsAnchor = async (
  page: Page,
  anchor: Locator,
  overlay: Locator,
  scope: "window" | "all" = "all",
) => {
  const before = await readAnchorGap(anchor, overlay);
  await scrollPage(page, scope);
  await expect
    .poll(async () => (await readAnchorGap(anchor, overlay)).anchorY)
    .not.toBe(before.anchorY);
  await expect
    .poll(async () => (await readAnchorGap(anchor, overlay)).gap)
    .toBe(before.gap);
};
