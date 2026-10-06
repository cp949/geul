/**
 * 접힌 toggle이 가린 블록이 오버레이 앵커·측정·드롭 후보로 쓰이지 않는지 실제
 * 브라우저에서 확인한다(Issue #280).
 *
 * 결함: 접힘은 `display: none` decoration이라 숨은 블록의 rect가 0x0이다. 이
 * rect가 앵커나 드롭 위치로 쓰이면 오버레이가 뷰포트 왼쪽 위 구석에 `visible`로
 * 남고, 드롭이 보이지 않는 블록 앞에 놓인다. jsdom은 레이아웃이 없어 0x0 rect가
 * 실제 위치 계산을 거치는 모양을 재현하지 못한다.
 *
 * 경로 네 가지를 본다.
 * - 표 행·그립 메뉴가 열린 채 표가 접힌다.
 * - hover 중인 자식 블록이 접힌다(gutter·코드블록 툴바·callout 트리거).
 * - 접힌 toggle이 낀 범위를 블록 선택한다(툴바 위치).
 * - 접힌 toggle이 있는 문서에서 블록을 뷰포트 위 밖으로 끌어 놓는다(드롭 후보).
 *
 * 판정 기준은 `visibility`다. 접힘 뒤에는 DOM 요소 참조가 낡으므로 locator를
 * 다시 찾는다. 숨김 단언이 가짜로 통과하지 않게, 각 시나리오는 접히기 전에
 * 오버레이가 보이는 것을 먼저 확인한다(G-TST-001).
 *
 * 문서는 apps/demo의 "Document source"/"Load JSON"으로 싣는다. 데모는 안쪽 스크롤
 * 영역이 없어 창 스크롤 상태다. 안쪽 스크롤 영역 시나리오는 편집기 래퍼에
 * `max-height`와 `overflow-y`를 줘 만든다.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import { domBlockIds } from "./support/block-order.js";
import { blockSelectionToolbar } from "./support/block-selection-toolbar.js";
import { openDemo } from "./support/demo.js";
import { yieldFrame } from "./support/yield-frame.js";

test.use({ viewport: { width: 1280, height: 720 } });

type Block = Record<string, unknown>;

const paragraph = (id: string, text: string): Block => ({
  id,
  type: "paragraph",
  content: [{ text }],
});

/** 접힌 toggle. 자식은 접힌 동안 숨는다. */
const collapsedToggle = (id: string, children: Block[]): Block => ({
  id,
  type: "toggleListItem",
  content: [{ text: `toggle ${id}` }],
  collapsed: true,
  children,
});

/** 3행 2열 표. */
const tableBlock = (id: string): Block => ({
  id,
  type: "table",
  columns: [
    { id: `${id}-c1`, width: 160 },
    { id: `${id}-c2`, width: 160 },
  ],
  rows: [1, 2, 3].map((row) => ({
    id: `${id}-r${row}`,
    cells: [1, 2].map((column) => ({
      id: `${id}-r${row}c${column}`,
      columnId: `${id}-c${column}`,
      rowSpan: 1,
      columnSpan: 1,
      content: [{ text: `r${row}c${column}` }],
    })),
  })),
  headerRows: 0,
  headerColumns: 0,
});

/** `blocks`를 "Load JSON"으로 싣고 렌더를 기다린다. */
const loadBlocks = async (page: Page, blocks: Block[]) => {
  const { editable } = await openDemo(page);
  await page
    .getByLabel("Document source")
    .fill(JSON.stringify({ formatVersion: 1, revision: 0, blocks }));
  await page.getByRole("button", { name: "Load JSON" }).click();
  await expect(
    editable.locator(`[data-geul-block-id="${blocks[0]!.id}"]`),
  ).toBeVisible();
  return { editable };
};

const blockOf = (editable: Locator, id: string) =>
  editable.locator(`[data-geul-block-id="${id}"]`);

/** 접힌 toggle의 마커를 눌러 펼친다. 이 펼침은 undo 한 번으로 다시 접힌다. */
const expandToggle = async (editable: Locator, id: string) => {
  await blockOf(editable, id)
    .locator("[data-geul-toggle-marker]")
    .first()
    .click();
  await expect(
    blockOf(editable, id).locator("[data-geul-block-group]"),
  ).toBeVisible();
};

