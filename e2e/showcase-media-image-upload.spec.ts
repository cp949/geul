/**
 * Media 예제(07-media)의 mock uploadFile이 data url을 돌려주는지 확인한다
 * — 00-composite/example.tsx와 동일 mock 패턴을 복제해(소스 패널
 * 자기완결성, 스펙 §5) 같은 원인(실존하지 않는
 * `https://example.com/uploads/...`)으로 이미지가 안 보였고, 같은 수정을
 * 받았다(2026-09-11). showcase-composite-image-upload.spec.ts와 대칭
 * spec — 세부 근거는 그쪽 docstring 참고.
 */
import { expect, test } from "@playwright/test";

import {
  openShowcasePage,
  uploadImageViaFilePanel,
} from "./support/showcase.js";

test("Upload 탭에서 이미지를 올리면 data url로 렌더돼 실제로 보인다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/media");

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
