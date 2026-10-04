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
