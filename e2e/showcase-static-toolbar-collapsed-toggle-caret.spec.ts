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
 *
 * 접힌 toggle 라벨의 ArrowDown·ArrowRight는 첫 숨은 자식 종류와 무관하게 다음
 * 보이는 블록 시작으로 간다(Issue #254, #255, #261). 다음 블록이 divider면 그
 * NodeSelection이다. 엔진마다 증상이 달라 #261 두 건은 `@core`다.
 *
 * RTL로 끝나는 라벨 끝의 ArrowRight는 엔진의 시각 이동을 따른다(Issue #268).
 * Firefox는 라벨 안에서 한 글자 움직이고 나머지 엔진은 다음 블록으로 간다.
 * 판정이 엔진의 Selection.modify 구현에 기대므로 세 건 모두 `@core`다.
 * LTR로 끝나는 혼합 라벨 건은 세 엔진 기대값이 같다.
 *
 * RTL로 끝나는 라벨 끝의 ArrowLeft는 첫 숨은 자식이 divider면 Firefox·WebKit에서
 * 다음 보이는 블록 시작으로 가고 Chromium에서 라벨 안에서 움직인다(Issue #273).
 *
 * ProseMirror 범위(U+0590–U+08AC) 밖 RTL 라벨의 ArrowRight도 엔진의 시각 이동을
 * 따른다(Issue #274). Firefox만 라벨 안에서 움직인다. 다섯 건 모두 `@core`다.
 * 혼합 라벨 연속 ArrowRight는 펼친 상태 네이티브와 같은 키 횟수로 라벨을
 * 벗어난다. Firefox caretBidiLevel이 남아야 같다.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";
import {
  labelText,
  nextSibling,
} from "./support/static-toolbar-collapsed-toggle.js";
import { blockId, placeCaretIn } from "./support/static-toolbar-sample.js";
import {
  placeCaretInsideOf,
  textBeforeCaret,
} from "./support/static-toolbar-selection.js";
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

/** block의 toggle 라벨 줄(블록 컨테이너의 첫 자식). */
const labelOf = (block: Locator) => block.locator(":scope > :first-child");

/**
 * block의 toggle 라벨을 text로 바꾼다(Issue #268). 라벨 안 캐럿에서 Home →
 * Shift+End로 라벨 전체를 잡고 insertText로 바꾼다.
 */
const replaceLabel = async (page: Page, block: Locator, text: string) => {
  await placeCaretInsideOf(page, labelOf(block));
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.insertText(text);
  await yieldFrame(page);
  // 전제: 라벨이 정확히 text다.
  expect(await labelText(block)).toBe(text);
};

/**
 * 10번째 toggle의 첫 자식을 divider로 만들고 접는다(Issue #254 재현 상태).
 * 라벨 끝 Enter는 새 블록을 마지막 자식 뒤에 붙인다. 첫 자식 앞에 빈 문단을
 * 만들려고 11번째 블록 시작에서 Enter를 쓴다. 접힌 뒤 라벨 끝 클릭 → End까지
 * 맞춘다. 접힌 toggle의 첫 숨은 자식이 atom이면 ArrowDown·ArrowRight가
 * 막히는 결함의 전제 상태다. label을 주면 먼저 라벨을 바꾼다(Issue #268).
 */
const collapseWithDividerFirstChild = async (page: Page, label?: string) => {
  const { editable, marker } = await openSample(page);
  const block = blockId(editable, 10);
  if (label !== undefined) await replaceLabel(page, block, label);
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

test("첫 숨은 자식이 문단인 접힌 toggle 라벨 끝의 ArrowDown은 다음 보이는 블록 시작으로 가고 입력이 거기 들어간다", async ({
  page,
}) => {
  const { editable, marker } = await openSample(page);
  await marker.click();
  await expect(blockId(editable, 11)).toBeHidden();
  await placeCaretIn(page, blockId(editable, 10));
  await page.keyboard.press("End");
  await yieldFrame(page);
  const labelBefore = await labelText(blockId(editable, 10));
  const blockBefore = await blockId(editable, 12).innerText();

  await page.keyboard.press("ArrowDown");
  await yieldFrame(page);
  await page.keyboard.type("Z");
  await yieldFrame(page);

  // 블록 시작에 들어갔다. 기존 텍스트 앞에 Z가 붙는다(Issue #261).
  expect(await blockId(editable, 12).innerText()).toBe(`Z${blockBefore}`);
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

test("첫 숨은 자식이 문단인 접힌 toggle 라벨 중간의 ArrowDown은 다음 보이는 블록 시작으로 가고 입력이 거기 들어간다", async ({
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
  const blockBefore = await blockId(editable, 12).innerText();

  await page.keyboard.press("ArrowDown");
  await yieldFrame(page);
  await page.keyboard.type("Z");
  await yieldFrame(page);

  // 블록 시작에 들어갔다. 기존 텍스트 앞에 Z가 붙는다(Issue #261).
  expect(await blockId(editable, 12).innerText()).toBe(`Z${blockBefore}`);
  expect(await labelText(blockId(editable, 10))).toBe(labelBefore);
});

/**
 * block-10(첫 자식 문단 block-11) 뒤, block-12 내용 앞 최상위에 divider를 두고
 * block-10을 접는다(Issue #261 재현 상태). block-12 시작 Enter로 앞에 빈 블록을
 * 만들고 거기서 `/divider`를 쓴다. 접힌 뒤 라벨 끝 클릭 → End까지 맞춘다.
 * 시작 Enter는 block-12 id를 앞 빈 블록에 남긴다. 그 빈 블록이 divider로
 * 바뀌고 원래 내용은 새 id 블록에 있다(세 엔진 실측). 그래서 내용으로 대조한다.
 */
const collapseWithDividerAfterToggle = async (page: Page) => {
  const { editable, marker } = await openSample(page);
  const block = blockId(editable, 10);
  const nextText = await blockId(editable, 12).innerText();
  await placeCaretInsideOf(page, blockId(editable, 12));
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.type("/divider");
  await expect(page.getByRole("option", { name: /Divider/ })).toBeVisible();
  await page.keyboard.press("Enter");
  // 전제: divider는 block-10 숨은 그룹 밖, block-10과 원래 block-12 내용 사이 최상위다.
  const divider = nextSibling(block);
  await expect(divider).toHaveJSProperty("tagName", "HR");
  expect(await nextSibling(divider).innerText()).toBe(nextText);
  await expect(block.locator("hr")).toHaveCount(0);

  await marker.click();
  await expect(blockId(editable, 11)).toBeHidden();

  await placeCaretInsideOf(page, block);
  await page.keyboard.press("End");
  await yieldFrame(page);
  return { editable, block, divider };
};

/** block의 부모 그룹(최상위) 직속 블록 수. */
const siblingCount = (block: Locator) =>
  block.evaluate((element) => element.parentElement?.childElementCount ?? 0);

for (const key of ["ArrowDown", "ArrowRight"] as const) {
  test(`첫 숨은 자식이 문단이고 뒤가 divider인 접힌 toggle 라벨 끝에서 ${key}하면 그 divider가 선택된다 @core`, async ({
    page,
  }) => {
    const { block, divider } = await collapseWithDividerAfterToggle(page);
    const labelBefore = await labelText(block);
    const countBefore = await siblingCount(block);

    await page.keyboard.press(key);
    await yieldFrame(page);

    await expect(divider).toHaveClass(/ProseMirror-selectednode/);
    // 키 자체가 블록을 만들지 않는다.
    expect(await siblingCount(block)).toBe(countBefore);
    expect(await labelText(block)).toBe(labelBefore);

    // 입력해도 toggle과 divider 사이에 유령 블록이 생기지 않는다(WebKit 증상).
    // 입력이 divider를 대체하는지는 단언하지 않는다. 블록 수만 본다.
    await page.keyboard.type("Z");
    await yieldFrame(page);

    expect(await siblingCount(block)).toBe(countBefore);
    expect(await labelText(block)).toBe(labelBefore);
  });
}

const RTL_LABEL = "مرحبا";
const MIXED_LABEL = `${RTL_LABEL} abc`;

/**
 * 접힌 block-10 라벨 끝에서 key 1회 뒤 `Z`를 입력한다(Issue #268, #273).
 * inLabel이면 엔진이 라벨 안에서 한 글자 움직인 결과를 기대한다. 글자는
 * 코드포인트 단위다(Issue #274). 아니면
 * block-12 시작을 기대한다. 키 전후와 입력 뒤 최상위 블록 수가 같다.
 */
const arrowAtLabelEnd = async (
  page: Page,
  editable: Locator,
  label: string,
  key: "ArrowLeft" | "ArrowRight",
  inLabel: boolean,
) => {
  const block = blockId(editable, 10);
  await placeCaretInsideOf(page, labelOf(block));
  // 전제: 캐럿이 라벨 논리 끝이다.
  await expect(async () => {
    await page.keyboard.press("End");
    await yieldFrame(page);
    expect(await textBeforeCaret(labelOf(block))).toBe(label);
  }).toPass();
  expect(await labelText(block)).toBe(label);
  const blockBefore = await blockId(editable, 12).innerText();
  const countBefore = await siblingCount(block);

  await page.keyboard.press(key);
  await yieldFrame(page);
  expect(await siblingCount(block)).toBe(countBefore);
  await page.keyboard.type("Z");
  await yieldFrame(page);

  expect(await siblingCount(block)).toBe(countBefore);
  if (inLabel) {
    const chars = Array.from(label);
    const last = chars.pop() ?? "";
    expect(await labelText(block)).toBe(`${chars.join("")}Z${last}`);
    expect(await blockId(editable, 12).innerText()).toBe(blockBefore);
  } else {
    expect(await blockId(editable, 12).innerText()).toBe(`Z${blockBefore}`);
    expect(await labelText(block)).toBe(label);
  }
};

test("RTL로 끝나는 접힌 toggle 라벨 끝의 ArrowRight는 첫 숨은 자식이 문단이면 엔진의 시각 이동을 따른다 @core", async ({
  page,
}, testInfo) => {
  const { editable, marker } = await openSample(page);
  await replaceLabel(page, blockId(editable, 10), RTL_LABEL);
  await marker.click();
  await expect(blockId(editable, 11)).toBeHidden();

  // Firefox만 시각 오른쪽이 라벨 안이다.
  await arrowAtLabelEnd(
    page,
    editable,
    RTL_LABEL,
    "ArrowRight",
    testInfo.project.name === "firefox",
  );
});

test("RTL로 끝나는 접힌 toggle 라벨 끝의 ArrowRight는 첫 숨은 자식이 divider여도 엔진의 시각 이동을 따른다 @core", async ({
  page,
}, testInfo) => {
  const { editable } = await collapseWithDividerFirstChild(page, RTL_LABEL);

  await arrowAtLabelEnd(
    page,
    editable,
    RTL_LABEL,
    "ArrowRight",
    testInfo.project.name === "firefox",
  );
});

test("RTL 글자가 있어도 LTR로 끝나는 접힌 toggle 라벨 끝의 ArrowRight는 다음 보이는 블록 시작으로 간다 @core", async ({
  page,
}) => {
  const { editable } = await collapseWithDividerFirstChild(page, MIXED_LABEL);

  // 세 엔진 모두 시각 오른쪽 끝이다. RTL 글자 유무로 폴스루하면 divider에 갇힌다.
  await arrowAtLabelEnd(page, editable, MIXED_LABEL, "ArrowRight", false);
});

const RTL_ENDING_MIXED_LABEL = `abc ${RTL_LABEL}`;

for (const label of [RTL_LABEL, RTL_ENDING_MIXED_LABEL]) {
  test(`RTL로 끝나는 접힌 toggle 라벨(${label}) 끝의 ArrowLeft는 첫 숨은 자식이 divider여도 라벨 끝에 갇히지 않는다 @core`, async ({
    page,
  }, testInfo) => {
    const { editable } = await collapseWithDividerFirstChild(page, label);

    // Chromium만 PM이 backward로 처리해 라벨 안에서 움직인다.
    await arrowAtLabelEnd(
      page,
      editable,
      label,
      "ArrowLeft",
      testInfo.project.name === "chromium",
    );
  });
}

/** PM 범위(U+0590–U+08AC) 밖 RTL 라벨이다(Issue #274). */
const OUT_OF_PM_RTL_LABELS = [
  [
    "Arabic Presentation Forms-B",
    String.fromCodePoint(0xfee3, 0xfeae, 0xfea3, 0xfe92, 0xfe8e),
  ],
  [
    "Arabic Extended-A",
    String.fromCodePoint(0x08b6, 0x08b7, 0x08b8, 0x08b6, 0x08b7),
  ],
  [
    "Hebrew Presentation Forms",
    String.fromCodePoint(0xfb2a, 0xfb31, 0xfb4b, 0xfb3c, 0xfb44),
  ],
  [
    "Adlam(astral)",
    String.fromCodePoint(0x1e922, 0x1e923, 0x1e924, 0x1e925, 0x1e926),
  ],
] as const;

for (const [name, label] of OUT_OF_PM_RTL_LABELS) {
  test(`PM 범위 밖 RTL(${name})로 끝나는 접힌 toggle 라벨 끝의 ArrowRight는 첫 숨은 자식이 문단이면 엔진의 시각 이동을 따른다 @core`, async ({
    page,
  }, testInfo) => {
    const { editable, marker } = await openSample(page);
    await replaceLabel(page, blockId(editable, 10), label);
    await marker.click();
    await expect(blockId(editable, 11)).toBeHidden();

    // Firefox만 시각 오른쪽이 라벨 안이다.
    await arrowAtLabelEnd(
      page,
      editable,
      label,
      "ArrowRight",
      testInfo.project.name === "firefox",
    );
  });
}

test("PM 범위 밖 RTL(Arabic Presentation Forms-B)로 끝나는 접힌 toggle 라벨 끝의 ArrowRight는 첫 숨은 자식이 divider여도 엔진의 시각 이동을 따른다 @core", async ({
  page,
}, testInfo) => {
  const [, label] = OUT_OF_PM_RTL_LABELS[0];
  const { editable } = await collapseWithDividerFirstChild(page, label);

  await arrowAtLabelEnd(
    page,
    editable,
    label,
    "ArrowRight",
    testInfo.project.name === "firefox",
  );
});

test("PM 범위 밖 RTL 글자로 끝나는 혼합 접힌 toggle 라벨 끝의 ArrowRight 2회는 펼친 상태처럼 라벨을 벗어난다 @core", async ({
  page,
}, testInfo) => {
  // `abc ` 뒤 Arabic Presentation Forms-B 한 글자다.
  const label = String.fromCodePoint(0x61, 0x62, 0x63, 0x20, 0xfee3);
  const { editable, marker } = await openSample(page);
  const block = blockId(editable, 10);
  await replaceLabel(page, block, label);
  await marker.click();
  await expect(blockId(editable, 11)).toBeHidden();
  await placeCaretInsideOf(page, labelOf(block));
  // 전제: 캐럿이 라벨 논리 끝이다.
  await expect(async () => {
    await page.keyboard.press("End");
    await yieldFrame(page);
    expect(await textBeforeCaret(labelOf(block))).toBe(label);
  }).toPass();
  const blockBefore = await blockId(editable, 12).innerText();
  const countBefore = await siblingCount(block);

  // Firefox 펼침 네이티브는 라벨 안 bidi 수준 전환 1회 뒤 라벨을 벗어난다.
  // 확장이 첫 키를 대신해도 그 bidi 수준을 남겨야 같은 횟수가 된다.
  await page.keyboard.press("ArrowRight");
  await yieldFrame(page);
  await page.keyboard.press("ArrowRight");
  await yieldFrame(page);
  await page.keyboard.type("Z");
  await yieldFrame(page);

  expect(await siblingCount(block)).toBe(countBefore);
  expect(await labelText(block)).toBe(label);
  if (testInfo.project.name === "firefox") {
    expect(await blockId(editable, 12).innerText()).toBe(`Z${blockBefore}`);
  } else {
    // 첫 키가 block-12 시작으로 가고 둘째 키가 한 글자 움직인다.
    const [first = "", ...rest] = Array.from(blockBefore);
    expect(await blockId(editable, 12).innerText()).toBe(
      `${first}Z${rest.join("")}`,
    );
  }
});
