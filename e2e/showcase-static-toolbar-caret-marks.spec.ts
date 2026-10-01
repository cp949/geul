/**
 * StaticToolbar가 접힌 캐럿에서 서식을 켜면 이어 입력한 텍스트에 그 서식이
 * 붙는지 확인한다(RD-002-DELTA-02, Issue #218 결함 2).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007 "네이티브 입력의 기본 동작"):
 * stored mark가 툴바 클릭 뒤 포커스·selection 이동을 견디고 실제 키 입력
 * 이벤트에서 소비되는지가 대상이다. jsdom은 실제 포커스 이동과 입력
 * 이벤트를 만들지 못한다. 캐럿 명령 호출 순서와 폴백 조건은 단위 테스트
 * (static-toolbar-caret-marks.test.tsx)가, stored mark 계약은 core 테스트가
 * 소유한다.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

const TYPED = "XYZ";

/** 예제를 열고 3번째 문단을 반환한다. 캐럿은 아직 놓지 않는다. */
const openParagraph = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  return {
    editable,
    paragraph: editable.locator('[data-geul-block-id$="block-3"]'),
  };
};

/** 문단을 클릭하고 End로 캐럿을 문단 끝에 둔다. */
const placeCaretAtEnd = async (page: Page, paragraph: Locator) => {
  await paragraph.click();
  await page.keyboard.press("End");
};

test("문단 끝 캐럿에서 Bold를 누르면 이어 입력한 텍스트가 굵게 된다", async ({
  page,
}) => {
  const { editable, paragraph } = await openParagraph(page);
  await placeCaretAtEnd(page, paragraph);
  const bold = page.getByRole("button", { name: "Bold" });

  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.type(TYPED);

  await expect(editable.locator("strong")).toHaveText(TYPED);
});

test("문단 중간 캐럿에서도 Bold를 누르면 이어 입력한 텍스트가 굵게 된다", async ({
  page,
}) => {
  const { editable, paragraph } = await openParagraph(page);
  await paragraph.click();
  await page.keyboard.press("Home");
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");

  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type(TYPED);

  await expect(editable.locator("strong")).toHaveText(TYPED);
});

test("접힌 캐럿에서 Bold와 Italic을 연달아 누르면 입력한 텍스트가 두 서식을 모두 가진다", async ({
  page,
}) => {
  const { editable, paragraph } = await openParagraph(page);
  await placeCaretAtEnd(page, paragraph);

  await page.getByRole("button", { name: "Bold" }).click();
  await page.getByRole("button", { name: "Italic" }).click();
  await page.keyboard.type(TYPED);

  await expect(editable.locator("strong em, em strong")).toHaveText(TYPED);
});

test("접힌 캐럿에서 글자색을 고르면 이어 입력한 텍스트에 그 색이 적용된다", async ({
  page,
}) => {
  const { editable, paragraph } = await openParagraph(page);
  await placeCaretAtEnd(page, paragraph);

  await page.getByRole("button", { name: "Text color" }).click();
  await page.getByRole("menuitem", { name: "Text color Red" }).click();
  await page.keyboard.type(TYPED);

  const colored = editable.locator("span", { hasText: TYPED });
  await expect(colored).toHaveText(TYPED);
  // #D93025(TABLE_TEXT_COLORS red)가 브라우저에서 rgb로 해석된다.
  await expect(colored).toHaveCSS("color", "rgb(217, 48, 37)");
});

test("접힌 캐럿에서 Inline code를 누르면 Bold 표시가 꺼진다", async ({
  page,
}) => {
  const { editable, paragraph } = await openParagraph(page);
  await placeCaretAtEnd(page, paragraph);
  const bold = page.getByRole("button", { name: "Bold" });

  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Inline code" }).click();
  await page.keyboard.type(TYPED);

  // code는 다른 mark와 함께 걸 수 없어 stored Bold가 대체된다.
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await expect(editable.locator("code")).toHaveText(TYPED);
  await expect(editable.locator("strong")).toHaveCount(0);
});
