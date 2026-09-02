/**
 * 다중 블록 선택(blockSelection, Issue #38 슬라이스7)의 드래그 선택·삭제·
 * 상하 이동·재드래그 이동·해제(바깥 클릭/Escape)를 실제 Chromium pointer
 * 순서로 검증한다. DELTA-01~04(core 명령 + BlockSideMenu 드래그 확장 +
 * BlockSelectionToolbar)가 실제 브라우저에서 맞물려 동작하는지 고정하는
 * 마지막 DELTA다.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import { openDemo } from "./support/demo.js";

// 5개 최상위 형제 + b2의 자식 b2-child. b2를 범위 중간에 끼워 넣어 "범위
// 안 blockId의 children이 flat DOM 순서상 자동으로 하이라이트·이동·삭제에
// 동반됨"(01-계획.md "확인한 사실")을 매 시나리오가 같은 픽스처로 검증한다.
const buildDocument = () => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    { id: "b1", type: "paragraph", content: [{ text: "block one" }] },
    {
      id: "b2",
      type: "paragraph",
      content: [{ text: "block two" }],
      children: [
        {
          id: "b2-child",
          type: "paragraph",
          content: [{ text: "child of two" }],
        },
      ],
    },
    { id: "b3", type: "paragraph", content: [{ text: "block three" }] },
    { id: "b4", type: "paragraph", content: [{ text: "block four" }] },
    { id: "b5", type: "paragraph", content: [{ text: "block five" }] },
  ],
});

const ORIGINAL_DOM_ORDER = ["b1", "b2", "b2-child", "b3", "b4", "b5"];

/**
 * 위 픽스처를 "Document source"/"Load JSON"으로 싣고 렌더를 기다린다.
 * b1 문단을 한 번 클릭해 편집기에 초점을 둔다 — handle
 * pointerdown(preserveFocusOnMouseDown, icon-button.tsx)은 초점을 훔치지
 * 않으므로, 여기서 미리 초점을 주지 않으면 이후 드래그만으로 편집기가
 * 한 번도 focus되지 않아 Control+z가 아무 대상에도 닿지 못하고 PM undo가
 * 발동하지 않는다(실측 발견).
 */
const openWithFixture = async (page: Page): Promise<{ editable: Locator }> => {
  const { editable } = await openDemo(page);
  await page
    .getByLabel("Document source")
    .fill(JSON.stringify(buildDocument()));
  await page.getByRole("button", { name: "Load JSON" }).click();
  await expect(editable.locator("p")).toHaveCount(6);
  await editable.locator('[data-be-block-id="b1"] > p').click();
  return { editable };
};

/** 현재 DOM에 렌더된 블록의 blockId를 document order(전위 순회) 그대로 뽑는다. */
const domBlockIds = async (editable: Locator): Promise<(string | null)[]> =>
  editable
    .locator("[data-be-block-id]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-be-block-id")),
    );

const centerOf = async (
  locator: Locator,
): Promise<{ x: number; y: number }> => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("Bounding box was not available");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** 목표 지점이 어느 블록의 own rect에도 걸리지 않는 "형제 목록 맨 뒤" 지점. */
const belowBottomOf = async (
  locator: Locator,
): Promise<{ x: number; y: number }> => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("Bounding box was not available");
  return { x: box.x + box.width / 2, y: box.y + box.height + 40 };
};

/**
 * `sourceBlockId`의 handle을 눌러 `target` 좌표까지 실제 pointer 순서로
 * 드래그한다. reorder/range-select/range-move 중 어느 모드로 해석되는지는
 * 이 함수가 아니라 core의 현재 blockSelection 상태(pointerdown 시점)와
 * own-rect 판정(block-side-menu.tsx)이 정한다 — 이 헬퍼는 세 모드 모두에
 * 재사용한다.
 */
