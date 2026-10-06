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
 * 코드블록 툴바도 같다(Issue #236). 언어 popover가 열려 있으면 숨기지 않는다.
 * 툴바 안 버튼에 포커스가 있어도 숨기지 않는다(Issue #237).
 *
 * 포커스를 가진 요소가 든 오버레이는 어느 오버레이든 숨기지 않고, 포커스가 빠지면
 * 숨긴다(Issue #243). 열린 자식 메뉴가 있으면 부모 툴바도 숨기지 않는다.
 * 숨기면 브라우저가 포커스를 body로 빼 입력의 포커스를 잃는다.
 *
 * 블록 선택 하이라이트도 영역 밖에서 숨는다(Issue #250). 하이라이트는 블록마다
 * 하나라 영역 밖으로 나간 블록의 것만 숨고 영역 안 블록의 것은 보인다.
 *
 * sticky 툴바 띠와 겹친 열 리사이즈 strip은 툴바 입력을 가로채지 않는다(Issue #265).
 * 툴바 띠에 들어온 블록 앵커 오버레이 여섯도 툴바 입력을 가로채지 않는다(Issue #266).
 * 영역 밖으로 나간 블록의 gutter·미디어 툴바는 clamp돼도 숨고 입력을 받지 않는다(Issue #267).
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";
import { blockId } from "./support/static-toolbar-sample.js";
import { dragSelectCells } from "./support/table-selection.js";
import { yieldFrame } from "./support/yield-frame.js";

const OVERLAY_SELECTOR = [
  ".geul-code-block-caption",
  ".geul-media-caption",
  ".geul-media-toolbar",
  ".geul-media-resize-handle",
  '[class*="geul-table-"]',
  ".geul-media-handle-overlay",
  ".geul-callout-icon-trigger",
  ".geul-code-block-toolbar",
  ".geul-block-selection-toolbar__highlight",
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

/** 포인터를 멈춘 채 scrollTop만 바꾼다. hover가 유지돼 오버레이가 DOM에 남는다. */
const setAreaScrollTop = (page: Page, top: number) =>
  page.evaluate((target) => {
    const area = document.querySelector<HTMLElement>('[class*="scrollArea"]');
    if (area === null) throw new Error("scrollArea 없음");
    area.scrollTop = target;
  }, top);

const isOutsideScrollArea = (anchor: Locator) =>
  anchor.evaluate((element) => {
    const area = document
      .querySelector('[class*="scrollArea"]')
      ?.getBoundingClientRect();
    if (area === undefined) throw new Error("scrollArea 없음");
    const rect = element.getBoundingClientRect();
    return rect.bottom < area.top || rect.top > area.bottom;
  });

/**
 * 앵커를 창 뷰포트 안(위에서 100px)으로 스크롤한다(#277). 앵커 점이 창 뷰포트 밖이면
 * fixed 툴바가 숨는다. `scrollIntoViewIfNeeded` 뒤 앵커가 뷰포트 경계에 걸릴 수 있다.
 */
const scrollAnchorIntoWindowViewport = (anchor: Locator) =>
  anchor.evaluate((element) => {
    window.scrollBy(0, element.getBoundingClientRect().top - 100);
  });

/**
 * 코드블록을 영역 밖으로 밀고 툴바 clip 판정이 한 번 돈 것을 기다린다.
 * 툴바가 새 앵커로 옮겨 가야 판정이 돈 것이다. 이전에는 시작 상태(visible)가
 * 그대로라 단언이 판정보다 먼저 통과할 수 있다.
 */
const pushCodeBlockOutOfArea = async (page: Page, codeBlock: Locator) => {
  const toolbar = page.locator(".geul-code-block-toolbar");
  const readToolbarY = async () => (await toolbar.boundingBox())?.y;
  const toolbarYBefore = await readToolbarY();
  await setAreaScrollTop(page, 0);
  await expect
    .poll(readToolbarY, { message: "툴바가 스크롤을 따라 이동" })
    .not.toBe(toolbarYBefore);
  expect(await isOutsideScrollArea(codeBlock), "코드블록이 영역 밖").toBe(true);
};

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

  for (const [anchor, selector] of [
    [editor.locator("img").first(), ".geul-media-handle-overlay"],
    [
      editor.locator("[data-geul-callout]").first(),
      ".geul-callout-icon-trigger",
    ],
    [editor.locator("pre").first(), ".geul-code-block-toolbar"],
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

    await setAreaScrollTop(page, 0);
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

    // 되돌릴 위치를 앵커에서 구한다. 미디어 로드로 레이아웃이 밀리면(스크롤
    // 이벤트 없음) 앞서 기록한 scrollTop은 앵커가 영역 밖인 값이 된다.
    await anchor.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await expect(overlay, `${selector} 돌아온 뒤`).toHaveCSS(
      "visibility",
      "visible",
    );
  }
});

test("언어 popover가 열려 있으면 코드블록이 스크롤 영역 밖에 있어도 툴바를 숨기지 않는다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });
  const codeBlock = editor.locator("pre").first();
  const toolbar = page.locator(".geul-code-block-toolbar");

  await codeBlock.scrollIntoViewIfNeeded();
  // #277: 앵커 점이 창 뷰포트 안이어야 툴바가 보인다.
  await scrollAnchorIntoWindowViewport(codeBlock);
  await codeBlock.hover();
  await expect(toolbar).toHaveCount(1);
  await page.getByRole("button", { name: "Code language" }).click();
  const popover = page.locator(".geul-code-block-language-popover");
  await expect(popover).toHaveCount(1);

  await pushCodeBlockOutOfArea(page, codeBlock);

  // 전제: 스크롤 중에도 popover가 닫히지 않는다.
  await expect(popover, "popover 유지").toHaveCount(1);
  await expect(toolbar, "툴바 유지").toHaveCSS("visibility", "visible");
});

test("툴바 버튼에 포커스가 있으면 코드블록이 스크롤 영역 밖에 있어도 툴바를 숨기지 않고 포커스가 빠지면 숨긴다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });
  const codeBlock = editor.locator("pre").first();
  const toolbar = page.locator(".geul-code-block-toolbar");

  await codeBlock.scrollIntoViewIfNeeded();
  // #277: 앵커 점이 창 뷰포트 안이어야 툴바가 보인다.
  await scrollAnchorIntoWindowViewport(codeBlock);
  await codeBlock.hover();
  await expect(toolbar).toHaveCount(1);
  // 클릭하면 popover가 열려 popover 면제와 구분되지 않는다. 포커스만 둔다.
  const copyButton = toolbar.getByRole("button", { name: "Copy code" });
  await copyButton.focus();
  await expect(copyButton).toBeFocused();

  await pushCodeBlockOutOfArea(page, codeBlock);

  // 포커스가 있는 동안은 숨기지 않는다. 숨기면 포커스가 body로 빠진다.
  await expect(toolbar, "툴바 유지").toHaveCSS("visibility", "visible");
  await expect(copyButton, "포커스 유지").toBeFocused();

  // 포커스가 빠지면 다시 영역 밖으로 판정해 숨는다.
  await copyButton.evaluate((element) => element.blur());
  await expect(toolbar, "포커스 뒤 숨김").toHaveCSS("visibility", "hidden");
});

/**
 * 스크롤 직후 clip 판정이 한 번 돈 것을 기다린다. 스크롤 이벤트가 렌더를
 * 일으키고 그 렌더 직후 판정이 돈다. 이 대기 없이 "보인다"를 단언하면 판정보다
 * 먼저 통과한다. 사전 상태가 이미 visible이기 때문이다.
 */
const settleClip = async (page: Page) => {
  await yieldFrame(page);
  await yieldFrame(page);
  await page.waitForTimeout(150);
};

/** 앵커를 스크롤 영역 밖으로 민다. 위 끝을 먼저 시도하고 안 나가면 아래 끝으로 민다. */
const scrollAnchorOutOfArea = async (page: Page, anchor: Locator) => {
  await setAreaScrollTop(page, 0);
  if (!(await isOutsideScrollArea(anchor))) {
    await setAreaScrollTop(page, 1_000_000);
  }
  expect(await isOutsideScrollArea(anchor), "앵커가 영역 밖").toBe(true);
  await settleClip(page);
};

/** 앵커를 영역 가운데로 되돌린다. */
const scrollAnchorIntoArea = (anchor: Locator) =>
  anchor.evaluate((element) => element.scrollIntoView({ block: "center" }));

/** 포커스 없이 영역 밖에서 숨는 것을 먼저 증명하려는 호출부는 `overlay`만 쓴다. */
type FocusExemptCase = {
  /** 스크롤로 영역 밖으로 보내는 앵커. */
  anchor: Locator;
  /** `visibility`가 걸리는 오버레이 노드. */
  overlay: Locator;
  /** 포커스를 가진 요소. `overlay` 안이어야 한다. */
  focused: Locator;
};

/**
 * 포커스가 든 오버레이는 영역 밖에서도 보이고 포커스를 유지한다. 포커스가 빠지면
 * 숨고, 영역 안으로 돌아오면 다시 보인다. 사전 결함은 숨김과 `activeElement`가
 * BODY로 빠지는 것이다.
 */
const expectFocusKeepsOverlay = async (
  page: Page,
  { anchor, overlay, focused }: FocusExemptCase,
) => {
  await expect(focused, "전제: 포커스").toBeFocused();
  await expect(overlay, "전제: 영역 안").toHaveCSS("visibility", "visible");

  await scrollAnchorOutOfArea(page, anchor);

  await expect(overlay, "포커스 중 유지").toHaveCSS("visibility", "visible");
  await expect(focused, "포커스 유지").toBeFocused();

  await focused.evaluate((element) => (element as HTMLElement).blur());
  await expect(overlay, "포커스 뒤 숨김").toHaveCSS("visibility", "hidden");

  await scrollAnchorIntoArea(anchor);
  await expect(overlay, "돌아온 뒤").toHaveCSS("visibility", "visible");
};

/** 샘플을 불러오고 이미지를 선택해 media 툴바를 연다. */
const openMediaToolbar = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });
  const image = editor.locator("img").first();
  await image.scrollIntoViewIfNeeded();
  await image.click();
  const toolbar = page.locator(".geul-media-toolbar");
  await expect(toolbar).toHaveCount(1);
  return { editor, image, toolbar };
};

test("링크 툴바 입력에 포커스가 있으면 영역 밖에서도 툴바를 숨기지 않고 포커스가 빠지면 숨긴다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const paragraph = editor.locator("p").nth(3);
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.dblclick();
  await page.getByRole("button", { name: "Add link" }).click();
  const input = page.getByRole("textbox", { name: "Link URL" });
  await expect(input).toBeFocused();

  await expectFocusKeepsOverlay(page, {
    anchor: paragraph,
    overlay: page.locator(".geul-link-toolbar"),
    focused: input,
  });
});

test.describe("미디어 툴바", () => {
  test("More 버튼에 포커스가 있으면 영역 밖에서도 툴바를 숨기지 않고 포커스가 빠지면 숨긴다", async ({
    page,
  }) => {
    const { image, toolbar } = await openMediaToolbar(page);
    const more = page.getByRole("button", { name: "More media options" });
    await more.focus();

    await expectFocusKeepsOverlay(page, {
      anchor: image,
      overlay: toolbar,
      focused: more,
    });
  });

  for (const [label, menuItem, inputName] of [
    ["Rename 입력", "Rename", "Image name"],
    ["Caption 입력", "Edit caption", "Image caption"],
  ] as const) {
    test(`${label}에 포커스가 있으면 영역 밖에서도 툴바를 숨기지 않고 포커스가 빠지면 숨긴다`, async ({
      page,
    }) => {
      const { image, toolbar } = await openMediaToolbar(page);
      await page.getByRole("button", { name: "More media options" }).click();
      await page.getByRole("menuitem", { name: menuItem }).click();
      const input = toolbar.getByRole("textbox", { name: inputName });
      await expect(input).toBeFocused();

      await expectFocusKeepsOverlay(page, {
        anchor: image,
        overlay: toolbar,
        focused: input,
      });
    });
  }

  test("Replace 입력에 포커스가 있으면 영역 밖에서도 툴바를 숨기지 않고 포커스가 빠지면 숨긴다", async ({
    page,
  }) => {
    const { image, toolbar } = await openMediaToolbar(page);
    await page.getByRole("button", { name: "More media options" }).click();
    await page.getByRole("menuitem", { name: "Replace file" }).click();
    await toolbar.getByRole("tab", { name: "Embed" }).click();
    const input = toolbar.getByRole("textbox", { name: "Image URL" });
    await input.focus();
    await expect(input).toBeFocused();

    await expectFocusKeepsOverlay(page, {
      anchor: image,
      overlay: toolbar,
      focused: input,
    });
  });

  test("More 메뉴가 열려 있으면 영역 밖에서도 툴바를 숨기지 않고 메뉴를 닫으면 숨긴다", async ({
    page,
  }) => {
    const { image, toolbar } = await openMediaToolbar(page);
    await page.getByRole("button", { name: "More media options" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    await scrollAnchorOutOfArea(page, image);

    await expect(menu, "메뉴 유지").toBeVisible();
    await expect(toolbar, "툴바 유지").toHaveCSS("visibility", "visible");

    // 메뉴를 닫은 뒤 포커스가 툴바 밖이어야 면제가 풀린다.
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await expect(toolbar, "메뉴 닫은 뒤 숨김").toHaveCSS(
      "visibility",
      "hidden",
    );
  });
});

test("미디어 캡션 입력에 포커스가 있으면 영역 밖에서도 캡션을 숨기지 않고 포커스가 빠지면 숨긴다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });
  const image = editor.locator("img").first();
  await image.scrollIntoViewIfNeeded();
  await image.hover();
  const caption = page.locator(".geul-media-caption").first();
  await caption.locator("button").click();
  const input = caption.getByRole("textbox", { name: "Image caption" });
  await expect(input).toBeFocused();
  // blur가 커밋하면 caption이 남아야 숨김을 볼 수 있다. 빈 값이면 오버레이가 사라진다.
  await input.fill("clip 캡션");

  await expectFocusKeepsOverlay(page, {
    anchor: image,
    overlay: caption,
    focused: input,
  });
});

test("표 행 핸들에 포커스가 있으면 영역 밖에서도 핸들을 숨기지 않고 포커스가 빠지면 숨긴다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });
  const table = editor.locator("table").first();
  const cell = table.locator("td").nth(1);
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  const handle = page.locator("[data-geul-table-row-handle]").first();
  await handle.focus();

  await expectFocusKeepsOverlay(page, {
    anchor: table,
    overlay: handle.locator("xpath=.."),
    focused: handle,
  });
});

test("미디어 그립에 포커스가 있으면 영역 밖에서도 그립을 숨기지 않고 포커스가 빠지면 숨긴다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });
  const image = editor.locator("img").first();
  await image.scrollIntoViewIfNeeded();
  await image.hover();
  const overlay = page.locator(".geul-media-handle-overlay");
  await expect(overlay).toHaveCount(1);
  const grip = overlay.locator(".geul-block-gutter__button--add");
  await grip.focus();

  await expectFocusKeepsOverlay(page, {
    anchor: image,
    overlay,
    focused: grip,
  });
});

