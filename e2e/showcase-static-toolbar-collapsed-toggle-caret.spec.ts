/**
 * 접힌 toggle로 Indent하거나 자식 있는 toggle을 접어도 캐럿이 숨은 블록에
 * 남지 않는지 실제 브라우저에서 확인한다(Issue #246). 캐럿이 숨은 블록에
 * 남으면 브라우저가 가까운 보이는 텍스트(toggle 라벨)로 캐럿을 옮겨 입력이
 * 엉뚱한 블록으로 간다.
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - display:none 노드 안 selection을 브라우저가 어디로 옮기는지는 jsdom이
 *   재현하지 못한다. 실제 키 입력(`Z`)이 들어간 위치로만 확인된다.
 * 가드 규칙과 undo 왕복의 세부 계약은 단위 테스트
 * (toggle-collapse-selection-guard.test.ts)가 소유한다.
 *
 * 샘플 문서(`샘플 불러오기`)를 쓴다. block-10은 자식 block-11을 가진 토글이고
 * block-12는 그 뒤 제목이다.
 */
import { expect, test, type Page } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";
import { labelText } from "./support/static-toolbar-collapsed-toggle.js";
import { blockId, placeCaretIn } from "./support/static-toolbar-sample.js";
import { yieldFrame } from "./support/yield-frame.js";

/** 샘플을 불러오고 편집 영역과 toggle 접기 마커를 돌려준다. */
const openSample = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editable = page.getByRole("textbox", { name: "Editor" });
  return {
    editable,
    marker: blockId(editable, 10).locator("[data-geul-toggle-marker]"),
    indent: page.getByRole("button", { name: "Indent" }),
    trigger: page.getByRole("button", { name: "Block type" }),
  };
};

test("접힌 toggle 뒤 블록을 Indent하면 toggle이 펼쳐지고 입력이 이동한 블록에 들어간다", async ({
  page,
}) => {
  const { editable, marker, indent } = await openSample(page);
  await marker.click();
  await expect(blockId(editable, 11)).toBeHidden();

  await placeCaretIn(page, blockId(editable, 12));
  await indent.click();
  await yieldFrame(page);

  // 이동한 블록은 펼쳐진 toggle 안에서 보인다.
  await expect(blockId(editable, 11)).toBeVisible();
  await expect(blockId(editable, 12)).toBeVisible();

  await page.keyboard.type("Z");
  await yieldFrame(page);

  await expect(blockId(editable, 12)).toContainText("Z");
  expect(await labelText(blockId(editable, 10))).toBe("펼쳐서 보는 토글 항목");
});

test("캐럿이 든 자식을 가진 toggle을 접으면 입력이 toggle 라벨 끝에 들어간다", async ({
  page,
}) => {
  const { editable, marker, trigger } = await openSample(page);
  await placeCaretIn(page, blockId(editable, 11));
  await expect(trigger).toContainText("Text");

  await marker.click();
  await expect(blockId(editable, 11)).toBeHidden();
  // 브라우저는 숨은 노드 캐럿을 라벨 텍스트로 옮겨 입력은 라벨로 가므로,
  // 입력 위치만으로는 결함이 가려진다. 툴바 블록 타입이 읽는 PM
  // selection이 숨은 문단(Text)이 아니라 toggle 라벨에 있는지 함께 확인한다.
  await yieldFrame(page);
  await expect(trigger).not.toContainText("Text");
  await page.keyboard.type("Z");
  await yieldFrame(page);

  expect(await labelText(blockId(editable, 10))).toBe("펼쳐서 보는 토글 항목Z");
  await expect(blockId(editable, 11)).not.toContainText("Z");
});

/**
 * 10번째 toggle의 첫 자식을 divider로 만들고 접는다(Issue #254 재현 상태).
 * 라벨 끝 Enter는 새 블록을 마지막 자식 뒤에 붙인다. 첫 자식 앞에 빈 문단을
 * 만들려고 11번째 블록 시작에서 Enter를 쓴다. 접힌 뒤 라벨 끝 클릭 → End까지
 * 맞춘다. 접힌 toggle의 첫 숨은 자식이 atom이면 ArrowDown·ArrowRight가
 * 막히는 결함의 전제 상태다.
 */
