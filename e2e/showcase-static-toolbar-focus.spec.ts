/**
 * StaticToolbar와 편집기 사이의 포커스·selection 전달을 실제 브라우저에서
 * 확인한다(Issue #222, spec §5, G-EDT-004, G-UI-001).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - F1: 버튼 포커스에서 DOM selection을 다시 쓰면 브라우저가 포커스를
 *   편집기로 옮긴다. jsdom은 이 포커스 이동을 구현하지 않는다.
 * - F2: 툴바 명령 뒤 버튼 포커스의 `Control+z`는 keydown만 오고
 *   `beforeinput(historyUndo)`가 오지 않는다. jsdom이 재현하지 못한다.
 * - F3: mousedown의 기본 동작(포커스·selection 이동)은 브라우저만 수행한다.
 *
 * 호출 배선·가로채기 조건·target 가드는 단위 테스트가 소유한다
 * (static-toolbar-caret-marks.test.tsx, static-toolbar.test.tsx,
 * history-keydown-fallback-extension.test.ts).
 *
 * `@core`는 F1의 처음 두 테스트에만 붙인다. 키보드 클릭 뒤 DOM selection
 * 유지는 엔진 간 구현 차이가 있을 수 있다. F2·F3은 Chromium 전용이다.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";
import {
  BLOCK_TEXT,
  editorSelectionText,
  placeCaretAtEnd,
  RANGE_TEXT,
  selectRange,
} from "./support/static-toolbar-selection.js";
import { yieldFrame } from "./support/yield-frame.js";

/** F2에서 Quote 적용 전에 입력하는 텍스트. */
const TYPED = "XYZ";

/** 예제를 열고 3번 문단과 툴바 locator를 돌려준다. 캐럿은 아직 없다. */
const openExample = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const toolbar = page.getByRole("toolbar", { name: "Toolbar" });
  await expect(toolbar).toBeVisible();
  return {
    editorInput: editable.locator('[contenteditable="true"]'),
    block: editable.locator('[data-geul-block-id$="block-3"]'),
    blocks: editable.locator("[data-geul-block-id]"),
    toolbar,
    control: (name: string) =>
      toolbar.getByRole("button", { name, exact: true }),
  };
};

test("범위 선택 뒤 키보드로 Bold를 켜고 꺼도 Bold가 포커스를 유지한다 @core", async ({
  page,
}) => {
  const { editorInput, block, blocks, control } = await openExample(page);
  const blockCount = await blocks.count();
  await selectRange(page, block, editorInput, RANGE_TEXT);
  const bold = control("Bold");
  await bold.focus();
  await expect(bold).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(block.locator("strong")).toHaveText(RANGE_TEXT);
  await expect(bold).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(block.locator("strong")).toHaveCount(0);
  await expect(bold).toBeFocused();
  await expect(blocks).toHaveCount(blockCount);
  await expect(block).toHaveText(BLOCK_TEXT);
});

test("키보드로 Bold를 켠 뒤 Escape로 돌아와 입력하면 원래 범위를 대체한다 @core", async ({
  page,
}) => {
  const { editorInput, block, control } = await openExample(page);
  await selectRange(page, block, editorInput, RANGE_TEXT);
  const bold = control("Bold");
  await bold.focus();
  await expect(bold).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(block.locator("strong")).toHaveText(RANGE_TEXT);
  await expect(bold).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(editorInput).toBeFocused();
  await expect.poll(() => editorSelectionText(editorInput)).toBe(RANGE_TEXT);
  await yieldFrame(page);

  await page.keyboard.type("X");

  await expect(block).toHaveText(`X${BLOCK_TEXT.slice(RANGE_TEXT.length)}`);
});

for (const [label, markSelector] of [
  ["Italic", "em"],
  ["Underline", "u"],
  ["Strikethrough", "s"],
  ["Inline code", "code"],
] as const) {
  test(`범위 선택 뒤 ${label} 버튼을 Enter로 켜고 Space로 꺼도 포커스를 유지한다`, async ({
    page,
  }) => {
    const { editorInput, block, control } = await openExample(page);
    await selectRange(page, block, editorInput, RANGE_TEXT);
    const button = control(label);
    await button.focus();
    await expect(button).toBeFocused();

    await page.keyboard.press("Enter");

    await expect(block.locator(markSelector)).toHaveText(RANGE_TEXT);
    await expect(button).toBeFocused();

    await page.keyboard.press("Space");

    await expect(block.locator(markSelector)).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(block).toHaveText(BLOCK_TEXT);
  });
}