test("callout 트리거에 포커스가 있으면 영역 밖에서도 트리거를 숨기지 않고 포커스가 빠지면 숨긴다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });
  const callout = editor.locator("[data-geul-callout]").first();
  await callout.scrollIntoViewIfNeeded();
  await callout.hover();
  const trigger = page.locator(".geul-callout-icon-trigger");
  await expect(trigger).toHaveCount(1);
  await trigger.focus();

  await expectFocusKeepsOverlay(page, {
    anchor: callout,
    overlay: trigger,
    focused: trigger,
  });
});

test("서식 툴바 색상 메뉴가 열려 있으면 영역 밖에서도 툴바를 숨기지 않고 메뉴를 닫으면 숨긴다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const paragraph = editor.locator("p").nth(3);
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.dblclick();
  const toolbar = page.locator(".geul-formatting-toolbar");
  await expect(toolbar).toHaveCount(1);
  await toolbar.getByRole("button", { name: "Text color" }).click();
  const menu = page.getByRole("menu", { name: "Text color" });
  await expect(menu).toBeVisible();

  await scrollAnchorOutOfArea(page, paragraph);

  await expect(menu, "메뉴 유지").toBeVisible();
  await expect(toolbar, "툴바 유지").toHaveCSS("visibility", "visible");

  // 메뉴를 닫은 뒤 포커스가 툴바 밖이어야 면제가 풀린다.
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await expect(toolbar, "메뉴 닫은 뒤 숨김").toHaveCSS("visibility", "hidden");
});

