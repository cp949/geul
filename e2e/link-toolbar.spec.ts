import { expect, test } from "@playwright/test";

const openDemo = async (page: Parameters<typeof test>[0]["page"]) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  return { editor, editable };
};

test("선택 텍스트에 링크를 만들고 undo 1회로 복원한다 @core", async ({
  page,
}) => {
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

test("선택 영역이 뷰포트 하단에 붙어 있어도 Add link 버튼을 클릭할 수 있다 (PIT-0011)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("first");
  for (let index = 0; index < 25; index += 1) {
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
  const viewportSize = page.viewportSize();
  expect(viewportSize).not.toBeNull();

  // 마지막 줄이 뷰포트 맨 아래(경계에서 2px)에 붙도록 정확히 그만큼만
  // 스크롤한다 — LinkToolbar는 선택 아래(top: bounds.bottom)에 뜨므로,
  // 클램프가 없으면 이 위치에서 뷰포트 밖으로 밀려난다(PIT-0011).
  const delta =
    selectionBox.y + selectionBox.height - (viewportSize?.height ?? 0) + 2;
  await page.evaluate((value) => window.scrollBy(0, value), delta);

  const toolbar = page.getByRole("toolbar", { name: "Link" });
  await expect(toolbar).toBeVisible();
  await expect
    .poll(async () => {
      const box = await toolbar.boundingBox();
      if (box === null) return Number.POSITIVE_INFINITY;
      return box.y + box.height;
    })
    .toBeLessThanOrEqual((viewportSize?.height ?? 0) - 2);

  // 클램프가 없으면 Add link 버튼이 뷰포트 밖으로 나가 클릭이 "element is
  // outside of the viewport"로 타임아웃한다(PIT-0011 실측 시나리오).
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByRole("textbox", { name: "Link URL" })).toBeVisible();
});
