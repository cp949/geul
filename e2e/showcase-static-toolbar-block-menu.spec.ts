/**
 * StaticToolbar의 블록 타입 트리거와 listbox 메뉴를 실제 브라우저에서
 * 확인한다(RD-003-DELTA-01, Issue #218 결함 5).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - 네이티브 입력의 기본 동작. Enter가 포커스된 버튼의 click이 되는지,
 *   확정 뒤 이어 입력한 글자가 어느 블록에 들어가는지, 포커스가 실제로
 *   편집기로 돌아오는지가 대상이다. jsdom은 키 입력을 요소에 라우팅하지
 *   않고 포커스 이동도 구현이 다르다.
 * - 실제 레이아웃. 메뉴가 `position: fixed`로 viewport 안에 들어오는지와
 *   스크롤 영역(max-height 220px) 안 sticky 툴바에서 그려지는지는 jsdom이
 *   레이아웃을 계산하지 못해 볼 수 없다.
 * 열림 상태·옵션 구성·키보드 이동이 변환을 일으키지 않는 계약은 단위
 * 테스트(static-toolbar-block-type-menu.test.tsx)가 소유한다.
 */
import { expect, test, type Page } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";
import { yieldFrame } from "./support/yield-frame.js";

const TYPED = "XYZ";

/** 예제를 열고 3번째 문단 끝에 캐럿을 둔다. */
const openWithCaret = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const block = editable.locator('[data-geul-block-id$="block-3"]');
  await block.click();
  await page.keyboard.press("End");
  // ProseMirror는 클릭한 selection을 selectionchange 뒤 비동기로 반영한다.
  // 그 전에 포커스가 툴바로 넘어가면 이전 블록(block-1)이 변환 대상으로
  // 남는다(RD-001-DELTA-03 "발견"). 사람이 만드는 간격(수십 ms)보다 훨씬
  // 짧은 경합이라 테스트가 한 프레임과 한 macrotask를 양보한다.
  await yieldFrame(page);
  return {
    editable,
    block,
    trigger: page.getByRole("button", { name: "Block type" }),
    listbox: page.getByRole("listbox", { name: "Block type" }),
    editorInput: editable.locator('[contenteditable="true"]'),
  };
};

test("블록 타입 컨트롤은 select가 아니라 listbox 팝업 버튼이다", async ({
  page,
}) => {
  const { trigger, listbox } = await openWithCaret(page);

  await expect(
    page.getByRole("toolbar", { name: "Toolbar" }).locator("select"),
  ).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(listbox.getByRole("option")).toHaveCount(7);
});

test("키보드로 연 메뉴에서 화살표는 이동만 하고 Enter가 변환을 확정한다", async ({
  page,
}) => {
  const { block, trigger, listbox } = await openWithCaret(page);

  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole("option", { name: "Text" })).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(
    listbox.getByRole("option", { name: "Heading 1" }),
  ).toBeFocused();
  // 화살표 이동만으로는 블록이 바뀌지 않는다.
  await expect(block.locator("h1")).toHaveCount(0);
  await expect(block.locator("p")).toHaveCount(1);

  await page.keyboard.press("Enter");

  await expect(block.locator("h1")).toHaveCount(1);
  await expect(listbox).toHaveCount(0);
});

