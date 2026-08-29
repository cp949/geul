/**
 * Issue #38 슬라이스 4 RD-004 — CodeBlock의 demo 배선, plain source 스타일,
 * language combobox 실제 event·focus 순서와 Tab/Shift+Tab 브라우저 동작을
 * 검증한다. 저장형·revision·undo 계약은 core/react unit test가 소유한다.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { CLAMP_BOUNDARY_MIN_MARGIN_PX } from "./support/clamp.js";
import { openDemo } from "./support/demo.js";

/** Slash menu에서 현재 빈 블록을 CodeBlock으로 바꾸고 DOM 렌더를 기다린다. */
const insertCodeBlock = async (page: Page, editable: Locator) => {
  await editable.click();
  await page.keyboard.type("/code");
  await page.getByRole("option", { name: /Code/ }).click();
  const codeBlock = editable.locator("pre[data-be-code-block]");
  await expect(codeBlock).toBeVisible();
  return codeBlock;
};

/** fixed overlay가 네 viewport 경계의 공통 8px 여백 안에 있는지 확인한다. */
const expectInsideViewport = async (page: Page, overlay: Locator) => {
  await expect
    .poll(async () => {
      const box = await overlay.boundingBox();
      const viewport = page.viewportSize();
      if (box === null || viewport === null) return null;
      return {
        bottom:
          box.y + box.height <= viewport.height - CLAMP_BOUNDARY_MIN_MARGIN_PX,
        left: box.x >= CLAMP_BOUNDARY_MIN_MARGIN_PX,
        right:
          box.x + box.width <= viewport.width - CLAMP_BOUNDARY_MIN_MARGIN_PX,
        top: box.y >= CLAMP_BOUNDARY_MIN_MARGIN_PX,
      };
    })
    .toEqual({ bottom: true, left: true, right: true, top: true });
};

test("Slash /code는 빈 CodeBlock과 Code placeholder, plain monospace 스타일을 렌더한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const codeBlock = await insertCodeBlock(page, editable);
  const code = codeBlock.locator("code");

  await expect(code).toHaveText("");
  await expect(codeBlock).toHaveAttribute("data-placeholder", "Code");

  const style = await codeBlock.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      backgroundColor: computed.backgroundColor,
      borderStyle: computed.borderStyle,
      borderWidth: computed.borderWidth,
      fontFamily: computed.fontFamily,
      overflowX: computed.overflowX,
      paddingLeft: computed.paddingLeft,
      paddingTop: computed.paddingTop,
    };
  });
  expect(style.fontFamily.toLowerCase()).toContain("mono");
  expect(Number.parseFloat(style.paddingLeft)).toBeGreaterThan(0);
  expect(Number.parseFloat(style.paddingTop)).toBeGreaterThan(0);
  expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(style.borderStyle).toBe("solid");
  expect(Number.parseFloat(style.borderWidth)).toBeGreaterThan(0);
  expect(style.overflowX).toBe("auto");
});

test("블록 메뉴의 Code는 기존 source를 표시한 채 DOM을 CodeBlock으로 바꾼다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("const value = 1;");

  await editable.locator("p").hover();
  await page
    .getByRole("button", { name: "Drag to reorder, click for options" })
    .click();
  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu.getByRole("menuitem", { name: "Code" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Code" }).click();

  await expect(editable.locator("pre[data-be-code-block] code")).toHaveText(
    "const value = 1;",
  );
});

test("활성 CodeBlock의 블록 메뉴 Text를 실제 클릭해 source를 보존한 문단으로 되돌린다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const codeBlock = await insertCodeBlock(page, editable);
  await codeBlock.click();
  await page.keyboard.type("const answer = 42;");

  await codeBlock.hover();
  await page
    .getByRole("button", { name: "Drag to reorder, click for options" })
    .click();
  const menu = page.getByRole("menu", { name: "Block menu" });
  await menu.getByRole("menuitem", { name: "Text" }).click();

  await expect(editable.locator("pre[data-be-code-block]")).toHaveCount(0);
  await expect(editable.locator("p").first()).toHaveText("const answer = 42;");
});

test("language Enter alias와 실제 option click은 표시값을 canonicalize하고 편집기로 초점을 복구한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertCodeBlock(page, editable);
  const input = page.getByRole("combobox", { name: "Code language" });

  await input.fill("js");
  await input.press("Enter");
  await expect(input).toHaveValue("javascript");
  await expect(editable).toBeFocused();

  await input.focus();
  await input.fill("py");
  const python = page.getByRole("option", { name: /Python/ });
  await expect(python).toBeVisible();
  // locator.click()의 실제 pointerdown → mouseup → click 순서를 사용한다.
  await python.click();
  await expect(input).toHaveValue("python");
  await expect(editable).toBeFocused();
});

