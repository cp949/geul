/**
 * media 전용 그립·plus 오버레이(Issue #187 RD-001 DELTA-03)가 실제
 * Chromium 레이아웃에서도 대표 깊이(0·중간값·데모 앱에서 실측 가능한
 * 최대 깊이)에서 클릭 가능하고, 그립 드래그가 depth 무관하게 재정렬하며,
 * 그립 클릭으로 연 Block menu가 스크롤 중에도 media를 따라가는지(공용
 * BlockSideMenu와 패리티) 검증한다. jsdom 단위 테스트
 * (media-handle-overlays.test.tsx)는 `getBoundingClientRect()`를 고정값으로
 * 스텁해 실제 CSS 들여쓰기 누적(`[data-geul-block-group]`의 padding-left
 * 재귀 누적, _editor.scss)을 검증하지 못했다 — 이 spec의 존재 이유다.
 *
 * "최대 깊이"는 model의 MAX_NESTING_DEPTH(64)가 아니라 40단계다 —
 * 실측(2026-09-13) 결과 데모 앱 shell이 `width: min(76rem, calc(100% -
 * 2rem))`로 폭을 고정해(apps/demo/src/app.css) 편집 영역이 뷰포트 크기와
 * 무관하게 약 1216px로 상한이 걸리고, `[data-geul-block-group]`가 재귀
 * 누적하는 padding-left(1.5rem=24px/단계, _editor.scss)가 이 상한을
 * 넘는 depth(약 48단계 이상)에서는 media뿐 아니라 평범한 paragraph도
 * 렌더 폭이 0으로 무너진다(paragraph로 교차 확인 완료) — media 전용 결함이
 * 아니라 이 데모 shell의 고정 폭이 만드는, media 오버레이와 무관한 일반
 * 특성이다. `readPageRect`/`getBoundingClientRect()` 기반 위치 계산
 * 자체에는 depth 분기가 없어(table-handle-geometry.ts) 40단계에서 성립하면
 * 그 위의 depth에서도 같은 공식이 그대로 성립한다 — RD-001.md 완료 조건
 * 1의 증거를 이 depth로 갱신했다(RD-001-DELTA-03.md "## 결과" 참고).
 */
import { expect, type Page, test } from "@playwright/test";

import { openDemo } from "./support/demo.js";

const DEPTH_TEST_IMAGE_URL = "https://example.com/dir/depth-test.png";

/** 실제 300×180 PNG로 fulfill해 <img>가 0×0으로 무너지지 않게 한다
 * (media-resize-handle.spec.ts의 routeResizeImage와 같은 이유). */
const routeDepthTestImage = (page: Page) =>
  page.route(DEPTH_TEST_IMAGE_URL, (route) =>
    route.fulfill({ path: "e2e/fixtures/resize-photo.png" }),
  );

type FixtureBlock = Record<string, unknown>;

/**
 * indentLevels단 paragraph 체인으로 media 리프(id: media-leaf)를 감싼
 * 문서를 만든다. model 관례상 "blocks 배열 자체가 depth 1"이므로
 * (document-nesting-depth.ts:9 주석) array-depth는 indentLevels+1이다 —
 * 이 함수 자체는 MAX_NESTING_DEPTH(64) 경계(indentLevels=63)까지도 유효한
 * 문서를 만들 수 있지만, 실제 DEPTH_CASES는 40까지만 쓴다(위 파일 머리말의
 * 이유). 항상 최상위 문단(tail-1)으로 닫는다 — depth 0(래퍼 없음)
 * 케이스만은 media 자신이 최상위 마지막 블록이 돼 TrailingBlockExtension이
 * 빈 문단을 자동 동반하므로(문서 최상위 마지막 블록만 판정 대상,
 * media-block-extension.ts 주석), 세 depth 케이스의 문서 구조를 통일해
 * 함정을 피한다.
 */
const buildMediaDepthDocument = (indentLevels: number) => {
  let innermost: FixtureBlock = {
    id: "media-leaf",
    type: "image",
    url: DEPTH_TEST_IMAGE_URL,
  };
  for (let level = indentLevels; level >= 1; level -= 1) {
    innermost = {
      id: `wrap-${level}`,
      type: "paragraph",
      content: [],
      children: [innermost],
    };
  }
  return {
    formatVersion: 1,
    revision: 0,
    blocks: [innermost, { id: "tail-1", type: "paragraph", content: [] }],
  };
};

const loadDocument = async (page: Page, document: unknown) => {
  await page.getByLabel("Document source").fill(JSON.stringify(document));
  await page.getByRole("button", { name: "Load JSON" }).click();
};

/** editor-round-trip.spec.ts의 관례 — Save JSON을 눌러 현재 문서를
 * textarea로 받아 파싱한다. 새 블록의 id는 예측할 수 없어(순차 발급기가
 * 세션 상태에 의존) 구조 검증은 항상 상대 위치로만 한다. */
const saveAndReadDocument = async (
  page: Page,
): Promise<{ blocks: FixtureBlock[] }> => {
  await page.getByRole("button", { name: "Save JSON" }).click();
  const source = await page.getByLabel("Document source").inputValue();
  return JSON.parse(source) as { blocks: FixtureBlock[] };
};

/** blocks(중첩 포함)에서 id가 일치하는 블록을 찾아 그 형제 배열과
 * index를 돌려준다. */
const findSiblingsAndIndex = (
  blocks: FixtureBlock[],
  id: string,
): { siblings: FixtureBlock[]; index: number } | null => {
  const index = blocks.findIndex((block) => block.id === id);
  if (index !== -1) return { siblings: blocks, index };
  for (const block of blocks) {
    const children = block.children;
    if (Array.isArray(children)) {
      const found = findSiblingsAndIndex(children as FixtureBlock[], id);
      if (found !== null) return found;
    }
  }
  return null;
};

