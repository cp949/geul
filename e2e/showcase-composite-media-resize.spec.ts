/**
 * Kitchen sink(00-composite)에서 이미지 리사이즈 핸들 드래그로 설정한
 * `previewWidth`가 편집기 DOM과 `exportHtml()` 미리보기(`@cp949/geul-io/
 * preview.css` 적용) 양쪽에 실제로 반영되는지 확인한다. `exportHtml()`은
 * `previewWidth`를 `data-geul-preview-width` data attribute로만 내보내고
 * (`packages/io/src/html/export-html.ts` mediaDataAttributes) 인라인
 * `style="width:...px"`를 내지 않는다 — showcase의 `applyDataGeulStyles`
 * (JS 후처리, `data-geul-text-color` 등과 같은 위치)가 그 값을 실제 `width`
 * style로 옮겨줘야 미리보기에 반영된다.
 *
 * `uploadImageViaFilePanel`(e2e/support/showcase.ts)의 기본 fixture가 이미
 * 실제 300×180 PNG(`resize-photo.png`)라 `media-resize-handle.spec.ts`(demo)
 * 와 같은 산식(폭 변화량 = 포인터 이동량의 2배, 중심 고정 대칭)을 그대로
 * 적용해 검증할 수 있다 — 드래그 조립 지식은 `e2e/support/media-resize.ts`
 * 공용 helper(`G-TST-002`, demo 스펙이 원 소유자)를 그대로 재사용한다.
 */
import { expect, test } from "@playwright/test";

import { beginDrag, dragTo } from "./support/media-resize.js";
import {
  openShowcasePage,
  uploadImageViaFilePanel,
} from "./support/showcase.js";

test("리사이즈 핸들로 이미지 폭을 늘리면 편집기와 미리보기 양쪽에 반영된다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const editorImage = await uploadImageViaFilePanel(page, editable);

  // showcase의 uploadImageViaFilePanel은 업로드 후 toolbar를 자동으로 열지
  // 않는다(demo의 insertFilledImage와 다름, showcase-composite-media-
  // alignment.spec.ts와 동일 사정) — 블록을 다시 선택해야 리사이즈 핸들이
  // 뜬다.
  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("img") });
  await wrapper.click();

  const dx = 40;
  const start = await beginDrag(
    page,
    page.locator('[data-geul-media-resize-handle="right"]'),
  );
  await dragTo(page, start, dx);
  await page.mouse.up();

  // 300(원본 폭) + 2*dx(중심 고정 대칭) = 380.
  await expect(editorImage).toHaveAttribute("style", /width:\s*380px/);

  const previewImage = page.locator('[aria-label="미리보기"]').locator("img");
  await expect(previewImage).toHaveCSS("width", "380px");
});
