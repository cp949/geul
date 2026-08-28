import { expect, test } from "@playwright/test";

import { openDemo } from "./support/demo.js";
import { trackPageErrors } from "./support/ids.js";

// DELTA-05 D18: computeDragGuide(block-side-menu.tsx)는
// querySelectorAll("[data-be-block-id]") 평면 리스트 + Y좌표 인덱스
// 산술로 드롭 대상을 정한다 — 중첩 DOM에서 이 쿼리는 부모·자식 컨테이너를
// 함께 반환한다. 손상 방어는 editor-controller.ts의 moveBlockBefore D20
// 가드(자식 딸린 source 거절 + 같은-부모 아닌 target 거절)가 소유하므로
// 이 파일은 코드 변경 없이 회귀만 검증한다.
const nestedDocument = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "parent-1",
      type: "paragraph",
      content: [{ text: "parent block" }],
      children: [
        {
          id: "child-1",
          type: "paragraph",
          content: [{ text: "child block" }],
        },
      ],
    },
    { id: "top-2", type: "paragraph", content: [{ text: "top block two" }] },
  ],
};

test("중첩 문서에서 side-menu 드래그 드롭이 모델을 손상시키지 않는다 (DELTA-05)", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const { editable } = await openDemo(page);

  await page.getByLabel("Document source").fill(JSON.stringify(nestedDocument));
  await page.getByRole("button", { name: "Load JSON" }).click();

  // 로드 직후 구조 확인: child-1은 parent-1의 blockGroup 안에, top-2는
  // 최상위에 있다.
  await expect(
    editable.locator(
      '[data-be-block-id="parent-1"] > [data-be-block-group] > [data-be-block-id="child-1"]',
    ),
  ).toHaveCount(1);
  await expect(editable.locator("p")).toHaveCount(3);

  const topParagraph = editable.locator('[data-be-block-id="top-2"] > p');
  const childParagraph = editable.locator('[data-be-block-id="child-1"] > p');

  await topParagraph.hover();
  const handle = page.getByRole("button", { name: "Drag to reorder" });
  await expect(handle).toBeVisible();

  const handleBox = await handle.boundingBox();
  const childBox = await childParagraph.boundingBox();
  if (handleBox === null || childBox === null) {
    throw new Error("Bounding boxes were not available");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  // child-1 자신의 줄 상단 바로 아래로 포인터를 옮긴다 — parent-1
  // 컨테이너는 child-1을 DOM 안에 품고 있어 그 bounding rect가 자기 텍스트
  // + child-1 텍스트를 모두 덮는다. 이 Y는 parent-1 전체의 세로 중심보다는
  // 아래(그래서 computeDragGuide가 parent-1을 건너뛴다)면서 child-1 자신의
  // 세로 중심보다는 위(그래서 child-1이 targetIndex로 뽑힌다)에 있다 —
  // 즉 드롭 목표가 "child-1의 형제 목록 앞"이 되어 D20의 같은-부모 가드가
  // 정확히 이 케이스를 거절해야 한다.
  await page.mouse.move(childBox.x + childBox.width / 2, childBox.y + 2, {
    steps: 5,
  });
  await page.mouse.up();

  // 거절(COMMAND_NOT_APPLICABLE)로 끝나 문서가 원래 구조 그대로다 — top-2는
  // parent-1의 자식으로 편입되지 않았고 순서도 그대로다.
  await expect(editable.locator("p")).toHaveCount(3);
  await expect(editable.locator("p").nth(0)).toHaveText("parent block");
  await expect(editable.locator("p").nth(1)).toHaveText("child block");
  await expect(editable.locator("p").nth(2)).toHaveText("top block two");
  await expect(
    editable.locator(
      '[data-be-block-id="parent-1"] > [data-be-block-group] > [data-be-block-id="child-1"]',
    ),
  ).toHaveCount(1);
  await expect(
    editable.locator(
      '[data-be-block-id="parent-1"] [data-be-block-id="top-2"]',
    ),
  ).toHaveCount(0);

  expect(pageErrors).toHaveLength(0);
});
