import { expect, test } from "@playwright/test";

import { CLAMP_BOUNDARY_MIN_MARGIN_PX } from "./support/clamp.js";
import { openDemo } from "./support/demo.js";
import { selectBlockTextAndNotify } from "./support/selection.js";

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

  const selectionBox = await selectBlockTextAndNotify(
    editable.locator("p").last(),
    "Last block",
  );
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
    .toBeLessThanOrEqual(
      (viewportSize?.height ?? 0) - CLAMP_BOUNDARY_MIN_MARGIN_PX,
    );

  // 클램프가 없으면 Add link 버튼이 뷰포트 밖으로 나가 클릭이 "element is
  // outside of the viewport"로 타임아웃한다(PIT-0011 실측 시나리오).
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByRole("textbox", { name: "Link URL" })).toBeVisible();
});

test("view에서 editing으로 바뀌며 툴바 폭이 커져도 뷰포트 오른쪽을 넘지 않는다 (PIT-0011)", async ({
  page,
}) => {
  // editing 모드 툴바(입력 224px + Save/Cancel, 약 350px)는 들어가되 본문
  // 오른쪽 끝이 뷰포트 오른쪽 여백에 닿도록 뷰포트를 좁힌다.
  const viewportWidth = 900;
  await page.setViewportSize({ height: 720, width: viewportWidth });

  const { editable } = await openDemo(page);
  await editable.click();
  // 한 글자 + 공백을 반복해 줄 끝 들쭉날쭉함을 최소화한다 — 오른쪽 끝에
  // 최대한 가까운 선택 지점을 만들기 위한 것이다.
  await page.keyboard.type("e ".repeat(160));

  // 줄 오른쪽 끝 글자 하나만 선택한다. LinkToolbar의 앵커(left)는 선택
  // 영역의 가로 중앙이므로, 이 선택에서만 view 모드 클램프가 실제로 걸린다.
  await editable
    .locator("p")
    .first()
    .evaluate((block: HTMLParagraphElement) => {
      const text = block.firstChild;
      if (text === null) throw new Error("First block has no text");
      const range = document.createRange();
      let bestIndex = 0;
      let bestCenter = Number.NEGATIVE_INFINITY;
      const length = text.textContent?.length ?? 0;
      for (let index = 0; index < length; index += 1) {
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        const rect = range.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        if (center > bestCenter) {
          bestCenter = center;
          bestIndex = index;
        }
      }
      range.setStart(text, bestIndex);
      range.setEnd(text, bestIndex + 1);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });

  const toolbar = page.getByRole("toolbar", { name: "Link" });
  await expect(toolbar).toBeVisible();

  // view 모드에서는 이미 클램프가 걸려 뷰포트 안에 있다.
  const viewBox = await toolbar.boundingBox();
  expect(viewBox).not.toBeNull();
  expect(viewBox?.x ?? -1).toBeGreaterThanOrEqual(CLAMP_BOUNDARY_MIN_MARGIN_PX);
  expect((viewBox?.x ?? 0) + (viewBox?.width ?? 0)).toBeLessThanOrEqual(
    viewportWidth - CLAMP_BOUNDARY_MIN_MARGIN_PX,
  );

  await page.getByRole("button", { name: "Add link" }).click();
  const linkInput = page.getByRole("textbox", { name: "Link URL" });
  await expect(linkInput).toBeVisible();

  // editing 모드로 박스가 약 80px -> 350px로 커진다. centerBelow 앵커라
  // 증가폭의 절반이 오른쪽으로 밀리므로, 크기 변화를 다시 클램프하지 않으면
  // 뷰포트 오른쪽으로 넘쳐 나간다(PIT-0011).
  await expect
    .poll(async () => {
      const box = await toolbar.boundingBox();
      if (box === null) return Number.POSITIVE_INFINITY;
      return box.x + box.width;
    })
    .toBeLessThanOrEqual(viewportWidth - CLAMP_BOUNDARY_MIN_MARGIN_PX);
  const editingBox = await toolbar.boundingBox();
  expect(editingBox?.x ?? -1).toBeGreaterThanOrEqual(
    CLAMP_BOUNDARY_MIN_MARGIN_PX,
  );

  // 넘친 상태에서는 입력이 뷰포트 밖에 있어 fill 자체가 실패한다.
  await linkInput.fill("https://example.com");
  await expect(linkInput).toHaveValue("https://example.com");
});
