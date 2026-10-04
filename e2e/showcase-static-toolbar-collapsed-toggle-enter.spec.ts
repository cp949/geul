/**
 * 자식이 있는 접힌 toggle 라벨에서 Enter를 누르면 숨은 그룹이 아니라 접힌
 * toggle 뒤의 보이는 위치에 새 블록이 생기고 입력이 거기 들어가는지 실제
 * 브라우저에서 확인한다(Issue #252). 새 블록이 숨은 그룹 안에 생기면 화면은
 * 안 바뀌고 이어지는 입력이 보이지 않는 블록으로 사라진다.
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - display:none 노드 안 캐럿을 브라우저가 어디로 옮기는지는 jsdom이
 *   재현하지 못한다. 실제 키 입력(`Z`)이 들어간 위치로만 확인된다.
 * 문서 구조·캐럿 selection·undo의 세부 계약은 단위 테스트
 * (block-split-collapsed.test.ts)가 소유한다.
 *
 * 샘플 문서(`샘플 불러오기`)를 쓴다. block-10은 자식 block-11을 가진 토글이고
 * block-12는 그 뒤 제목이다.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";
import { blockId, placeCaretIn } from "./support/static-toolbar-sample.js";
import { yieldFrame } from "./support/yield-frame.js";

/** 샘플을 불러와 block-10을 접고 라벨을 클릭해 캐럿을 둔다. */
const openCollapsedSample = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editable = page.getByRole("textbox", { name: "Editor" });
  const block = blockId(editable, 10);
  await block.locator("[data-geul-toggle-marker]").click();
  await expect(blockId(editable, 11)).toBeHidden();
  await placeCaretIn(page, block);
  return { editable, block };
};

/** toggle 라벨 줄(블록 컨테이너의 첫 자식)의 텍스트. 자식 블록 텍스트는 뺀다. */
const labelText = (block: Locator) =>
  block.evaluate((element) => element.firstElementChild?.textContent ?? "");

/** block의 바로 뒤 형제 블록 컨테이너. */
const nextSibling = (block: Locator) =>
  block.locator("xpath=following-sibling::*[1]");

/** block 안 숨은 그룹의 직속 자식 컨테이너. */
const groupChildren = (block: Locator) =>
  block.locator(":scope > [data-geul-block-group] > *");

test("접힌 toggle 라벨 끝에서 Enter 뒤 입력하면 접힌 toggle 바로 뒤 새 블록에 들어가고 숨은 그룹은 그대로다", async ({
  page,
}) => {
  const { editable, block } = await openCollapsedSample(page);
  await page.keyboard.press("End");
  await yieldFrame(page);
  const labelBefore = await labelText(block);

  await page.keyboard.press("Enter");
  await yieldFrame(page);
  await page.keyboard.type("Z");
  await yieldFrame(page);

  // Z는 block-10 바로 뒤에 새로 생긴 보이는 블록에 들어갔다.
  const created = nextSibling(block);
  await expect(created).toBeVisible();
  expect(await labelText(created)).toBe("Z");
  // 접힌 toggle 라벨과 숨은 자식에는 Z가 없다.
  expect(await labelText(block)).toBe(labelBefore);
  await expect(blockId(editable, 11)).not.toContainText("Z");
  // 숨은 그룹의 자식은 block-11 하나뿐이다.
  await expect(groupChildren(block)).toHaveCount(1);
  await expect(groupChildren(block)).toHaveAttribute(
    "data-geul-block-id",
    /sample-block-11$/,
  );
});

test("접힌 toggle 라벨 중간에서 Enter하면 앞 조각은 접힌 toggle에 남고 뒤 조각이 새 블록으로 가며 입력은 새 블록 시작에 들어간다", async ({
  page,
}) => {
  const { editable, block } = await openCollapsedSample(page);
  await page.keyboard.press("Home");
  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await yieldFrame(page);
  const labelBefore = await labelText(block);
  // 중간 위치 전제: 라벨이 "펼쳐" 뒤에서 나뉜다. 공백 경계는 피한다. 줄 맨
  // 앞 공백은 브라우저가 입력 때 접어 버려 입력 위치 단언이 흔들린다.
  expect(labelBefore.startsWith("펼쳐서")).toBe(true);
  const front = "펼쳐";
  const rest = labelBefore.slice(front.length);

  await page.keyboard.press("Enter");
  await yieldFrame(page);

  const created = nextSibling(block);
  await expect(created).toBeVisible();
  expect(await labelText(block)).toBe(front);
  expect(await labelText(created)).toBe(rest);

  await page.keyboard.type("Z");
  await yieldFrame(page);

  // Z는 새 블록 시작에 들어간다.
  expect(await labelText(created)).toBe(`Z${rest}`);
  expect(await labelText(block)).toBe(front);
  await expect(blockId(editable, 11)).not.toContainText("Z");
  await expect(groupChildren(block)).toHaveCount(1);
});