test("Escape는 language draft를 취소하고 편집기로 초점을 복구한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertCodeBlock(page, editable);
  const input = page.getByRole("combobox", { name: "Code language" });

  await input.fill("typescript");
  await input.press("Escape");

  await expect(input).toHaveValue("text");
  await expect(
    page.getByRole("listbox", { name: "Code language suggestions" }),
  ).toHaveCount(0);
  await expect(editable).toBeFocused();
});

test("language draft에서 Save JSON을 클릭하면 commit 없이 취소하고 Save 초점을 유지한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertCodeBlock(page, editable);
  const input = page.getByRole("combobox", { name: "Code language" });
  const save = page.getByRole("button", { name: "Save JSON" });

  await input.fill("typescript");
  await save.click();

  await expect(input).toHaveValue("text");
  await expect(save).toBeFocused();
});

test("CodeBlock의 Shift+Tab은 contenteditable 밖으로 순차 초점을 이동시킨다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const codeBlock = await insertCodeBlock(page, editable);
  // 빈 <code>는 자체 box가 0×0이므로 padding이 있는 <pre>를 클릭한다.
  await codeBlock.click();
  await expect(editable).toBeFocused();

  await page.keyboard.press("Shift+Tab");

  await expect(editable).not.toBeFocused();
  expect(
    await editable.evaluate(
      (element) =>
        element !== element.ownerDocument.activeElement &&
        !element.contains(element.ownerDocument.activeElement),
    ),
  ).toBe(true);
});

test("짧은 뷰포트에서 language suggestion 크기가 바뀌어도 네 경계 안에서 Markdown을 클릭할 수 있다 (PIT-0011)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 240 });
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("line 0");
  for (let index = 1; index < 20; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }
  await page.keyboard.press("Enter");
  await page.keyboard.type("/code");
  await page.getByRole("option", { name: /Code/ }).click();

  const input = page.getByRole("combobox", { name: "Code language" });
  const overlay = input.locator("xpath=../..");
  const suggestions = page.getByRole("listbox", {
    name: "Code language suggestions",
  });

  await input.fill("md");
  await expect(suggestions.getByRole("option")).toHaveCount(1);
  await expectInsideViewport(page, overlay);

  await input.fill("");
  await expect(suggestions.getByRole("option")).toHaveCount(12);
  await expectInsideViewport(page, overlay);

  await suggestions.getByRole("option", { name: /Markdown/ }).click();
  await expect(input).toHaveValue("markdown");
  await expect(editable).toBeFocused();
});

test("scroll과 viewport resize 뒤 language overlay가 활성 CodeBlock을 추적하고 200px 폭의 네 경계 안에 머문다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 320 });
  const { editable } = await openDemo(page);
  await editable.click();
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.type(`line ${index}`);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type("/code");
  await page.getByRole("option", { name: /Code/ }).click();

  const codeBlock = editable.locator("pre[data-be-code-block]");
  const overlay = page
    .getByRole("combobox", { name: "Code language" })
    .locator("xpath=../..");
  await page.evaluate(() => {
    document.body.style.paddingBottom = "1000px";
  });
  await codeBlock.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await expectInsideViewport(page, overlay);
  await expect
    .poll(async () => {
      const blockBox = await codeBlock.boundingBox();
      const overlayBox = await overlay.boundingBox();
      if (blockBox === null || overlayBox === null) return null;
      return Math.round(overlayBox.y - (blockBox.y + blockBox.height));
    })
    .toBe(0);

  await page.evaluate(() => window.scrollBy(0, -40));
  await expect
    .poll(async () => {
      const blockBox = await codeBlock.boundingBox();
      const overlayBox = await overlay.boundingBox();
      if (blockBox === null || overlayBox === null) return null;
      return Math.round(overlayBox.y - (blockBox.y + blockBox.height));
    })
    .toBe(0);

  await page.setViewportSize({ width: 200, height: 480 });
  await expectInsideViewport(page, overlay);
  await expect
    .poll(async () => {
      const blockBox = await codeBlock.boundingBox();
      const overlayBox = await overlay.boundingBox();
      if (blockBox === null || overlayBox === null) return null;
      return Math.round(overlayBox.y - (blockBox.y + blockBox.height));
    })
    .toBe(0);
});
