/**
 * Issue #38 슬라이스 5 RD-002 — production demo에 load된 글머리·번호 목록의
 * marker·placeholder 계산 스타일과 Enter/Backspace/Delete/Tab 브라우저 키
 * 소비·focus 효과를 검증한다. 저장 구조·revision·undo는 core 테스트가 소유한다.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { openDemo } from "./support/demo.js";

/** JSON source를 통해 production demo 문서를 교체한다. */
const loadDocument = async (page: Page, document: unknown): Promise<void> => {
  await page.getByLabel("Document source").fill(JSON.stringify(document));
  await page.getByRole("button", { name: "Load JSON" }).click();
};

/**
 * 다음 실제 keydown이 editor에서 preventDefault됐는지 document bubble에서 읽는다.
 * 등록한 keydown 리스너는 `window`에 임시로 붙잡아 뒀다가 `finally`에서
 * `removeEventListener`로 제거한다(G-TST-003) — `page.keyboard.press`가
 * 던지는 경로에서도 정리가 빠지지 않게 한다.
 */
const pressAndReadConsumption = async (
  page: Page,
  key: string,
): Promise<boolean> => {
  const expectedKey = key.includes("+")
    ? key.slice(key.lastIndexOf("+") + 1)
    : key;
  await page.evaluate((targetKey) => {
    delete document.body.dataset.beTestKeyConsumed;
    const listener = (event: KeyboardEvent) => {
      if (event.key !== targetKey) return;
      document.body.dataset.beTestKeyConsumed = String(event.defaultPrevented);
    };
    document.addEventListener("keydown", listener);
    (
      window as typeof window & {
        __beTestKeydownListener__?: (event: KeyboardEvent) => void;
      }
    ).__beTestKeydownListener__ = listener;
  }, expectedKey);
  try {
    await page.keyboard.press(key);
    return await page.evaluate(
      () => document.body.dataset.beTestKeyConsumed === "true",
    );
  } finally {
    await page.evaluate(() => {
      const win = window as typeof window & {
        __beTestKeydownListener__?: (event: KeyboardEvent) => void;
      };
      if (win.__beTestKeydownListener__ !== undefined) {
        document.removeEventListener("keydown", win.__beTestKeydownListener__);
        delete win.__beTestKeydownListener__;
      }
    });
  }
};

/** blockContainer의 직접 목록 content locator를 찾는다. */
const listContent = (editable: Locator, blockId: string): Locator =>
  editable.locator(`[data-be-block-id="${blockId}"] > div`).first();

/** 키보드 구조 편집의 최소 번호 목록 fixture다. */
const numberedDocument = () => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "first",
      type: "numberedListItem",
      startNumber: 7,
      content: [{ text: "가나" }],
    },
    {
      id: "second",
      type: "numberedListItem",
      content: [{ text: "다라" }],
    },
    { id: "tail", type: "paragraph", content: [{ text: "꼬리" }] },
  ],
});

test("load된 목록은 명시·자동 marker와 빈 List item placeholder의 계산 스타일을 표시한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await loadDocument(page, {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "numbered-7",
        type: "numberedListItem",
        startNumber: 7,
        content: [{ text: "명시" }],
      },
      {
        id: "numbered-8",
        type: "numberedListItem",
        content: [{ text: "자동" }],
      },
      { id: "empty", type: "bulletListItem", content: [] },
      { id: "tail", type: "paragraph", content: [{ text: "꼬리" }] },
    ],
  });

  const explicit = editable.locator('[data-be-block-id="numbered-7"]');
  const automatic = editable.locator('[data-be-block-id="numbered-8"]');
  const empty = editable.locator('[data-be-block-id="empty"]');
  const emptyContent = listContent(editable, "empty");

  await expect(explicit).toHaveAttribute("data-be-list-marker", "7.");
  await expect(automatic).toHaveAttribute("data-be-list-marker", "8.");
  await expect(empty).toHaveAttribute("data-be-list-marker", "•");
  await expect(emptyContent).toHaveAttribute("data-placeholder", "List item");

  const style = await empty.evaluate((element) => {
    const layout = getComputedStyle(element);
    const marker = getComputedStyle(element, "::before");
    const placeholder = getComputedStyle(
      element.firstElementChild!,
      "::before",
    );
    return {
      display: layout.display,
      gridTemplateColumns: layout.gridTemplateColumns,
      markerContent: marker.content,
      markerPosition: marker.position,
      placeholderContent: placeholder.content,
    };
  });
  expect(style.display).toBe("grid");
  expect(Number.parseFloat(style.gridTemplateColumns)).toBeGreaterThan(0);
  expect(style.markerContent).not.toBe("none");
  expect(style.markerPosition).toBe("static");
  expect(style.placeholderContent).not.toBe("none");
});

