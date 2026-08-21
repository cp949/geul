import { expect, test } from "@playwright/test";

import { CLAMP_BOUNDARY_MIN_MARGIN_PX } from "./support/clamp.js";
import { openDemo } from "./support/demo.js";

test("핸들을 드래그해 블록 순서를 재정렬하고 undo 1회로 복원한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("first block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second block");

  const firstBlock = editable.locator("p").first();
  const secondBlock = editable.locator("p").nth(1);
  await firstBlock.hover();
  const handle = page.getByRole("button", { name: "Drag to reorder" });
  await expect(handle).toBeVisible();

  const handleBox = await handle.boundingBox();
  const secondBlockBox = await secondBlock.boundingBox();
  if (handleBox === null || secondBlockBox === null) {
    throw new Error("Bounding boxes were not available");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    secondBlockBox.x + secondBlockBox.width / 2,
    secondBlockBox.y + secondBlockBox.height - 2,
    { steps: 5 },
  );

  await expect(page.locator("[data-be-block-insertion-guide]")).toBeVisible();

  await page.mouse.up();

  await expect(editable.locator("p").first()).toHaveText("second block");
  await expect(editable.locator("p").last()).toHaveText("first block");
  await expect(page.getByRole("menu", { name: "Block menu" })).toHaveCount(0);

  await page.keyboard.press("Control+z");

  await expect(editable.locator("p").first()).toHaveText("first block");
  await expect(editable.locator("p").last()).toHaveText("second block");
});

test("블록 메뉴에서 복제하면 원본 바로 다음에 블록이 생기고 undo 1회로 복원된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("duplicate me");

  await editable.locator("p").first().hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();

  await expect(menu).not.toBeVisible();
  await expect(editable.locator("p")).toHaveCount(2);
  await expect(editable.locator("p").first()).toHaveText("duplicate me");
  await expect(editable.locator("p").last()).toHaveText("duplicate me");

  await page.keyboard.press("Control+z");

  await expect(editable.locator("p")).toHaveCount(1);
  await expect(editable.locator("p").first()).toHaveText("duplicate me");
});

test("블록을 복제하면 편집 포커스가 복제본으로 이동한다", async ({ page }) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("duplicate me");

  await editable.locator("p").first().hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();

  await page.keyboard.type(" typed after");

  await expect(editable.locator("p").first()).toHaveText("duplicate me");
  await expect(editable.locator("p").last()).toHaveText(
    "duplicate me typed after",
  );
});

test("블록 메뉴에서 삭제하면 블록이 사라지고 undo 1회로 복원된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("first block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second block");

  await editable.locator("p").first().hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await expect(editable.locator("p")).toHaveCount(1);
  await expect(editable.locator("p").first()).toHaveText("second block");

  await page.keyboard.press("Control+z");

  await expect(editable.locator("p")).toHaveCount(2);
  await expect(editable.locator("p").first()).toHaveText("first block");
  await expect(editable.locator("p").last()).toHaveText("second block");
});

test("Escape로 블록 메뉴를 닫으면 편집기로 초점을 복구한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("focus target");

  await editable.locator("p").first().hover();
  const handle = page.getByRole("button", { name: "Drag to reorder" });
  await handle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu", { name: "Block menu" })).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("menu", { name: "Block menu" })).toHaveCount(0);
  await expect(editable).toBeFocused();
});

test("블록 메뉴 바깥을 클릭하면 클릭한 컨트롤에 초점을 유지한다 (PIT-0013)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.locator("p").first().hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();
  await expect(page.getByRole("menu", { name: "Block menu" })).toBeVisible();

  const saveButton = page.getByRole("button", { name: "Save JSON" });
  await saveButton.click();

  await expect(page.getByRole("menu", { name: "Block menu" })).toHaveCount(0);
  await expect(saveButton).toBeFocused();
});

test("좁은 뷰포트에서도 드래그 핸들이 화면 안에서 클릭 가능하다 (PIT-0011)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("first block");
  await editable.locator("p").first().hover();

  const handle = page.getByRole("button", { name: "Drag to reorder" });
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  // 사이드 버튼 오버레이는 translate(-3.5rem, 0)로 왼쪽으로 56px
  // 이동한다 — 클램프가 없으면 좁은 뷰포트에서 이 값이 음수가 되어
  // 핸들이 화면 밖으로 나간다(PIT-0011).
  expect(handleBox?.x ?? -1).toBeGreaterThanOrEqual(
    CLAMP_BOUNDARY_MIN_MARGIN_PX,
  );

  // 클램프가 없으면 클릭이 "element is outside of the viewport"로
  // 타임아웃한다(PIT-0011 실측 시나리오).
  await handle.click();
  await expect(page.getByRole("menu", { name: "Block menu" })).toBeVisible();
});

test("문서 하단 블록에서 메뉴를 열어도 Delete 항목까지 뷰포트 안에서 클릭할 수 있다 (PIT-0011)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("first block");
  for (let index = 0; index < 25; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }

  const lastBlock = editable.locator("p").last();
  await lastBlock.hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();

  const menuBox = await menu.boundingBox();
  const viewportSize = page.viewportSize();
  expect(menuBox).not.toBeNull();
  expect(viewportSize).not.toBeNull();
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual(
    (viewportSize?.height ?? 0) - CLAMP_BOUNDARY_MIN_MARGIN_PX,
  );

  // 클램프가 없으면 Delete 항목이 뷰포트 밖으로 나가 클릭이 "element is
  // outside of the viewport"로 타임아웃한다(PIT-0011 실측 시나리오).
  await menu.getByRole("menuitem", { name: "Delete" }).click();
  await expect(editable.locator("p").last()).not.toHaveText("line 24");
});

test("메뉴보다 짧은 뷰포트에서도 블록 메뉴 맨 아래 Delete 항목을 클릭할 수 있다 (PIT-0011)", async ({
  page,
}) => {
  // 블록 메뉴는 "Turn into" 헤더 + 블록 타입 4개 + 구분선 + Duplicate +
  // Delete로 약 230px다. 높이 200px 뷰포트는 클램프 여백(위아래 8px씩)을
  // 빼면 184px만 남아 메뉴가 확실히 넘친다. 클램프는 좌표만 접을 뿐이라
  // 뷰포트보다 큰 메뉴의 아래쪽 항목에는 닿지 못한다 — max-height와
  // overflow-y가 함께 있어야 한다(PIT-0011 예방 규칙).
  await page.setViewportSize({ width: 1280, height: 200 });
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("first block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second block");

  await editable.locator("p").first().hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();

  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  // max-height가 없으면 메뉴 박스 자체가 뷰포트 아래로 넘친다.
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual(200);

  // overflow-y가 없으면 메뉴 내부 스크롤이 불가능해 이 클릭이 "element is
  // outside of the viewport"로 타임아웃한다(PIT-0011 "가장 아래쪽 항목을
  // 실제로 클릭").
  await menu.getByRole("menuitem", { name: "Delete" }).click();

  await expect(editable.locator("p")).toHaveCount(1);
  await expect(editable.locator("p").first()).toHaveText("second block");
});
