/**
 * 툴바 컨트롤에 포커스가 있을 때 `Control+Shift+z`·`Control+y`가 에디터를
 * redo하는지 실제 Chromium에서 확인한다(Issue #219, G-EDT-004).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - 포커스가 에디터 밖 버튼에 있을 때 브라우저가 이 키를 어떤 이벤트로
 *   보내는지(keydown은 오고 `beforeinput(historyRedo)`는 오지 않는다)는
 *   jsdom이 재현하지 못한다.
 * - 키 판별·가로채기 조건·다중 인스턴스 비침해는 단위 테스트
 *   (history-redo-keydown-fallback-extension.test.ts)가 소유한다.
 *
 * Chromium 전용이다. 다른 엔진은 이 증상을 검증하지 않아 `@core`를 붙이지
 * 않는다.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { openDemo } from "./support/demo.js";
import { selectBlockTextAndNotify } from "./support/selection.js";
import { openShowcasePage } from "./support/showcase.js";

/** 입력 직후 redo가 되돌릴 텍스트. */
const TYPED = "ABC";

/**
 * 한 프레임과 한 macrotask를 양보한다. ProseMirror는 selection 변경을
 * `selectionchange` 뒤 비동기로 반영한다.
 */
const yieldFrame = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 0)),
      ),
  );

/**
 * StaticToolbar 예제를 열고 첫 문단 끝에 TYPED를 입력한 뒤 에디터 포커스에서
 * undo한다. 반환 시점에 redo 스택이 하나 있고 포커스는 아직 에디터에 있다.
 *
 * 클릭한 selection이 툴바에 반영될 때까지 기다린 뒤 키를 보낸다 — 시간
 * 양보만으로는 부하에서 낡은 selection에 입력이 들어가는 경합이 남는다.
 */
const openStaticToolbarWithUndoneInput = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const paragraph = page
    .getByRole("textbox", { name: "Editor" })
    .locator("p")
    .first();
  await paragraph.click();
  await expect(
    page.getByRole("button", { name: "Block type" }),
  ).toHaveAttribute("aria-disabled", "false");
  await page.keyboard.press("End");
  await yieldFrame(page);

  await page.keyboard.type(TYPED);
  await expect(paragraph).toContainText(TYPED);
  await page.keyboard.press("Control+z");
  await expect(paragraph).not.toContainText(TYPED);
  return { paragraph, bold: page.getByRole("button", { name: "Bold" }) };
};

test("StaticToolbar 컨트롤에 포커스가 있어도 Control+Shift+z가 redo한다", async ({
  page,
}) => {
  const { paragraph, bold } = await openStaticToolbarWithUndoneInput(page);
  await bold.focus();
  await expect(bold).toBeFocused();

  await page.keyboard.press("Control+Shift+z");

  await expect(paragraph).toContainText(TYPED);
  await expect(bold).toBeFocused();
});

test("StaticToolbar 컨트롤에 포커스가 있어도 Control+y가 redo한다", async ({
  page,
}) => {
  const { paragraph, bold } = await openStaticToolbarWithUndoneInput(page);
  await bold.focus();
  await expect(bold).toBeFocused();

  await page.keyboard.press("Control+y");

  await expect(paragraph).toContainText(TYPED);
  await expect(bold).toBeFocused();
});

test("FormattingToolbar 버튼에 포커스가 있어도 Control+Shift+z가 redo한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const paragraph = editable.locator("p").first();
  await editable.click();
  await page.keyboard.type("Hello");
  await expect(paragraph).toHaveText("Hello");
  // history는 newGroupDelay(500ms) 안의 인접 입력을 한 이벤트로 합친다.
  // 입력을 두 이벤트로 가르려고 그 시간만큼 기다린다. 이 대기가 없으면
  // undo가 "Hello"까지 지워 선택할 텍스트가 사라진다.
  await page.waitForTimeout(600);
  await page.keyboard.type(TYPED);
  await expect(paragraph).toHaveText(`Hello${TYPED}`);
  await page.keyboard.press("Control+z");
  await expect(paragraph).toHaveText("Hello");

  // undo 뒤 선택이 접히면 서식 툴바가 사라지므로, undo를 에디터 포커스에서
  // 먼저 하고 그 뒤에 선택을 만든다.
  await selectBlockTextAndNotify(paragraph, "Hello 블록");
  const bold = page.getByRole("button", { name: "Bold" });
  await expect(bold).toBeVisible();
  await bold.focus();
  await expect(bold).toBeFocused();

  await page.keyboard.press("Control+Shift+z");

  // redo는 undo 시점의 caret을 복원한다. 서식 툴바는 DOM selection이 접히면
  // 닫히고, 이는 에디터 포커스에서 redo한 결과와 같다. 포커스된 Bold가
  // unmount돼도 포커스는 `BODY`가 아니라 에디터로 간다(Issue #221,
  // toolbar-focus-undo-redo.spec.ts가 툴바별 계약을 소유한다).
  await expect(page.getByRole("toolbar", { name: "Formatting" })).toHaveCount(
    0,
  );
  await expect(editable).toBeFocused();
  await expect(paragraph).toHaveText(`Hello${TYPED}`);
});

/**
 * 에디터 밖에 `<input>`을 주입하고 포커스한 뒤 그 locator를 돌려준다.
 * 일반 입력 컨트롤은 자기 undo 스택을 가져 에디터가 훔치면 안 된다.
 * 제거는 호출부가 `removeInjectedInput`으로 `finally`에서 한다.
 */
const focusInjectedInput = async (page: Page): Promise<Locator> => {
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "injected-redo-input";
    input.setAttribute("aria-label", "injected-redo-input");
    document.body.append(input);
    input.focus();
  });
  const input = page.locator("#injected-redo-input");
  await expect(input).toBeFocused();
  return input;
};

/** 주입한 `<input>`을 제거한다. 없어도 안전하다. */
const removeInjectedInput = (page: Page) =>
  page.evaluate(() => document.getElementById("injected-redo-input")?.remove());

for (const key of ["Control+Shift+z", "Control+y"]) {
  test(`에디터 밖 input에 포커스가 있으면 ${key}가 에디터를 redo하지 않는다`, async ({
    page,
  }) => {
    const { paragraph } = await openStaticToolbarWithUndoneInput(page);
    try {
      const input = await focusInjectedInput(page);

      await page.keyboard.press(key);

      await expect(input).toBeFocused();
      await expect(paragraph).not.toContainText(TYPED);
    } finally {
      await removeInjectedInput(page);
    }
  });
}
