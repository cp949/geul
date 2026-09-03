import { expect, test } from "@playwright/test";

import { openDemo } from "./support/demo.js";
import { trackPageErrors } from "./support/ids.js";

// Issue #125(D1)부터 moveBlockBefore는 cross-parent 이동(다른 부모의
// children 목록 임의 위치)을 허용한다 — 이 파일은 옛 DELTA-05가 고정했던
// "거절" 계약을 GREEN(성공) 계약으로 교체하고, 자식이 있는 블록 자신을
// 드래그할 때 하위 트리 전체가 동반 이동하는지(UI-003)를 추가로 검증한다.
// 두 시나리오 모두 target·source를 DOM index가 아니라 blockId로 판정한다는
// computeDragGuide/moveBlockBefore의 계약은 그대로다(G-UI-002) — 달라진
// 것은 core가 그 결과를 더 이상 거절하지 않는다는 점뿐이다.
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

test("중첩 문서에서 side-menu 드래그 드롭이 cross-parent 이동으로 성공하고 undo 1회로 원래 구조를 복원한다 (Issue #125 D1)", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const { editable } = await openDemo(page);

  await page.getByLabel("Document source").fill(JSON.stringify(nestedDocument));
  await page.getByRole("button", { name: "Load JSON" }).click();
  // 편집기에 초점을 둔다 — 그러지 않으면 초점이 "Load JSON" 버튼에 남아
  // 아래 Control+z가 편집기의 undo 키맵에 닿지 않고 조용히 무시된다.
  await editable.click();

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
  // child-1 자신의 줄 상단 바로 아래로 포인터를 옮긴다 — 드롭 목표가
  // "child-1의 형제 목록(= parent-1의 children) 앞"이 된다.
  await page.mouse.move(childBox.x + childBox.width / 2, childBox.y + 2, {
    steps: 5,
  });
  await page.mouse.up();

  // top-2가 parent-1의 자식으로 편입되고 child-1 바로 앞에 놓인다 —
  // D1(a)(다른 부모의 children 목록 안 임의 위치)가 실제 drag 경로에서도
  // 성립함을 확인한다. 이동 후 최상위 블록이 parent-1(자식 있음) 하나뿐이라
  // 같은 dispatch 안에서 UI-010 trailing paragraph가 하나 더 붙는다 —
  // 3개가 아니라 4개다.
  await expect(editable.locator("p")).toHaveCount(4);
  await expect(editable.locator("p").nth(0)).toHaveText("parent block");
  await expect(editable.locator("p").nth(1)).toHaveText("top block two");
  await expect(editable.locator("p").nth(2)).toHaveText("child block");
  await expect(editable.locator("p").nth(3)).toHaveText("");
  await expect(
    editable.locator(
      '[data-be-block-id="parent-1"] > [data-be-block-group] > [data-be-block-id="top-2"]',
    ),
  ).toHaveCount(1);
  await expect(
    editable.locator(
      '[data-be-block-id="parent-1"] > [data-be-block-group] > [data-be-block-id="child-1"]',
    ),
  ).toHaveCount(1);

  await page.keyboard.press("Control+z");

  // undo 1회로 원래 DOM 구조(top-2가 다시 최상위, child-1이 다시 parent-1의
  // 유일한 자식)로 완전히 복원된다.
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

const subtreeDocument = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "group-1",
      type: "paragraph",
      content: [{ text: "group block" }],
      children: [
        {
          id: "group-1-child",
          type: "paragraph",
          content: [{ text: "group child block" }],
        },
      ],
    },
    { id: "solo-1", type: "paragraph", content: [{ text: "solo block" }] },
  ],
};

test("자식이 있는 블록 자신을 드래그하면 하위 트리 전체가 동반 이동하고 undo 1회로 복원된다 (Issue #125 UI-003)", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const { editable } = await openDemo(page);

  await page
    .getByLabel("Document source")
    .fill(JSON.stringify(subtreeDocument));
  await page.getByRole("button", { name: "Load JSON" }).click();
  // 편집기에 초점을 둔다 — 그러지 않으면 초점이 "Load JSON" 버튼에 남아
  // 아래 Control+z가 편집기의 undo 키맵에 닿지 않고 조용히 무시된다.
  await editable.click();

  await expect(
    editable.locator(
      '[data-be-block-id="group-1"] > [data-be-block-group] > [data-be-block-id="group-1-child"]',
    ),
  ).toHaveCount(1);
  await expect(editable.locator("p")).toHaveCount(3);

  // group-1 "자신"(그 자식이 아니라)의 줄을 hover해 핸들을 그 블록에
  // 붙인다 — 하위 트리를 가진 블록을 직접 드래그하는 시나리오다.
  const groupParagraph = editable.locator('[data-be-block-id="group-1"] > p');
  const soloParagraph = editable.locator('[data-be-block-id="solo-1"] > p');
  await groupParagraph.hover();
  const handle = page.getByRole("button", { name: "Drag to reorder" });
  await expect(handle).toBeVisible();

  const handleBox = await handle.boundingBox();
  const soloBox = await soloParagraph.boundingBox();
  if (handleBox === null || soloBox === null) {
    throw new Error("Bounding boxes were not available");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  // solo-1 아래로 포인터를 옮겨 문서 끝으로의 이동을 요청한다(beforeBlockId
  // null, R2 — 최상위 문서 끝).
  await page.mouse.move(
    soloBox.x + soloBox.width / 2,
    soloBox.y + soloBox.height + 20,
    { steps: 5 },
  );
  await page.mouse.up();

  // group-1이 solo-1 뒤로 이동하되, group-1-child는 여전히 group-1의
  // blockGroup 안에 남아 하위 트리 전체가 함께 옮겨졌음을 보여준다. 이동 후
  // 최상위 마지막 블록이 group-1(자식 있음)이라 같은 dispatch 안에서
  // UI-010 trailing paragraph가 하나 더 붙는다 — 3개가 아니라 4개다.
  await expect(editable.locator("p")).toHaveCount(4);
  await expect(editable.locator("p").nth(0)).toHaveText("solo block");
  await expect(editable.locator("p").nth(1)).toHaveText("group block");
  await expect(editable.locator("p").nth(2)).toHaveText("group child block");
  await expect(editable.locator("p").nth(3)).toHaveText("");
  await expect(
    editable.locator(
      '[data-be-block-id="group-1"] > [data-be-block-group] > [data-be-block-id="group-1-child"]',
    ),
  ).toHaveCount(1);

  await page.keyboard.press("Control+z");

  // undo 1회로 순서와 하위 트리 귀속이 모두 원래대로 복원된다.
  await expect(editable.locator("p")).toHaveCount(3);
  await expect(editable.locator("p").nth(0)).toHaveText("group block");
  await expect(editable.locator("p").nth(1)).toHaveText("group child block");
  await expect(editable.locator("p").nth(2)).toHaveText("solo block");
  await expect(
    editable.locator(
      '[data-be-block-id="group-1"] > [data-be-block-group] > [data-be-block-id="group-1-child"]',
    ),
  ).toHaveCount(1);

  expect(pageErrors).toHaveLength(0);
});