test("표 셀 서식 메뉴가 열려 있으면 영역 밖에서도 표 선택 툴바를 숨기지 않고 메뉴를 닫으면 숨긴다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });
  const table = editor.locator("table").first();
  const cells = table.locator("td");
  await cells.first().scrollIntoViewIfNeeded();
  // #277: 앵커 점이 창 뷰포트 안이어야 툴바가 보인다.
  await scrollAnchorIntoWindowViewport(cells.first());
  await cells.first().click();
  await dragSelectCells(page, cells.nth(0), cells.nth(1));
  const toolbar = page.locator(".geul-table-selection-toolbar");
  await expect(toolbar).toHaveCount(1);
  await toolbar.getByRole("button", { name: "Cell formatting" }).click();
  const menu = page.getByRole("menu", { name: "Cell formatting" });
  await expect(menu).toBeVisible();

  await scrollAnchorOutOfArea(page, table);

  await expect(menu, "메뉴 유지").toBeVisible();
  await expect(toolbar, "툴바 유지").toHaveCSS("visibility", "visible");

  // 메뉴를 닫은 뒤 포커스가 툴바 밖이어야 면제가 풀린다.
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await expect(toolbar, "메뉴 닫은 뒤 숨김").toHaveCSS("visibility", "hidden");
});

