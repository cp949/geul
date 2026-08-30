/**
 * 실제 브라우저에서 서식 툴바의 표시, 키보드·포인터 조작, 계산 스타일과
 * 뷰포트 배치를 검증한다.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  CLAMP_BOUNDARY_MIN_MARGIN_PX,
  expectOverlayWithinViewport,
} from "./support/clamp.js";
import { openDemo } from "./support/demo.js";
import { selectBlockTextAndNotify } from "./support/selection.js";

/**
 * 실제 역방향 순차 포커스로 대상 버튼에 도달한다.
 * programmatic focus가 숨기는 tabIndex·기본 동작 억제 회귀를 드러낸다.
 */
const focusWithShiftTab = async (page: Page, target: Locator) => {
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press("Shift+Tab");
    const focused = await target.evaluate(
      (element) => element === element.ownerDocument.activeElement,
    );
    if (focused) break;
  }
  await expect(target).toBeFocused();
};

/**
 * 편집기 선택을 만든 뒤 공용 역방향 순차 포커스 경로로 Bold에 도달한다.
 */
const focusBoldFromEditorWithShiftTab = async (page: Page) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  const bold = page.getByRole("button", { name: "Bold" });
  await expect(bold).toBeVisible();

  // 데모 DOM에서 툴바가 에디터보다 앞에 있어 역방향 Tab으로 도달한다.
  await focusWithShiftTab(page, bold);
  return { bold, editable };
};

test("텍스트가 선택된 동안에만 서식 툴바를 표시한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  const toolbar = page.getByRole("toolbar", { name: "Formatting" });

  await expect(toolbar).not.toBeVisible();

  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");
  await expect(toolbar).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(toolbar).not.toBeVisible();
});

test("선택을 잃지 않고 선택 텍스트의 굵게와 밑줄을 토글한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  await page.getByRole("button", { name: "Bold" }).click();
  await expect(editable.locator("strong")).toHaveText("Hello R1");
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "Underline" }).click();
  await expect(editable.locator("strong u, u strong")).toHaveText("Hello R1");

  await page.getByRole("button", { name: "Bold" }).click();
  await expect(editable.locator("strong")).toHaveCount(0);
  await expect(editable.locator("u")).toHaveText("Hello R1");
});

