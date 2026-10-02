/**
 * Static toolbar 예제는 항상 보이는 StaticToolbar와 함께, 글자를 선택하면
 * 뜨는 서식 popover(FormattingToolbar)를 둔다. 기존 게시판 에디터식 상단
 * 툴바와 선택 시 popover를 둘 다 쓰는 사용 방식을 시연한다(2026-10-02
 * 사용자 요청).
 */
import { expect, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

test("글자를 선택하면 서식 popover가 뜨고, 선택을 풀면 사라진다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const popover = page.getByRole("toolbar", { name: "Formatting" });

  await expect(popover).toBeHidden();

  await editable.locator("p").first().dblclick();
  await expect(popover).toBeVisible();

  await editable.locator("p").nth(3).click();
  await expect(popover).toBeHidden();
});

test("popover에서 Bold를 누르면 선택한 글자에 적용되고 상단 툴바 상태도 따라간다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });

  await editable.locator("p").first().dblclick();
  await page
    .getByRole("toolbar", { name: "Formatting" })
    .getByRole("button", { name: "Bold" })
    .click();

  await expect(editable.locator("strong")).toHaveCount(1);
  await expect(
    page
      .getByRole("toolbar", { name: "Toolbar", exact: true })
      .getByRole("button", { name: "Bold" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("첫 줄을 선택해도 popover가 sticky 툴바에 가려지지 않는다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const popover = page.getByRole("toolbar", { name: "Formatting" });

  // 첫 문단은 스크롤 영역 맨 위라 popover(선택 위쪽에 붙는다)가 sticky
  // 툴바 띠와 겹친다. 겹치더라도 popover가 위에 그려져야 한다 — 위쪽
  // 가장자리가 먼저 가려지므로 그 지점을 본다.
  await editable.locator("p").first().dblclick();
  await expect(popover).toBeVisible();

  const box = await popover.boundingBox();
  if (box === null) throw new Error("popover bounding box 없음");
  const toolbarBox = await page
    .getByRole("toolbar", { name: "Toolbar", exact: true })
    .boundingBox();
  if (toolbarBox === null) throw new Error("StaticToolbar bounding box 없음");
  // 전제 확인: 이 시나리오에서 두 툴바가 실제로 겹친다.
  expect(box.y).toBeLessThan(toolbarBox.y + toolbarBox.height);

  const topEdgeIsPopover = await page.evaluate(
    ({ x, y }) =>
      document
        .elementFromPoint(x, y)
        ?.closest("[role='toolbar'][aria-label='Formatting']") !== null,
    { x: box.x + box.width / 2, y: box.y + 2 },
  );
  expect(topEdgeIsPopover).toBe(true);
});