test("Shift+Tab과 화살표로 Bold에 가서 Enter를 두 번 눌러도 블록이 쪼개지지 않는다", async ({
  page,
}) => {
  const { editorInput, block, blocks, toolbar, control } =
    await openExample(page);
  const blockCount = await blocks.count();
  await selectRange(page, block, editorInput, RANGE_TEXT);
  const bold = control("Bold");
  // Shift+Tab은 툴바의 Tab 정지점(첫 컨트롤)으로 간다. Bold까지 화살표로
  // 이동할 횟수를 컨트롤 순서에서 읽는다.
  const boldIndex = await toolbar
    .locator(":scope > button")
    .evaluateAll((controls) =>
      controls.findIndex((item) => item.getAttribute("aria-label") === "Bold"),
    );
  expect(boldIndex).toBeGreaterThan(0);

  await page.keyboard.press("Shift+Tab");
  await expect(toolbar.locator(":scope > button").first()).toBeFocused();
  for (let i = 0; i < boldIndex; i += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(bold).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(block.locator("strong")).toHaveText(RANGE_TEXT);
  await expect(bold).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(block.locator("strong")).toHaveCount(0);
  await expect(bold).toBeFocused();
  await expect(blocks).toHaveCount(blockCount);
  await expect(block).toHaveText(BLOCK_TEXT);
});

test("키보드로 적용한 Quote를 툴바 포커스의 Control+z가 되돌리고 Quote가 포커스를 유지한다", async ({
  page,
}) => {
  const { block, control } = await openExample(page);
  await placeCaretAtEnd(page, block, BLOCK_TEXT);
  const quote = control("Quote");
  await quote.focus();
  await expect(quote).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(block.locator("blockquote")).toHaveText(BLOCK_TEXT);
  await expect(quote).toBeFocused();

  await page.keyboard.press("Control+z");

  await expect(block.locator("blockquote")).toHaveCount(0);
  await expect(block.locator("p")).toHaveText(BLOCK_TEXT);
  await expect(quote).toHaveAttribute("aria-pressed", "false");
  await expect(quote).toBeFocused();
});

test("마우스로 적용한 Quote를 툴바 포커스의 Control+z가 되돌린다", async ({
  page,
}) => {
  const { block, control } = await openExample(page);
  await placeCaretAtEnd(page, block, BLOCK_TEXT);
  const quote = control("Quote");
  await quote.click();
  await expect(block.locator("blockquote")).toHaveText(BLOCK_TEXT);
  await quote.focus();
  await expect(quote).toBeFocused();

  await page.keyboard.press("Control+z");

  await expect(block.locator("blockquote")).toHaveCount(0);
  await expect(block.locator("p")).toHaveText(BLOCK_TEXT);
  await expect(quote).toBeFocused();
});

test("입력 뒤 적용한 Quote를 툴바 포커스의 Control+z가 한 번에 한 단계씩 되돌린다", async ({
  page,
}) => {
  const { block, control } = await openExample(page);
  await placeCaretAtEnd(page, block, BLOCK_TEXT);
  await page.keyboard.type(TYPED);
  await expect(block).toHaveText(BLOCK_TEXT + TYPED);
  // 입력과 Quote 적용은 newGroupDelay 안에 이어져도 다른 history 이벤트다
  // (에디터 포커스의 Control+z 두 번으로 실측). 대기 없이 두 단계로 갈린다.
  const quote = control("Quote");
  await quote.focus();
  await expect(quote).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(block.locator("blockquote")).toHaveText(BLOCK_TEXT + TYPED);

  await page.keyboard.press("Control+z");
  // keydown 라우팅과 `beforeinput` 경로가 둘 다 실행되면 같은 키 이벤트
  // 안에서 입력까지 되돌려진다. 그 뒤 상태를 읽도록 프레임을 양보한다.
  await yieldFrame(page);

  await expect(block.locator("blockquote")).toHaveCount(0);
  await expect(block.locator("p")).toHaveText(BLOCK_TEXT + TYPED);
  await expect(quote).toBeFocused();

  await page.keyboard.press("Control+z");

  await expect(block.locator("p")).toHaveText(BLOCK_TEXT);
});

/**
 * 툴바 컨테이너 자신이 hit되는 두 지점을 돌려준다. 마지막 컨트롤 오른쪽의
 * 빈 공간과 둘째·셋째 컨트롤 사이 틈이다. `hitsToolbar`는 그 지점의
 * 최상위 요소가 컨테이너인지다.
 */
const bareToolbarPoints = (toolbar: Locator) =>
  toolbar.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const rects = Array.from(element.children).map((child) =>
      child.getBoundingClientRect(),
    );
    const last = rects[rects.length - 1];
    const second = rects[1];
    const third = rects[2];
    if (last === undefined || second === undefined || third === undefined) {
      throw new Error("툴바 컨트롤 조회 실패");
    }
    const describe = (x: number, y: number) => ({
      x,
      y,
      hitsToolbar: element.ownerDocument.elementFromPoint(x, y) === element,
    });
    return {
      rightSpace: describe(
        (last.right + rect.right) / 2,
        rect.top + rect.height / 2,
      ),
      gap: describe(
        (second.right + third.left) / 2,
        second.top + second.height / 2,
      ),
    };
  });

for (const [label, pointKey] of [
  ["우측 빈 공간", "rightSpace"],
  ["버튼 사이 틈", "gap"],
] as const) {
  test(`범위 선택 뒤 툴바 ${label}을 눌러도 편집기 포커스와 selection이 유지되고 Bold가 적용된다`, async ({
    page,
  }) => {
    const { editorInput, block, toolbar, control } = await openExample(page);
    await selectRange(page, block, editorInput, RANGE_TEXT);
    const point = (await bareToolbarPoints(toolbar))[pointKey];
    expect(point.hitsToolbar).toBe(true);

    await page.mouse.click(point.x, point.y);
    await yieldFrame(page);

    await expect(editorInput).toBeFocused();
    expect(await editorSelectionText(editorInput)).toBe(RANGE_TEXT);

    await control("Bold").click();

    await expect(block.locator("strong")).toHaveText(RANGE_TEXT);
  });
}
