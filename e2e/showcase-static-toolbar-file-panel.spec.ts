/**
 * file 패널이 열린 채 스크롤해도 대상 블록 하단 중앙에 붙어 있는지
 * 확인한다(Issue #234, G-UI-001).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007 "레이아웃 기하"): 패널은 열릴
 * 때의 viewport 좌표에 fixed로 그려지고, 블록은 안쪽 스크롤 컨테이너와
 * window 안에서 움직인다. jsdom은 실제 스크롤과 레이아웃을 만들지 못한다.
 * 재측정 배선과 draft 보존은 단위 테스트(file-panel.test.tsx)가 소유한다.
 */
import { expect, type Page, test } from "@playwright/test";

import {
  expectOverlayFollowsAnchor,
  type ScrollScope,
} from "./support/anchor-gap.js";
import { openShowcasePage } from "./support/showcase.js";

/** `centerBelow` 앵커가 블록 하단과 패널 상단 사이에 두는 간격(0.5rem, px). */
const PANEL_GAP = 8;

/** 예제를 열고 3번 문단 아래에 빈 file 블록을 만들어 패널이 열린 상태로 돌려준다. */
const openFilePanel = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  await editable.locator('[data-geul-block-id$="block-3"]').click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/file");
  await page.getByRole("option", { name: /^File/ }).click();

  const panel = page.getByRole("toolbar", { name: "File panel" });
  await expect(panel).toBeVisible();
  // 패널이 열린 대상 블록 id는 편집기 요소의 속성에 있다.
  const blockId = await page
    .locator("[data-geul-file-panel-block-id]")
    .getAttribute("data-geul-file-panel-block-id");
  if (blockId === null) throw new Error("패널이 연 블록 id를 얻지 못했다");
  const block = editable.locator(`[data-geul-block-id="${blockId}"]`);
  return { block, panel };
};

test.describe("열린 채 스크롤 (Issue #234)", () => {
  for (const [title, scope] of [
    ["window를 스크롤해도", "window"],
    ["안쪽 스크롤 컨테이너를 스크롤해도", "inner"],
    ["안쪽 스크롤과 window를 함께 스크롤해도", "all"],
  ] as const satisfies readonly (readonly [string, ScrollScope])[]) {
    test(`file 패널이 열린 채 ${title} 블록 하단에 붙어 있다`, async ({
      page,
    }) => {
      const { block, panel } = await openFilePanel(page);

      await expectOverlayFollowsAnchor(page, block, panel, scope, PANEL_GAP);
    });
  }
});
