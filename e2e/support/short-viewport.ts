/**
 * 편집 직후 캐럿이 뷰포트 안으로 스크롤되는지 보는 e2e가 공용으로 쓰는
 * 짧은 뷰포트 셋업과 PM 캐럿 좌표 읽기(G-TST-002).
 */
import type { Locator, Page } from "@playwright/test";

import { openDemo } from "./demo.js";

/** 20줄이 넘치도록 고른 짧은 뷰포트 크기. */
export const SHORT_VIEWPORT = { width: 320, height: 240 } as const;

/**
 * 짧은 뷰포트로 데모를 열고 "line 0".."line 19" 20개 문단을 입력한다.
 * 캐럿은 "line 19" 끝에 남는다. 문서 끝이 뷰포트 밖으로 넘쳐서 다음 편집이
 * 스크롤을 일으켜야 캐럿이 보이는 상태를 만든다.
 */
export const openShortViewportDemoWithLines = async (page: Page) => {
  await page.setViewportSize(SHORT_VIEWPORT);
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("line 0");
  for (let index = 1; index < 20; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }
  return { editable };
};

/**
 * 현재 selection head의 viewport 기준 top·bottom을 PM `coordsAtPos`로 읽는다.
 * 빈 블록은 DOM Range rect가 0이라 DOM selection으로는 캐럿 위치를 못 읽는다.
 * `editable`은 Tiptap이 `editor` 속성을 붙인 `.ProseMirror` 요소여야 한다.
 */
export const readPmCaretRect = (editable: Locator) =>
  editable.evaluate((root) => {
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
    const { top, bottom } = view.coordsAtPos(view.state.selection.head);
    return { top, bottom };
  });
