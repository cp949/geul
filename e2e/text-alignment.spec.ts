/**
 * 텍스트 블록 정렬이 편집 화면에 보이는지 Chromium computed style로 검증한다
 * (Issue #424 RD-003, D1).
 *
 * - 정렬은 blockContent 노드(p·h2 등)에 걸린다. container에는 걸리지 않아 자식
 *   블록이 부모 정렬을 상속하지 않는다.
 * - 정렬은 화면 표시일 뿐이라 저장 JSON(`Save JSON`)에는 `textAlignment`만 남는다.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import { openDemo } from "./support/demo.js";

const documentWithAlignments = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "parent",
      type: "paragraph",
      content: [{ text: "parent" }],
      textAlignment: "center",
      children: [
        { id: "child", type: "paragraph", content: [{ text: "child" }] },
      ],
    },
    {
      id: "right",
      type: "heading",
      level: 2,
      content: [{ text: "right" }],
      textAlignment: "right",
    },
    {
      id: "justify",
      type: "paragraph",
      content: [{ text: "justify" }],
      textAlignment: "justify",
    },
    {
      id: "bullet",
      type: "bulletListItem",
      content: [{ text: "bullet" }],
      textAlignment: "center",
    },
    { id: "plain", type: "paragraph", content: [{ text: "plain" }] },
  ],
};

const loadDocument = async (page: Page): Promise<Locator> => {
  const { editable } = await openDemo(page);
  await page
    .getByLabel("Document source")
    .fill(JSON.stringify(documentWithAlignments));
  await page.getByRole("button", { name: "Load JSON" }).click();
  await expect(editable.locator('[data-geul-block-id="plain"]')).toHaveCount(1);
  return editable;
};

/** blockContent(container의 첫 자식)의 computed text-align이다. */
const computedAlign = (editable: Locator, blockId: string): Promise<string> =>
  editable
    .locator(`[data-geul-block-id="${blockId}"] > *:first-child`)
    .evaluate((element) => getComputedStyle(element).textAlign);

test("저장된 정렬이 편집 화면 computed text-align으로 보인다", async ({
  page,
}) => {
  const editable = await loadDocument(page);

  expect(await computedAlign(editable, "parent")).toBe("center");
  expect(await computedAlign(editable, "right")).toBe("right");
  expect(await computedAlign(editable, "justify")).toBe("justify");
  expect(await computedAlign(editable, "bullet")).toBe("center");
  expect(await computedAlign(editable, "plain")).toBe("start");
});

test("자식 블록은 부모 정렬을 상속하지 않는다", async ({ page }) => {
  const editable = await loadDocument(page);

  expect(await computedAlign(editable, "parent")).toBe("center");
  expect(await computedAlign(editable, "child")).toBe("start");
  // container와 자식 group에도 정렬이 걸리지 않아야 상속이 생기지 않는다.
  const containerAlign = await editable
    .locator('[data-geul-block-id="parent"]')
    .evaluate((element) => getComputedStyle(element).textAlign);
  expect(containerAlign).toBe("start");
});

test("블록 메뉴로 정렬을 바꾸면 화면이 즉시 바뀌고 해제하면 돌아간다", async ({
  page,
}) => {
  const editable = await loadDocument(page);
  expect(await computedAlign(editable, "plain")).toBe("start");

  await editable.locator('[data-geul-block-id="plain"] > p').hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();
  await page.getByRole("menuitem", { name: "Align center" }).click();
  expect(await computedAlign(editable, "plain")).toBe("center");

  await page.getByRole("menuitem", { name: "Align none" }).click();
  expect(await computedAlign(editable, "plain")).toBe("start");
});

test("justify 블록은 메뉴를 열고 닫아도 저장값이 유지된다", async ({
  page,
}) => {
  const editable = await loadDocument(page);

  await editable.locator('[data-geul-block-id="justify"] > p').hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();
  await page.keyboard.press("Escape");

  const source = page.getByLabel("Document source");
  await page.getByRole("button", { name: "Save JSON" }).click();
  const saved = JSON.parse(await source.inputValue());
  const justify = saved.blocks.find(
    (block: { id: string }) => block.id === "justify",
  );
  expect(justify.textAlignment).toBe("justify");
  expect(await computedAlign(editable, "justify")).toBe("justify");
});