test("블록 범위를 선택한 채 스크롤하면 영역 밖으로 나간 블록의 하이라이트만 숨고 돌아오면 다시 보인다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });
  const first = blockId(editor, 2);
  const last = blockId(editor, 6);
  await setAreaScrollTop(page, 0);

  // 거터 핸들을 비인접 형제로 드래그하면 블록 범위 선택이 된다(block-selection.spec.ts).
  await first.hover();
  const handle = page.getByRole("button", { name: /^Drag to reorder/ });
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  const lastBox = await last.boundingBox();
  if (handleBox === null || lastBox === null) {
    throw new Error("Bounding box was not available");
  }
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    lastBox.x + lastBox.width / 2,
    lastBox.y + lastBox.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toBeVisible();

  const highlight = (number: number) =>
    page.locator(
      `.geul-block-selection-toolbar__highlight[data-geul-highlighted-block-id$="sample-block-${number}"]`,
    );
  await expect(highlight(2), "전제: 하이라이트").toHaveCount(1);
  await expect(highlight(6), "전제: 하이라이트").toHaveCount(1);
  await expect(highlight(2), "전제: 영역 안").toHaveCSS(
    "visibility",
    "visible",
  );
  expect(await readEscapedOverlays(page)).toEqual([]);

  // 첫 블록을 영역 위로 완전히 밀어 낸다. 마지막 블록은 영역 안에 남는다.
  await page.evaluate((id) => {
    const area = document.querySelector<HTMLElement>('[class*="scrollArea"]');
    const block = document.querySelector(`[data-geul-block-id$="${id}"]`);
    if (area === null || block === null)
      throw new Error("scrollArea 또는 블록 없음");
    area.scrollTop +=
      block.getBoundingClientRect().bottom -
      area.getBoundingClientRect().top +
      8;
  }, "sample-block-2");
  expect(await isOutsideScrollArea(first), "첫 블록이 영역 밖").toBe(true);
  expect(await isOutsideScrollArea(last), "마지막 블록은 영역 안").toBe(false);
  await settleClip(page);

  await expect(highlight(2), "영역 밖 블록").toHaveCSS("visibility", "hidden");
  await expect(highlight(6), "영역 안 블록").toHaveCSS("visibility", "visible");
  expect(await readEscapedOverlays(page)).toEqual([]);

  await scrollAnchorIntoArea(first);
  await expect(highlight(2), "돌아온 뒤").toHaveCSS("visibility", "visible");
});

/**
 * 창을 스크롤해 스크롤 영역 상단을 뷰포트 상단에 맞춘다. 영역이 뷰포트 밖이면
 * 마우스로 영역 안 핸들이나 툴바를 누를 수 없다.
 */
const alignAreaToViewportTop = (page: Page) =>
  page.evaluate(() => {
    const area = document.querySelector('[class*="scrollArea"]');
    if (area === null) throw new Error("scrollArea 없음");
    window.scrollBy(0, area.getBoundingClientRect().top);
  });

/**
 * 표 상단만 스크롤 영역 위로 20px 밀어 낸다. 마지막 행 셀에 커서를 둬 hover 없이도
 * 표 핸들이 남는다. 창을 스크롤해 영역 상단을 뷰포트 상단에 맞춘다.
 */
