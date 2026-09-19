/**
 * iframe 블록(CUS-001~004, roadmap Issue #212) — 리사이즈/정렬/Interact
 * 토글/새 창 열기/복제/삭제(RD-004 완료 조건 2). `media-resize-handle.spec.ts`/
 * `media-toolbar.spec.ts`/`media-handle-overlays.tsx`가 이미 고정한 generic
 * 계약(중심 고정 대칭 리사이즈, 64px clamp, more 메뉴 구조, 그립 메뉴
 * Duplicate/Delete)을 재검증하지 않는다 — iframe kind가 이 기존 계약에
 * 실제로 연결됐는지, 그리고 iframe 전용 신규 UI(Interact 토글, "새 창에서
 * 열기")가 실제 Chromium event 순서로 동작하는지만 확인한다.
 */
import { expect, type Page, test } from "@playwright/test";

import { insertFilledIframe, openDemo } from "./support/demo.js";
import { beginDrag, dragTo } from "./support/media-resize.js";

/** media-toolbar.spec.ts의 openMoreMenu와 동형 — kind 무관 `⋯` 트리거. */
const openMoreMenu = (page: Page) =>
  page.getByRole("button", { name: "More media options" }).click();

test("오른쪽 핸들을 dx만큼 끌면 iframe 폭이 2*dx만큼 커진다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const iframe = await insertFilledIframe(page, editable);
  // DEFAULT_IFRAME_WIDTH_PX(core, iframe-block-extension.ts) — previewWidth
  // 미설정 시 기본값.
  await expect(iframe).toHaveAttribute("style", /width:\s*640px/);

  const dx = 40;
  const start = await beginDrag(
    page,
    page.locator('[data-geul-media-resize-handle="right"]'),
  );
  await dragTo(page, start, dx);
  await expect(iframe).toHaveAttribute("style", /width:\s*720px/);
  await page.mouse.up();

  await page.keyboard.press("Control+z");
  await expect(iframe).toHaveAttribute("style", /width:\s*640px/);
});

test("왼쪽으로 한참 끌어도 64px 밑으로 내려가지 않는다", async ({ page }) => {
  const { editable } = await openDemo(page);
  const iframe = await insertFilledIframe(page, editable);

  const start = await beginDrag(
    page,
    page.locator('[data-geul-media-resize-handle="right"]'),
  );
  await dragTo(page, start, -9999);

  await expect(iframe).toHaveAttribute("style", /width:\s*64px/);
});

test("more 메뉴에 정렬 항목이 노출되고 클릭하면 aria-checked가 반영되며 undo로 복원된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledIframe(page, editable);

  await openMoreMenu(page);
  const centerItem = page.getByRole("menuitemcheckbox", {
    name: "Align center",
  });
  await expect(centerItem).toHaveAttribute("aria-checked", "false");

  await centerItem.click();
  await expect(centerItem).toHaveAttribute("aria-checked", "true");

  await page.keyboard.press("Control+z");
  await expect(centerItem).toHaveAttribute("aria-checked", "false");
});

test("Interact 버튼을 누르면 iframe이 pointer-events:auto로 전환되고 바깥을 클릭하면 원복된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const iframe = await insertFilledIframe(page, editable);
  // Media toolbar를 열어 둔 채로는 바깥 클릭 판정에 toolbar 자체가 걸릴 수
  // 있어(ADR-0013 allow-list) 먼저 닫는다.
  await page.keyboard.press("Escape");

  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("iframe") });
  await wrapper.hover();
  const interactButton = page.getByRole("button", {
    name: "Interact with embedded content",
  });
  await expect(interactButton).toBeVisible();
  await expect(interactButton).toHaveAttribute("aria-pressed", "false");

  await interactButton.click();
  await expect(interactButton).toHaveAttribute("aria-pressed", "true");
  await expect(iframe).toHaveAttribute("data-geul-iframe-interactive", "true");

  // 편집기 안의 다른 지점(트레일링 문단)을 클릭한다 — capture-phase 1회성
  // 바깥 클릭 리스너(media-handle-overlays.tsx)가 원복해야 한다.
  await editable.locator("p").first().click();

  await expect(iframe).not.toHaveAttribute(
    "data-geul-iframe-interactive",
    "true",
  );
});

test("새 창에서 열기를 클릭하면 iframe URL로 새 탭이 열린다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledIframe(page, editable);

  await openMoreMenu(page);
  const openInNewTab = page.getByRole("menuitem", {
    name: "Open in new tab",
  });
  await expect(openInNewTab).toHaveAttribute(
    "href",
    "https://example.com/embed",
  );

  const popupPromise = page.waitForEvent("popup");
  await openInNewTab.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/example\.com\/embed$/);
  await popup.close();
});

test("복제하면 iframe이 하나 더 생기고 undo 1회로 복원된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledIframe(page, editable, "https://example.com/dup");
  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("iframe") });

  await wrapper.hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();

  await expect(editable.locator("iframe")).toHaveCount(2);
  await expect(editable.locator("iframe").nth(1)).toHaveAttribute(
    "src",
    "https://example.com/dup",
  );

  await page.keyboard.press("Control+z");
  await expect(editable.locator("iframe")).toHaveCount(1);
});

test("Delete하면 iframe 블록이 사라지고 undo 1회로 복원된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledIframe(page, editable);
  await expect(editable.locator("iframe")).toHaveCount(1);

  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "Delete media block" }).click();

  await expect(editable.locator("iframe")).toHaveCount(0);
  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).not.toBeVisible();

  await page.keyboard.press("Control+z");
  await expect(editable.locator("iframe")).toHaveCount(1);
});
