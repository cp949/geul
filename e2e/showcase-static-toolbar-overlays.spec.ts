/**
 * Static toolbar 예제는 에디터를 안쪽 스크롤 컨테이너(scrollArea)에 둔다.
 * 캡션·미디어 툴바·리사이즈 핸들·표 핸들 같은 오버레이는 그 컨테이너
 * 바깥에 그려지므로, 스크롤로 블록이 보이는 영역 밖에 나가도 컨테이너가
 * 잘라내지 못해 영역 밖에 떠 있었다. 표·미디어 핸들은 안쪽 스크롤을 따라가지도
 * 않았다. jsdom은 레이아웃이 없어 이 결함을 재현하지 못한다(2026-10-02
 * 사용자 보고).
 */
import { expect, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

const OVERLAY_SELECTOR = [
  ".geul-code-block-caption",
  ".geul-media-caption",
  ".geul-media-toolbar",
  ".geul-media-resize-handle",
  '[class*="geul-table-"]',
].join(",");

test("스크롤해도 오버레이가 스크롤 영역 밖에 떠 있지 않다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });

  // 이미지를 선택해 media 툴바·리사이즈 핸들을 띄우고 표 위에 hover한다.
  const image = editor.locator("img").first();
  await image.scrollIntoViewIfNeeded();
  await image.click();

  const escaped = () =>
    page.evaluate((selector) => {
      const area = document
        .querySelector('[class*="scrollArea"]')
        ?.getBoundingClientRect();
      if (area === undefined) throw new Error("scrollArea 없음");
      return Array.from(document.querySelectorAll(selector))
        .filter((element) => {
          if (element.closest("[contenteditable]") !== null) return false;
          if (getComputedStyle(element).visibility === "hidden") return false;
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return false;
          return rect.bottom < area.top || rect.top > area.bottom;
        })
        .map((element) => String(element.className));
    }, OVERLAY_SELECTOR);

  await page.mouse.move(700, 400);
  for (const deltaY of [-2000, 300, 500, 800, -400]) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(250);
    expect(await escaped(), `wheel ${deltaY}`).toEqual([]);
  }
});

test("표 핸들이 안쪽 스크롤에서 표를 따라간다", async ({ page }) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });
  const cell = editor.locator("td").nth(1);
  await cell.scrollIntoViewIfNeeded();
  await cell.click();

  const offsets = () =>
    page.evaluate(() => {
      const table = document.querySelector("table")?.getBoundingClientRect();
      const handle = document
        .querySelector("[data-geul-table-row-handle-hit]")
        ?.getBoundingClientRect();
      if (table === undefined || handle === undefined) {
        throw new Error("표 또는 행 핸들 없음");
      }
      return handle.top - table.top;
    });

  const before = await offsets();
  await page.evaluate(() => {
    const area = document.querySelector('[class*="scrollArea"]');
    if (area !== null) area.scrollTop += 60;
  });
  await expect.poll(offsets).toBeCloseTo(before, 0);
});
