/**
 * Kitchen sink(00-composite)의 mock uploadFile이 실존하지 않는 external url
 * (`https://example.com/uploads/...`) 대신 브라우저가 실제로 렌더할 수
 * 있는 data url을 돌려주는지 확인한다(2026-09-11 사용자 보고 — "kitchen
 * sink에서 이미지가 안나온다"). 존재하지 않는 도메인이라 <img>가 항상
 * 깨진 상태였다(실측). Upload 탭으로 실제 PNG(e2e/fixtures/resize-photo.png,
 * 300×180)를 올려 data url로 렌더되는지와 실제 디코딩된 픽셀 크기까지
 * 확인한다 — src 접두어만 보면 FileReader가 빈 결과를 돌려줘도 통과해
 * 회귀를 못 잡는다. 07-media/example.tsx도 동일 mock 패턴을 복제해 같은
 * 원인·수정을 가졌다 — 그쪽은
 * showcase-media-image-upload.spec.ts가 검증한다.
 */
import { expect, test } from "@playwright/test";

import {
  openShowcasePage,
  uploadImageViaFilePanel,
} from "./support/showcase.js";

test("Upload 탭에서 이미지를 올리면 data url로 렌더돼 실제로 보인다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");

  const editable = page.getByRole("textbox", { name: "Editor" });
  const image = await uploadImageViaFilePanel(page, editable);

  await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/);

  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(300);
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalHeight))
    .toBe(180);
});
