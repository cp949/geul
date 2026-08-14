import { expect, test } from "@playwright/test";

const openDemo = async (page: Parameters<typeof test>[0]["page"]) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  return { editor, editable };
};

test("shows the formatting toolbar only while text is selected", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const toolbar = page.getByRole("toolbar", { name: "Formatting" });

  await expect(toolbar).not.toBeVisible();

  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");
  await expect(toolbar).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(toolbar).not.toBeVisible();
});

test("toggles bold and underline on the selected text without losing the selection", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  await page.getByRole("button", { name: "Bold" }).click();
  await expect(editable.locator("strong")).toHaveText("Hello R1");
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "Underline" }).click();
  await expect(editable.locator("strong u, u strong")).toHaveText("Hello R1");

  await page.getByRole("button", { name: "Bold" }).click();
  await expect(editable.locator("strong")).toHaveCount(0);
  await expect(editable.locator("u")).toHaveText("Hello R1");
});

test("toggles strikethrough and inline code on the selected text", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  await page.getByRole("button", { name: "Strikethrough" }).click();
  await expect(editable.locator("s")).toHaveText("Hello R1");
  await expect(
    page.getByRole("button", { name: "Strikethrough" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Strikethrough" }).click();
  await expect(editable.locator("s")).toHaveCount(0);

  await page.getByRole("button", { name: "Inline code" }).click();
  await expect(editable.locator("code")).toHaveText("Hello R1");
  await expect(
    page.getByRole("button", { name: "Inline code" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("undoes a mark toggle as one unit", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  await page.getByRole("button", { name: "Italic" }).click();
  await expect(editable.locator("em")).toHaveText("Hello R1");

  await page.keyboard.press("Control+z");
  await expect(editable.locator("em")).toHaveCount(0);
  await expect(editable).toHaveText("Hello R1");
});

test("positions the toolbar next to the selected text", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("first");
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }

  const selectionBox = await editable
    .locator("p")
    .last()
    .evaluate((block) => {
      const text = block.firstChild;
      if (text === null) throw new Error("Last block has no text");
      const range = document.createRange();
      range.selectNodeContents(text);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return range.getBoundingClientRect().toJSON();
    });
  const toolbarBox = await page
    .getByRole("toolbar", { name: "Formatting" })
    .boundingBox();

  expect(toolbarBox).not.toBeNull();
  expect(
    Math.abs((toolbarBox?.y ?? 0) + (toolbarBox?.height ?? 0) - selectionBox.y),
  ).toBeLessThan(24);

  await page.evaluate(() => window.scrollBy(0, 200));
  await expect
    .poll(async () => {
      const scrolledSelectionBox = await page.evaluate(() =>
        document.getSelection()?.getRangeAt(0).getBoundingClientRect().toJSON(),
      );
      const scrolledToolbarBox = await page
        .getByRole("toolbar", { name: "Formatting" })
        .boundingBox();
      if (scrolledSelectionBox === undefined || scrolledToolbarBox === null) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(
        scrolledToolbarBox.y +
          scrolledToolbarBox.height -
          scrolledSelectionBox.y,
      );
    })
    .toBeLessThan(24);
});