test("선택 텍스트의 취소선과 인라인 코드를 토글한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  await page.getByRole("button", { name: "Strikethrough" }).click();
  await expect(editable.locator("s")).toHaveText("Hello R1");
  await expect(
    page.getByRole("button", { name: "Strikethrough" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Strikethrough" }).click();
  await expect(editable.locator("s")).toHaveCount(0);

  await page.getByRole("button", { name: "Inline code" }).click();
  await expect(editable.locator("code")).toHaveText("Hello R1");
  await expect(
    page.getByRole("button", { name: "Inline code" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("키보드만으로 굵게 버튼에 도달해 토글한다 @core", async ({ page }) => {
  const { bold, editable } = await focusBoldFromEditorWithShiftTab(page);
  await page.keyboard.press("Enter");

  await expect(editable.locator("strong")).toHaveText("Hello R1");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("toolbar", { name: "Formatting" })).toBeVisible();

  const underline = page.getByRole("button", { name: "Underline" });
  await focusWithShiftTab(page, underline);
  await page.keyboard.press("Enter");

  await expect(editable.locator("strong u, u strong")).toHaveText("Hello R1");
  await expect(underline).toHaveAttribute("aria-pressed", "true");
});

test("소비자 전역 CSS가 lucide 클래스를 겨냥해도 아이콘 크기가 16px로 유지된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  // 소비자 앱이 자기 lucide 아이콘을 전역 CSS로 스타일링하는 상황을 재현한다.
  // geul 내부 아이콘은 inline style 방어로 영향을 받지 않아야 한다.
  await page.addStyleTag({
    content: ".lucide { width: 3rem; height: 3rem; } svg { width: 2rem; }",
  });
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  const icon = page.getByRole("button", { name: "Bold" }).locator("svg");
  await expect(icon).toBeVisible();
  const box = await icon.boundingBox();
  expect(box?.width).toBe(16);
  expect(box?.height).toBe(16);
});

test("mark 토글을 undo 1회로 복원한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  await page.getByRole("button", { name: "Italic" }).click();
  await expect(editable.locator("em")).toHaveText("Hello R1");

  await page.keyboard.press("Control+z");
  await expect(editable.locator("em")).toHaveCount(0);
  await expect(editable).toHaveText("Hello R1");
});

test("툴바를 선택한 텍스트 옆에 배치한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("first");
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }

  const selectionBox = await selectBlockTextAndNotify(
    editable.locator("p").last(),
    "Last block",
  );
  const toolbarBox = await page
    .getByRole("toolbar", { name: "Formatting" })
    .boundingBox();

  expect(toolbarBox).not.toBeNull();
  expect(
    Math.abs((toolbarBox?.y ?? 0) + (toolbarBox?.height ?? 0) - selectionBox.y),
  ).toBeLessThan(24);

  await page.evaluate(() => window.scrollBy(0, 200));
  await expect
    .poll(async () => {
      const scrolledSelectionBox = await page.evaluate(() =>
        document.getSelection()?.getRangeAt(0).getBoundingClientRect().toJSON(),
      );
      const scrolledToolbarBox = await page
        .getByRole("toolbar", { name: "Formatting" })
        .boundingBox();
      if (scrolledSelectionBox === undefined || scrolledToolbarBox === null) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(
        scrolledToolbarBox.y +
          scrolledToolbarBox.height -
          scrolledSelectionBox.y,
      );
    })
    .toBeLessThan(24);

  await page.setViewportSize({ width: 320, height: 200 });
  await expectOverlayWithinViewport(
    page.getByRole("toolbar", { name: "Formatting" }),
    page,
  );
  await page.getByRole("button", { name: "Inline code" }).click();
  await expect(editable.locator("code").last()).toHaveText("line 11");
});

test("선택이 뷰포트 좌상단 모서리에 붙어도 서식 툴바 전체가 화면 안에 남는다 (PIT-0011)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("first line");
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }

  const selectionBox = await selectBlockTextAndNotify(
    editable.locator("p").first(),
    "First block",
  );

  // 첫 줄이 뷰포트 맨 위(y≈2)로 오도록 정확히 그만큼만 스크롤해 선택을 화면
  // 좌상단 모서리에 붙인다. 데모 셸(width: min(76rem, 100% - 2rem), 가운데
  // 정렬) + .editor-panel 테두리 + .geul-editor 패딩 1.5rem이라 1280px 뷰포트에서
  // 첫 줄 텍스트의 좌측은 x≈50, 선택 중심은 x≈82다 — 즉 세로뿐 아니라 가로로도
  // 이미 뷰포트 가장자리다.
  await page.evaluate((delta) => window.scrollBy(0, delta), selectionBox.y - 2);

  const toolbar = page.getByRole("toolbar", { name: "Formatting" });

  // 가로: 이 시나리오의 실제 RED. 클램프 이전 코드는
  // left = min(max(중심x, 96), max(innerWidth - 96, 96))로 96px 바닥값만 뒀는데,
  // 툴바는 translate(-50%)로 그 좌표에 중심이 걸리고 폭이 약 250px(Block type
  // select + 아이콘 버튼 5개)이라 박스 좌측이 96 - 125 ≈ -31로 뷰포트를 벗어났다
  // (중심 x≈82도 폭 절반보다 작아 바닥값이 걸리든 말든 음수다). 가장 왼쪽 컨트롤인
  // Block type select가 화면 밖으로 잘려나가는 PIT-0011 그 결함이다.
  await expect
    .poll(async () => (await toolbar.boundingBox())?.x ?? -1)
    .toBeGreaterThanOrEqual(CLAMP_BOUNDARY_MIN_MARGIN_PX);

  // 세로: 클램프 이전 코드는 top = max(bounds.top, 48)로 48px 바닥값을 뒀고, 한 줄
  // 툴바 높이가 약 37px이라 박스 상단이 48 - 37 - 8 ≈ 3으로 이미 화면 안이었다.
  // 즉 이 assertion은 PIT-0011의 원래 실패를 재현하지 않고 useClampedMenuPosition의
  // anchor 계약(centerAbove = translate(-50%, calc(-100% - 0.5rem)) 오프셋 상쇄)을
  // 지킨다 — anchor 없이 top만 클램프했던 최초 마이그레이션은 여기서 y=-37로 렌더됐다.
  // MENU_VIEWPORT_MARGIN이 8을 보장한다(minTop = 8 + height + 8이라 박스 상단이
  // 정확히 8) — 경계값 8은 서브픽셀 반올림에 흔들릴 수 있어 허용오차를 뺀
  // CLAMP_BOUNDARY_MIN_MARGIN_PX만 요구한다(e2e/support/clamp.ts).
  await expect
    .poll(async () => (await toolbar.boundingBox())?.y ?? -1)
    .toBeGreaterThanOrEqual(CLAMP_BOUNDARY_MIN_MARGIN_PX);

  // Bold는 툴바 오른쪽 끝이라 클램프 없이도 클릭 자체는 됐다. 클램프로 위치를
  // 옮긴 뒤에도 선택을 잃지 않고 mark가 적용되는지 확인하는 용도다.
  await page.getByRole("button", { name: "Bold" }).click();
  await expect(editable.locator("strong")).toHaveText("first line");
});

