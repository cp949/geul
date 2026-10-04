/**
 * StaticToolbar 블록 컨트롤이 selection에 따라 사라지거나 움직이지 않는지
 * 실제 브라우저에서 확인한다(RD-003-DELTA-02, Issue #218 결함 1).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - 네이티브 입력의 기본 동작. `Shift+ArrowDown`이 만드는 실제 다중 블록
 *   selection에서 컨트롤이 활성으로 남는지는 jsdom이 키 입력으로
 *   selection을 확장하지 않아 볼 수 없다. 구분선 클릭이 만드는 대상 블록
 *   없음 selection도 같다.
 * - 실제 레이아웃. 컨트롤의 x 좌표와 툴바 폭이 같은지는 jsdom이 레이아웃을
 *   계산하지 못해 볼 수 없다.
 * 컨트롤 수·`aria-disabled`·`title`·클릭 가드 계약은 단위 테스트
 * (static-toolbar-block-controls.test.tsx)가 소유한다.
 *
 * 캐럿 배치 헬퍼는 showcase-static-toolbar-block-menu.spec.ts의
 * `openWithCaret`와 같은 패턴이다. 공용 `e2e/support/`로 올리면 기존 spec과
 * 변경 범위 밖 파일을 건드리므로 이 DELTA에서는 복제로 두고 결과에 적는다.
 */
import { expect, test, type Page } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";
import { selectFirstDivider } from "./support/static-toolbar-selection.js";
import { yieldFrame } from "./support/yield-frame.js";

const DISABLED_REASON = "Available when the cursor is in a single block";
const MARKING_DISABLED_REASON =
  "Formatting isn't available in code blocks, media blocks, or table cell ranges";

/** 예제를 열고 첫 문단에 캐럿을 둔다. */
const openWithCaretInFirstBlock = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  await editable.locator("p").first().click();
  // 클릭한 selection이 편집기 상태에 반영돼 툴바가 대상 블록을 잡을 때까지
  // 기다린다. 시간 양보만으로는 부하에서 클릭 반영이 뒤처져 뒤따르는
  // Shift+ArrowDown이 낡은 selection에서 확장되지 않는 경합이 남는다.
  await expect(
    page.getByRole("button", { name: "Block type" }),
  ).toHaveAttribute("aria-disabled", "false");
  await page.keyboard.press("End");
  // ProseMirror는 End가 옮긴 selection도 selectionchange 뒤 비동기로
  // 반영한다. 그 전에 다음 키를 보내면 이전 selection에서 확장된다. 한
  // 프레임과 한 macrotask를 양보한다.
  await yieldFrame(page);
  return {
    editable,
    toolbar: page.getByRole("toolbar", { name: "Toolbar" }),
    trigger: page.getByRole("button", { name: "Block type" }),
    quote: page.getByRole("button", { name: "Quote" }),
  };
};

/**
 * 예제를 열고 샘플의 구분선을 클릭해 대상 블록이 없는 NodeSelection을
 * 만든다(`selectFirstDivider`).
 */
const openWithDividerSelected = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editable = page.getByRole("textbox", { name: "Editor" });
  await selectFirstDivider(page, editable);
  return {
    editable,
    trigger: page.getByRole("button", { name: "Block type" }),
    quote: page.getByRole("button", { name: "Quote" }),
  };
};

type ToolbarLayout = { count: number; xs: number[]; width: number };

/** 툴바 직계 컨트롤 수, 각 컨트롤의 x 좌표와 툴바 폭을 기록한다. */
const measureToolbar = (toolbar: ReturnType<Page["getByRole"]>) =>
  toolbar.evaluate((element): ToolbarLayout => {
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      count: element.children.length,
      xs: Array.from(element.children).map((child) =>
        round(child.getBoundingClientRect().x),
      ),
      width: round(element.getBoundingClientRect().width),
    };
  });

test("여러 블록을 선택해도 블록 컨트롤의 수와 좌표와 툴바 폭이 같고 컨트롤이 활성이다", async ({
  page,
}) => {
  const { toolbar, trigger, quote } = await openWithCaretInFirstBlock(page);
  await expect(trigger).toHaveAttribute("aria-disabled", "false");
  const before = await measureToolbar(toolbar);

  await page.keyboard.press("Shift+ArrowDown");

  // 여러 블록 선택은 블록 타입 대상이다(743b7e8b). 트리거와 아이콘 버튼은
  // 활성으로 남고 비활성 사유 title이 붙지 않는다. 활성 값은 선택 전과 같아
  // 갱신 대기 지점이 없다. 네이티브 selection이 실제로 확장된 것을 확인하고
  // 한 프레임과 한 macrotask를 양보해 상태 갱신을 기다린다.
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString().length))
    .toBeGreaterThan(0);
  await yieldFrame(page);
  await expect(trigger).toHaveAttribute("aria-disabled", "false");
  await expect(quote).toHaveAttribute("aria-disabled", "false");
  await expect(trigger).not.toHaveAttribute("title", DISABLED_REASON);
  await expect(quote).not.toHaveAttribute("title", DISABLED_REASON);
  const after = await measureToolbar(toolbar);
  expect(after).toEqual(before);
});

test("대상 블록이 없을 때 비활성 트리거와 아이콘 버튼을 눌러도 블록이 바뀌지 않는다", async ({
  page,
}) => {
  const { editable, trigger, quote } = await openWithDividerSelected(page);
  await expect(quote).toHaveAttribute("aria-disabled", "true");
  const blockquoteBefore = await editable.locator("blockquote").count();
  const htmlBefore = await editable.innerHTML();

  // Playwright는 aria-disabled 컨트롤을 "enabled 아님"으로 보고 클릭을
  // 막는다. 사용자가 누르는 상황을 만들려고 force로 우회한다.
  await trigger.click({ force: true });
  await quote.click({ force: true });

  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(editable.locator("blockquote")).toHaveCount(blockquoteBefore);
  await expect(editable.locator("hr")).toHaveCount(1);
  expect(await editable.innerHTML()).toBe(htmlBefore);
});

test("대상 블록이 없을 때도 비활성 컨트롤이 키보드 포커스를 받는다", async ({
  page,
}) => {
  const { trigger, quote } = await openWithDividerSelected(page);
  await expect(quote).toHaveAttribute("aria-disabled", "true");

  await trigger.focus();
  await expect(trigger).toBeFocused();
  await quote.focus();
  await expect(quote).toBeFocused();
});

test("샘플 전체 선택(Ctrl+A)이 codeBlock을 걸치면 Bold가 비활성이고 눌러도 서식이 바뀌지 않는다", async ({
  page,
}) => {
  // Issue #241. 여러 블록 선택에서 단일 블록 판정만 보면 mark 버튼이
  // 활성으로 남고, core는 codeBlock 교차 선택의 mark를 거절해 무반응이 된다.
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editable = page.getByRole("textbox", { name: "Editor" });
  await editable.locator("p").first().click();
  await page.keyboard.press("Control+A");

  // 예제는 FormattingToolbar도 같이 띄우므로 StaticToolbar 안으로 좁힌다.
  const bold = page
    .getByRole("toolbar", { name: "Toolbar" })
    .getByRole("button", { name: "Bold" });
  await expect(bold).toHaveAttribute("aria-disabled", "true");
  await expect(bold).toHaveAttribute("title", MARKING_DISABLED_REASON);
  const strongBefore = await editable.locator("strong").count();

  // aria-disabled 컨트롤은 Playwright가 클릭을 막으므로 force로 우회한다.
  await bold.click({ force: true });

  await expect(editable.locator("strong")).toHaveCount(strongBefore);
});