const DEPTH_CASES = [
  { indentLevels: 0, label: "들여쓰지 않음(depth 0)" },
  { indentLevels: 20, label: "중간 깊이(20단계 들여쓰기)" },
  {
    indentLevels: 40,
    label: "데모 앱에서 실측 가능한 최대 깊이(40단계 들여쓰기)",
  },
];

for (const { indentLevels, label } of DEPTH_CASES) {
  test(`${label}에서 media 그립·plus가 보이고 클릭 가능하다(완료 조건 1)`, async ({
    page,
  }) => {
    await routeDepthTestImage(page);
    const { editable } = await openDemo(page);
    await loadDocument(page, buildMediaDepthDocument(indentLevels));

    const media = editable.locator('[data-geul-block-id="media-leaf"]');
    await media.hover();

    const dragHandle = page.getByRole("button", { name: "Drag to reorder" });
    const addButton = page.getByRole("button", { name: "Add block" });
    await expect(dragHandle).toBeVisible();
    await expect(addButton).toBeVisible();

    await addButton.click();
    const afterAdd = await saveAndReadDocument(page);
    const located = findSiblingsAndIndex(afterAdd.blocks, "media-leaf");
    if (located === null) throw new Error("media-leaf를 찾지 못했다");
    expect(located.siblings[located.index + 1]?.type).toBe("paragraph");

    await media.hover();
    await dragHandle.click();
    await expect(page.getByRole("menu", { name: "Block menu" })).toBeVisible();
  });
}

test("그립을 드래그하면 들여쓴 media도 재정렬된다(완료 조건 2, depth 무관)", async ({
  page,
}) => {
  await routeDepthTestImage(page);
  const { editable } = await openDemo(page);
  // 20단계 들여쓴 wrap-leaf 안에 [media-leaf, sibling-1] 두 자식을 둔다.
  // 그립을 sibling-1 하반부까지 끌면 block-side-menu-geometry.ts의
  // computeDragGuide가 "마지막 형제를 지나침"으로 판정해 문서 최상위
  // 끝으로 옮긴다(media-handle-overlays.test.tsx의 "아래로 드래그하면
  // media 블록이 뒤 형제 뒤로 재정렬된다"와 같은 지오메트리 — jsdom
  // 스텁이 아니라 실제 20단계 CSS 들여쓰기 레이아웃에서도 같은 결과가
  // 나오는지가 이 테스트의 검증 대상이다, 실측 확인 2026-09-13:
  // top-level이 [wrap-1, media-leaf, tail-1]이 된다).
  const indentLevels = 20;
  let innermost: FixtureBlock = {
    id: "wrap-leaf",
    type: "paragraph",
    content: [],
    children: [
      { id: "media-leaf", type: "image", url: DEPTH_TEST_IMAGE_URL },
      { id: "sibling-1", type: "paragraph", content: [{ text: "형제" }] },
    ],
  };
  for (let level = indentLevels; level >= 1; level -= 1) {
    innermost = {
      id: `wrap-${level}`,
      type: "paragraph",
      content: [],
      children: [innermost],
    };
  }
  await loadDocument(page, {
    formatVersion: 1,
    revision: 0,
    blocks: [innermost, { id: "tail-1", type: "paragraph", content: [] }],
  });

  const media = editable.locator('[data-geul-block-id="media-leaf"]');
  const sibling = editable.locator('[data-geul-block-id="sibling-1"] > p');
  await media.hover();
  const handle = page.getByRole("button", { name: "Drag to reorder" });
  await expect(handle).toBeVisible();

  const handleBox = await handle.boundingBox();
  const siblingBox = await sibling.boundingBox();
  if (handleBox === null || siblingBox === null) {
    throw new Error("bounding box를 읽지 못했다");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    siblingBox.x + siblingBox.width / 2,
    siblingBox.y + siblingBox.height - 2,
    { steps: 5 },
  );
  await expect(page.locator("[data-geul-block-insertion-guide]")).toBeVisible();
  await page.mouse.up();

  const after = await saveAndReadDocument(page);
  expect(after.blocks.map((block) => block.id)).toEqual([
    "wrap-1",
    "media-leaf",
    "tail-1",
  ]);
});

test("그립 클릭으로 연 Block menu가 스크롤 중에도 media를 따라간다(완료 조건 2, refreshBlockMenuGeometry 패리티)", async ({
  page,
}) => {
  await routeDepthTestImage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const { editable } = await openDemo(page);

  const blocks: FixtureBlock[] = [];
  for (let index = 0; index < 15; index += 1) {
    blocks.push({
      id: `filler-${index}`,
      type: "paragraph",
      content: [{ text: `line ${index}` }],
    });
  }
  blocks.push({ id: "media-leaf", type: "image", url: DEPTH_TEST_IMAGE_URL });
  for (let index = 15; index < 30; index += 1) {
    blocks.push({
      id: `filler-${index}`,
      type: "paragraph",
      content: [{ text: `line ${index}` }],
    });
  }
  await loadDocument(page, { formatVersion: 1, revision: 0, blocks });

  const media = editable.locator('[data-geul-block-id="media-leaf"]');
  await media.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await media.hover();
  const handle = page.getByRole("button", { name: "Drag to reorder" });
  await handle.click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();
  await page.evaluate(() => window.scrollBy(0, 80));

  await expect
    .poll(async () => {
      const mediaBox = await media.boundingBox();
      const menuBox = await menu.boundingBox();
      if (mediaBox === null || menuBox === null) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(menuBox.y - (mediaBox.y + 28));
    })
    .toBeLessThan(24);
});