const pushTableTopAboveArea = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });
  const table = editor.locator("table").first();
  const lastRow = table.locator("tr").last();
  const cell = lastRow.locator("td").first();
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await alignAreaToViewportTop(page);

  // 표 상단을 영역 위로 20px 민다. 아래 행들은 영역 안에 남는다.
  const target = await table.evaluate((element) => {
    const area = document.querySelector<HTMLElement>('[class*="scrollArea"]');
    if (area === null) throw new Error("scrollArea 없음");
    return (
      area.scrollTop +
      element.getBoundingClientRect().top -
      area.getBoundingClientRect().top +
      20
    );
  });
  await setAreaScrollTop(page, target);
  const layout = await lastRow.evaluate((row) => {
    const area = document
      .querySelector('[class*="scrollArea"]')
      ?.getBoundingClientRect();
    const tableRect = row.closest("table")?.getBoundingClientRect();
    if (area === undefined || tableRect === undefined) {
      throw new Error("scrollArea 또는 표 없음");
    }
    const rowRect = row.getBoundingClientRect();
    return {
      areaInViewport: area.top >= 0 && area.bottom <= window.innerHeight,
      tableTopAbove: tableRect.top < area.top,
      lastRowInside: rowRect.top >= area.top && rowRect.bottom <= area.bottom,
    };
  });
  expect(layout, "전제: 표 상단만 영역 밖").toEqual({
    areaInViewport: true,
    tableTopAbove: true,
    lastRowInside: true,
  });
  await settleClip(page);
  return { table, lastRow };
};

test("표 상단이 스크롤 영역 위로 나가도 보이는 행 옆 열 리사이즈 strip이 보이고 드래그로 열 폭을 바꾼다(#260)", async ({
  page,
}) => {
  const { table, lastRow } = await pushTableTopAboveArea(page);

  // 병합 셀 없는 표는 열마다 strip 하나다. 첫 열 경계 strip을 본다.
  const strip = page.locator("[data-geul-table-resize-handle]").first();
  await expect(strip, "영역에 걸친 strip").toHaveCSS("visibility", "visible");
  const stripInsideArea = await strip.evaluate((element) => {
    const area = document
      .querySelector('[class*="scrollArea"]')
      ?.getBoundingClientRect();
    if (area === undefined) throw new Error("scrollArea 없음");
    const rect = element.getBoundingClientRect();
    return rect.top >= area.top && rect.bottom <= area.bottom;
  });
  expect(stripInsideArea, "strip 박스가 영역 안").toBe(true);
  expect(await readEscapedOverlays(page)).toEqual([]);

  // 보이는 마지막 행 높이에서 strip을 끌어 첫 열 폭을 바꾼다.
  const stripBox = await strip.boundingBox();
  const rowBox = await lastRow.boundingBox();
  if (stripBox === null || rowBox === null) {
    throw new Error("Bounding box was not available");
  }
  const startX = stripBox.x + stripBox.width / 2;
  const y = rowBox.y + rowBox.height / 2;
  const firstColumn = table.locator("colgroup col").first();
  await expect(firstColumn, "전제: 시작 폭").toHaveAttribute(
    "style",
    /width:\s*160px/,
  );
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + 40, y, { steps: 5 });
  await page.mouse.up();

  await expect(firstColumn, "드래그 뒤 폭").toHaveAttribute(
    "style",
    /width:\s*200px/,
  );
});

/** 예제의 sticky 상단 툴바(`StaticToolbar` 루트). */
const STATIC_TOOLBAR_SELECTOR = '[role="toolbar"][aria-label="Toolbar"]';

type Point = { x: number; y: number };

/** 오버레이 박스와 툴바 박스가 겹친 사각형의 중앙 점. 겹치지 않으면 `null`이다. */
const readToolbarOverlapPoint = (overlay: Locator) =>
  overlay.evaluate((element, selector): Point | null => {
    const toolbar = document.querySelector(selector);
    if (toolbar === null) throw new Error("툴바 없음");
    const a = element.getBoundingClientRect();
    const b = toolbar.getBoundingClientRect();
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    if (bottom <= top || right <= left) return null;
    return { x: (left + right) / 2, y: (top + bottom) / 2 };
  }, STATIC_TOOLBAR_SELECTOR);

/**
 * 툴바 띠에 들어온 오버레이 위 점에서 툴바가 입력을 받는지 단언한다.
 * 전제는 오버레이가 보이고 툴바와 겹치는 것이다. 겹친 사각형 중앙 점에서
 * hit-test 맨 위와 실제 click 대상이 모두 툴바 안이어야 한다. 툴바 밖이면 받은
 * 요소의 `tag.class`가 실패 메시지에 남는다. class가 없는 요소(svg 안 path 등)는
 * class를 가진 가장 가까운 조상으로 적는다. 점은 툴바 레이아웃에 따라 버튼 위일
 * 수도 버튼 사이 틈일 수도 있어 버튼으로 한정하지 않는다. 이어지는 드래그 단언이
 * 쓰도록 점을 돌려준다.
 */
const expectToolbarTakesInputOverOverlay = async (
  page: Page,
  overlay: Locator,
) => {
  await expect(overlay, "전제: 오버레이 보임").toHaveCSS(
    "visibility",
    "visible",
  );
  // fixed 오버레이는 스크롤 뒤 렌더로 재배치된다. 겹침이 수렴할 때까지 기다린다.
  await expect
    .poll(() => readToolbarOverlapPoint(overlay), {
      message: "전제: 오버레이가 툴바 띠와 겹친다",
    })
    .not.toBeNull();
  const point = await readToolbarOverlapPoint(overlay);
  if (point === null)
    throw new Error("전제: 오버레이가 툴바 띠와 겹치지 않는다");

  const topElement = await page.evaluate(
    ({ x, y, selector }) => {
      const top = document.elementsFromPoint(x, y)[0];
      if (top === undefined) return "none";
      if (top.closest(selector) !== null) return "toolbar";
      // svg의 className은 문자열이 아니다. class 속성을 읽는다.
      const owner = top.closest("[class]") ?? top;
      return `${owner.tagName}.${owner.getAttribute("class") ?? ""}`;
    },
    { ...point, selector: STATIC_TOOLBAR_SELECTOR },
  );
  expect(topElement, "hit-test 맨 위가 툴바 자손").toBe("toolbar");

  await page.evaluate((selector) => {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target as Element;
        const owner = target.closest("[class]") ?? target;
        document.body.dataset.clickTarget =
          target.closest(selector) === null
            ? `${owner.tagName}.${owner.getAttribute("class") ?? ""}`
            : "toolbar";
      },
      { capture: true, once: true },
    );
  }, STATIC_TOOLBAR_SELECTOR);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator("body"), "click target이 툴바 안").toHaveAttribute(
    "data-click-target",
    "toolbar",
  );
  return point;
};

