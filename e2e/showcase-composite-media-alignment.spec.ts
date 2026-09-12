/**
 * Kitchen sink(00-composite)에서 image·video 두 미디어 타입의 정렬(기본/
 * left/right)이 편집기 DOM과 `exportHtml()` 미리보기(`@cp949/geul-io/
 * preview.css` 적용) 양쪽에 실제로 반영되는지 확인한다(image: Issue #178,
 * RD-002 DELTA-02. video: Issue #181, 01-계획.md — #178 완료 기준이 추론으로
 * 처리했던 부분을 실측으로 보완). 두 컨테이너의 폭·padding이 달라 절대 픽셀
 * 위치를 서로 비교하지 않는다 — 각 쪽에서 독립적으로
 * `getComputedStyle().marginLeft`/`marginRight`를 읽어 정렬 CSS 규칙 자체가
 * 적용됐는지 확인한다.
 *
 * image·video 두 미디어 타입, 6개 변형(각 기본/left/right)을 이 한 파일에
 * 둔다 — 파일명이 이미 "media"(image 한정이 아님)라 자연스럽고, 분리하면
 * `readHorizontalMargins`와 "블록 wrapper 클릭해 선택" 조립 지식이 두 번째
 * 파일에서 반복돼 `G-TST-002`가 이 이슈 범위 밖의 helper 추출을
 * 요구한다(Issue #181, 01-계획.md "## 결정").
 *
 * image test 3개에만 `@core`를 붙여 Issue #180으로 chrome83 project에
 * 편입했다. 파일당 `@core` 1개 원칙(Issue #124)의 의도적 예외다 — 그 3개는
 * 같은 정렬 시나리오의 변형(기본/left/right)이라 Issue #124가 막으려던
 * "서로 무관한 test가 파일 단위 testMatch에 편입되는 문제"에 해당하지
 * 않는다. video test 3개는 `@core`를 붙이지 않는다 — chrome83 편입은 이슈
 * #181 범위 밖이다(01-계획.md "## 5. 범위 밖").
 */
import { expect, type Locator, test } from "@playwright/test";

import {
  openShowcasePage,
  uploadImageViaFilePanel,
  uploadVideoViaFilePanel,
} from "./support/showcase.js";

/**
 * img/video 요소의 실제 계산된 marginLeft/marginRight를 px 숫자로 읽는다.
 * `margin: 0 auto`나 `margin-right: auto`처럼 선언에 `auto`가 섞여 있어도
 * computed style은 항상 실제 레이아웃이 풀어낸 px 값으로 나온다.
 */
const readHorizontalMargins = (
  element: Locator,
): Promise<{ left: number; right: number }> =>
  element.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      left: Number.parseFloat(style.marginLeft),
      right: Number.parseFloat(style.marginRight),
    };
  });

test("기본(정렬 미지정) 이미지는 편집기와 미리보기 양쪽에서 중앙 정렬된다 @core", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const editorImage = await uploadImageViaFilePanel(page, editable);
  const previewImage = page.locator('[aria-label="미리보기"]').locator("img");

  const editorMargins = await readHorizontalMargins(editorImage);
  const previewMargins = await readHorizontalMargins(previewImage);

  // 좌우 여백이 있어야(둘 다 0이 아니어야) 실제로 중앙에 남은 공간을
  // 나눈 것이지, 이미지가 컨테이너 폭과 같아서 우연히 0=0이 된 게
  // 아님을 함께 확인한다.
  expect(editorMargins.left).toBeGreaterThan(0);
  expect(editorMargins.left).toBeCloseTo(editorMargins.right, 0);
  expect(previewMargins.left).toBeGreaterThan(0);
  expect(previewMargins.left).toBeCloseTo(previewMargins.right, 0);
});

