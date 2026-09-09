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
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("img") });

  const before = await readMargins(image, wrapper);
  expect(before.width).toBe(300);
  // 대칭 정렬 사전 조건 — margin:0 auto 아래에서는 드래그 전에도 좌우
  // 여백이 같아야 한다(이후 dx만큼씩 같이 줄어드는 비교의 기준선).
  expect(before.left).toBeCloseTo(before.right, 0);

  const dx = 40;
  const start = await beginDrag(
    page,
    page.locator('[data-geul-media-resize-handle="right"]'),
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
    page.locator('[data-geul-media-resize-handle="right"]'),
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
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("img") });
  const wrapperBox = await wrapper.boundingBox();
  if (wrapperBox === null) throw new Error("래퍼 bounding box 없음");
  const maxWidth = Math.round(wrapperBox.width);

  const start = await beginDrag(
    page,
    page.locator('[data-geul-media-resize-handle="right"]'),
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
    page.locator('[data-geul-media-resize-handle="right"]'),
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

/**
 * Playwright `page.touchscreen`은 탭만 지원한다(공식 타입 주석 —
 * "This class is limited to emulating tap gestures", `touchscreen.tap()`
 * 하나뿐). 좌표 이동이 있는 드래그를 재현하려면 `touchscreen.tap()`이 내부적으로
 * 쓰는 것과 같은 계층인 CDP `Input.dispatchTouchEvent`를 직접 호출해야 한다
 * — `elementHandle.dispatchEvent`로 `TouchEvent`를 합성하면(비trusted)
 * Chromium의 touch->pointer 합성이 일어나지 않아 `MediaResizeHandles`(순수
 * Pointer Events 기반, `pointerType` 분기 없음)의 리스너에 닿지 않는다.
 */
const dragHandleWithTouch = async (
  page: Page,
  handle: Locator,
  dx: number,
): Promise<void> => {
  const box = await handle.boundingBox();
  if (box === null) throw new Error("핸들 bounding box 없음");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + dx, y }],
  });
  // touchEnd/touchCancel은 touchPoints를 비워야 한다(CDP 계약 — "must not
  // contain any touch points").
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
};

/**
 * `insertFilledImage`(support/demo.ts)와 같은 흐름이지만 마우스가 아니라
 * touch(`tap`)로 조작한다. mobile project(hasTouch:true)에서
 * `wrapper.click()`(mouse 이벤트)으로는 Media Toolbar가 뜨지 않음을 실측
 * 확인했다 — hasTouch 컨텍스트에서 mouse 이벤트만으로는 미디어 블록
 * selection이 서지 않는다(디버그 재현: 같은 흐름을 `tap()`으로 바꾸면
 * 정상 동작). 이 파일에서만 쓰므로 desktop 12+개 spec이 의존하는
 * `insertFilledImage`를 건드리지 않고 지역 함수로 둔다(사용처 1곳, 공용화
 * 문턱 미달).
 */
const insertFilledImageWithTap = async (
  page: Page,
  editable: Locator,
  url: string,
): Promise<Locator> => {
  await editable.tap();
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).tap();
  await page.getByRole("textbox", { name: "Image URL" }).pressSequentially(url);
  await page.getByRole("button", { name: "Save URL" }).tap();
  const image = editable.locator("img");
  await expect(image).toHaveAttribute("src", url);

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("toolbar", { name: "File panel" }),
  ).not.toBeVisible();

  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("img") });
  await wrapper.tap();
  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).toBeVisible();
  return image;
};

test("touch로 오른쪽 핸들을 끌면 실제 touch 입력으로도 폭이 바뀐다 @mobile", async ({
  page,
}) => {
  await routeResizeImage(page);
  const { editable } = await openDemo(page);
  const image = await insertFilledImageWithTap(
    page,
    editable,
    RESIZE_IMAGE_URL,
  );
  // 드래그 전에는 previewWidth가 없어 인라인 style width 자체가 없다(취소
  // 테스트 F6 주석과 동일한 전제) — 자연 크기(300px)는 style이 아니라 실제
  // 렌더 bounding box로 확인한다.
  const startBox = await image.boundingBox();
  if (startBox === null) throw new Error("이미지 bounding box 없음");
  expect(Math.round(startBox.width)).toBe(300);

  // 왼쪽으로 20px 축소 — 자연 크기(300px)가 이미 렌더돼 있다는 것은 그
  // 폭이 래퍼 content 폭(상한) 이하라는 뜻이라, 줄이는 방향은 상한 clamp와
  // 무관하다(Pixel 5의 좁은 뷰포트에서도 성립). 결과 폭(260px)도 64px
  // 하한과 충분히 떨어져 있어 하한 clamp도 걸리지 않는다.
  await dragHandleWithTouch(
    page,
    page.locator('[data-geul-media-resize-handle="right"]'),
    -20,
  );

  // 2배: 컴포넌트 주석 "중심 고정 대칭 리사이즈" 참고 — 위 mouse 기반
  // 테스트와 같은 산식(폭 변화량 = 포인터 이동량의 2배)이 touch 입력에서도
  // 성립함을 증명한다.
  await expect(image).toHaveAttribute("style", /width:\s*260px/);
});

