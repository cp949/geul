/**
 * Static toolbar 예제는 에디터를 안쪽 스크롤 컨테이너(scrollArea)에 둔다.
 * 캡션·미디어 툴바·리사이즈 핸들·표 핸들 같은 오버레이는 그 컨테이너
 * 바깥에 그려지므로, 스크롤로 블록이 보이는 영역 밖에 나가도 컨테이너가
 * 잘라내지 못해 영역 밖에 떠 있었다. 표·미디어 핸들은 안쪽 스크롤을 따라가지도
 * 않았다. jsdom은 레이아웃이 없어 이 결함을 재현하지 못한다(2026-10-02
 * 사용자 보고).
 *
 * hover로 뜨는 미디어 그립과 callout 트리거도 같은 규칙을 따른다(Issue #235).
 * 둘은 hover 중에만 DOM에 있어서, 숨었는지 보려면 먼저 DOM에 있어야 한다.
 */
import { expect, type Page, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

const OVERLAY_SELECTOR = [
  ".geul-code-block-caption",
  ".geul-media-caption",
  ".geul-media-toolbar",
  ".geul-media-resize-handle",
  '[class*="geul-table-"]',
  ".geul-media-handle-overlay",
  ".geul-callout-icon-trigger",
].join(",");

/** 스크롤 영역 위나 아래로 벗어났는데 보이는 오버레이의 class 목록. */
const readEscapedOverlays = (page: Page) =>
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

  const escaped = () => readEscapedOverlays(page);

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

test("글자를 선택한 채 스크롤해도 서식 popover와 링크 툴바가 스크롤 영역 밖에 떠 있지 않다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editor = page.getByRole("textbox", { name: "Editor" });
  await editor.locator("p").nth(3).dblclick();
  await expect(page.getByRole("toolbar", { name: "Formatting" })).toBeVisible();

  const escaped = () =>
    page.evaluate(() => {
      const area = document
        .querySelector('[class*="scrollArea"]')
        ?.getBoundingClientRect();
      if (area === undefined) throw new Error("scrollArea 없음");
      return Array.from(
        document.querySelectorAll(
          ".geul-formatting-toolbar, .geul-link-toolbar",
        ),
      )
        .filter((element) => {
          if (getComputedStyle(element).visibility === "hidden") return false;
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return false;
          return rect.bottom < area.top || rect.top > area.bottom;
        })
        .map((element) => String(element.className));
    });

  expect(await escaped()).toEqual([]);
  await page.mouse.move(700, 400);
  for (const deltaY of [400, 800, -1500]) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(250);
    expect(await escaped(), `wheel ${deltaY}`).toEqual([]);
  }
});

test("hover로 뜬 미디어 그립과 callout 트리거는 스크롤 영역 밖에서 숨고 돌아오면 다시 보인다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });

  // 포인터를 멈춘 채 scrollTop만 바꾼다. hover가 유지돼 오버레이가 DOM에 남는다.
  const readAreaScrollTop = () =>
    page.evaluate(() => {
      const area = document.querySelector<HTMLElement>('[class*="scrollArea"]');
      if (area === null) throw new Error("scrollArea 없음");
      return area.scrollTop;
    });
  const setAreaScrollTop = (top: number) =>
    page.evaluate((target) => {
      const area = document.querySelector<HTMLElement>('[class*="scrollArea"]');
      if (area === null) throw new Error("scrollArea 없음");
      area.scrollTop = target;
    }, top);
  const isOutsideScrollArea = (anchor: ReturnType<typeof editor.locator>) =>
    anchor.evaluate((element) => {
      const area = document
        .querySelector('[class*="scrollArea"]')
        ?.getBoundingClientRect();
      if (area === undefined) throw new Error("scrollArea 없음");
      const rect = element.getBoundingClientRect();
      return rect.bottom < area.top || rect.top > area.bottom;
    });

  for (const [anchor, selector] of [
    [editor.locator("img").first(), ".geul-media-handle-overlay"],
    [
      editor.locator("[data-geul-callout]").first(),
      ".geul-callout-icon-trigger",
    ],
  ] as const) {
    const overlay = page.locator(selector);
    await anchor.scrollIntoViewIfNeeded();
    await anchor.hover();
    // 전제: 숨었는지 보려면 오버레이가 DOM에 있어야 한다.
    await expect(overlay, `${selector} 존재`).toHaveCount(1);
    await expect(overlay, `${selector} 영역 안`).toHaveCSS(
      "visibility",
      "visible",
    );
    expect(await readEscapedOverlays(page)).toEqual([]);

    const inside = await readAreaScrollTop();
    await setAreaScrollTop(0);
    expect(
      await isOutsideScrollArea(anchor),
      `${selector} 앵커가 영역 밖`,
    ).toBe(true);
    await expect(overlay, `${selector} 존재(영역 밖)`).toHaveCount(1);
    await expect(overlay, `${selector} 영역 밖`).toHaveCSS(
      "visibility",
      "hidden",
    );
    expect(await readEscapedOverlays(page)).toEqual([]);

    await setAreaScrollTop(inside);
    await expect(overlay, `${selector} 돌아온 뒤`).toHaveCSS(
      "visibility",
      "visible",
    );
  }
});