test("Align left를 누르면 편집기와 미리보기 양쪽에서 이미지가 왼쪽에 붙는다 @core", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const editorImage = await uploadImageViaFilePanel(page, editable);

  // showcase의 uploadImageViaFilePanel은 업로드 후 toolbar를 자동으로 열지
  // 않는다(demo의 insertFilledImage와 다름) — 블록을 다시 선택한다.
  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("img") });
  await wrapper.click();
  await page.getByRole("button", { name: "Align left" }).click();

  const previewImage = page.locator('[aria-label="미리보기"]').locator("img");
  const editorMargins = await readHorizontalMargins(editorImage);
  const previewMargins = await readHorizontalMargins(previewImage);

  expect(editorMargins.left).toBe(0);
  expect(editorMargins.right).toBeGreaterThan(0);
  expect(previewMargins.left).toBe(0);
  expect(previewMargins.right).toBeGreaterThan(0);
});

test("Align right를 누르면 편집기와 미리보기 양쪽에서 이미지가 오른쪽에 붙는다 @core", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const editorImage = await uploadImageViaFilePanel(page, editable);

  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("img") });
  await wrapper.click();
  await page.getByRole("button", { name: "Align right" }).click();

  const previewImage = page.locator('[aria-label="미리보기"]').locator("img");
  const editorMargins = await readHorizontalMargins(editorImage);
  const previewMargins = await readHorizontalMargins(previewImage);

  expect(editorMargins.right).toBe(0);
  expect(editorMargins.left).toBeGreaterThan(0);
  expect(previewMargins.right).toBe(0);
  expect(previewMargins.left).toBeGreaterThan(0);
});

test("기본(정렬 미지정) video는 편집기와 미리보기 양쪽에서 중앙 정렬된다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const editorVideo = await uploadVideoViaFilePanel(page, editable);
  const previewVideo = page.locator('[aria-label="미리보기"]').locator("video");

  const editorMargins = await readHorizontalMargins(editorVideo);
  const previewMargins = await readHorizontalMargins(previewVideo);

  // 좌우 여백이 있어야(둘 다 0이 아니어야) 실제로 중앙에 남은 공간을
  // 나눈 것이지, video가 컨테이너 폭과 같아서 우연히 0=0이 된 게
  // 아님을 함께 확인한다.
  expect(editorMargins.left).toBeGreaterThan(0);
  expect(editorMargins.left).toBeCloseTo(editorMargins.right, 0);
  expect(previewMargins.left).toBeGreaterThan(0);
  expect(previewMargins.left).toBeCloseTo(previewMargins.right, 0);
});

test("Align left를 누르면 편집기와 미리보기 양쪽에서 video가 왼쪽에 붙는다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const editorVideo = await uploadVideoViaFilePanel(page, editable);

  // showcase의 uploadVideoViaFilePanel은 업로드 후 toolbar를 자동으로 열지
  // 않는다(demo의 insertFilledImage와 다름) — 블록을 다시 선택한다.
  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("video") });
  await wrapper.click();
  await page.getByRole("button", { name: "Align left" }).click();

  const previewVideo = page.locator('[aria-label="미리보기"]').locator("video");
  const editorMargins = await readHorizontalMargins(editorVideo);
  const previewMargins = await readHorizontalMargins(previewVideo);

  expect(editorMargins.left).toBe(0);
  expect(editorMargins.right).toBeGreaterThan(0);
  expect(previewMargins.left).toBe(0);
  expect(previewMargins.right).toBeGreaterThan(0);
});

test("Align right를 누르면 편집기와 미리보기 양쪽에서 video가 오른쪽에 붙는다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const editorVideo = await uploadVideoViaFilePanel(page, editable);

  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("video") });
  await wrapper.click();
  await page.getByRole("button", { name: "Align right" }).click();

  const previewVideo = page.locator('[aria-label="미리보기"]').locator("video");
  const editorMargins = await readHorizontalMargins(editorVideo);
  const previewMargins = await readHorizontalMargins(previewVideo);

  expect(editorMargins.right).toBe(0);
  expect(editorMargins.left).toBeGreaterThan(0);
  expect(previewMargins.right).toBe(0);
  expect(previewMargins.left).toBeGreaterThan(0);
});
