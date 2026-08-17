import { expect, test } from "@playwright/test";

const openDemo = async (page: Parameters<typeof test>[0]["page"]) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  return { editor, editable };
};

test("선택 텍스트에 링크를 만들고 undo 1회로 복원한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  await page.getByRole("button", { name: "Add link" }).click();
  const linkInput = page.getByRole("textbox", { name: "Link URL" });
  await linkInput.pressSequentially("https://example.com");
  await expect(linkInput).toHaveValue("https://example.com");
  await page.getByRole("button", { name: "Save link" }).click();

  await expect(editable).toBeFocused();
  await expect(editable.locator("a")).toHaveAttribute(
    "href",
    "https://example.com",
  );
  await expect(editable.locator("a")).toHaveText("Hello R1");

  await page.keyboard.press("Control+z");
  await expect(editable.locator("a")).toHaveCount(0);
  await expect(editable).toHaveText("Hello R1");
});

test("collapsed 커서에서 기존 링크를 편집하고 제거한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");
  await page.getByRole("button", { name: "Add link" }).click();
  await page.getByRole("textbox", { name: "Link URL" }).fill("/opened");
  await page.getByRole("button", { name: "Save link" }).click();
  await expect(editable.locator("a")).toHaveAttribute("href", "/opened");

  await editable.locator("a").click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("toolbar", { name: "Link" })).toBeVisible();
  const openLink = page.getByRole("link", { name: "Open link" });
  await expect(openLink).toHaveAttribute("href", "/opened");
  const popupPromise = page.waitForEvent("popup");
  await openLink.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/opened$/);
  await popup.close();

  await page.getByRole("button", { name: "Edit link" }).click();
  await page
    .getByRole("textbox", { name: "Link URL" })
    .fill("https://updated.example.com");
  await page.getByRole("button", { name: "Save link" }).click();
  await expect(editable.locator("a")).toHaveAttribute(
    "href",
    "https://updated.example.com",
  );

  await editable.locator("a").click();
  await page.getByRole("button", { name: "Remove link" }).click();
  await expect(editable.locator("a")).toHaveCount(0);
  await expect(editable).toHaveText("Hello R1");
});

test("허용되지 않는 링크 URL을 거부하고 문서를 그대로 둔다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  await page.getByRole("button", { name: "Add link" }).click();
  await page
    .getByRole("textbox", { name: "Link URL" })
    .fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save link" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(editable.locator("a")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Link URL" })).toBeVisible();
});