/** 대상이 접혀 숨을 때까지 기다린다. */
const expectHidden = (target: Locator) => expect(target).toBeHidden();

const centerOf = async (target: Locator) => {
  const box = await target.boundingBox();
  if (box === null) throw new Error("bounding box 없음");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test("행 메뉴가 열린 채 표가 접히면 메뉴가 닫히고 Delete row가 남지 않는다(#280)", async ({
  page,
}) => {
  const { editable } = await loadBlocks(page, [
    collapsedToggle("t1", [tableBlock("tb")]),
    paragraph("tail", "tail"),
  ]);
  await expandToggle(editable, "t1");
  const table = blockOf(editable, "tb");
  const cell = table.locator("td").first();
  await cell.click();
  await cell.hover();
  const handle = page.locator("[data-geul-table-row-handle]").nth(1);
  await handle.click();
  const menu = page.locator("[data-geul-table-menu]");
  await expect(menu, "전제: 행 메뉴가 열린다").toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Delete row" }),
    "전제: Delete row가 보인다",
  ).toBeVisible();

  await page.keyboard.press("Control+z");
  await expectHidden(table);

  await expect(menu, "접힌 뒤 메뉴").toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Delete row" })).toHaveCount(
    0,
  );
  await expect(table.locator("tr")).toHaveCount(3);
});

test("표 그립 메뉴가 열린 채 표가 접히면 메뉴가 닫힌다(#280)", async ({
  page,
}) => {
  const { editable } = await loadBlocks(page, [
    collapsedToggle("t1", [tableBlock("tb")]),
    paragraph("tail", "tail"),
  ]);
  await expandToggle(editable, "t1");
  const table = blockOf(editable, "tb");
  const cell = table.locator("td").first();
  await cell.click();
  await cell.hover();
  const grip = page.locator("[data-geul-table-grip]");
  await expect(grip, "전제: 그립이 보인다").toBeVisible();
  await grip.click();
  const menu = page.locator("[data-geul-table-grip-menu]");
  await expect(menu, "전제: 그립 메뉴가 열린다").toBeVisible();

  await page.keyboard.press("Control+z");
  await expectHidden(table);

  await expect(menu, "접힌 뒤 그립 메뉴").toHaveCount(0);
  await expect(table.locator("tr")).toHaveCount(3);
});

const codeBlock = (id: string): Block => ({
  id,
  type: "codeBlock",
  content: [{ text: "const a = 1;" }],
});

const callout = (id: string): Block => ({
  id,
  type: "callout",
  icon: "💡",
  content: [{ text: "callout text" }],
});

/**
 * 접힌 toggle을 펼치고, 꼬리 문단에 캐럿을 둬 편집기에 초점을 준 뒤 `childId`
 * 위에 포인터를 둔다. 초점이 편집기에 있어야 `Control+z`가 닿는다.
 */
const hoverExpandedChild = async (page: Page, childId: string) => {
  const { editable } = await loadBlocks(page, [
    collapsedToggle("t1", [
      paragraph("pc", "child paragraph"),
      codeBlock("cb"),
      callout("co"),
    ]),
    paragraph("tail", "tail"),
  ]);
  await expandToggle(editable, "t1");
  await blockOf(editable, "tail").click();
  await yieldFrame(page);
  const child = blockOf(editable, childId);
  await child.hover();
  return { editable, child };
};

test("hover 중인 자식 문단이 접히면 gutter가 남지 않고 블록 수가 유지된다(#280)", async ({
  page,
}) => {
  const { editable } = await hoverExpandedChild(page, "pc");
  const gutter = page.locator(".geul-block-gutter");
  await expect(gutter, "전제: hover한 문단에 gutter가 뜬다").toBeVisible();
  const blockCount = await editable.locator("[data-geul-block-id]").count();

  await page.keyboard.press("Control+z");
  await expectHidden(blockOf(editable, "pc"));

  await expect(gutter, "접힌 뒤 gutter").toBeHidden();
  await expect(editable.locator("[data-geul-block-id]")).toHaveCount(
    blockCount,
  );
});

