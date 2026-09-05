/**
 * Media resize handle(RD-001 DELTA-03, spec §6.3 `MED-007`): jsdom
 * rect-stub(media-resize-handles.test.tsx)로만 검증됐던 "중심 고정 대칭
 * 리사이즈"(폭 변화량 = 포인터 이동량의 2배, 좌우 여백이 각각 이동량만큼
 * 줄어든다)와 64px~content 폭 clamp가 실제 Chromium 레이아웃에서도
 * 성립하는지, Escape 취소가 Media Toolbar를 닫지 않는지(F5 회귀),
 * pointer-up 커밋이 undo 1회로 복원되는지를 실제 pointer 드래그로
 * 검증한다.
 *
 * 기존 미디어 fixture(`e2e/fixtures/photo.png` 등)는 전부 텍스트
 * placeholder라 실제로 디코드되지 않는다(다른 spec은 URL 문자열만
 * 검증해 상관없었다) — 이 spec은 실제 렌더 픽셀 크기가 검증 대상이라
 * `resize-photo.png`(실제 300×180 PNG)를 `page.route()`로 fulfill해
 * `<img>`가 진짜로 디코드되게 한다(계획 "배경" 참고).
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import { insertFilledImage, openDemo } from "./support/demo.js";

const RESIZE_IMAGE_URL = "https://example.com/dir/resize-photo.png";

/** 실제 300×180 PNG로 fulfill해 `<img>`가 진짜 픽셀 크기로 렌더되게 한다. */
const routeResizeImage = (page: Page) =>
  page.route(RESIZE_IMAGE_URL, (route) =>
    route.fulfill({ path: "e2e/fixtures/resize-photo.png" }),
  );

type Point = { x: number; y: number };

/**
 * 핸들 중심으로 마우스를 옮기고 누른다 — 이후 `dragTo`가 이 중심 좌표
 * 기준으로 상대 이동한다(핸들 박스의 좌측 상단이 아니라 실제로 누른
 * 지점에서부터 움직여야 포인터 이동량 dx가 정확하다).
 */
const beginDrag = async (page: Page, handle: Locator): Promise<Point> => {
  const box = await handle.boundingBox();
  if (box === null) throw new Error("핸들 bounding box 없음");
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  return center;
};

/** `beginDrag`가 누른 지점에서 x축으로 dx만큼(y 고정) 옮긴다. */
const dragTo = (page: Page, start: Point, dx: number): Promise<void> =>
  page.mouse.move(start.x + dx, start.y, { steps: 5 });

/** 이미지·래퍼의 현재 bounding box로 좌우 여백(래퍼 경계까지 거리)을 계산한다. */
const readMargins = async (image: Locator, wrapper: Locator) => {
  const imageBox = await image.boundingBox();
  const wrapperBox = await wrapper.boundingBox();
  if (imageBox === null || wrapperBox === null) {
    throw new Error("bounding box 없음");
  }
  return {
    width: imageBox.width,
    left: imageBox.x - wrapperBox.x,
    right: wrapperBox.x + wrapperBox.width - (imageBox.x + imageBox.width),
    wrapperWidth: wrapperBox.width,
  };
};

test("오른쪽 핸들을 dx만큼 끌면 실제 레이아웃에서도 폭이 2*dx만큼 커지고 좌우 여백이 각각 dx만큼 줄어든다(중심 고정 대칭)", async ({
  page,
}) => {
  await routeResizeImage(page);
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable, RESIZE_IMAGE_URL);
  const wrapper = editable
    .locator("[data-be-block-id]")
    .filter({ has: page.locator("img") });

  const before = await readMargins(image, wrapper);
  expect(before.width).toBe(300);
  // 대칭 정렬 사전 조건 — margin:0 auto 아래에서는 드래그 전에도 좌우
  // 여백이 같아야 한다(이후 dx만큼씩 같이 줄어드는 비교의 기준선).
  expect(before.left).toBeCloseTo(before.right, 0);

  const dx = 40;
  const start = await beginDrag(
    page,
    page.locator('[data-be-media-resize-handle="right"]'),
  );
  await dragTo(page, start, dx);

  await expect(image).toHaveAttribute("style", /width:\s*380px/);
  await page.mouse.up();

  const after = await readMargins(image, wrapper);
  expect(after.width).toBe(before.width + 2 * dx);
  expect(after.left).toBeCloseTo(before.left - dx, 0);
  expect(after.right).toBeCloseTo(before.right - dx, 0);
  // 래퍼(content 폭) 자체는 이미지 크기 변화에 영향받지 않는다 — 상한
  // clamp가 드래그 시작 시점 값을 계속 유효하게 쓸 수 있다는 전제.
  expect(after.wrapperWidth).toBeCloseTo(before.wrapperWidth, 0);
});