test("최대 번호 marker는 컨테이너 안의 전용 track에 들어가 content와 겹치지 않는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await loadDocument(page, {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "maximum",
        type: "numberedListItem",
        startNumber: 999999999,
        content: [{ text: "최대 번호 내용" }],
      },
      { id: "tail", type: "paragraph", content: [{ text: "꼬리" }] },
    ],
  });

  const container = editable.locator('[data-be-block-id="maximum"]');
  await expect(container).toHaveAttribute("data-be-list-marker", "999999999.");

  const geometry = await container.evaluate((element) => {
    const containerBox = element.getBoundingClientRect();
    const contentBox = element.firstElementChild!.getBoundingClientRect();
    const editableBox = element
      .closest('[contenteditable="true"]')!
      .getBoundingClientRect();
    const style = getComputedStyle(element);
    const markerStyle = getComputedStyle(element, "::before");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("2D canvas context 조회 실패");
    context.font = markerStyle.font;
    const markerWidth = context.measureText("999999999.").width;
    const firstTrack = Number.parseFloat(style.gridTemplateColumns);
    return {
      containerLeft: containerBox.left,
      contentLeft: contentBox.left,
      editableLeft: editableBox.left,
      firstTrack,
      markerWidth,
    };
  });

  expect(geometry.containerLeft).toBeGreaterThanOrEqual(geometry.editableLeft);
  expect(geometry.firstTrack).toBeGreaterThanOrEqual(geometry.markerWidth - 1);
  expect(geometry.contentLeft).toBeGreaterThan(
    geometry.containerLeft + geometry.markerWidth,
  );
});

test("중첩 목록의 child marker와 content는 parent content보다 오른쪽에 배치된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await loadDocument(page, {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "parent",
        type: "numberedListItem",
        content: [{ text: "부모" }],
        children: [
          {
            id: "child",
            type: "bulletListItem",
            content: [{ text: "자식" }],
          },
        ],
      },
      { id: "tail", type: "paragraph", content: [{ text: "꼬리" }] },
    ],
  });

  const parentContent = listContent(editable, "parent");
  const childContainer = editable.locator('[data-be-block-id="child"]');
  const childContent = listContent(editable, "child");
  const [parentBox, childContainerBox, childContentBox] = await Promise.all([
    parentContent.boundingBox(),
    childContainer.boundingBox(),
    childContent.boundingBox(),
  ]);
  if (
    parentBox === null ||
    childContainerBox === null ||
    childContentBox === null
  ) {
    throw new Error("목록 geometry 조회 실패");
  }

  expect(childContainerBox.x).toBeGreaterThan(parentBox.x);
  expect(childContentBox.x).toBeGreaterThan(childContainerBox.x);
  expect(childContentBox.x).toBeGreaterThan(parentBox.x);
});

test("목록 중간 Enter는 native 폴스루 없이 소비되고 편집기 focus를 유지한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await loadDocument(page, numberedDocument());

  await listContent(editable, "first").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  expect(await pressAndReadConsumption(page, "Enter")).toBe(true);

  await expect(editable).toBeFocused();
  await expect(editable.locator("[data-be-list-marker]")).toHaveCount(3);
});

