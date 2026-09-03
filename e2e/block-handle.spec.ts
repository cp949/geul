/**
 * 블록 gutter의 재정렬·추가와 Block menu의 종류 변경·복제·삭제·focus·
 * viewport clamp를 실제 Chromium pointer/keyboard 순서로 검증한다.
 */
import { expect, test } from "@playwright/test";

import {
  CLAMP_BOUNDARY_MIN_MARGIN_PX,
  expectOverlayWithinViewport,
} from "./support/clamp.js";
import { openDemo } from "./support/demo.js";
import { trackPageErrors, uuidV4Pattern } from "./support/ids.js";

test("핸들을 드래그해 블록 순서를 재정렬하고 undo 1회로 복원한다", async ({
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

test("블록 메뉴에서 Indent를 클릭하면 앞 형제의 자식으로 들여쓰기되고 undo 1회로 복원된다 (Issue #126)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("first block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second block");

  await expect(page.locator("[data-be-block-group]")).toHaveCount(0);

  const secondBlock = editable.locator("p").nth(1);
  await secondBlock.hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Indent" }).click();

  await expect(menu).toHaveCount(0);
  await expect(page.locator("[data-be-block-group]")).toHaveCount(1);
  // trailing-block-extension.ts(UI-010): 최상위 마지막 블록이 더는
  // "자식 없는 paragraph"가 아니라, 같은 dispatch가 문서 끝에 새 빈
  // paragraph를 추가한다 — 그래서 "second block"은 더 이상 p.last()가
  // 아니라 nth(1)이다. undo 1회가 이 추가도 함께 되돌린다(R-8).
  await expect(editable.locator("p").nth(1)).toHaveText("second block");

  await page.keyboard.press("Control+z");

  await expect(page.locator("[data-be-block-group]")).toHaveCount(0);
  await expect(editable.locator("p")).toHaveCount(2);
});

test("블록 메뉴에서 Outdent를 클릭하면 부모의 형제로 내어쓰기되고 undo 1회로 복원된다 (Issue #126)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const nestedDocument = {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "parent-1",
        type: "paragraph",
        content: [{ text: "parent" }],
        children: [
          { id: "child-1", type: "paragraph", content: [{ text: "child" }] },
        ],
      },
    ],
  };
  await page.getByLabel("Document source").fill(JSON.stringify(nestedDocument));
  await page.getByRole("button", { name: "Load JSON" }).click();

  await expect(page.locator("[data-be-block-group]")).toHaveCount(1);

  const childBlock = editable.locator('[data-be-block-id="child-1"] > p');
  await childBlock.hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Outdent" }).click();

  await expect(menu).toHaveCount(0);
  await expect(page.locator("[data-be-block-group]")).toHaveCount(0);
  await expect(
    editable.locator(':scope > [data-be-block-id="child-1"]'),
  ).toHaveCount(1);

  await page.keyboard.press("Control+z");

  await expect(page.locator("[data-be-block-group]")).toHaveCount(1);
  // 개수뿐 아니라 재중첩 위치까지 확인한다(table-handle.spec.ts의
  // Indent/Outdent undo 검증과 같은 엄격도, qq-workflow 단계-3 MINOR).
  await expect(
    editable.locator(
      '[data-be-block-id="parent-1"] > [data-be-block-group] > [data-be-block-id="child-1"]',
    ),
  ).toHaveCount(1);
});

test("블록 메뉴의 Indent/Outdent 항목은 적용 불가 상태에서 비활성화된다 (Issue #126)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("only block");

  await editable.locator("p").first().hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();
  // 앞 형제도 없고(canIndent false) 최상위 depth 0(canOutdent false)이라
  // getBlockNestingActionState가 둘 다 false를 반환한다(indent-commands.ts).
  await expect(menu.getByRole("menuitem", { name: "Indent" })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "Outdent" })).toBeDisabled();
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