test("sticky 툴바 띠와 겹친 열 리사이즈 strip은 툴바 클릭과 드래그를 가로채지 않는다(#265)", async ({
  page,
}) => {
  const { table } = await pushTableTopAboveArea(page);
  const strip = page.locator("[data-geul-table-resize-handle]").first();

  // strip은 영역 상단까지 잘려 툴바 띠와 겹친다. 겹친 점은 첫 열 strip x, 툴바 중앙 y다.
  const point = await expectToolbarTakesInputOverOverlay(page, strip);

  // 툴바 띠 안에서 strip x를 40px 끌어도 첫 열 폭이 그대로다.
  const firstColumn = table.locator("colgroup col").first();
  await expect(firstColumn, "전제: 시작 폭").toHaveAttribute(
    "style",
    /width:\s*160px/,
  );
  await expect(strip, "전제: 드래그 전 strip 보임").toHaveCSS(
    "visibility",
    "visible",
  );
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 40, point.y, { steps: 5 });
  await page.mouse.up();
  await settleClip(page);
  await expect(firstColumn, "툴바 띠 드래그 뒤 폭 유지").toHaveAttribute(
    "style",
    /width:\s*160px/,
  );
});

/** 앵커의 어느 y를 툴바 상단 기준 위치에 맞출지. */
type BandPlacement = {
  /** `top`은 앵커 상단, `center`는 앵커 세로 중앙을 맞춘다. */
  edge: "top" | "center";
  /** 툴바 상단에서 아래로 떨어진 거리(px). */
  offset: number;
};

/**
 * 안쪽 스크롤로 앵커의 `edge`를 툴바 상단 아래 `offset`px에 둔다. `scrollTop`
 * 대입만 해서 포인터는 움직이지 않는다. 스크롤 한계로 원하는 위치에 못 가면
 * 전제 단언이 실패한다.
 */
const placeAnchorInBand = async (
  page: Page,
  anchor: Locator,
  { edge, offset }: BandPlacement,
) => {
  const placed = await anchor.evaluate(
    (element, { edge, offset, selector }) => {
      const area = document.querySelector<HTMLElement>('[class*="scrollArea"]');
      const toolbar = document.querySelector(selector);
      if (area === null || toolbar === null) {
        throw new Error("scrollArea 또는 툴바 없음");
      }
      const readY = () => {
        const rect = element.getBoundingClientRect();
        return edge === "top" ? rect.top : (rect.top + rect.bottom) / 2;
      };
      const target = toolbar.getBoundingClientRect().top + offset;
      area.scrollTop += readY() - target;
      return Math.abs(readY() - target) < 1;
    },
    { edge, offset, selector: STATIC_TOOLBAR_SELECTOR },
  );
  expect(placed, `전제: 앵커 ${edge}가 툴바 상단 +${offset}px`).toBe(true);
  await settleClip(page);
};

/**
 * hover 오버레이를 툴바 띠로 올린다. 먼저 앵커를 띠 바로 아래에 두고 포인터를
 * 앵커 위에 멈춘다. 그다음 `scrollTop` 대입으로만 앵커 상단을 띠에 넣는다.
 * 포인터 y는 스크롤 뒤 띠 아래로 보이는 앵커 부분의 가운데다. 그래서 스크롤
 * 전후 모두 앵커 위에 있고 hover가 유지된다.
 */
const hoverAnchorIntoBand = async (
  page: Page,
  anchor: Locator,
  overlay: Locator,
  offset: number,
) => {
  await alignAreaToViewportTop(page);
  const band = await page
    .locator(STATIC_TOOLBAR_SELECTOR)
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
  await placeAnchorInBand(page, anchor, {
    edge: "top",
    offset: band.bottom - band.top + 2,
  });
  const before = await anchor.boundingBox();
  if (before === null) throw new Error("Bounding box was not available");
  const pointer = {
    x: before.x + Math.min(30, before.width / 2),
    y: (band.bottom + band.top + offset + before.height) / 2,
  };
  expect(
    pointer.y > before.y && pointer.y < before.y + before.height,
    "전제: 스크롤 전 포인터가 앵커 위",
  ).toBe(true);
  await page.mouse.move(pointer.x + 2, pointer.y);
  await page.mouse.move(pointer.x, pointer.y);
  await expect(overlay, "전제: hover 오버레이 존재").toHaveCount(1);

  await placeAnchorInBand(page, anchor, { edge: "top", offset });
  const after = await anchor.boundingBox();
  if (after === null) throw new Error("Bounding box was not available");
  expect(
    pointer.y > Math.max(after.y, band.bottom) &&
      pointer.y < after.y + after.height,
    "전제: 스크롤 뒤 포인터가 띠 아래 앵커 위",
  ).toBe(true);
};