test("hover 중인 자식 codeBlock이 접히면 코드블록 툴바가 남지 않는다(#280)", async ({
  page,
}) => {
  const { editable } = await hoverExpandedChild(page, "cb");
  const toolbar = page.locator(".geul-code-block-toolbar");
  await expect(toolbar, "전제: hover한 코드블록에 툴바가 뜬다").toBeVisible();

  await page.keyboard.press("Control+z");
  await expectHidden(blockOf(editable, "cb"));

  await expect(toolbar, "접힌 뒤 코드블록 툴바").toBeHidden();
});

test("hover 중인 자식 callout이 접히면 아이콘 트리거가 남지 않는다(#280)", async ({
  page,
}) => {
  const { editable } = await hoverExpandedChild(page, "co");
  const trigger = page.locator("[data-geul-callout-icon-trigger]");
  await expect(trigger, "전제: hover한 callout에 트리거가 뜬다").toBeVisible();

  await page.keyboard.press("Control+z");
  await expectHidden(blockOf(editable, "co"));

  await expect(trigger, "접힌 뒤 callout 트리거").toBeHidden();
});

/** 첫 문단 p1–p12, 접힌 toggle(자식 c1·c2), 뒤 문단 after, 뒤 문단 q1–q60. */
const longDocument = (): Block[] => [
  ...Array.from({ length: 12 }, (_, i) => paragraph(`p${i + 1}`, `p${i + 1}`)),
  collapsedToggle("t1", [paragraph("c1", "c1"), paragraph("c2", "c2")]),
  paragraph("after", "after"),
  ...Array.from({ length: 60 }, (_, i) => paragraph(`q${i + 1}`, `q${i + 1}`)),
];

/** `block` 위에 포인터를 두고 gutter의 드래그 핸들 중심에서 `to`까지 끌어 놓는다. */
const dragGutterHandle = async (
  page: Page,
  block: Locator,
  to: { x: number; y: number },
  { release = true }: { release?: boolean } = {},
) => {
  await block.hover();
  const handle = page.getByRole("button", { name: "Drag to reorder" });
  await expect(handle).toBeVisible();
  const from = await centerOf(handle);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  if (release) await page.mouse.up();
};

/** `block`의 top이 뷰포트 `top`px에 오게 창을 스크롤한다. */
const scrollWindowSoBlockTopIs = (block: Locator, top: number) =>
  block.evaluate((element, target) => {
    window.scrollBy(0, element.getBoundingClientRect().top - target);
  }, top);

/** 블록 선택 툴바가 선택 맨 위 블록 바로 위에 있는지 poll로 확인한다. */
const expectToolbarAbove = async (
  page: Page,
  selectionTopBlock: Locator,
  label: string,
) => {
  const toolbar = blockSelectionToolbar(page);
  await expect(toolbar, `${label}: 툴바가 보인다`).toBeVisible();
  await expect
    .poll(
      async () => {
        const toolbarBox = await toolbar.boundingBox();
        const blockBox = await selectionTopBlock.boundingBox();
        if (toolbarBox === null || blockBox === null) return Number.NaN;
        // 툴바 하단과 선택 상단의 간격. 음수면 툴바가 블록을 덮는다.
        return blockBox.y - (toolbarBox.y + toolbarBox.height);
      },
      { message: `${label}: 툴바 하단과 선택 상단의 간격(px)` },
    )
    .toBeGreaterThanOrEqual(-1);
  const toolbarBox = await toolbar.boundingBox();
  const blockBox = await selectionTopBlock.boundingBox();
  expect(
    blockBox!.y - (toolbarBox!.y + toolbarBox!.height),
    `${label}: 툴바가 선택 상단 가까이 있다`,
  ).toBeLessThan(40);
};