test("블록 메뉴 바깥을 클릭하면 클릭한 컨트롤에 초점을 유지한다 (G-UI-001)", async ({
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

test("Turn into의 번호 목록을 클릭하면 내용을 보존하고 메뉴를 닫는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("보존할 내용");
  await editable.locator("p").first().hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Numbered List" }).click();

  await expect(menu).toHaveCount(0);
  const listItem = editable.locator("[data-be-list-marker]").first();
  await expect(listItem).toHaveAttribute("data-be-list-marker", "1.");
  await expect(listItem).toContainText("보존할 내용");
  await expect(editable).toBeFocused();
});

test("Turn into의 체크 목록을 클릭하면 내용을 보존하고 클릭으로 checked를 토글한다 (RD-001 DELTA-06)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("보존할 내용");
  await editable.locator("p").first().hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Check List" }).click();

  await expect(menu).toHaveCount(0);
  const listItem = editable.locator("[data-be-check-list-item]").first();
  await expect(listItem).toContainText("보존할 내용");
  await expect(editable).toBeFocused();

  const marker = listItem.locator("[data-be-check-marker]");
  await expect(marker).toHaveAttribute("data-be-checked", "false");
  await marker.click();
  await expect(marker).toHaveAttribute("data-be-checked", "true");
});

test("Turn into의 토글 목록을 클릭하면 내용을 보존하고 클릭으로 collapsed를 토글한다 (RD-004 DELTA-04)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("보존할 내용");
  await editable.locator("p").first().hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Toggle List" }).click();

  await expect(menu).toHaveCount(0);
  const listItem = editable.locator("[data-be-toggle-list-item]").first();
  await expect(listItem).toContainText("보존할 내용");
  await expect(editable).toBeFocused();

  const marker = listItem.locator("[data-be-toggle-marker]");
  await expect(marker).toHaveAttribute("data-be-collapsed", "false");
  await marker.click();
  await expect(marker).toHaveAttribute("data-be-collapsed", "true");
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

test("스크롤·뷰포트 변경 후 블록 메뉴가 블록을 따르고 마지막 목록 항목을 클릭한다 (PIT-0011)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  // Turn into 옵션이 RD-004 DELTA-04로 12(heading 6 + toggle-heading 6)까지
  // 늘어 블록 메뉴 전체 높이(max-height: calc(100vh - 1rem))가 기본
  // 720px 뷰포트에서 704px에 달한다 — 아래 "메뉴가 target을 따라간다"
  // 검증은 메뉴가 top에 clamp되지 않을 여유가 필요해 기본 뷰포트보다
  // 넉넉한 높이로 시작한다(두 번째 시나리오는 여전히 320x300으로 좁힌다).
  await page.setViewportSize({ width: 1280, height: 1000 });
  const blocks = Array.from({ length: 31 }, (_, index) => ({
    id: `block-menu-${index}`,
    type: "paragraph",
    content: [{ text: `line ${index}` }],
  }));
  await page
    .getByLabel("Document source")
    .fill(JSON.stringify({ formatVersion: 1, revision: 0, blocks }));
  await page.getByRole("button", { name: "Load JSON" }).click();

  const target = editable.locator('[data-be-block-id="block-menu-15"] > p');
  await target.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      '[data-be-block-id="block-menu-15"] > p',
    );
    if (target === null) throw new Error("Block menu target was not found");
    window.scrollBy(0, target.getBoundingClientRect().y - 100);
  });
  await target.hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();
  await page.evaluate(() => window.scrollBy(0, 80));

  await expect
    .poll(async () => {
      const targetBox = await target.boundingBox();
      const menuBox = await menu.boundingBox();
      if (targetBox === null || menuBox === null) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(menuBox.y - (targetBox.y + 28));
    })
    .toBeLessThan(24);

  await page.setViewportSize({ width: 320, height: 300 });
  await expectOverlayWithinViewport(menu, page);
  await menu.getByRole("menuitem", { name: "Numbered List" }).click();

  await expect(
    editable.locator('[data-be-block-id="block-menu-15"]'),
  ).toHaveAttribute("data-be-list-marker", "1.");
  await expect(editable).toBeFocused();
});

test("메뉴보다 짧은 뷰포트에서도 블록 메뉴 맨 아래 Delete 항목을 클릭할 수 있다 (PIT-0011)", async ({
  page,
}) => {
  // 블록 메뉴는 "Turn into" 헤더 + 블록 타입 9개 + 구분선 + Indent + Outdent +
  // Duplicate + Delete라 높이 200px 뷰포트의 클램프 여백(위아래 8px씩)을
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

  await expect(menu.getByRole("menuitem", { name: "Code" })).toBeVisible();

  // overflow-y가 없으면 메뉴 내부 스크롤이 불가능해 이 클릭이 "element is
  // outside of the viewport"로 타임아웃한다(PIT-0011 "가장 아래쪽 항목을
  // 실제로 클릭").
  await menu.getByRole("menuitem", { name: "Delete" }).click();

  await expect(editable.locator("p")).toHaveCount(1);
  await expect(editable.locator("p").first()).toHaveText("second block");
});

test("Enter로 블록을 분리하면 새 블록에 유효한 id가 발급된다 @core", async ({
  page,
}) => {
  // BlockIdExtension.appendTransaction → createId() 경로를 실제로 태운다
  // (Chrome75/83 crypto.randomUUID() 미지원 회귀 — Issue #121).
  const pageErrors = trackPageErrors(page);

  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("first block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second block");

  await expect(editable.locator("p")).toHaveCount(2);
  await expect(editable.locator("p").first()).toHaveText("first block");
  await expect(editable.locator("p").last()).toHaveText("second block");

  // D19(컨테이너 스키마)부터 blockId는 <p> 자신이 아니라 그 부모
  // <div>(blockContainer)에 있다 — closest로 조상 컨테이너를 찾는다
  // (DELTA-02e 정정).
  const newBlockId = await editable
    .locator("p")
    .last()
    .evaluate(
      (node) =>
        node.closest("[data-be-block-id]")?.getAttribute("data-be-block-id") ??
        null,
    );
  expect(newBlockId).toMatch(uuidV4Pattern);

  expect(pageErrors).toHaveLength(0);
});