const collapseWithDividerFirstChild = async (page: Page) => {
  const { editable, marker } = await openSample(page);
  const block = blockId(editable, 10);
  await placeCaretIn(page, blockId(editable, 11));
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.type("/divider");
  await expect(page.getByRole("option", { name: /Divider/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(block.locator("hr")).toHaveCount(1);
  // 첫 자식이 divider다.
  expect(
    await block.evaluate(
      (element) =>
        element.querySelector("[data-geul-block-group]")?.firstElementChild
          ?.tagName,
    ),
  ).toBe("HR");

  await marker.click();
  await expect(block.locator("hr")).toBeHidden();

  await placeCaretIn(page, block);
  await page.keyboard.press("End");
  await yieldFrame(page);
  return { editable };
};

test("첫 숨은 자식이 divider인 접힌 toggle 라벨 끝에서 ArrowDown하면 다음 보이는 블록으로 가고 입력이 거기 들어간다", async ({
  page,
}) => {
  const { editable } = await collapseWithDividerFirstChild(page);
  const labelBefore = await labelText(blockId(editable, 10));

  await page.keyboard.press("ArrowDown");
  await yieldFrame(page);
  await page.keyboard.type("Z");
  await yieldFrame(page);

  await expect(blockId(editable, 12)).toContainText("Z");
  expect(await labelText(blockId(editable, 10))).toBe(labelBefore);
});

test("첫 숨은 자식이 divider인 접힌 toggle 라벨 끝에서 ArrowRight하면 다음 보이는 블록 시작으로 가고 입력이 거기 들어간다", async ({
  page,
}) => {
  const { editable } = await collapseWithDividerFirstChild(page);
  const labelBefore = await labelText(blockId(editable, 10));
  const blockBefore = await blockId(editable, 12).innerText();

  await page.keyboard.press("ArrowRight");
  await yieldFrame(page);
  await page.keyboard.type("Z");
  await yieldFrame(page);

  // 블록 시작에 들어갔다. 기존 텍스트 앞에 Z가 붙는다.
  expect(await blockId(editable, 12).innerText()).toBe(`Z${blockBefore}`);
  expect(await labelText(blockId(editable, 10))).toBe(labelBefore);
});

test("첫 숨은 자식이 문단인 접힌 toggle 라벨 끝의 ArrowDown은 네이티브 이동으로 다음 보이는 블록에 간다", async ({
  page,
}) => {
  const { editable, marker } = await openSample(page);
  await marker.click();
  await expect(blockId(editable, 11)).toBeHidden();
  await placeCaretIn(page, blockId(editable, 10));
  await page.keyboard.press("End");
  await yieldFrame(page);
  const labelBefore = await labelText(blockId(editable, 10));

  await page.keyboard.press("ArrowDown");
  await yieldFrame(page);
  await page.keyboard.type("Z");
  await yieldFrame(page);

  await expect(blockId(editable, 12)).toContainText("Z");
  expect(await labelText(blockId(editable, 10))).toBe(labelBefore);
});

/**
 * 라벨 중간 캐럿에서 ArrowDown 1회 뒤 `Z`를 입력하고 12번째 블록이 시작 고정으로
 * 받았는지 확인한다(Issue #255). `afterHome` 만큼 ArrowRight를 눌러 캐럿을 둔다.
 */
const arrowDownFromLabel = async (page: Page, afterHome: number) => {
  const { editable } = await collapseWithDividerFirstChild(page);
  const labelBefore = await labelText(blockId(editable, 10));
  const blockBefore = await blockId(editable, 12).innerText();

  await page.keyboard.press("Home");
  for (let i = 0; i < afterHome; i += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await yieldFrame(page);
  await page.keyboard.press("ArrowDown");
  await yieldFrame(page);
  await page.keyboard.type("Z");
  await yieldFrame(page);

  // 블록 시작에 들어갔다. 기존 텍스트 앞에 Z가 붙는다.
  expect(await blockId(editable, 12).innerText()).toBe(`Z${blockBefore}`);
  expect(await labelText(blockId(editable, 10))).toBe(labelBefore);
};

test("첫 숨은 자식이 divider인 접힌 toggle 라벨 중간에서 ArrowDown하면 다음 보이는 블록 시작으로 가고 입력이 거기 들어간다", async ({
  page,
}) => {
  await arrowDownFromLabel(page, 3);
});

test("첫 숨은 자식이 divider인 접힌 toggle 라벨 시작에서 ArrowDown하면 다음 보이는 블록 시작으로 가고 입력이 거기 들어간다", async ({
  page,
}) => {
  await arrowDownFromLabel(page, 0);
});

test("여러 줄로 줄바꿈된 접힌 toggle 라벨 첫 줄의 ArrowDown은 라벨 둘째 줄로 가고 다음 블록으로 점프하지 않는다", async ({
  page,
}) => {
  const { editable } = await collapseWithDividerFirstChild(page);
  const block = blockId(editable, 10);
  const label = block.locator(":scope > :first-child");
  const blockBefore = await blockId(editable, 12).innerText();
  const oneLineHeight = (await label.boundingBox())?.height ?? 0;

  // 라벨 끝에서 긴 텍스트를 입력해 줄바꿈시킨다.
  await page.keyboard.type(
    " 줄바꿈을 일으키는 아주 긴 라벨 텍스트를 이어서 입력해 라벨이 여러 줄이 되게 한다 ".repeat(
      3,
    ),
  );
  await yieldFrame(page);
  // 전제: 줄바꿈이 안 되면 테스트가 공허하게 통과한다.
  const wrappedHeight = (await label.boundingBox())?.height ?? 0;
  expect(oneLineHeight).toBeGreaterThan(0);
  expect(wrappedHeight).toBeGreaterThan(oneLineHeight * 1.5);

  // 캐럿이 라벨 첫 줄에 올 때까지 ArrowUp한다. 마지막 줄의 Home은 그 줄 시작이다.
  const caretTop = () =>
    page.evaluate(() => {
      const range = getSelection()?.getRangeAt(0);
      const rect = range?.getClientRects()[0] ?? range?.getBoundingClientRect();
      return rect?.top ?? Number.NaN;
    });
  const labelTop = (await label.boundingBox())?.y ?? 0;
  for (
    let i = 0;
    i < 6 && (await caretTop()) > labelTop + oneLineHeight / 2;
    i += 1
  ) {
    await page.keyboard.press("ArrowUp");
    await yieldFrame(page);
  }
  expect(await caretTop()).toBeLessThan(labelTop + oneLineHeight / 2);
  const labelBefore = await labelText(block);

  await page.keyboard.press("ArrowDown");
  await yieldFrame(page);
  await page.keyboard.type("Z");
  await yieldFrame(page);

  // Z는 라벨 안에 들어가고 12번째 블록은 그대로다.
  expect(await labelText(block)).toContain("Z");
  expect(await labelText(block)).not.toBe(labelBefore);
  expect(await blockId(editable, 12).innerText()).toBe(blockBefore);
});

test("첫 숨은 자식이 문단인 접힌 toggle 라벨 중간의 ArrowDown은 네이티브 이동으로 다음 보이는 블록에 간다", async ({
  page,
}) => {
  const { editable, marker } = await openSample(page);
  await marker.click();
  await expect(blockId(editable, 11)).toBeHidden();
  await placeCaretIn(page, blockId(editable, 10));
  await page.keyboard.press("Home");
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await yieldFrame(page);
  const labelBefore = await labelText(blockId(editable, 10));

  await page.keyboard.press("ArrowDown");
  await yieldFrame(page);
  await page.keyboard.type("Z");
  await yieldFrame(page);

  await expect(blockId(editable, 12)).toContainText("Z");
  expect(await labelText(blockId(editable, 10))).toBe(labelBefore);
});
