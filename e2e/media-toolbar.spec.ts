/**
 * Media toolbar(RD-004 DELTA-01): `url` 있는 미디어 블록을 선택하면
 * rename/caption/delete/download 4개 control을 가진 toolbar가 나타나고,
 * 빈 블록에는 나타나지 않는다(File Panel과 상호 배타). rename/caption
 * 편집과 delete의 undo 1회 복원, download 링크의 href/download 속성,
 * Escape/바깥 클릭에 따른 닫힘과 focus 복원 차이를 실제 Chromium event
 * 순서로 검증한다.
 */
import { expect, test } from "@playwright/test";

import { insertFilledImage, openDemo } from "./support/demo.js";

test("url 있는 이미지를 선택하면 toolbar가 나타나고 4개 control이 보인다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);

  await expect(page.getByRole("button", { name: "Rename" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit caption" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete media block" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
});

test("빈 미디어 블록을 선택하면 toolbar가 나타나지 않는다(File Panel 담당)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/video");
  await page.getByRole("option", { name: /^Video/ }).click();

  await expect(page.getByRole("toolbar", { name: "File panel" })).toBeVisible();
  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).not.toBeVisible();
});

test("Rename으로 이름을 바꾸면 alt에 반영되고 undo 1회로 복원된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable);
  await expect(image).toHaveAttribute("alt", "photo.png");

  await page.getByRole("button", { name: "Rename" }).click();
  const nameInput = page.getByRole("textbox", { name: "Image name" });
  await expect(nameInput).toBeFocused();
  await nameInput.fill("renamed.png");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(image).toHaveAttribute("alt", "renamed.png");
  await expect(editable).toBeFocused();

  await page.keyboard.press("Control+z");

  await expect(image).toHaveAttribute("alt", "photo.png");
});

test("Enter로도 이름을 제출한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable);

  await page.getByRole("button", { name: "Rename" }).click();
  const nameInput = page.getByRole("textbox", { name: "Image name" });
  await nameInput.fill("renamed.png");
  await nameInput.press("Enter");

  await expect(image).toHaveAttribute("alt", "renamed.png");
});

test("Escape로 이름 편집을 취소하면 원래 값을 유지한 채 toolbar가 남는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable);

  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Image name" }).fill("discarded.png");
  await page.keyboard.press("Escape");

  await expect(image).toHaveAttribute("alt", "photo.png");
  await expect(page.getByRole("button", { name: "Rename" })).toBeVisible();
  await expect(editable).toBeFocused();
});

test("Caption을 추가하면 표시되고 undo 1회로 복원된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable);
  const caption = editable.locator("[data-be-media-caption]");
  await expect(caption).toHaveCount(0);

  await page.getByRole("button", { name: "Edit caption" }).click();
  await page.getByRole("textbox", { name: "Image caption" }).fill("풍경 사진");
  await page.getByRole("button", { name: "Save caption" }).click();

  await expect(caption).toHaveText("풍경 사진");
  // caption이 있으면 alt는 caption을 재사용한다(media-block-extension.ts,
  // spec §6.3).
  await expect(image).toHaveAttribute("alt", "풍경 사진");

  await page.keyboard.press("Control+z");

  await expect(caption).toHaveCount(0);
  await expect(image).toHaveAttribute("alt", "photo.png");
});

test("Delete하면 블록이 사라지고 undo 1회로 복원된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);
  await expect(editable.locator("img")).toHaveCount(1);

  await page.getByRole("button", { name: "Delete media block" }).click();

  await expect(editable.locator("img")).toHaveCount(0);
  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).not.toBeVisible();

  await page.keyboard.press("Control+z");

  await expect(editable.locator("img")).toHaveCount(1);
});

test("Download 링크가 href와 download 속성을 렌더한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);

  const download = page.getByRole("link", { name: "Download" });
  await expect(download).toHaveAttribute(
    "href",
    "https://example.com/dir/photo.png",
  );
  await expect(download).toHaveAttribute("download", "photo.png");
});

test("Escape는 toolbar를 닫고 편집기로 초점을 되돌린다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);

  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).not.toBeVisible();
  await expect(editable).toBeFocused();
});

test("바깥 클릭은 toolbar를 닫되 클릭한 컨트롤로 초점을 옮긴다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);

  const saveJsonButton = page.getByRole("button", { name: "Save JSON" });
  await saveJsonButton.click();

  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).not.toBeVisible();
  await expect(saveJsonButton).toBeFocused();
});
