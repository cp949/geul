/**
 * Media toolbar(RD-004 DELTA-01): `url` 있는 미디어 블록을 선택하면
 * rename/caption/delete/download 4개 control을 가진 toolbar가 나타나고,
 * 빈 블록에는 나타나지 않는다(File Panel과 상호 배타). rename/caption
 * 편집과 delete의 undo 1회 복원, download 링크의 href/download 속성,
 * Escape/바깥 클릭에 따른 닫힘과 focus 복원 차이를 실제 Chromium event
 * 순서로 검증한다. Preview 토글(image/video/audio 전용, 슬라이스5 RD-002
 * DELTA-03)의 `<img>`↔`<a>` 실제 DOM 교체·undo·aria-pressed·JSON
 * round-trip도 이 파일이 검증한다.
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

test("Preview를 끄면 img가 a 링크로 바뀌고 undo 1회로 복원된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable);
  // 문서에는 트리거였던 빈 문단·미디어 블록·trailing 문단 3개가 모두
  // `[data-be-block-id]`를 갖는다(모든 block-level 노드의 공통 속성) —
  // `.first()`는 미디어 블록이 아니라 그 앞 빈 문단을 집을 수 있다(실측).
  // toggle 이후 `img`가 사라져 `filter({ has: img })`로도 더는 못 좁히므로,
  // img가 아직 있는 지금 실제 blockId 값을 읽어 안정된 셀렉터로 고정한다.
  const mediaBlockId = await editable
    .locator("[data-be-block-id]")
    .filter({ has: page.locator("img") })
    .getAttribute("data-be-block-id");
  const wrapper = editable.locator(`[data-be-block-id="${mediaBlockId}"]`);

  await page.getByRole("button", { name: "Preview" }).click();

  await expect(editable.locator("img")).toHaveCount(0);
  const link = wrapper.locator("a");
  await expect(link).toHaveAttribute(
    "href",
    "https://example.com/dir/photo.png",
  );
  await expect(link).toHaveText("photo.png");

  await page.keyboard.press("Control+z");

  await expect(wrapper.locator("a")).toHaveCount(0);
  await expect(image).toHaveAttribute(
    "src",
    "https://example.com/dir/photo.png",
  );
});

test("Preview 버튼의 aria-pressed가 클릭마다 반전된다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);
  const previewButton = page.getByRole("button", { name: "Preview" });
  await expect(previewButton).toHaveAttribute("aria-pressed", "true");

  await previewButton.click();
  await expect(previewButton).toHaveAttribute("aria-pressed", "false");

  await previewButton.click();
  await expect(previewButton).toHaveAttribute("aria-pressed", "true");
});

test("showPreview:false가 Save/Load JSON round-trip 이후에도 유지된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const source = page.getByLabel("Document source");
  await insertFilledImage(page, editable);

  await page.getByRole("button", { name: "Preview" }).click();
  await expect(editable.locator("img")).toHaveCount(0);

  // Media toolbar가 열린 채로 "Save JSON"(편집기 바깥 버튼)을 바로 클릭하지
  // 않는다 — 그 클릭이 바깥-클릭 dismiss와 Save JSON 자신의 onClick을
  // 동시에 수행해야 하는 조합에서 onClick이 조용히 무시되는 기존 결함을
  // 실측했다(RD-002 착수 이전부터 존재, 이 슬라이스가 만든 회귀 아님 —
  // `pending-issues/02.md`). Escape로 먼저 닫아 dismiss와 다음 클릭을
  // 분리한다.
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Save JSON" }).click();
  // JSON.stringify(doc, null, 2) pretty-print 형식(콜론 뒤 공백 1개)에
  // 맞춘다 — compact 직렬화가 아니다(demo app의 saveJson 구현).
  await expect(source).toContainText('"showPreview": false');
  const json = await source.inputValue();

  await editable.fill("Temporary text");
  await source.fill(json);
  await page.getByRole("button", { name: "Load JSON" }).click();

  await expect(editable.locator("img")).toHaveCount(0);
  const restoredLink = editable.locator("[data-be-block-id] a");
  await expect(restoredLink).toHaveAttribute(
    "href",
    "https://example.com/dir/photo.png",
  );
});
