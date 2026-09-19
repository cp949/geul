/**
 * Callout 블록(Issue #209, BLK-020)의 색상 프리셋 원자적 세팅과 아이콘
 * 클릭 교체를 실제 Chromium 레이아웃으로 검증한다. 모델 반영은
 * block-handle.spec.ts와 같은 이유로 "Save JSON"으로 읽은 문서 값을
 * 단언한다. backgroundColor의 편집 화면 시각 렌더는 일반 텍스트 블록
 * 7종과 달리(RD-003 D5, block-handle.spec.ts:596-598 — 그쪽은 여전히
 * 수동 QA 영역) callout만 CalloutBackgroundPresentationExtension이
 * decoration으로 얹는다(2026-09-19 사용자 보고로 발견한 결함 수정,
 * packages/core/test/callout-background-presentation.test.ts가 unit
 * 계약을 고정) — 여기서는 실제 Chromium computed style로 이중 확인한다.
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

  // 기본 카드 배경(_callout.scss --geul-color-surface-muted 대체값
  // #f1f3f4)이 backgroundColor 미설정 상태의 기준값이다 — 투명이 아니다.
  const callout = editable.locator("[data-geul-callout]");
  await expect(callout).toHaveCSS("background-color", "rgb(241, 243, 244)");

  await callout.hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();
  await page.getByRole("menuitem", { name: "Warning" }).click();

  const applied = await readSavedDocument(page);
  expect(applied.blocks[0]).toMatchObject({
    type: "callout",
    icon: "⚠️",
    backgroundColor: "#FEF7E0",
  });
  await expect(callout).toHaveCSS("background-color", "rgb(254, 247, 224)");

  await page.keyboard.press("Control+z");
  const reverted = await readSavedDocument(page);
  expect(reverted.blocks[0]?.icon).toBeUndefined();
  expect(reverted.blocks[0]?.backgroundColor).toBeUndefined();
  await expect(callout).toHaveCSS("background-color", "rgb(241, 243, 244)");
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