test("키보드로 확정한 직후 입력한 텍스트가 변환된 블록에 들어간다", async ({
  page,
}) => {
  const { block, trigger, listbox, editorInput } = await openWithCaret(page);

  // 열림과 포커스 이동은 렌더 뒤 effect로 일어난다. 다음 키를 보내기 전에
  // 포커스가 옮겨졌는지 기다려야 키가 메뉴 밖으로 새지 않는다.
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(listbox.getByRole("option", { name: "Text" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    listbox.getByRole("option", { name: "Heading 1" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(editorInput).toBeFocused();
  await page.keyboard.type(TYPED);

  await expect(block.locator("h1")).toContainText(TYPED);
});

test("마우스로 확정한 직후 입력한 텍스트가 변환된 블록에 들어간다", async ({
  page,
}) => {
  const { block, trigger, listbox, editorInput } = await openWithCaret(page);

  await trigger.click();
  await listbox.getByRole("option", { name: "Heading 2" }).click();
  await expect(editorInput).toBeFocused();
  await page.keyboard.type(TYPED);

  await expect(block.locator("h2")).toContainText(TYPED);
});

test("Escape는 메뉴를 닫고 포커스를 편집기로 돌린다", async ({ page }) => {
  const { trigger, listbox, editorInput } = await openWithCaret(page);

  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(listbox).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(listbox).toHaveCount(0);
  await expect(editorInput).toBeFocused();
});

test("키보드로 연 메뉴에서 툴바 Bold를 마우스로 누르면 메뉴가 닫히고 포커스가 BODY로 떨어지지 않는다", async ({
  page,
}) => {
  // Issue #225 항목 1. 툴바 버튼 mousedown은 `preventDefault`라 포커스가
  // 옵션에 남은 채 메뉴가 언마운트되고, 브라우저가 포커스를 BODY로 떨어뜨렸다.
  const { trigger, listbox, editorInput } = await openWithCaret(page);

  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(listbox.getByRole("option", { name: "Text" })).toBeFocused();
  await page
    .getByRole("toolbar", { name: "Toolbar" })
    .getByRole("button", { name: "Bold" })
    .click();

  await expect(listbox).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .not.toBe("BODY");
  await expect(editorInput).toBeFocused();
});

test("바깥 클릭은 메뉴를 닫고 클릭한 컨트롤의 동작을 실행한다", async ({
  page,
}) => {
  const { block, trigger, listbox } = await openWithCaret(page);

  await trigger.click();
  await expect(listbox).toBeVisible();
  await page.getByRole("button", { name: "Quote" }).click();

  await expect(listbox).toHaveCount(0);
  await expect(block.locator("blockquote")).toHaveCount(1);
});

test("트리거를 다시 누르면 메뉴가 닫힌다", async ({ page }) => {
  const { trigger, listbox } = await openWithCaret(page);

  await trigger.click();
  await expect(listbox).toBeVisible();
  await trigger.click();

  await expect(listbox).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("마우스로 연 메뉴에서 ArrowDown은 변환하지 않고 편집기 캐럿을 움직인다", async ({
  page,
}) => {
  // RD-003 결정("마우스로 열면 편집기 포커스를 유지한다")의 결과를 고정한다.
  // 메뉴로 포커스가 가지 않으므로 화살표는 편집기가 받는다.
  const { editable, block, trigger, listbox, editorInput } =
    await openWithCaret(page);

  await trigger.click();
  await expect(listbox).toBeVisible();
  await expect(editorInput).toBeFocused();
  await page.keyboard.press("ArrowDown");

  await expect(editorInput).toBeFocused();
  await expect(block.locator("p")).toHaveCount(1);
  await expect(editable.locator("h1")).toHaveCount(0);
});

test("낮은 viewport에서도 메뉴가 화면 안에 그려지고 마지막 항목을 누를 수 있다", async ({
  page,
}) => {
  // PIT-0011. 메뉴(7항목)가 트리거 아래로 들어갈 자리가 없을 만큼 낮춘다.
  await page.setViewportSize({ width: 1280, height: 320 });
  const { block, trigger, listbox } = await openWithCaret(page);

  await trigger.click();
  await expect(listbox).toBeVisible();
  const box = await listbox.boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null) {
    throw new Error("메뉴 또는 viewport 크기를 얻지 못했다");
  }
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

  await listbox.getByRole("option", { name: "Heading 6" }).click();

  await expect(block.locator("h6")).toHaveCount(1);
});

/** 편집기의 블록 수. 분할이 일어나면 늘어난다. */
const blockCount = (page: Page) => page.locator("[data-geul-block-id]").count();

test("트리거에서 Enter를 길게 눌러도 반복이 첫 옵션을 확정하거나 블록을 나누지 않는다", async ({
  page,
}) => {
  const { trigger, listbox } = await openWithCaret(page);
  const before = await blockCount(page);
  await trigger.focus();

  await page.keyboard.down("Enter");
  await expect(listbox.getByRole("option", { name: "Text" })).toBeFocused();
  // 같은 키를 떼지 않고 다시 누르면 `repeat`이 true인 keydown이 간다.
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.down("Enter");
    await yieldFrame(page);
  }
  await page.keyboard.up("Enter");

  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole("option", { name: "Text" })).toBeFocused();
  expect(await blockCount(page)).toBe(before);
});

test("옵션에서 Enter를 길게 눌러도 확정 뒤 반복이 블록을 나누지 않는다", async ({
  page,
}) => {
  const { block, trigger, listbox, editorInput } = await openWithCaret(page);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(listbox.getByRole("option", { name: "Text" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    listbox.getByRole("option", { name: "Heading 1" }),
  ).toBeFocused();
  const before = await blockCount(page);

  await page.keyboard.down("Enter");
  // 확정으로 메뉴가 닫히고 포커스가 편집기로 돌아간다.
  await expect(listbox).toHaveCount(0);
  await expect(editorInput).toBeFocused();
  await expect(block.locator("h1")).toHaveCount(1);
  // 같은 키를 떼지 않고 다시 누르면 `repeat`이 true인 keydown이 편집기로 간다.
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.down("Enter");
    await yieldFrame(page);
  }
  await page.keyboard.up("Enter");

  expect(await blockCount(page)).toBe(before);
});

test("트리거에서 Space를 길게 눌러도 블록을 나누지 않는다", async ({
  page,
}) => {
  // 가설 검증이다. 버튼은 Space를 keyup에서 활성화하므로 keydown 반복이
  // click을 내지 않는다고 본다. Space 억제는 별도 범위다.
  const { trigger } = await openWithCaret(page);
  const before = await blockCount(page);
  await trigger.focus();

  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.down("Space");
    await yieldFrame(page);
  }
  await page.keyboard.up("Space");

  expect(await blockCount(page)).toBe(before);
});
