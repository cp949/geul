/**
 * 창 스크롤로 앵커가 레이아웃 뷰포트 밖에 나가면 `position: fixed` 오버레이를
 * 숨기고 입력을 막는다(Issue #277, QA-092 후속).
 *
 * 결함: fixed 오버레이는 뷰포트 가장자리로 clamp된다. 앵커 블록이 창 스크롤로
 * 뷰포트 밖에 나가도 오버레이는 가장자리에 남아 계속 클릭을 받았다. 안쪽 스크롤
 * 컨테이너가 없는 페이지(스크롤 영역 조상이 없는 예제)에서는 clip 판정이 영역을
 * 하나도 갖지 못해 숨기는 경로가 없었다. jsdom은 레이아웃이 없어 이 결함을
 * 재현하지 못한다.
 *
 * 판정은 앵커 점만 뷰포트로 본다. 박스는 보지 않는다.
 *
 * 판정 기준은 두 가지다.
 * - `visibility: hidden`: 계산된 스타일로 읽는다. 숨은 요소는 접근성 트리에서
 *   빠지므로 role locator를 쓰지 않는다.
 * - 입력 차단: 숨긴 오버레이가 있던 자리의 점이 오버레이 안 요소를 가리키지
 *   않고, 그 점을 실제로 클릭해도 버튼 동작이 일어나지 않는다.
 *
 * 포커스를 에디터에 둔 채 스크롤한다. 오버레이 안에 포커스가 있으면 숨기지 않는
 * 면제(Issue #243)가 있어 그 경로는 이 파일의 대상이 아니다.
 *
 * absolute 오버레이(미디어 리사이즈 핸들)는 문서와 함께 스크롤돼 판정 대상이
 * 아니다. 같은 시나리오에서 `visibility`를 건드리지 않는 것을 고정한다.
 *
 * 숨김이 판정보다 먼저 통과하지 않게, 각 시나리오는 보임 상태에서 시작해 앵커가
 * 뷰포트 밖에 있는 것을 먼저 확인한다(G-TST-001).
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import { openShowcasePage, uploadImageAtCaret } from "./support/showcase.js";
import { yieldFrame } from "./support/yield-frame.js";

test.use({ viewport: { width: 1280, height: 720 } });

/** 페이지 높이를 뷰포트의 두 배 넘게 만드는 줄 수. */
const LINE_COUNT = 60;

type Point = { x: number; y: number };

/** 편집기를 클릭해 줄을 채운다. 캐럿은 마지막 줄 뒤에 있다. */
const typeLines = async (page: Page, editor: Locator) => {
  await editor.click();
  const lines = Array.from({ length: LINE_COUNT }, (_, i) => `줄 ${i + 1}`);
  await page.keyboard.type(lines.join("\n"));
};

/** 첫 줄 전체를 선택한다. 선택 변경 반영을 한 프레임 기다린다. */
const selectFirstLine = async (page: Page) => {
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Shift+End");
  await yieldFrame(page);
};

const scrollWindowTo = (page: Page, top: number) =>
  page.evaluate((target) => window.scrollTo(0, target), top);

const scrollWindowBy = (page: Page, delta: number) =>
  page.evaluate((amount) => window.scrollBy(0, amount), delta);

/** 요소의 뷰포트 기준 가운데 점. 숨은 요소도 레이아웃 박스가 남는다. */
const centerOf = (target: Locator): Promise<Point> =>
  target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

/** 요소의 뷰포트 기준 아래쪽 끝이 뷰포트 위쪽 밖인지. */
const isAboveViewport = (target: Locator) =>
  target.evaluate((element) => element.getBoundingClientRect().bottom < 0);

/** 요소의 뷰포트 기준 위쪽 끝이 뷰포트 아래쪽 밖인지. */
const isBelowViewport = (target: Locator) =>
  target.evaluate(
    (element) =>
      element.getBoundingClientRect().top >
      (element.ownerDocument.defaultView?.innerHeight ?? 0),
  );

/** `point`를 가리키는 최상위 요소가 `overlaySelector` 안에 있는지. */
const isPointInsideOverlay = (
  page: Page,
  point: Point,
  overlaySelector: string,
) =>
  page.evaluate(
    ({ x, y, selector }) =>
      document.elementFromPoint(x, y)?.closest(selector) != null,
    { ...point, selector: overlaySelector },
  );

const expectHidden = (overlay: Locator, message: string) =>
  expect(overlay, message).toHaveCSS("visibility", "hidden");

