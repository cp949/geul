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
import { expect, test, type Locator, type Page } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";
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

/** toggle 라벨 줄(블록 컨테이너의 첫 자식)의 텍스트. 자식 블록 텍스트는 뺀다. */
const labelText = (block: Locator) =>
  block.evaluate((element) => element.firstElementChild?.textContent ?? "");

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