/** 샘플을 불러오고 영역 상단을 뷰포트 상단에 맞춘다. */
const openSampleAligned = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editor = page.getByRole("textbox", { name: "Editor" });
  await alignAreaToViewportTop(page);
  return editor;
};

test("sticky 툴바 띠에 들어온 hover 미디어 그립은 툴바 클릭을 가로채지 않는다(#266)", async ({
  page,
}) => {
  const editor = await openSampleAligned(page);
  const grip = page.locator(".geul-media-handle-overlay");
  // 그립 상단은 이미지 상단과 같다. 그립(24px)이 툴바 상단 아래 4px부터 띠에 걸친다.
  await hoverAnchorIntoBand(page, editor.locator("img").first(), grip, 4);

  await expectToolbarTakesInputOverOverlay(page, grip);
});

test("sticky 툴바 띠에 들어온 hover callout 트리거는 툴바 클릭을 가로채지 않는다(#266)", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editor = page.getByRole("textbox", { name: "Editor" });
  await editor.locator('[data-geul-block-id$="block-3"]').click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/callout");
  await page.getByRole("option", { name: "Callout" }).click();
  const trigger = page.locator(".geul-callout-icon-trigger");
  // 트리거 상단은 callout 상단과 같다. 트리거(24px)가 툴바 상단 아래 10px부터 띠에 걸친다.
  await hoverAnchorIntoBand(
    page,
    editor.locator("[data-geul-callout]").first(),
    trigger,
    10,
  );

  await expectToolbarTakesInputOverOverlay(page, trigger);
});

test("sticky 툴바 띠에 들어온 미디어 리사이즈 핸들은 툴바 클릭을 가로채지 않는다(#266)", async ({
  page,
}) => {
  const { image } = await openMediaToolbar(page);
  await alignAreaToViewportTop(page);
  // 핸들은 이미지 세로 중앙에 있다. 이미지 중앙을 툴바 세로 중앙 근처에 둔다.
  await placeAnchorInBand(page, image, { edge: "center", offset: 18 });

  await expectToolbarTakesInputOverOverlay(
    page,
    page.locator(".geul-media-resize-handle").first(),
  );
});

test("sticky 툴바 띠에 들어온 코드블록 툴바는 툴바 클릭을 가로채지 않는다(#266)", async ({
  page,
}) => {
  const editor = await openSampleAligned(page);
  const toolbar = page.locator(".geul-code-block-toolbar");
  // 코드블록 툴바 상단은 코드블록 상단과 같다. 툴바 상단 아래 16px부터 띠에 걸친다.
  await hoverAnchorIntoBand(page, editor.locator("pre").first(), toolbar, 16);

  await expectToolbarTakesInputOverOverlay(page, toolbar);
});

test("sticky 툴바 띠에 들어온 미디어 툴바는 툴바 클릭을 가로채지 않는다(#266)", async ({
  page,
}) => {
  const { image, toolbar } = await openMediaToolbar(page);
  await alignAreaToViewportTop(page);
  // 미디어 툴바 상단은 이미지 상단과 같다. 툴바 상단 아래 20px부터 띠에 걸친다.
  await placeAnchorInBand(page, image, { edge: "top", offset: 20 });

  await expectToolbarTakesInputOverOverlay(page, toolbar);
});

test("sticky 툴바 띠에 들어온 블록 gutter는 툴바 클릭을 가로채지 않는다(#266)", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const gutter = page.locator(".geul-block-gutter");
  // 깊이 0 문단. gutter 상단은 블록 상단과 같다. 툴바 상단 아래 24px부터 띠에 걸친다.
  const block = editor.locator(
    '[data-geul-block-id="showcase-static-toolbar-block-10"]',
  );
  await expect(block, "전제: 초기 문서").toBeVisible();
  await hoverAnchorIntoBand(page, block, gutter, 24);

  await expectToolbarTakesInputOverOverlay(page, gutter);
});

/**
 * 안쪽 스크롤만 옮겨 앵커 상단을 뷰포트 y `top`에 둔다. 포인터는 움직이지 않는다.
 * 앵커는 영역 밖이어야 한다.
 */
const placeAnchorTopAt = async (page: Page, anchor: Locator, top: number) => {
  await anchor.evaluate((element, target) => {
    const area = document.querySelector<HTMLElement>('[class*="scrollArea"]');
    if (area === null) throw new Error("scrollArea 없음");
    area.scrollTop += element.getBoundingClientRect().top - target;
  }, top);
  expect(await isOutsideScrollArea(anchor), "전제: 앵커가 영역 밖").toBe(true);
  await settleClip(page);
};

/**
 * 문단 블록에 포인터를 멈춰 gutter를 띄운다. 포인터를 고정한 채 `scrollTop`
 * 대입으로 블록 상단을 뷰포트 y `top`에 둔다. 블록은 영역 위 끝 밖이다.
 * 포인터가 움직이지 않아 hover가 유지된다.
 */
const hoverBlockThenPushAbove = async (
  page: Page,
  block: Locator,
  top: number,
) => {
  const box = await block.boundingBox();
  if (box === null) throw new Error("Bounding box was not available");
  await page.mouse.move(box.x + 60, box.y + box.height / 2);
  const gutter = page.locator(".geul-block-gutter");
  await expect(gutter, "전제: hover gutter").toHaveCSS("visibility", "visible");
  await placeAnchorTopAt(page, block, top);
  await expect(gutter, "전제: 스크롤 뒤에도 hover 유지").toHaveCount(1);
  return gutter;
};