test("실제 범위 선택을 글머리 목록으로 바꾸면 현재 옵션과 목록 DOM을 갱신한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("선택한 목록 내용");

  await selectBlockTextAndNotify(editable.locator("p").first(), "List source");

  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  const blockTypeSelect = page.getByRole("combobox", { name: "Block type" });
  await expect(toolbar).toBeVisible();
  await expect(blockTypeSelect).toHaveValue("paragraph");

  await blockTypeSelect.selectOption("bullet-list");

  await expect(toolbar).toBeVisible();
  await expect(blockTypeSelect).toHaveValue("bullet-list");
  const listItem = editable.locator("[data-be-list-marker]").first();
  await expect(listItem).toHaveAttribute("data-be-list-marker", "•");
  await expect(listItem).toContainText("선택한 목록 내용");
});

test("들여쓰기 버튼 클릭 후 자식 블록이 부모보다 좌측으로 들여쓰여 렌더링되고 undo 1회로 복원된다 (DELTA-05)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  // Enter로 두 형제 블록을 만드는 대신 Load JSON으로 이미 평면인 두 블록을
  // 올린다 — DELTA-05 입력이 명시한 대안(demo의 Document source textarea +
  // Load JSON)이다. 작성 당시엔 Enter 분리가 형제 대신 자식으로 중첩되는
  // 회귀 때문의 우회였으나 그 회귀는 DELTA-02d가 수정했다 — 지금은 원하는
  // 블록 배치를 결정적으로 만드는 setup 수단으로 유지한다.
  const flatDocument = {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "first-block",
        type: "paragraph",
        content: [{ text: "first block" }],
      },
      {
        id: "second-block",
        type: "paragraph",
        content: [{ text: "second block" }],
      },
    ],
  };
  await page.getByLabel("Document source").fill(JSON.stringify(flatDocument));
  await page.getByRole("button", { name: "Load JSON" }).click();

  const firstParagraph = editable.locator(
    '[data-be-block-id="first-block"] > p',
  );
  const secondParagraph = editable.locator(
    '[data-be-block-id="second-block"] > p',
  );
  const beforeIndentBox = await secondParagraph.boundingBox();
  if (beforeIndentBox === null) {
    throw new Error("Bounding box was not available");
  }

  await selectBlockTextAndNotify(secondParagraph, "second block");
  // 들여쓰기 전에는 blockGroup wrapper가 없다 — DELTA-02 컨테이너는 자식이
  // 있을 때만 그 노드를 만든다.
  await expect(page.locator("[data-be-block-group]")).toHaveCount(0);

  await page.getByRole("button", { name: "Indent" }).click();

  // indentBlockCommand는 대상을 앞 형제(첫 블록)의 blockGroup 자식으로
  // 옮긴다(indent-commands.ts) — 옮겨진 즉시 DOM에 wrapper가 새로 생긴다.
  await expect(page.locator("[data-be-block-group]")).toHaveCount(1);

  const afterIndentBox = await secondParagraph.boundingBox();
  const firstBox = await firstParagraph.boundingBox();
  if (afterIndentBox === null || firstBox === null) {
    throw new Error("Bounding box was not available");
  }
  // 변이 확인(RED): _editor.scss의 [data-be-block-group] padding-left
  // 규칙을 지우면 DOM은 중첩돼도 시각 오프셋이 없어 아래 두 assertion이
  // 실패한다 — 구현 중 직접 지워 재현했고(RED), 되돌린 뒤 이 커밋을 냈다.
  expect(afterIndentBox.x).toBeGreaterThan(firstBox.x);
  expect(afterIndentBox.x).toBeGreaterThan(beforeIndentBox.x);

  await page.keyboard.press("Control+z");

  await expect(page.locator("[data-be-block-group]")).toHaveCount(0);
  const afterUndoBox = await secondParagraph.boundingBox();
  expect(Math.abs((afterUndoBox?.x ?? -1000) - beforeIndentBox.x)).toBeLessThan(
    2,
  );

  // 깊이 누적 확인(조건 7 후반): 3단 중첩 문서를 로드해 깊이가 늘수록
  // 오프셋이 누적되는지 확인한다 — 그룹 padding 규칙 하나가 DOM 중첩을
  // 타고 재귀 적용되는지의 실측이다(D18).
  const nestedDocument = {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "grandparent-1",
        type: "paragraph",
        content: [{ text: "grandparent text" }],
        children: [
          {
            id: "parent-1",
            type: "paragraph",
            content: [{ text: "parent text" }],
            children: [
              {
                id: "child-1",
                type: "paragraph",
                content: [{ text: "child text" }],
              },
            ],
          },
        ],
      },
    ],
  };
  await page.getByLabel("Document source").fill(JSON.stringify(nestedDocument));
  await page.getByRole("button", { name: "Load JSON" }).click();

  const grandparentBox = await editable
    .locator('[data-be-block-id="grandparent-1"] > p')
    .boundingBox();
  const parentBox = await editable
    .locator('[data-be-block-id="parent-1"] > p')
    .boundingBox();
  const childBox = await editable
    .locator('[data-be-block-id="child-1"] > p')
    .boundingBox();
  if (grandparentBox === null || parentBox === null || childBox === null) {
    throw new Error("Bounding box was not available");
  }
  expect(parentBox.x).toBeGreaterThan(grandparentBox.x);
  expect(childBox.x).toBeGreaterThan(parentBox.x);
});

