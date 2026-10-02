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