const expectVisible = (overlay: Locator, message: string) =>
  expect(overlay, message).toHaveCSS("visibility", "visible");

test("서식 툴바는 선택이 창 스크롤로 뷰포트 밖에 나가면 숨고 그 자리의 클릭을 받지 않는다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/formatting-toolbar");
  const editor = page.getByRole("textbox", { name: "Editor" });
  await typeLines(page, editor);
  await selectFirstLine(page);

  const toolbarSelector = ".geul-formatting-toolbar";
  const toolbar = page.locator(toolbarSelector);
  await expectVisible(toolbar, "선택 직후 보임");
  const bold = toolbar.locator('[aria-label="Bold"]');
  const firstLine = editor.locator("p").first();

  await scrollWindowTo(page, 1800);
  expect(await isAboveViewport(firstLine), "선택한 첫 줄이 뷰포트 위").toBe(
    true,
  );
  await expectHidden(toolbar, "창 스크롤 뒤");

  // 되돌리면 다시 보인다.
  await scrollWindowTo(page, 0);
  await expectVisible(toolbar, "스크롤 복귀");

  // 다시 밀어낸 뒤, 툴바가 있던 자리를 클릭한다.
  await scrollWindowTo(page, 1800);
  await expectHidden(toolbar, "다시 창 스크롤");
  const boldPoint = await centerOf(bold);
  expect(
    await isPointInsideOverlay(page, boldPoint, toolbarSelector),
    "툴바 자리의 점이 툴바를 가리키지 않는다",
  ).toBe(false);
  await page.mouse.click(boldPoint.x, boldPoint.y);
  await expect(editor.locator("strong")).toHaveCount(0);
});

test("링크 툴바는 선택이 창 스크롤로 뷰포트 밖에 나가면 숨고 그 자리의 클릭을 받지 않는다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");
  const editor = page.getByRole("textbox", { name: "Editor" });
  await typeLines(page, editor);
  await selectFirstLine(page);

  const toolbarSelector = ".geul-link-toolbar";
  const toolbar = page.locator(toolbarSelector);
  await expectVisible(toolbar, "선택 직후 보임");
  const addLink = toolbar.locator('[aria-label="Add link"]');
  const firstLine = editor.locator("p").first();

  await scrollWindowTo(page, 1800);
  expect(await isAboveViewport(firstLine), "선택한 첫 줄이 뷰포트 위").toBe(
    true,
  );
  await expectHidden(toolbar, "창 스크롤 뒤");

  await scrollWindowTo(page, 0);
  await expectVisible(toolbar, "스크롤 복귀");

  await scrollWindowTo(page, 1800);
  await expectHidden(toolbar, "다시 창 스크롤");
  const addLinkPoint = await centerOf(addLink);
  expect(
    await isPointInsideOverlay(page, addLinkPoint, toolbarSelector),
    "툴바 자리의 점이 툴바를 가리키지 않는다",
  ).toBe(false);
  await page.mouse.click(addLinkPoint.x, addLinkPoint.y);
  await expect(page.locator(".geul-link-toolbar__input")).toHaveCount(0);
});

test("링크 툴바는 링크 안 collapsed 캐럿이 창 스크롤로 뷰포트 밖에 나가면 숨고 되돌리면 다시 보인다 (#282)", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");
  const editor = page.getByRole("textbox", { name: "Editor" });
  await typeLines(page, editor);
  // 첫 줄에 링크를 만든 뒤 링크 안에 캐럿을 둔다. 앵커는 실제 Range rect다.
  await selectFirstLine(page);
  await page.locator('.geul-link-toolbar [aria-label="Add link"]').click();
  await page.locator(".geul-link-toolbar__input").fill("/opened");
  await page.locator('.geul-link-toolbar [aria-label="Save link"]').click();
  const link = editor.locator("a").first();
  await expect(link).toHaveAttribute("href", "/opened");
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("ArrowRight");
  await yieldFrame(page);

  const toolbar = page.locator(".geul-link-toolbar");
  await expectVisible(toolbar, "링크 안 캐럿 직후 보임");
  await expect(toolbar.locator('[aria-label="Open link"]')).toHaveAttribute(
    "href",
    "/opened",
  );

  await scrollWindowTo(page, 1800);
  expect(await isAboveViewport(link), "링크가 뷰포트 위").toBe(true);
  await expectHidden(toolbar, "창 스크롤 뒤");

  await scrollWindowTo(page, 0);
  await expectVisible(toolbar, "스크롤 복귀");
});

