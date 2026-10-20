/**
 * Enter 블록 분할 직후 결과 캐럿이 뷰포트 안에 있는지 실제 Chromium
 * 스크롤로 검증한다(Issue #427). core는 분할 transaction의
 * scrolledIntoView 플래그를 고정하고, 이 spec은 그 플래그가 짧은
 * 뷰포트에서 실제 스크롤로 이어지는지 확인한다.
 */
import { expect, test } from "@playwright/test";

import { openDemo } from "./support/demo.js";

test("짧은 뷰포트에서 문서 끝 Enter로 만든 새 블록의 캐럿이 뷰포트 안에 있다 (Issue #427)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 240 });
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("line 0");
  for (let index = 1; index < 20; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }
  await page.keyboard.press("Enter");

  // 빈 블록은 DOM Range rect가 0이라 캐럿 위치는 PM coordsAtPos로 읽는다.
  // 스크롤 반영은 poll로 기다리고, 실패하면 측정값을 메시지로 남긴다.
  await expect
    .poll(async () => {
      const caret = await editable.evaluate((root) => {
        const { view } = (
          root as unknown as {
            editor: {
              view: {
                state: { selection: { head: number } };
                coordsAtPos(position: number): { top: number; bottom: number };
              };
            };
          }
        ).editor;
        return view.coordsAtPos(view.state.selection.head);
      });
      const viewport = page.viewportSize();
      if (viewport === null) return "viewport 없음";
      return caret.top >= 0 && caret.bottom <= viewport.height
        ? "inside"
        : `top=${caret.top} bottom=${caret.bottom} height=${viewport.height}`;
    })
    .toBe("inside");
});
