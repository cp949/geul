/**
 * Slash menu의 검색·키보드·블록 추가 배선과 fixed overlay viewport clamp를
 * 실제 Chromium event 순서로 검증한다.
 */
import { expect, test } from "@playwright/test";

import {
  CLAMP_BOUNDARY_MIN_MARGIN_PX,
  expectOverlayWithinViewport,
} from "./support/clamp.js";
import { openDemo } from "./support/demo.js";

test("'/' 입력에 검색 가능한 메뉴를 열고 항목을 고르면 블록을 변환한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/head");

  await expect(menu).toBeVisible();
  // "head"는 label 부분 일치로 heading 1-6과 toggle heading 1-6을 모두
  // 매치한다(RD-004 DELTA-04) — 6 + 6 = 12.
  await expect(page.getByRole("option")).toHaveCount(12);

  // 앵커로 Toggle Heading 1(같은 키워드 "h1"을 공유)과 구분한다.
  await page.getByRole("option", { name: /^Heading 1/ }).click();

  await expect(menu).not.toBeVisible();
  await expect(editable.locator("h1")).toHaveText("");
  // heading 변환으로 문서가 heading으로 끝나면 trailing paragraph(UI-010)가
  // 자동 추가된다 — 남는 문단은 그 빈 문단 하나다.
  await expect(editable.locator("p")).toHaveCount(1);
  await expect(editable.locator("p")).toHaveText("");
});

test("슬래시 메뉴 선택을 undo 1회로 복원한다", async ({ page }) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("/h2");
  // 앵커로 Toggle Heading 2(같은 키워드 "h2"를 공유, RD-004 DELTA-04)와
  // 구분한다.
  await page.getByRole("option", { name: /^Heading 2/ }).click();
  await expect(editable.locator("h2")).toHaveCount(1);

  await page.keyboard.press("Control+z");

  await expect(editable.locator("h2")).toHaveCount(0);
  await expect(editable.locator("p")).toHaveText("/h2");
});

test("키보드만으로 메뉴 항목을 이동하고 선택한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/");
  await expect(menu).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(menu).not.toBeVisible();
  await expect(editable.locator("h1")).toHaveCount(1);
});

test("글머리 목록 항목을 클릭하면 실제 목록으로 바꾸고 편집기 초점을 복구한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/bullet");
  await expect(menu).toBeVisible();

  await menu.getByRole("option", { name: /Bulleted List/ }).click();

  await expect(menu).toHaveCount(0);
  const listItem = editable.locator("[data-be-list-marker]").first();
  await expect(listItem).toHaveAttribute("data-be-list-marker", "•");
  await expect(listItem.locator("[data-be-bullet-list-item]")).toHaveAttribute(
    "data-placeholder",
    "List item",
  );
  await expect(editable).toBeFocused();

  await page.keyboard.type("첫 목록");
  await expect(listItem).toContainText("첫 목록");
});

test("체크 목록 항목을 Slash로 만들고 마커 클릭으로 checked를 토글한다 (RD-001 DELTA-06)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/check");
  await expect(menu).toBeVisible();

  await menu.getByRole("option", { name: /Check List/ }).click();

  await expect(menu).toHaveCount(0);
  const listItem = editable.locator("[data-be-check-list-item]").first();
  await expect(editable).toBeFocused();

  await page.keyboard.type("할 일");
  await expect(listItem).toContainText("할 일");

  const marker = listItem.locator("[data-be-check-marker]");
  await expect(marker).toHaveAttribute("data-be-checked", "false");
  await marker.click();
  await expect(marker).toHaveAttribute("data-be-checked", "true");
});

test("토글 목록 항목을 Slash로 만들고 마커 클릭으로 collapsed를 토글한다 (RD-004 DELTA-04)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/toggle");
  await expect(menu).toBeVisible();

  await menu.getByRole("option", { name: /Toggle List/ }).click();

  await expect(menu).toHaveCount(0);
  const listItem = editable.locator("[data-be-toggle-list-item]").first();
  await expect(editable).toBeFocused();

  await page.keyboard.type("할 일");
  await expect(listItem).toContainText("할 일");

  const marker = listItem.locator("[data-be-toggle-marker]");
  await expect(marker).toHaveAttribute("data-be-collapsed", "false");
  await marker.click();
  await expect(marker).toHaveAttribute("data-be-collapsed", "true");
});

test("토글 제목을 Slash로 만들고 마커 클릭으로 collapsed를 토글한다 (RD-004 DELTA-04)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/toggle");
  await expect(menu).toBeVisible();

  await menu.getByRole("option", { name: /^Toggle Heading 1/ }).click();

  await expect(menu).toHaveCount(0);
  const heading = editable.locator("h1").first();
  await expect(editable).toBeFocused();

  await page.keyboard.type("토글 제목");
  await expect(heading).toContainText("토글 제목");

  const marker = heading.locator("[data-be-toggle-marker]");
  await expect(marker).toHaveAttribute("data-be-collapsed", "false");
  await marker.click();
  await expect(marker).toHaveAttribute("data-be-collapsed", "true");
});

test("Escape로 메뉴를 닫으면 블록은 그대로 둔다", async ({ page }) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/head");
  await expect(menu).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(menu).not.toBeVisible();
  await expect(editable.locator("p")).toHaveText("/head");
  await expect(editable).toBeFocused();
});