/**
 * 첫 줄 위에 이미지를 올리고 이미지 블록을 선택한다. 페이지가 길어 창 스크롤이
 * 이미지를 뷰포트 밖으로 밀 수 있다. 이미지 블록 locator를 돌려준다.
 */
const selectImageAtTop = async (page: Page, editor: Locator) => {
  await typeLines(page, editor);
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await uploadImageAtCaret(page);
  const image = editor.locator("img").first();
  await expect(image).toBeVisible();
  await image.click();
  await yieldFrame(page);
  return image;
};

test("미디어 툴바는 이미지가 창 스크롤로 뷰포트 밖에 나가면 숨고 그 자리의 클릭을 받지 않는다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const image = await selectImageAtTop(page, editor);

  const toolbarSelector = ".geul-media-toolbar";
  const toolbar = page.locator(toolbarSelector);
  await expectVisible(toolbar, "선택 직후 보임");
  const more = toolbar.locator('[aria-label="More media options"]');

  await scrollWindowBy(page, 1500);
  expect(await isAboveViewport(image), "이미지가 뷰포트 위").toBe(true);
  await expectHidden(toolbar, "창 스크롤 뒤");

  await scrollWindowTo(page, 0);
  await expectVisible(toolbar, "스크롤 복귀");

  await scrollWindowBy(page, 1500);
  await expectHidden(toolbar, "다시 창 스크롤");
  const morePoint = await centerOf(more);
  expect(
    await isPointInsideOverlay(page, morePoint, toolbarSelector),
    "툴바 자리의 점이 툴바를 가리키지 않는다",
  ).toBe(false);
  await page.mouse.click(morePoint.x, morePoint.y);
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("코드블록 툴바는 코드블록이 창 스크롤로 뷰포트 아래에 나가면 숨고 그 자리의 클릭을 받지 않는다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");
  const editor = page.getByRole("textbox", { name: "Editor" });
  await typeLines(page, editor);
  await page.keyboard.press("Enter");
  await page.keyboard.type("```");
  const codeBlock = editor.locator("pre[data-geul-code-block]").first();
  await expect(codeBlock).toBeVisible();

  const toolbarSelector = ".geul-code-block-toolbar";
  const toolbar = page.locator(toolbarSelector);
  await expectVisible(toolbar, "캐럿을 둔 직후 보임");
  const more = toolbar.locator('[aria-label="More code block options"]');

  await scrollWindowTo(page, 0);
  expect(await isBelowViewport(codeBlock), "코드블록이 뷰포트 아래").toBe(true);
  await expectHidden(toolbar, "창 스크롤 뒤");

  // 되돌리면 다시 보인다. 코드블록이 뷰포트 안에 들어온다.
  await codeBlock.scrollIntoViewIfNeeded();
  await expectVisible(toolbar, "스크롤 복귀");

  await scrollWindowTo(page, 0);
  await expectHidden(toolbar, "다시 창 스크롤");
  const morePoint = await centerOf(more);
  expect(
    await isPointInsideOverlay(page, morePoint, toolbarSelector),
    "툴바 자리의 점이 툴바를 가리키지 않는다",
  ).toBe(false);
  await page.mouse.click(morePoint.x, morePoint.y);
  await expect(page.locator(".geul-code-block-toolbar__more-menu")).toHaveCount(
    0,
  );
});

test("absolute 오버레이(미디어 리사이즈 핸들)는 창 스크롤로 뷰포트 밖에 나가도 visibility를 건드리지 않는다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const image = await selectImageAtTop(page, editor);

  const handles = page.locator(".geul-media-resize-handle");
  await expect(handles.first()).toBeVisible();
  const toolbar = page.locator(".geul-media-toolbar");

  await scrollWindowBy(page, 1500);
  expect(await isAboveViewport(image), "이미지가 뷰포트 위").toBe(true);
  // 같은 시나리오에서 fixed 툴바는 숨는다. 판정이 돈 뒤에 핸들을 읽는다.
  await expectHidden(toolbar, "fixed 미디어 툴바는 숨는다");

  const handleCount = await handles.count();
  expect(handleCount).toBeGreaterThan(0);
  for (let index = 0; index < handleCount; index += 1) {
    const handle = handles.nth(index);
    expect(
      await handle.evaluate(
        (element) => (element as HTMLElement).style.visibility,
      ),
      `핸들 ${index}의 인라인 visibility`,
    ).toBe("");
    await expectVisible(handle, `핸들 ${index}`);
    expect(await isAboveViewport(handle), `핸들 ${index}도 뷰포트 위`).toBe(
      true,
    );
  }
});