test("텍스트를 다시 선택하지 않고 두 단계 들여쓰기와 연속 내어쓰기를 적용한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const sourceDocument = {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "outer",
        type: "paragraph",
        content: [{ text: "outer" }],
        children: [
          { id: "inner", type: "paragraph", content: [{ text: "inner" }] },
        ],
      },
      {
        id: "target",
        type: "paragraph",
        content: [{ text: "target text" }],
      },
    ],
  };
  await page.getByLabel("Document source").fill(JSON.stringify(sourceDocument));
  await page.getByRole("button", { name: "Load JSON" }).click();

  const target = editable.locator('[data-be-block-id="target"] > p');
  await selectBlockTextAndNotify(target, "target text");
  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  const indent = page.getByRole("button", { name: "Indent" });
  const outdent = page.getByRole("button", { name: "Outdent" });

  await expect(toolbar).toBeVisible();
  await expect(indent).toBeEnabled();
  await expect(outdent).toBeDisabled();

  await indent.click();
  await expect(
    editable.locator(
      '[data-be-block-id="outer"] > [data-be-block-group] > [data-be-block-id="target"]',
    ),
  ).toHaveCount(1);
  await expect(toolbar).toBeVisible();
  await expect(indent).toBeEnabled();
  await expect(outdent).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => document.getSelection()?.toString()))
    .toBe("target text");

  await indent.click();
  await expect(
    editable.locator(
      '[data-be-block-id="inner"] > [data-be-block-group] > [data-be-block-id="target"]',
    ),
  ).toHaveCount(1);

  await outdent.click();
  await expect(
    editable.locator(
      '[data-be-block-id="outer"] > [data-be-block-group] > [data-be-block-id="target"]',
    ),
  ).toHaveCount(1);
  await outdent.click();
  await expect(
    editable.locator(':scope > [data-be-block-id="target"]'),
  ).toHaveCount(1);
  await expect(toolbar).toBeVisible();
  await expect(outdent).toBeDisabled();
  await expect
    .poll(() => page.evaluate(() => document.getSelection()?.toString()))
    .toBe("target text");
});