test("목록 선두 Backspace와 끝 Delete join은 native 폴스루 없이 각각 소비된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await loadDocument(page, numberedDocument());

  await listContent(editable, "second").click();
  await page.keyboard.press("Home");
  expect(await pressAndReadConsumption(page, "Backspace")).toBe(true);
  await expect(editable).toBeFocused();
  await expect(editable.locator("[data-be-list-marker]")).toHaveCount(1);

  await loadDocument(page, numberedDocument());
  await listContent(editable, "first").click();
  await page.keyboard.press("End");
  expect(await pressAndReadConsumption(page, "Delete")).toBe(true);
  await expect(editable).toBeFocused();
  await expect(editable.locator("[data-be-list-marker]")).toHaveCount(1);
});

test("빈 목록 Enter는 키를 소비하고 marker를 제거한 paragraph로 종료한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await loadDocument(page, {
    formatVersion: 1,
    revision: 0,
    blocks: [
      { id: "empty", type: "bulletListItem", content: [] },
      { id: "tail", type: "paragraph", content: [{ text: "꼬리" }] },
    ],
  });

  await listContent(editable, "empty").click();
  expect(await pressAndReadConsumption(page, "Enter")).toBe(true);

  const exited = editable.locator('[data-be-block-id="empty"]');
  await expect(exited).not.toHaveAttribute("data-be-list-marker", /.+/);
  await expect(exited.locator("p")).toHaveCount(1);
  await expect(editable).toBeFocused();
});

test("목록 Tab과 Shift+Tab은 순차 focus 이동을 억제하고 편집기 focus를 유지한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await loadDocument(page, numberedDocument());
  const second = editable.locator('[data-be-block-id="second"]');

  await listContent(editable, "second").click();
  expect(await pressAndReadConsumption(page, "Tab")).toBe(true);
  await expect(editable).toBeFocused();
  await expect(second).toHaveAttribute("data-be-list-marker", "1.");

  expect(await pressAndReadConsumption(page, "Shift+Tab")).toBe(true);
  await expect(editable).toBeFocused();
  await expect(second).toHaveAttribute("data-be-list-marker", "8.");
});

for (const [marker, type, contentAttribute, renderedMarker] of [
  ["-", "bulletListItem", "data-be-bullet-list-item", "•"],
  ["1.", "numberedListItem", "data-be-numbered-list-item", "1."],
] as const) {
  test(`native ${marker} space 입력은 production editor에서 ${type} DOM으로 변환하고 focus를 유지한다`, async ({
    page,
  }) => {
    const { editable } = await openDemo(page);
    await loadDocument(page, {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "target", type: "paragraph", content: [] },
        { id: "tail", type: "paragraph", content: [{ text: "꼬리" }] },
      ],
    });

    const target = editable.locator('[data-be-block-id="target"]');
    await target.locator("p").click();
    await page.keyboard.type(`${marker} `);

    await expect(target).toHaveAttribute("data-be-list-marker", renderedMarker);
    await expect(target.locator(`[${contentAttribute}]`)).toHaveCount(1);
    await expect(editable).toBeFocused();
  });
}

test("native - 뒤 두 space는 첫 space에서 목록으로 변환하고 둘째 space를 content에 입력한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await loadDocument(page, {
    formatVersion: 1,
    revision: 0,
    blocks: [
      { id: "target", type: "paragraph", content: [] },
      { id: "tail", type: "paragraph", content: [{ text: "꼬리" }] },
    ],
  });

  const target = editable.locator('[data-be-block-id="target"]');
  await target.locator("p").click();
  await page.keyboard.type("-  ");

  await expect(target).toHaveAttribute("data-be-list-marker", "•");
  await expect(target.locator("[data-be-bullet-list-item]")).toHaveText(" ");
  await expect(editable).toBeFocused();
});