const dragHandleTo = async (
  page: Page,
  sourceBlockId: string,
  target: { x: number; y: number },
): Promise<void> => {
  await page.locator(`[data-be-block-id="${sourceBlockId}"] > p`).hover();
  const handle = page.getByRole("button", { name: "Drag to reorder" });
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  if (handleBox === null) {
    throw new Error("Handle bounding box was not available");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.mouse.up();
};

test("핸들 드래그로 비인접 형제 범위를 선택하면 하이라이트와 BlockSelectionToolbar가 뜬다", async ({
  page,
}) => {
  await openWithFixture(page);

  // b1 -> b3 own rect(형제 인덱스 차 2, 비인접)로 드래그하면 재정렬이
  // 아니라 range-select로 전환돼 selectBlockRange(b1, b3)가 커밋된다.
  await dragHandleTo(
    page,
    "b1",
    await centerOf(page.locator('[data-be-block-id="b3"]')),
  );

  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toBeVisible();

  const highlighted = await page
    .locator("[data-be-block-selection-highlight]")
    .evaluateAll((elements) =>
      elements.map((element) =>
        element.getAttribute("data-be-highlighted-block-id"),
      ),
    );
  // b1~b3 DOM 순서 슬라이스에는 중간에 낀 b2의 children(b2-child)도
  // 자동으로 포함된다(01-계획.md "확인한 사실").
  expect(highlighted.sort()).toEqual(["b1", "b2", "b2-child", "b3"]);
});

test("삭제 버튼을 클릭하면 선택 범위와 children이 함께 사라지고 Control+z 1회로 복원된다", async ({
  page,
}) => {
  const { editable } = await openWithFixture(page);

  await dragHandleTo(
    page,
    "b1",
    await centerOf(page.locator('[data-be-block-id="b3"]')),
  );
  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete selected blocks" }).click();

  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toHaveCount(0);
  expect(await domBlockIds(editable)).toEqual(["b4", "b5"]);

  await page.keyboard.press("Control+z");

  expect(await domBlockIds(editable)).toEqual(ORIGINAL_DOM_ORDER);
  await expect(
    editable.locator(
      '[data-be-block-id="b2"] > [data-be-block-group] > [data-be-block-id="b2-child"]',
    ),
  ).toHaveCount(1);
});

test("아래로 이동 버튼을 클릭하면 선택 범위와 children이 함께 이동하고 Control+z 1회로 복원된다", async ({
  page,
}) => {
  const { editable } = await openWithFixture(page);

  await dragHandleTo(
    page,
    "b1",
    await centerOf(page.locator('[data-be-block-id="b3"]')),
  );
  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Move selection down" }).click();

  // b1~b3(+b2-child)이 b5 앞으로 이동한다(범위 끝 다음다음 형제 앞,
  // block-selection-toolbar.tsx moveDownBeforeBlockId 계산).
  expect(await domBlockIds(editable)).toEqual([
    "b4",
    "b1",
    "b2",
    "b2-child",
    "b3",
    "b5",
  ]);
  // 이동 뒤에도 같은 범위를 가리키므로 툴바가 사라지지 않는다(DELTA-02
  // 완료 조건 12).
  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toBeVisible();

  await page.keyboard.press("Control+z");

  expect(await domBlockIds(editable)).toEqual(ORIGINAL_DOM_ORDER);
});

test("이미 선택된 범위의 handle을 재드래그하면 범위 전체가 드롭 위치로 이동하고 Control+z 1회로 복원된다", async ({
  page,
}) => {
  const { editable } = await openWithFixture(page);

  await dragHandleTo(
    page,
    "b1",
    await centerOf(page.locator('[data-be-block-id="b3"]')),
  );
  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toBeVisible();

  // 범위(b1~b3) 안에 있는 b2의 handle을 다시 눌러 형제 목록 맨 뒤(b5
  // 아래)로 드래그한다 — 단일 블록(b2)이 아니라 범위 전체가 이동해야 한다.
  await dragHandleTo(
    page,
    "b2",
    await belowBottomOf(page.locator('[data-be-block-id="b5"]')),
  );

  expect(await domBlockIds(editable)).toEqual([
    "b4",
    "b5",
    "b1",
    "b2",
    "b2-child",
    "b3",
  ]);

  await page.keyboard.press("Control+z");

  expect(await domBlockIds(editable)).toEqual(ORIGINAL_DOM_ORDER);
});

test("선택 범위와 무관한 blockId의 handle을 드래그해도 여전히 바깥 클릭으로 선택이 해제된다(회귀, 즉시 리뷰 발견)", async ({
  page,
}) => {
  await openWithFixture(page);

  await dragHandleTo(
    page,
    "b1",
    await centerOf(page.locator('[data-be-block-id="b3"]')),
  );
  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toBeVisible();

  // b4~b5는 선택 범위(b1~b3) 밖이다 — 이 handle을 누르는 것은
  // range-move가 아니라 평범한 단일 블록 재정렬 진입점이므로, 이전
  // 선택은 "바깥 클릭"으로 즉시 해제돼야 한다(DELTA-04 완료 조건 8).
  // BlockSelectionToolbar의 dismiss allow-list를 handle 전체로 넓히는
  // 잘못된 수정은 이 케이스까지 함께 막아버린다(즉시 리뷰 MAJOR-1).
  await page.locator('[data-be-block-id="b4"] > p').hover();
  const handle = page.getByRole("button", { name: "Drag to reorder" });
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  if (handleBox === null) {
    throw new Error("Handle bounding box was not available");
  }
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();

  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toHaveCount(0);
  await expect(page.locator("[data-be-block-selection-highlight]")).toHaveCount(
    0,
  );

  // 드래그 자체는 정상적으로 이어져야 한다(이 회귀와 무관한 정상 경로).
  const b5Center = await centerOf(page.locator('[data-be-block-id="b5"]'));
  await page.mouse.move(b5Center.x, b5Center.y, { steps: 5 });
  await page.mouse.up();
});

test("선택 범위 밖을 클릭하면 하이라이트와 툴바가 사라진다", async ({
  page,
}) => {
  await openWithFixture(page);

  await dragHandleTo(
    page,
    "b1",
    await centerOf(page.locator('[data-be-block-id="b3"]')),
  );
  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save JSON" }).click();

  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toHaveCount(0);
  await expect(page.locator("[data-be-block-selection-highlight]")).toHaveCount(
    0,
  );
});

test("Escape를 누르면 하이라이트와 툴바가 사라지고 편집기로 초점이 복귀해 다음 타이핑이 반영된다", async ({
  page,
}) => {
  const { editable } = await openWithFixture(page);

  // PM 커서를 b5 텍스트 끝에 미리 둔다 — clearBlockSelection은 PM
  // Selection과 독립이라(spec §5.3) 아래 드래그·Escape를 거쳐도 이 커서
  // 위치가 그대로 유지되는지까지 함께 확인한다.
  await editable.locator('[data-be-block-id="b5"] > p').click();
  await page.keyboard.press("End");

  await dragHandleTo(
    page,
    "b1",
    await centerOf(page.locator('[data-be-block-id="b3"]')),
  );
  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toHaveCount(0);
  await expect(page.locator("[data-be-block-selection-highlight]")).toHaveCount(
    0,
  );
  await expect(editable).toBeFocused();

  await page.keyboard.type(" appended");

  await expect(editable.locator('[data-be-block-id="b5"] > p')).toHaveText(
    "block five appended",
  );
});

test("선택 범위가 형제 목록 맨 앞/맨 뒤에 닿으면 해당 방향 이동 버튼이 비활성화된다", async ({
  page,
}) => {
  await openWithFixture(page);

  await dragHandleTo(
    page,
    "b1",
    await centerOf(page.locator('[data-be-block-id="b3"]')),
  );
  await expect(
    page.getByRole("button", { name: "Move selection up" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Move selection down" }),
  ).toBeEnabled();

  await page.getByRole("button", { name: "Save JSON" }).click();
  await expect(
    page.getByRole("toolbar", { name: "Block selection" }),
  ).toHaveCount(0);

  await dragHandleTo(
    page,
    "b3",
    await centerOf(page.locator('[data-be-block-id="b5"]')),
  );
  await expect(
    page.getByRole("button", { name: "Move selection down" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Move selection up" }),
  ).toBeEnabled();
});