test("왼쪽으로 한참 끌어도 64px 밑으로 내려가지 않는다", async ({ page }) => {
  await routeResizeImage(page);
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable, RESIZE_IMAGE_URL);

  const start = await beginDrag(
    page,
    page.locator('[data-be-media-resize-handle="right"]'),
  );
  await dragTo(page, start, -9999);

  await expect(image).toHaveAttribute("style", /width:\s*64px/);
  await page.mouse.up();
  await expect(image).toHaveAttribute("style", /width:\s*64px/);
});

test("오른쪽으로 한참 끌어도 실제 측정한 래퍼 content 폭을 넘지 않는다", async ({
  page,
}) => {
  await routeResizeImage(page);
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable, RESIZE_IMAGE_URL);
  const wrapper = editable
    .locator("[data-be-block-id]")
    .filter({ has: page.locator("img") });
  const wrapperBox = await wrapper.boundingBox();
  if (wrapperBox === null) throw new Error("래퍼 bounding box 없음");
  const maxWidth = Math.round(wrapperBox.width);

  const start = await beginDrag(
    page,
    page.locator('[data-be-media-resize-handle="right"]'),
  );
  await dragTo(page, start, 9999);

  await expect(image).toHaveAttribute(
    "style",
    new RegExp(`width:\\s*${maxWidth}px`),
  );
  await page.mouse.up();
});

test("Escape로 취소하면 원래 폭으로 복원되고 Media Toolbar가 닫히지 않는다(F5·F6 회귀) @core", async ({
  page,
}) => {
  await routeResizeImage(page);
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable, RESIZE_IMAGE_URL);
  const toolbar = page.getByRole("toolbar", { name: "Media toolbar" });
  await expect(toolbar).toBeVisible();

  const start = await beginDrag(
    page,
    page.locator('[data-be-media-resize-handle="right"]'),
  );
  await dragTo(page, start, 40);

  await expect(image).toHaveAttribute("style", /width:\s*380px/);
  // 드래그가 진행 중인 동안에도 toolbar가 살아 있어야 한다 — F5(핸들
  // pointerdown이 "바깥 클릭"으로 오판정돼 즉시 닫히는 회귀)는 여기서 잡힌다.
  await expect(toolbar).toBeVisible();

  await page.keyboard.press("Escape");
  await page.mouse.up();

  // previewWidth가 원래 null(자연 크기)이었으므로 인라인 width가 전혀
  // 없어야 한다(F6 — 취소 후 시작 rect 폭을 재조립해 fluid 이미지를
  // 고정폭으로 굳히는 회귀).
  await expect(image).not.toHaveAttribute("style", /width/);
  await expect(toolbar).toBeVisible();
});

test("pointer-up 커밋은 undo 1회로 복원된다", async ({ page }) => {
  await routeResizeImage(page);
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable, RESIZE_IMAGE_URL);

  const start = await beginDrag(
    page,
    page.locator('[data-be-media-resize-handle="right"]'),
  );
  await dragTo(page, start, 40);
  await page.mouse.up();

  await expect(image).toHaveAttribute("style", /width:\s*380px/);

  await page.keyboard.press("Control+z");

  await expect(image).not.toHaveAttribute("style", /width/);
});
