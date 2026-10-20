/**
 * Shift-Enter 줄바꿈(hardBreak) 직후 결과 캐럿이 뷰포트 안에 있는지 실제
 * Chromium 스크롤로 검증한다(Issue #428). core는 hardBreak 삽입
 * transaction의 scrolledIntoView 플래그를 고정하고, 이 spec은 그 플래그가
 * 짧은 뷰포트에서 실제 스크롤로 이어지는지 확인한다.
 */
import { expect, test } from "@playwright/test";

import {
  openShortViewportDemoWithLines,
  readPmCaretRect,
} from "./support/short-viewport.js";

test("짧은 뷰포트에서 문서 끝 Shift-Enter 줄바꿈 뒤 캐럿이 뷰포트 안에 있다 (Issue #428)", async ({
  page,
}) => {
  const { editable } = await openShortViewportDemoWithLines(page);
  await page.keyboard.press("Shift+Enter");

  // 스크롤 반영은 poll로 기다리고, 실패하면 측정값을 메시지로 남긴다.
  await expect
    .poll(async () => {
      const caret = await readPmCaretRect(editable);
      const viewport = page.viewportSize();
      if (viewport === null) return "viewport 없음";
      return caret.top >= 0 && caret.bottom <= viewport.height
        ? "inside"
        : `top=${caret.top} bottom=${caret.bottom} height=${viewport.height}`;
    })
    .toBe("inside");
});
