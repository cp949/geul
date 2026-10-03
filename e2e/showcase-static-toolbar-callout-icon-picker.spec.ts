/**
 * callout 아이콘 선택기가 열린 채 스크롤해도 callout 하단에 붙어 있는지
 * 확인한다(Issue #234, G-UI-001).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007 "레이아웃 기하"): 선택기는
 * 열릴 때의 viewport 좌표에 fixed로 그려지고, callout은 안쪽 스크롤 컨테이너와
 * window 안에서 움직인다. jsdom은 실제 스크롤과 레이아웃을 만들지 못한다.
 * 재측정 배선은 단위 테스트(fixed-placement.test.tsx)가 소유한다.
 *
 * 열리기 전 hover 트리거(Issue #235, G-UI-003)는 page 좌표 absolute라 안쪽
 * 스크롤 컨테이너가 스크롤돼도 제자리에 남았다. 포인터를 멈춘 채 스크롤해도
 * 트리거 상단이 callout 상단과 같은지 본다. 재렌더 배선은 단위 테스트
 * (callout-icon-picker.test.tsx)가 소유한다.
 */
import { expect, type Page, test } from "@playwright/test";

import {
  expectOverlayFollowsAnchor,
  expectOverlayTopAlignedWithAnchor,
  type ScrollScope,
} from "./support/anchor-gap.js";
import { openShowcasePage } from "./support/showcase.js";

/** 예제를 열고 3번 문단 아래에 callout을 만들어 callout locator를 돌려준다. */
const createCallout = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  await editable.locator('[data-geul-block-id$="block-3"]').click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/callout");
  await page.getByRole("option", { name: "Callout" }).click();
  return editable.locator("[data-geul-callout]");
};

/** callout을 만들고 hover해 선택기를 연다. */
const openCalloutPicker = async (page: Page) => {
  const callout = await createCallout(page);
  await callout.hover();
  await page.getByRole("button", { name: "Change callout icon" }).click();
  const picker = page.getByRole("listbox", { name: "Callout icon picker" });
  await expect(picker).toBeVisible();
  return { callout, picker };
};

test.describe("열린 채 스크롤 (Issue #234)", () => {
  for (const [title, scope] of [
    ["window를 스크롤해도", "window"],
    ["안쪽 스크롤 컨테이너를 스크롤해도", "inner"],
    ["안쪽 스크롤과 window를 함께 스크롤해도", "all"],
  ] as const satisfies readonly (readonly [string, ScrollScope])[]) {
    test(`callout 아이콘 선택기가 열린 채 ${title} callout 하단에 붙어 있다`, async ({
      page,
    }) => {
      const { callout, picker } = await openCalloutPicker(page);

      // 선택기는 callout 하단에 간격 없이 붙는다(readAnchor의 오프셋 +0).
      await expectOverlayFollowsAnchor(page, callout, picker, scope, 0);
    });
  }
});

test.describe("hover 트리거 (Issue #235)", () => {
  for (const [title, scope] of [
    ["window를 스크롤해도", "window"],
    ["안쪽 스크롤 컨테이너를 스크롤해도", "inner"],
    ["안쪽 스크롤과 window를 함께 스크롤해도", "all"],
  ] as const satisfies readonly (readonly [string, ScrollScope])[]) {
    test(`포인터를 멈춘 채 ${title} 트리거 상단이 callout 상단과 같다`, async ({
      page,
    }) => {
      const callout = await createCallout(page);
      await callout.hover();
      const trigger = page.getByRole("button", { name: "Change callout icon" });
      await expect(trigger).toBeVisible();

      await expectOverlayTopAlignedWithAnchor(page, callout, trigger, scope);
    });
  }
});
