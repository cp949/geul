/**
 * Callout 블록(Issue #209, BLK-020)의 색상 프리셋 원자적 세팅과 아이콘
 * 클릭 교체를 실제 Chromium 레이아웃으로 검증한다. 블록 레벨 backgroundColor
 * 반영은 block-handle.spec.ts와 같은 이유로 "Save JSON"으로 읽은 문서
 * 값을 단언한다(편집 화면에 시각 렌더 확인은 별도 수동 QA 영역).
 */
import { expect, test } from "@playwright/test";

import { openDemo } from "./support/demo.js";

const readSavedDocument = async (
  page: Parameters<typeof openDemo>[0],
): Promise<{
  blocks: { id: string; type: string; [key: string]: unknown }[];
}> => {
  const source = page.getByLabel("Document source");
  await page.getByRole("button", { name: "Save JSON" }).click();
  return JSON.parse(await source.inputValue());
};

test("Slash 메뉴로 Callout을 만들 수 있다 @core", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/callout");

  await page.getByRole("option", { name: "Callout" }).click();

  const applied = await readSavedDocument(page);
  expect(applied.blocks[0]?.type).toBe("callout");
});

test("블록 메뉴의 색상 프리셋이 icon+backgroundColor를 원자적으로 세팅하고 undo 1회로 복원된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/callout");
  await page.getByRole("option", { name: "Callout" }).click();
  await editable.locator("[data-geul-callout]").click();
  await page.keyboard.type("주의하세요");

  await editable.locator("[data-geul-callout]").hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();
  await page.getByRole("menuitem", { name: "Warning" }).click();

  const applied = await readSavedDocument(page);
  expect(applied.blocks[0]).toMatchObject({
    type: "callout",
    icon: "⚠️",
    backgroundColor: "#FEF7E0",
  });

  await page.keyboard.press("Control+z");
  const reverted = await readSavedDocument(page);
  expect(reverted.blocks[0]?.icon).toBeUndefined();
  expect(reverted.blocks[0]?.backgroundColor).toBeUndefined();
});

test("아이콘 클릭으로 임의 이모지를 교체한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/callout");
  await page.getByRole("option", { name: "Callout" }).click();

  await editable.locator("[data-geul-callout]").hover();
  await page.getByRole("button", { name: "Change callout icon" }).click();

  const grid = page.getByRole("listbox", { name: "Callout icon picker" });
  await expect(grid).toBeVisible();
  const firstOption = grid.getByRole("option").first();
  const char = await firstOption.textContent();
  await firstOption.click();

  await expect(grid).not.toBeVisible();
  const applied = await readSavedDocument(page);
  expect(applied.blocks[0]).toMatchObject({ type: "callout", icon: char });
});
