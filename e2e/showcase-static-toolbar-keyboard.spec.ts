/**
 * StaticToolbar의 roving tabindex와 키보드 이동을 실제 브라우저에서
 * 확인한다(RD-003-DELTA-03, Issue #218 결함 6, spec §5).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - Tab 키가 포커스를 어디로 옮기는지는 브라우저의 탭 순서가 결정한다.
 *   `tabindex` 속성 값만으로는 "정지점 1개"를 증명하지 못한다.
 * - 화살표·Escape 뒤 포커스 위치와 `aria-disabled` 컨트롤의 포커스 수용은
 *   jsdom이 네이티브 포커스 이동을 구현하지 않는 부분과 겹친다.
 * 이동 규칙의 세부(수식 키, ArrowUp/Down 무시, override 경로)는 단위
 * 테스트(static-toolbar-roving.test.tsx)가 소유한다.
 */
import { expect, test, type Page } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";
import { yieldFrame } from "./support/yield-frame.js";

/** 예제를 열고 툴바 직계 컨트롤을 돌려준다. */
const openToolbar = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const toolbar = page.getByRole("toolbar", { name: "Toolbar" });
  await expect(toolbar).toBeVisible();
  const controls = toolbar.locator(":scope > button");
  return {
    toolbar,
    controls,
    first: controls.first(),
    last: controls.last(),
    editorInput: page
      .getByRole("textbox", { name: "Editor" })
      .locator('[contenteditable="true"]'),
  };
};

test("툴바 안에서 tabindex=0인 컨트롤은 하나뿐이다", async ({ page }) => {
  const { controls, first } = await openToolbar(page);

  await expect(controls).toHaveCount(17);
  await expect(controls.and(page.locator('[tabindex="0"]'))).toHaveCount(1);
  await expect(first).toHaveAttribute("tabindex", "0");
  await expect(controls.and(page.locator('[tabindex="-1"]'))).toHaveCount(16);
});

test("실제 Tab은 툴바 컨트롤 하나만 거치고 Shift+Tab은 같은 컨트롤로 돌아온다", async ({
  page,
}) => {
  const { toolbar, controls, first } = await openToolbar(page);
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const stop = controls.nth(2);
  await expect(stop).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(toolbar.locator(":focus")).toHaveCount(0);

  await page.keyboard.press("Shift+Tab");
  await expect(stop).toBeFocused();
  await expect(stop).toHaveAttribute("tabindex", "0");
  await expect(controls.and(page.locator('[tabindex="0"]'))).toHaveCount(1);
});

test("ArrowRight·ArrowLeft는 순환하고 Home·End는 처음과 끝으로 간다", async ({
  page,
}) => {
  const { controls, first, last } = await openToolbar(page);
  await first.focus();

  await page.keyboard.press("ArrowRight");
  await expect(controls.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(last).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(first).toBeFocused();
  await page.keyboard.press("End");
  await expect(last).toBeFocused();
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
});

test("대상 블록이 없을 때 aria-disabled 컨트롤도 화살표로 포커스를 받는다", async ({
  page,
}) => {
  const { controls, first } = await openToolbar(page);
  const editable = page.getByRole("textbox", { name: "Editor" });
  await editable.locator("p").first().click();
  await page.keyboard.press("End");
  // ProseMirror는 클릭한 selection을 selectionchange 뒤 비동기로 반영한다.
  // 그 전에 Shift+ArrowDown을 보내면 이전 selection에서 확장된다. 한 프레임과
  // 한 macrotask를 양보한다(showcase-static-toolbar-block-controls.spec.ts와
  // 같은 패턴).
  await yieldFrame(page);
  await page.keyboard.press("Shift+ArrowDown");
  await expect(first).toHaveAttribute("aria-disabled", "true");

  await first.focus();
  await page.keyboard.press("ArrowRight");

  await expect(controls.nth(1)).toBeFocused();
  await expect(controls.nth(1)).toHaveAttribute("aria-disabled", "true");
});

test("툴바 컨트롤에서 Escape를 누르면 편집기가 포커스를 받는다", async ({
  page,
}) => {
  const { controls, editorInput } = await openToolbar(page);
  await controls.nth(10).focus();
  await expect(controls.nth(10)).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(editorInput).toBeFocused();
});