test("접힌 toggle이 낀 범위를 블록 선택하면 툴바가 보이는 선택 위쪽에 놓인다(창 스크롤)(#280)", async ({
  page,
}) => {
  const { editable } = await loadBlocks(page, longDocument());
  const p10 = blockOf(editable, "p10");
  const after = blockOf(editable, "after");
  await editable.locator('[data-geul-block-id="p1"]').click();
  await scrollWindowSoBlockTopIs(p10, 300);
  await yieldFrame(page);

  await dragGutterHandle(page, p10.locator("p"), await centerOf(after));

  await expect(
    page.locator("[data-geul-block-selection-highlight]").first(),
    "전제: 블록 범위가 선택된다",
  ).toBeVisible();
  await expectToolbarAbove(page, p10, "창 스크롤");
});

test("접힌 toggle이 낀 범위를 블록 선택하면 안쪽 스크롤 영역에서도 툴바가 보인다(#280)", async ({
  page,
}) => {
  const { editable } = await loadBlocks(page, longDocument());
  const editor = page.getByRole("textbox", { name: "Editor" });
  await page.addStyleTag({
    content: `[role="textbox"][aria-label="Editor"] { max-height: 460px; overflow-y: auto; }`,
  });
  await editable.locator('[data-geul-block-id="p1"]').click();
  const p10 = blockOf(editable, "p10");
  const after = blockOf(editable, "after");
  await editor.evaluate((element) => {
    const p10Element = element.querySelector('[data-geul-block-id="p10"]');
    if (p10Element === null) throw new Error("p10 없음");
    element.scrollTop =
      p10Element.getBoundingClientRect().top -
      element.getBoundingClientRect().top -
      120;
  });
  await yieldFrame(page);

  await dragGutterHandle(page, p10.locator("p"), await centerOf(after));

  await expect(
    page.locator("[data-geul-block-selection-highlight]").first(),
    "전제: 블록 범위가 선택된다",
  ).toBeVisible();
  await expectToolbarAbove(page, p10, "안쪽 스크롤");
});

test("뷰포트 위 밖으로 끌어 놓은 블록이 접힌 toggle의 숨은 자식이 되지 않는다(#280)", async ({
  page,
}) => {
  const { editable } = await loadBlocks(page, longDocument());
  const q30 = blockOf(editable, "q30");
  const toggle = blockOf(editable, "t1");
  const blockIdsBefore = await domBlockIds(editable);
  await editable.locator('[data-geul-block-id="p1"]').click();
  await scrollWindowSoBlockTopIs(q30, 400);
  await yieldFrame(page);
  const q30Box = await q30.boundingBox();
  if (q30Box === null) throw new Error("q30 bounding box 없음");

  // 뷰포트 위 밖(clientY -20)까지 끌되 놓기 전에 가이드를 읽는다.
  await dragGutterHandle(
    page,
    q30.locator("p"),
    { x: q30Box.x + q30Box.width / 2, y: -20 },
    { release: false },
  );
  const guide = page.locator("[data-geul-block-insertion-guide]");
  await expect(guide, "전제: 드롭 가이드가 뜬다").toHaveCount(1);
  await expect
    .poll(
      () => guide.evaluate((element) => element.getBoundingClientRect().width),
      { message: "드롭 가이드 폭(px)" },
    )
    .toBeGreaterThan(0);
  await page.mouse.up();
  await yieldFrame(page);

  // 숨은 자식 c1·c2만 toggle 안에 남고 q30은 들어가지 않는다.
  await expect(toggle.locator("[data-geul-block-id]")).toHaveCount(2);
  await expect(toggle.locator('[data-geul-block-id="q30"]')).toHaveCount(0);
  const blockIdsAfter = await domBlockIds(editable);
  expect([...blockIdsAfter].sort()).toEqual([...blockIdsBefore].sort());
  expect(blockIdsAfter.indexOf("q30"), "q30이 옮겨졌다").not.toBe(
    blockIdsBefore.indexOf("q30"),
  );
});

