/**
 * iframe 블록(CUS-001~004, roadmap Issue #212) — 슬래시커맨드 삽입과
 * whitelist 밖 URL/거절 UI(RD-004 완료 조건 1). 데모 앱은 `app.tsx`의
 * `DEMO_IFRAME_EMBED`로 "example.com"만 화이트리스트에 등록한다
 * (`allowCustomUrl` 미설정 — 기본 false) — 그 밖 도메인은 항상
 * NOT_WHITELISTED_AND_CUSTOM_DISABLED로 거절된다.
 */
import { expect, test } from "@playwright/test";

import { openDemo } from "./support/demo.js";

test("Slash로 iframe을 삽입하면 목록에 Iframe 항목이 보이고 File Panel이 Upload 탭 없이 자동으로 열린다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/iframe");
  await expect(page.getByRole("option", { name: /^Iframe/ })).toBeVisible();
  await page.getByRole("option", { name: /^Iframe/ }).click();

  await expect(page.getByRole("toolbar", { name: "File panel" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Upload" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Embed" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Iframe URL" })).toBeFocused();
});

test("화이트리스트 URL을 저장하면 iframe이 그 src를 갖고 이름 초깃값을 추출한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/iframe");
  await page.getByRole("option", { name: /^Iframe/ }).click();

  await page
    .getByRole("textbox", { name: "Iframe URL" })
    .pressSequentially("https://example.com/embed");
  await page.getByRole("button", { name: "Save URL" }).click();

  await expect(editable.locator("iframe")).toHaveAttribute(
    "src",
    "https://example.com/embed",
  );
  await expect(page.getByText("Name: embed")).toBeVisible();
});

test("화이트리스트 밖 URL이면 거부 메시지를 표시하고 문서를 그대로 둔다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/iframe");
  await page.getByRole("option", { name: /^Iframe/ }).click();

  await page
    .getByRole("textbox", { name: "Iframe URL" })
    .fill("https://not-whitelisted.example.org");
  await page.getByRole("button", { name: "Save URL" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "This URL isn't on the allowed list",
  );
  await expect(editable.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Iframe URL" })).toBeVisible();
});

test("차단된 protocol이면 사유별 거부 메시지를 표시한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/iframe");
  await page.getByRole("option", { name: /^Iframe/ }).click();

  await page
    .getByRole("textbox", { name: "Iframe URL" })
    .fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save URL" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "This protocol isn't allowed",
  );
  await expect(editable.locator("iframe")).toHaveCount(0);
});

test("삽입을 undo 1회로 복원한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/iframe");
  await page.getByRole("option", { name: /^Iframe/ }).click();
  await expect(
    editable.locator('[data-geul-media-empty="iframe"]'),
  ).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "File panel" })).toBeVisible();

  // media-file-panel.spec.ts "삽입을 undo 1회로 복원한다"와 같은 이유 —
  // File Panel이 URL 입력에 초점을 가져간 상태로 Ctrl+Z를 누르면 입력
  // 필드의 네이티브 undo(빈 동작)만 소비한다. Escape로 패널을 닫아 초점을
  // 편집기로 되돌린 뒤에야 undo가 실제로 편집기 히스토리에 닿는다.
  await page.keyboard.press("Escape");
  await expect(editable).toBeFocused();

  await page.keyboard.press("Control+z");

  await expect(
    editable.locator('[data-geul-media-empty="iframe"]'),
  ).toHaveCount(0);
  await expect(editable.locator("p")).toHaveText("/iframe");
});
