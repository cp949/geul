import { expect, test } from "@playwright/test";

const openDemo = async (page: Parameters<typeof test>[0]["page"]) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  return { editor, editable };
};

test("텍스트가 선택된 동안에만 서식 툴바를 표시한다", async ({ page }) => {
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

test("선택을 잃지 않고 선택 텍스트의 굵게와 밑줄을 토글한다", async ({
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

test("선택 텍스트의 취소선과 인라인 코드를 토글한다", async ({ page }) => {
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

test("키보드만으로 굵게 버튼에 도달해 토글한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  const bold = page.getByRole("button", { name: "Bold" });
  await expect(bold).toBeVisible();

  // programmatic .focus()는 버튼이 tabindex=-1이어도 통과하므로 실제 Shift+Tab
  // 입력으로 도달성을 gate한다. 데모 DOM에서 툴바가 에디터보다 앞에 있어
  // 역방향 Tab으로 도달한다.
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press("Shift+Tab");
    const focused = await bold.evaluate(
      (element) => element === element.ownerDocument.activeElement,
    );
    if (focused) break;
  }
  await expect(bold).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(editable.locator("strong")).toHaveText("Hello R1");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
});

test("소비자 전역 CSS가 lucide 클래스를 겨냥해도 아이콘 크기가 16px로 유지된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  // 소비자 앱이 자기 lucide 아이콘을 전역 CSS로 스타일링하는 상황을 재현한다.
  // geul 내부 아이콘은 inline style 방어로 영향을 받지 않아야 한다.
  await page.addStyleTag({
    content: ".lucide { width: 3rem; height: 3rem; } svg { width: 2rem; }",
  });
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  const icon = page.getByRole("button", { name: "Bold" }).locator("svg");
  await expect(icon).toBeVisible();
  const box = await icon.boundingBox();
  expect(box?.width).toBe(16);
  expect(box?.height).toBe(16);
});

test("mark 토글을 undo 1회로 복원한다", async ({ page }) => {
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

test("툴바를 선택한 텍스트 옆에 배치한다", async ({ page }) => {
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