test("슬래시 메뉴 바깥을 클릭하면 메뉴를 닫고 클릭한 컨트롤로 초점을 옮긴다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/head");
  await expect(menu).toBeVisible();

  const saveButton = page.getByRole("button", { name: "Save JSON" });
  await saveButton.click();

  await expect(menu).toHaveCount(0);
  await expect(saveButton).toBeFocused();
});

test("hover 시 나타나는 블록 추가 버튼으로 블록을 넣고 그 블록의 메뉴를 연다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("first block");
  await editable.locator("p").first().hover();

  const addBlockButton = page.getByRole("button", { name: "Add block" });
  await expect(addBlockButton).toBeVisible();
  await addBlockButton.click();

  await expect(menu).toBeVisible();
  await expect(editable.locator("p")).toHaveCount(2);

  await page.getByRole("option", { name: /Text/ }).click();
  await page.keyboard.type("second block");

  await expect(editable.locator("p").first()).toHaveText("first block");
  await expect(editable.locator("p").last()).toHaveText("second block");
});

test("서식 툴바의 select로 블록 종류를 바꿔도 내용을 보존한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  const blockTypeSelect = page.getByRole("combobox", { name: "Block type" });
  await expect(blockTypeSelect).toHaveValue("paragraph");

  await blockTypeSelect.selectOption("heading-2");

  await expect(editable.locator("h2")).toHaveText("Hello R1");

  await page.keyboard.press("Control+z");
  await expect(editable.locator("h2")).toHaveCount(0);
  await expect(editable.locator("p")).toHaveText("Hello R1");
});

test("문서 하단에서 슬래시 메뉴를 열어도 Audio 항목까지 뷰포트 안에서 클릭할 수 있다 (PIT-0011)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("first");
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }
  // 슬래시 질의는 블록 텍스트 전체가 "/..."와 일치해야 인식된다
  // (parseSlashQuery: /^\/(\S*)$/) — "line 29" 뒤에 그냥 "/"를 이어치면
  // 블록 텍스트가 "line 29/"가 되어 매치되지 않는다. Enter로 새 빈
  // 블록을 만든 뒤 그 블록에 "/"를 친다. 긴 문서를 계속 타이핑하는
  // 동안 브라우저가 캐럿을 뷰포트 안으로 계속 스크롤해 따라오므로,
  // 이 시점의 캐럿(=새 빈 블록)은 뷰포트 하단 근처에 있다.
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");

  const menu = page.getByRole("listbox", { name: "Slash menu" });
  await expect(menu).toBeVisible();

  const menuBox = await menu.boundingBox();
  const viewportSize = page.viewportSize();
  expect(menuBox).not.toBeNull();
  expect(viewportSize).not.toBeNull();
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual(
    (viewportSize?.height ?? 0) - CLAMP_BOUNDARY_MIN_MARGIN_PX,
  );

  // 클램프가 없으면 마지막 항목이 뷰포트 밖으로 나가 클릭이 "element is
  // outside of the viewport"로 타임아웃한다(PIT-0011 실측 시나리오). 슬래시
  // 메뉴의 마지막 항목은 공용 블록 순서(paragraph → heading 1-6 → quote →
  // code) 뒤 table → divider → file → image → video → audio가 이어져
  // Audio다(RD-003 DELTA-01, media 4종 추가로 Divider에서 밀려남).
  await expect(menu.getByRole("option", { name: /Code/ })).toBeVisible();
  await menu.getByRole("option", { name: /^Audio/ }).click();
  // 빈 미디어 블록은 콘텐츠 없는 div라 화면 크기가 0이다(RD-002 core 렌더
  // 전용, react 빈 상태 CSS는 아직 없다) — toBeVisible()은 0x0 요소를
  // "hidden"으로 판정하므로 존재 여부만 본다.
  await expect(editable.locator('[data-be-media-empty="audio"]')).toHaveCount(
    1,
  );
});

test("스크롤·뷰포트 변경 후 슬래시 메뉴가 caret을 따르고 마지막 목록 항목을 클릭한다 (PIT-0011)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const blocks = Array.from({ length: 31 }, (_, index) => ({
    id: `slash-${index}`,
    type: "paragraph",
    content: index === 15 ? [] : [{ text: `line ${index}` }],
  }));
  await page
    .getByLabel("Document source")
    .fill(JSON.stringify({ formatVersion: 1, revision: 0, blocks }));
  await page.getByRole("button", { name: "Load JSON" }).click();

  const target = editable.locator('[data-be-block-id="slash-15"] > p');
  await target.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await target.click();
  await page.keyboard.type("/");

  const menu = page.getByRole("listbox", { name: "Slash menu" });
  await expect(menu).toBeVisible();
  await page.evaluate(() => window.scrollBy(0, 80));

  await expect
    .poll(async () => {
      const caret = await page.evaluate(() =>
        document.getSelection()?.getRangeAt(0).getBoundingClientRect().toJSON(),
      );
      const box = await menu.boundingBox();
      if (caret === undefined || box === null) return Number.POSITIVE_INFINITY;
      return Math.abs(box.y - caret.bottom);
    })
    .toBeLessThan(24);

  await page.setViewportSize({ width: 320, height: 300 });
  await expectOverlayWithinViewport(menu, page);
  await menu.getByRole("option", { name: /Numbered List/ }).click();

  await expect(
    editable.locator("[data-be-list-marker]").first(),
  ).toHaveAttribute("data-be-list-marker", "1.");
  await expect(editable).toBeFocused();
});