test("pointer-up 커밋은 undo 1회로 복원된다", async ({ page }) => {
  await routeResizeImage(page);
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable, RESIZE_IMAGE_URL);

  const start = await beginDrag(
    page,
    page.locator('[data-geul-media-resize-handle="right"]'),
  );
  await dragTo(page, start, 40);
  await page.mouse.up();

  await expect(image).toHaveAttribute("style", /width:\s*380px/);

  await page.keyboard.press("Control+z");

  await expect(image).not.toHaveAttribute("style", /width/);
});

/**
 * media-resize-handles.tsx가 `position: fixed`(viewport-relative
 * `getBoundingClientRect()`)였을 때는, 이미지가 문서 하단에 있어 핸들이
 * 뷰포트 밖으로 밀려나면 네이티브 scroll-into-view가 no-op이라(표 핸들의
 * Issue #163과 같은 근본 원인) 명시적 `scrollIntoViewIfNeeded()`도 Playwright
 * hover의 자동 스크롤도 핸들에 도달하지 못했다(Issue #164 본문이 실측한
 * 재현 방법 그 자체). `G-UI-003`/`ADR-0012` 전환(absolute + page-relative
 * 좌표, `table-handle-geometry.ts`의 `readPageRect` 재사용) 이후 두 핸들
 * 모두 도달 가능함을 확인한다.
 *
 * 필러 문단 25개(`media-file-panel.spec.ts`의 PIT-0011 테스트와 같은
 * 관용구)를 이미지보다 **앞에** 넣어, 맨 위로 스크롤했을 때 이미지(와 그
 * 경계에 앵커된 핸들)가 뷰포트 아래로 밀려나게 만든다 — `insertFilledImage`가
 * 자체적으로 `editable.click()`을 다시 호출해 캐럿 위치를 흩트리므로, 이
 * 테스트는 그 헬퍼를 재사용하지 않고 같은 절차를 필러 입력 뒤 캐럿 위치에서
 * 직접 수행한다.
 */
test("리사이즈 핸들이 뷰포트 밖으로 밀려난 뒤에도 스크롤로 도달 가능하다 (Issue #164)", async ({
  page,
}) => {
  await routeResizeImage(page);
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("first");
  for (let index = 0; index < 25; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }
  await page.keyboard.press("Enter");
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).click();
  await page
    .getByRole("textbox", { name: "Image URL" })
    .pressSequentially(RESIZE_IMAGE_URL);
  await page.getByRole("button", { name: "Save URL" }).click();
  const image = editable.locator("img");
  await expect(image).toHaveAttribute("src", RESIZE_IMAGE_URL);

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("toolbar", { name: "File panel" }),
  ).not.toBeVisible();

  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("img") });
  await wrapper.click();
  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).toBeVisible();

  // 맨 위로 스크롤하면 필러 문단 뒤에 있는 이미지(와 핸들)는 뷰포트 밖(아래)에
  // 남는다.
  await page.evaluate(() => window.scrollTo(0, 0));

  const leftHandle = page.locator('[data-geul-media-resize-handle="left"]');
  const rightHandle = page.locator('[data-geul-media-resize-handle="right"]');

  // sanity check: 둘 다 뷰포트 밖(아래)에서 시작해야 한다 — 깨지면 setup
  // 자체가 틀린 것이다.
  await expect(leftHandle).not.toBeInViewport();
  await expect(rightHandle).not.toBeInViewport();

  for (const handle of [leftHandle, rightHandle]) {
    // 실측 1: 명시적 scrollIntoViewIfNeeded()로 도달한다 — position: fixed
    // 였다면 네이티브 scroll-into-view가 no-op이라 window.scrollY가 그대로
    // 였을 것이다(Issue #164 본문 실측, Issue #163과 같은 근본 원인).
    const scrollYBefore = await page.evaluate(() => window.scrollY);
    await handle.scrollIntoViewIfNeeded();
    const scrollYAfter = await page.evaluate(() => window.scrollY);
    expect(scrollYAfter).toBeGreaterThan(scrollYBefore);
    await expect(handle).toBeInViewport();

    // 다시 뷰포트 밖으로 되돌린다 — 다음 핸들(또는 아래 hover 실측)이
    // 자기만의 스크롤 이동을 실제로 일으키는지 검증하려면 매번 원점에서
    // 시작해야 한다.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(handle).not.toBeInViewport();
  }

  // 실측 2: hover의 자동 스크롤로도 도달해 실제 드래그 상호작용까지
  // 성공한다(도달 확인보다 강한 증거) — 오른쪽 핸들로 중심 고정 대칭
  // 리사이즈가 스크롤된 상태에서도 그대로 성립함을 함께 확인한다.
  await rightHandle.hover();
  await expect(rightHandle).toBeInViewport();

  const start = await beginDrag(page, rightHandle);
  await dragTo(page, start, 20);
  await page.mouse.up();

  await expect(image).toHaveAttribute("style", /width:\s*340px/);
});
