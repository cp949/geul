/**
 * 접힌 toggle 바로 뒤 블록 선두에서 Backspace를 누르면 그 블록 텍스트가 숨은
 * 자손이 아니라 접힌 toggle 라벨 끝에 보이고 이어지는 입력이 라벨에 들어가는지
 * 실제 브라우저에서 확인한다(Issue #253). 숨은 그룹에 병합되면 텍스트가 화면에서
 * 사라지고 이어지는 입력도 보이지 않는 곳으로 간다.
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - display:none 노드 안 캐럿을 브라우저가 어디로 옮기는지는 jsdom이
 *   재현하지 못한다. 실제 키 입력(`Z`)이 들어간 위치로만 확인된다.
 * 문서 구조·캐럿 selection·undo의 세부 계약은 단위 테스트
 * (block-join/collapsed-toggle.test.ts)가 소유한다.
 *
 * Control+Backspace(Issue #276)도 같은 병합 경로를 탄다. 수식 키가 BlockJoin을
 * 거치지 않으면 PM joinBackward가 숨은 자손에 병합해 텍스트가 사라진다. 수식 키
 * 조합별 동등 계약은 단위 테스트(block-join/modifier-keys.test.ts)가 소유한다.
 *
 * 샘플 문서(`샘플 불러오기`)를 쓴다. block-10은 자식 block-11을 가진 토글이고
 * block-12는 그 뒤 제목이다.
 */
import { expect, test } from "@playwright/test";

import {
  groupChildren,
  labelText,
  openCollapsedSample,
} from "./support/static-toolbar-collapsed-toggle.js";
import { blockId, placeCaretIn } from "./support/static-toolbar-sample.js";
import { yieldFrame } from "./support/yield-frame.js";

test("접힌 toggle 뒤 블록 선두에서 Backspace하면 그 텍스트가 접힌 toggle 라벨 끝에 보이고 입력도 라벨에 들어간다", async ({
  page,
}) => {
  const { editable, block } = await openCollapsedSample(page);
  const labelBefore = await labelText(block);
  const headingText = await blockId(editable, 12).innerText();
  expect(headingText.trim()).toBe("코드");

  await placeCaretIn(page, blockId(editable, 12));
  await page.keyboard.press("Home");
  await yieldFrame(page);
  await page.keyboard.press("Backspace");
  await yieldFrame(page);

  // block-12 컨테이너는 사라지고 그 텍스트가 block-10 라벨 끝에 붙는다.
  await expect(blockId(editable, 12)).toHaveCount(0);
  expect(await labelText(block)).toBe(`${labelBefore}${headingText.trim()}`);
  // 접힘과 숨은 자식은 그대로다.
  await expect(blockId(editable, 11)).toBeHidden();
  await expect(groupChildren(block)).toHaveCount(1);

  await page.keyboard.type("Z");
  await yieldFrame(page);

  // 캐럿은 접합점(라벨의 기존 텍스트 끝)이라 Z는 기존 라벨과 병합된 텍스트
  // 사이에 들어간다. 라벨 밖(숨은 자식)에는 들어가지 않는다.
  expect(await labelText(block)).toBe(`${labelBefore}Z${headingText.trim()}`);
  await expect(groupChildren(block)).toHaveCount(1);

  // 펼치면 숨은 자식 텍스트가 그대로이고 Z·병합된 텍스트가 거기 없다.
  await block.locator("[data-geul-toggle-marker]").click();
  await expect(blockId(editable, 11)).toBeVisible();
  await expect(blockId(editable, 11)).toHaveText("토글 안에 중첩된 문단이다.");
  await expect(blockId(editable, 11)).not.toContainText("Z");
  await expect(blockId(editable, 11)).not.toContainText(headingText.trim());
});

test("접힌 toggle 뒤 블록 선두에서 Control+Backspace해도 Backspace와 같이 라벨 끝에 병합되고 입력도 라벨에 들어간다", async ({
  page,
}) => {
  const { editable, block } = await openCollapsedSample(page);
  const labelBefore = await labelText(block);
  const headingText = (await blockId(editable, 12).innerText()).trim();
  expect(headingText).toBe("코드");

  await placeCaretIn(page, blockId(editable, 12));
  await page.keyboard.press("Home");
  await yieldFrame(page);
  await page.keyboard.press("Control+Backspace");
  await yieldFrame(page);

  // block-12 텍스트가 숨은 자식이 아니라 block-10 라벨 끝에 붙는다.
  await expect(blockId(editable, 12)).toHaveCount(0);
  expect(await labelText(block)).toBe(`${labelBefore}${headingText}`);
  await expect(blockId(editable, 11)).toBeHidden();
  await expect(groupChildren(block)).toHaveCount(1);

  await page.keyboard.type("Z");
  await yieldFrame(page);

  expect(await labelText(block)).toBe(`${labelBefore}Z${headingText}`);

  // 펼치면 숨은 자식 텍스트가 그대로이고 Z·병합된 텍스트가 거기 없다.
  await block.locator("[data-geul-toggle-marker]").click();
  await expect(blockId(editable, 11)).toBeVisible();
  await expect(blockId(editable, 11)).toHaveText("토글 안에 중첩된 문단이다.");
  await expect(blockId(editable, 11)).not.toContainText("Z");
  await expect(blockId(editable, 11)).not.toContainText(headingText);
});
