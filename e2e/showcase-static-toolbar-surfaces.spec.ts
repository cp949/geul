/**
 * Static toolbar 예제는 Kitchen sink(00-composite)의 표면 전부(서식 popover,
 * 링크 툴바, 슬래시 메뉴, 파일 패널, 미디어 툴바, 이모지 picker, 업로드,
 * 구문 강조)에 항상 보이는 StaticToolbar를 더한다(2026-10-02 사용자 요청).
 * 상단 툴바와 함께 둬도 각 표면이 실제로 동작하는지 확인한다.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

/**
 * 이 예제는 문단 40개가 채워진 문서다. 슬래시 메뉴·이모지 picker 같은 트리거
 * 팝업은 빈 문단에서 쓰므로 맨 끝에 빈 문단을 하나 만들어 캐럿을 둔다.
 */
const placeCaretInNewParagraph = async (page: Page, editable: Locator) => {
  await editable.locator("p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
};

test("글자를 선택하면 Add link로 링크를 만들 수 있다", async ({ page }) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });

  await editable.locator("p").first().dblclick();
  await page.getByRole("button", { name: "Add link" }).click();
  const linkInput = page.getByRole("textbox", { name: "Link URL" });
  await linkInput.fill("https://example.com");
  await linkInput.press("Enter");

  await expect(editable.locator("a")).toHaveAttribute(
    "href",
    "https://example.com",
  );
});

test("`:`로 이모지 picker가 열리고 선택하면 삽입된다", async ({ page }) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });

  await placeCaretInNewParagraph(page, editable);
  await page.keyboard.type(":smile");
  const menu = page.getByRole("listbox", { name: "Emoji picker" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(menu).toBeHidden();
  await expect(editable.locator("p").last()).not.toContainText(":smile");
});

test("Upload 탭에서 이미지를 올리면 data url로 렌더된다", async ({ page }) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });

  await placeCaretInNewParagraph(page, editable);
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).click();
  await page.getByRole("tab", { name: "Upload" }).click();
  await page
    .getByLabel("Image file")
    .setInputFiles("e2e/fixtures/resize-photo.png");
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByRole("status")).not.toBeVisible();

  await expect(editable.locator("img")).toHaveAttribute(
    "src",
    /^data:image\/png;base64,/,
  );
});

test("샘플을 불러오면 미리보기의 코드 블록이 구문 강조된다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");

  await page.getByRole("button", { name: "샘플 불러오기" }).click();

  await expect(
    page
      .locator('[aria-label="미리보기"] pre[data-geul-block-id] code')
      .locator('span[class*="hljs-"]')
      .first(),
  ).toBeVisible();
});
