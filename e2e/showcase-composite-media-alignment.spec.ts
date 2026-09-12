/**
 * Kitchen sink(00-composite)에서 image 정렬(기본/left/right)이 편집기 DOM과
 * `exportHtml()` 미리보기(`@cp949/geul-io/preview.css` 적용) 양쪽에 실제로
 * 반영되는지 확인한다(Issue #178, RD-002 DELTA-02). 두 컨테이너의 폭·padding이
 * 달라 절대 픽셀 위치를 서로 비교하지 않는다 — 각 쪽에서 독립적으로
 * `getComputedStyle().marginLeft`/`marginRight`를 읽어 정렬 CSS 규칙 자체가
 * 적용됐는지 확인한다.
 *
 * test 3개 전부에 `@core`를 붙여 Issue #180으로 chrome83 project에
 * 편입했다. 파일당 `@core` 1개 원칙(Issue #124)의 의도적 예외다 — 3개는
 * 같은 정렬 시나리오의 변형(기본/left/right)이라 Issue #124가 막으려던
 * "서로 무관한 test가 파일 단위 testMatch에 편입되는 문제"에 해당하지
 * 않는다. 오히려 3개 모두 이 파일이 증명하는 완료 조건을 함께
 * 이룬다(01-계획.md "## 결정").
 */
import { expect, type Locator, test } from "@playwright/test";

import {
  openShowcasePage,
  uploadImageViaFilePanel,
} from "./support/showcase.js";

/**
 * img 요소의 실제 계산된 marginLeft/marginRight를 px 숫자로 읽는다.
 * `margin: 0 auto`나 `margin-right: auto`처럼 선언에 `auto`가 섞여 있어도
 * computed style은 항상 실제 레이아웃이 풀어낸 px 값으로 나온다.
 */
const readHorizontalMargins = (
  image: Locator,
): Promise<{ left: number; right: number }> =>
  image.evaluate((el) => {
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
