/**
 * Issue #38 슬라이스 4 RD-004 — CodeBlock의 demo 배선, plain source 스타일,
 * language 트리거·팝오버 실제 event·focus 순서와 Tab/Shift+Tab 브라우저
 * 동작을 검증한다. 저장형·revision·undo 계약은 core/react unit test가
 * 소유한다.
 * 슬라이스 9 RD-003 DELTA-01 — 펜스(```lang) native shorthand의 실제 브라우저
 * 타이핑 경로(keydown→composition→input→DOM mutation)도 이 파일이 검증한다
 * (ADR-0007, RD-003.md "결정" (c)). 입력 규칙 로직 자체는 core 유닛 테스트
 * (block-type-input-rule-extension.test.ts)가 소유한다.
 * Issue #173(RD-002, roadmap "코드블록 언어 선택기 UX 개편") — language
 * combobox(입력=표시값)를 트리거 button + 팝오버(검색 input 분리)로
 * 바꿨다. 이전 "다음 블록 겹침 회피(뒤집기)" 동작은 폐기했다 — 트리거는
 * 코드블록 자신의 우상단에 작게 앵커링돼 아래 블록을 덮지 않는다
 * (RD-002.md "결정").
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { CLAMP_BOUNDARY_MIN_MARGIN_PX } from "./support/clamp.js";
import { openDemo } from "./support/demo.js";

/** Slash menu에서 현재 빈 블록을 CodeBlock으로 바꾸고 DOM 렌더를 기다린다. */
const insertCodeBlock = async (page: Page, editable: Locator) => {
  await editable.click();
  await page.keyboard.type("/code");
  await page.getByRole("option", { name: /Code/ }).click();
  const codeBlock = editable.locator("pre[data-geul-code-block]");
  await expect(codeBlock).toBeVisible();
  return codeBlock;
};

/** language 검색 팝오버를 연다(트리거 클릭) 후 검색 input을 반환한다. */
const openLanguagePopover = async (page: Page): Promise<Locator> => {
  await page.getByRole("button", { name: "Code language" }).click();
  return page.getByRole("combobox", { name: "Search for a language" });
};

/**
 * 트리거가 활성 CodeBlock의 우상단 모서리에 붙어 있는지 poll로 확인한다
 * (topRight anchor — use-clamped-menu-position.ts). 뷰포트 clamp가
 * 개입하지 않는 범위(블록이 화면 가장자리에 바짝 붙지 않은 경우)에서만
 * 정확히 0으로 맞는다 — clamp 경계 확인은 `expectInsideViewport`가 한다.
 */
const expectTriggerAtBlockTopRight = async (
  codeBlock: Locator,
  trigger: Locator,
) => {
  await expect
    .poll(async () => {
      const blockBox = await codeBlock.boundingBox();
      const triggerBox = await trigger.boundingBox();
      if (blockBox === null || triggerBox === null) return null;
      return {
        right: Math.round(
          blockBox.x + blockBox.width - (triggerBox.x + triggerBox.width),
        ),
        top: Math.round(blockBox.y - triggerBox.y),
      };
    })
    .toEqual({ right: 0, top: 0 });
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

test("펜스 ```lang 입력은 production editor에서 codeBlock DOM으로 변환하고 language를 canonicalize한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("```js ");

  const codeBlock = editable.locator("pre[data-geul-code-block]");
  await expect(codeBlock).toBeVisible();
  await expect(codeBlock.locator("code")).toHaveText("");

  const trigger = page.getByRole("button", { name: "Code language" });
  await expect(trigger).toHaveText("JavaScript");
  await expect(editable).toBeFocused();
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

  await expect(editable.locator("pre[data-geul-code-block] code")).toHaveText(
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

  await expect(editable.locator("pre[data-geul-code-block]")).toHaveCount(0);
  await expect(editable.locator("p").first()).toHaveText("const answer = 42;");
});

test("language 검색 Enter alias와 실제 option click은 트리거 라벨을 canonicalize하고 편집기로 초점을 복구한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertCodeBlock(page, editable);
  const trigger = page.getByRole("button", { name: "Code language" });

  let search = await openLanguagePopover(page);
  await search.fill("js");
  await search.press("Enter");
  await expect(trigger).toHaveText("JavaScript");
  await expect(editable).toBeFocused();

  search = await openLanguagePopover(page);
  await search.fill("py");
  const python = page.getByRole("option", { name: /Python/ });
  await expect(python).toBeVisible();
  // locator.click()의 실제 pointerdown → mouseup → click 순서를 사용한다.
  await python.click();
  await expect(trigger).toHaveText("Python");
  await expect(editable).toBeFocused();
});

test("Escape는 팝오버 검색을 취소하고 편집기로 초점을 복구한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertCodeBlock(page, editable);
  const trigger = page.getByRole("button", { name: "Code language" });
  const search = await openLanguagePopover(page);

  await search.fill("typescript");
  await search.press("Escape");

  await expect(trigger).toHaveText("Plain Text");
  await expect(
    page.getByRole("listbox", { name: "Code language suggestions" }),
  ).toHaveCount(0);
  await expect(editable).toBeFocused();
});

test("팝오버 검색 중 Save JSON을 클릭하면 commit 없이 취소하고 Save 초점을 유지한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertCodeBlock(page, editable);
  const trigger = page.getByRole("button", { name: "Code language" });
  const search = await openLanguagePopover(page);
  const save = page.getByRole("button", { name: "Save JSON" });

  await search.fill("typescript");
  await save.click();

  await expect(trigger).toHaveText("Plain Text");
  await expect(save).toBeFocused();
  await expect(search).toHaveCount(0);
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

test("짧은 뷰포트에서 팝오버 크기가 바뀌어도 네 경계 안에서 Markdown을 클릭할 수 있다 (PIT-0011)", async ({
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

  const trigger = page.getByRole("button", { name: "Code language" });
  const search = await openLanguagePopover(page);
  const popover = page.locator(".geul-code-block-language-popover");
  const suggestions = page.getByRole("listbox", {
    name: "Code language suggestions",
  });

  await search.fill("md");
  await expect(suggestions.getByRole("option")).toHaveCount(1);
  await expectInsideViewport(page, popover);

  await search.fill("");
  await expect(suggestions.getByRole("option")).toHaveCount(12);
  await expectInsideViewport(page, popover);

  await suggestions.getByRole("option", { name: /Markdown/ }).click();
  await expect(trigger).toHaveText("Markdown");
  await expect(editable).toBeFocused();
});

test("scroll과 viewport resize 뒤 language 트리거가 활성 CodeBlock 우상단을 추적하고 좁은 화면에서도 팝오버가 네 경계 안에 머문다", async ({
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

  const codeBlock = editable.locator("pre[data-geul-code-block]");
  const trigger = page.getByRole("button", { name: "Code language" });
  await page.evaluate(() => {
    document.body.style.paddingBottom = "1000px";
  });
  await codeBlock.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await expectTriggerAtBlockTopRight(codeBlock, trigger);

  await page.evaluate(() => window.scrollBy(0, -40));
  await expectTriggerAtBlockTopRight(codeBlock, trigger);

  await page.setViewportSize({ width: 200, height: 480 });
  await expectInsideViewport(page, trigger);

  await trigger.click();
  const popover = page.locator(".geul-code-block-language-popover");
  await expectInsideViewport(page, popover);
});