/**
 * 노드 rect에서 sticky 툴바에 가리지 않은 부분의 중앙 점. 툴바가 노드와 가로로
 * 겹치고 노드 위쪽을 덮으면 툴바 하단 아래만 본다. 남는 부분이 없으면 `null`이다.
 */
const readUncoveredCenter = (node: Locator) =>
  node.evaluate((element, selector): Point | null => {
    const toolbar = document.querySelector(selector);
    if (toolbar === null) throw new Error("툴바 없음");
    const rect = element.getBoundingClientRect();
    const bar = toolbar.getBoundingClientRect();
    const covers =
      bar.left < rect.right && rect.left < bar.right && bar.top <= rect.top;
    const top = covers ? Math.max(rect.top, bar.bottom) : rect.top;
    if (rect.bottom <= top) return null;
    return { x: (rect.left + rect.right) / 2, y: (top + rect.bottom) / 2 };
  }, STATIC_TOOLBAR_SELECTOR);

/**
 * 숨은 오버레이 버튼 자리를 마우스로 누른다. `visibility: hidden`이어도 박스는
 * 남는다. 그 박스 중앙(sticky 툴바 띠에 가린 부분 제외)을 누른다. 수정 전에는
 * 이 점에서 버튼이 click을 받아 메뉴를 연다.
 */
const clickWhereHidden = async (page: Page, button: Locator) => {
  const point = await readUncoveredCenter(button);
  if (point === null) throw new Error("전제: 버튼 일부가 툴바에 가리지 않는다");
  await page.mouse.click(point.x, point.y);
  await settleClip(page);
};

test("영역 위 끝 밖으로 나간 블록의 gutter는 숨고 그 자리 클릭이 블록 메뉴를 열지 않는다(#267)", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const block = editor.locator(
    '[data-geul-block-id="showcase-static-toolbar-block-3"]',
  );
  await expect(block, "전제: 초기 문서").toBeVisible();
  // 창 스크롤 0이면 영역 상단은 페이지 헤더 아래다. 블록을 영역 위 헤더 높이로 민다.
  const areaTop = await page
    .locator('[class*="scrollArea"]')
    .evaluate((element) => element.getBoundingClientRect().top);
  expect(areaTop, "전제: 영역이 헤더 아래에서 시작").toBeGreaterThan(120);
  const gutter = await hoverBlockThenPushAbove(page, block, areaTop - 110);

  await expect(gutter, "영역 밖 gutter").toHaveCSS("visibility", "hidden");

  await clickWhereHidden(
    page,
    gutter.locator(".geul-block-gutter__button--drag"),
  );
  await expect(page.getByRole("menu", { name: "Block menu" })).toHaveCount(0);
});

test("영역 상단이 뷰포트 상단이면 clamp된 gutter도 블록이 영역 밖일 때 숨고 그 자리 클릭이 블록 메뉴를 열지 않는다(#267)", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const block = editor.locator(
    '[data-geul-block-id="showcase-static-toolbar-block-6"]',
  );
  await expect(block, "전제: 초기 문서").toBeVisible();
  await alignAreaToViewportTop(page);
  // 블록을 뷰포트 위로 300px 민다. gutter는 뷰포트 상단 + 8px에 clamp된다.
  const gutter = await hoverBlockThenPushAbove(page, block, -300);
  const gutterTop = await gutter.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  expect(gutterTop, "전제: gutter 박스가 clamp로 영역 안").toBeGreaterThan(0);

  await expect(gutter, "영역 밖 블록의 gutter").toHaveCSS(
    "visibility",
    "hidden",
  );

  await clickWhereHidden(
    page,
    gutter.locator(".geul-block-gutter__button--drag"),
  );
  await expect(page.getByRole("menu", { name: "Block menu" })).toHaveCount(0);
});

test("영역 상단이 뷰포트 상단이면 clamp된 미디어 툴바도 이미지가 영역 밖일 때 숨고 그 자리 클릭이 more 메뉴를 열지 않는다(#267)", async ({
  page,
}) => {
  const { image, toolbar } = await openMediaToolbar(page);
  // 샘플은 끝까지 스크롤해도 이미지 하단이 영역 안에 16px 남는다. 문서 끝에 빈
  // 문단을 더해 스크롤 여유를 만든 뒤 이미지를 다시 선택한다. 스크롤 직후 바로
  // 누르면 첫 클릭이 선택을 못 바꿀 때가 있어 한 번 기다린다.
  await page.keyboard.press("Control+End");
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Enter");
  }
  await image.scrollIntoViewIfNeeded();
  await settleClip(page);
  await image.click();
  await expect(toolbar, "전제: 다시 선택한 이미지의 툴바").toHaveCount(1);
  await alignAreaToViewportTop(page);
  // 이미지 하단을 영역 상단 30px 위에 둔다. 툴바는 뷰포트 상단 + 8px에 clamp된다.
  const imageHeight = await image.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  await placeAnchorTopAt(page, image, -30 - imageHeight);
  const toolbarTop = await toolbar.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  expect(toolbarTop, "전제: 툴바 박스가 clamp로 영역 안").toBeGreaterThan(0);

  await expect(toolbar, "영역 밖 이미지의 툴바").toHaveCSS(
    "visibility",
    "hidden",
  );

  await clickWhereHidden(
    page,
    toolbar.getByRole("button", {
      name: "More media options",
      includeHidden: true,
    }),
  );
  await expect(page.locator(".geul-media-toolbar__more-menu")).toHaveCount(0);
});