test("열린 블록 메뉴가 가리키는 자식이 접히면 메뉴가 닫힌다(#280)", async ({
  page,
}) => {
  const { editable } = await loadBlocks(page, [
    collapsedToggle("t1", [paragraph("pc", "child paragraph")]),
    paragraph("tail", "tail"),
  ]);
  await expandToggle(editable, "t1");
  await blockOf(editable, "tail").click();
  await blockOf(editable, "pc").hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();
  const menu = page.locator("[data-geul-block-menu]");
  await expect(menu, "전제: 블록 메뉴가 열린다").toBeVisible();
  const blockCount = await editable.locator("[data-geul-block-id]").count();

  await page.keyboard.press("Control+z");
  await expectHidden(blockOf(editable, "pc"));

  await expect(menu, "접힌 뒤 블록 메뉴").toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await expect(editable.locator("[data-geul-block-id]")).toHaveCount(
    blockCount,
  );
});

/** 실제 이미지로 fulfill해 `<img>`가 0x0으로 무너지지 않게 한다. */
const ROUTED_IMAGE_URL = "https://example.com/dir/hidden-overlays.png";

const imageBlock = (id: string): Block => ({
  id,
  type: "image",
  url: ROUTED_IMAGE_URL,
});

/** 접힌 toggle의 자식 이미지를 펼치고, 꼬리 문단에 캐럿을 둔 채 이미지 위에 포인터를 둔다. */
const hoverExpandedImage = async (page: Page) => {
  await page.route(ROUTED_IMAGE_URL, (route) =>
    route.fulfill({ path: "e2e/fixtures/resize-photo.png" }),
  );
  const { editable } = await loadBlocks(page, [
    collapsedToggle("t1", [imageBlock("im")]),
    paragraph("tail", "tail"),
  ]);
  await expandToggle(editable, "t1");
  await blockOf(editable, "tail").click();
  await blockOf(editable, "im").hover();
  return { editable };
};

test("hover 중인 자식 이미지가 접히면 미디어 그립 오버레이가 남지 않는다(#280)", async ({
  page,
}) => {
  const { editable } = await hoverExpandedImage(page);
  const overlay = page.locator(".geul-media-handle-overlay");
  await expect(overlay, "전제: hover한 이미지에 그립이 뜬다").toBeVisible();

  await page.keyboard.press("Control+z");
  await expectHidden(blockOf(editable, "im"));

  await expect(overlay, "접힌 뒤 미디어 그립").toHaveCount(0);
});

test("미디어 그립 메뉴가 열린 채 이미지가 접히면 메뉴가 닫힌다(#280)", async ({
  page,
}) => {
  const { editable } = await hoverExpandedImage(page);
  await page
    .locator(".geul-media-handle-overlay")
    .getByRole("button", { name: "Drag to reorder" })
    .click();
  const menu = page.locator("[data-geul-block-menu]");
  await expect(menu, "전제: 미디어 메뉴가 열린다").toBeVisible();

  await page.keyboard.press("Control+z");
  await expectHidden(blockOf(editable, "im"));

  await expect(menu, "접힌 뒤 미디어 메뉴").toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
});

test("hover 중인 자식 표가 접히면 핸들 층·추가 rail·리사이즈 strip이 남지 않는다(#280)", async ({
  page,
}) => {
  const { editable } = await loadBlocks(page, [
    collapsedToggle("t1", [tableBlock("tb")]),
    paragraph("tail", "tail"),
  ]);
  await expandToggle(editable, "t1");
  const table = blockOf(editable, "tb");
  const cell = table.locator("td").first();
  await cell.click();
  await cell.hover();
  const layerParts = [
    "[data-geul-table-row-handle-hit]",
    "[data-geul-table-column-handle-hit]",
    "[data-geul-table-grip]",
    "[data-geul-table-quick-insert]",
    "[data-geul-table-expand-row]",
    "[data-geul-table-expand-column]",
    "[data-geul-table-resize-handle]",
  ];
  for (const selector of layerParts) {
    await expect(
      page.locator(selector).first(),
      `전제: ${selector}가 뜬다`,
    ).toBeVisible();
  }

  await page.keyboard.press("Control+z");
  await expectHidden(table);

  for (const selector of layerParts) {
    await expect(page.locator(selector), `접힌 뒤 ${selector}`).toHaveCount(0);
  }
});
