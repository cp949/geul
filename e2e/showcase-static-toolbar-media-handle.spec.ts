/**
 * 미디어 그립이 안쪽 스크롤을 따라가는지 확인한다(Issue #235, G-UI-003).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007 "레이아웃 기하"): 그립은 page 좌표
 * absolute라 안쪽 스크롤 컨테이너가 스크롤돼도 제자리에 남았다. 포인터를 멈춘 채
 * 스크롤해도 그립 상단이 미디어 시각 요소 상단과 같은지 본다. jsdom은 실제
 * 스크롤과 레이아웃을 만들지 못한다. 재렌더 배선과 clip 판정은 단위 테스트
 * (media-handle-overlays.test.tsx)가 소유한다.
 *
 * 그립은 hover 중인 블록에만 뜬다. 스크롤은 `scrollTop=60` 대입이라 포인터가
 * 움직이지 않는다. 그래서 이미지를 문서 위쪽(3번 문단 아래)에 둔다.
 */
import { expect, type Page, test } from "@playwright/test";

import {
  expectOverlayTopAlignedWithAnchor,
  resetPageScroll,
  type ScrollScope,
} from "./support/anchor-gap.js";
import { openShowcasePage, uploadImageAtCaret } from "./support/showcase.js";

/** 예제를 열고 3번 문단 아래에 이미지를 올려 `<img>`를 hover한 채 돌려준다. */
const hoverUploadedImage = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  await editable.locator('[data-geul-block-id$="block-3"]').click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await uploadImageAtCaret(page);

  const image = editable.locator("img");
  await expect(image).toBeVisible();
  // 업로드가 편집기 쪽으로 스크롤했을 수 있다. 맨 위에서 시작한다.
  await resetPageScroll(page);
  await image.hover();
  const grip = page.getByRole("button", {
    name: "Drag to reorder, click for options",
  });
  await expect(grip).toBeVisible();
  return { image, grip };
};

test.describe("hover 그립 (Issue #235)", () => {
  for (const [title, scope] of [
    ["window를 스크롤해도", "window"],
    ["안쪽 스크롤 컨테이너를 스크롤해도", "inner"],
    ["안쪽 스크롤과 window를 함께 스크롤해도", "all"],
  ] as const satisfies readonly (readonly [string, ScrollScope])[]) {
    test(`포인터를 멈춘 채 ${title} 그립 상단이 이미지 상단과 같다`, async ({
      page,
    }) => {
      const { image } = await hoverUploadedImage(page);

      await expectOverlayTopAlignedWithAnchor(
        page,
        image,
        page.locator(".geul-media-handle-overlay"),
        scope,
      );
    });
  }

  test("Block menu가 열린 채 안쪽 스크롤 컨테이너를 스크롤해도 그립 상단이 이미지 상단과 같다", async ({
    page,
  }) => {
    const { image, grip } = await hoverUploadedImage(page);
    await grip.click();
    await expect(page.getByRole("menu", { name: "Block menu" })).toBeVisible();

    await expectOverlayTopAlignedWithAnchor(
      page,
      image,
      page.locator(".geul-media-handle-overlay"),
      "inner",
    );
  });
});
