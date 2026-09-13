/**
 * showcase의 StaticToolbar 예제(RD-001-DELTA-05, Issue #184)를 검증한다.
 * 단위 테스트(packages/react/test/static-toolbar.test.tsx)는 fakeController
 * 고정값만 보므로, 실제 브라우저의 스크롤·CSS sticky 동작은 이 spec이
 * 담당한다 — RD-001 완료 조건 6.
 */
import { expect, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

test("선택 없이도 툴바가 항상 보인다", async ({ page }) => {
  await openShowcasePage(page, "/examples/static-toolbar");

  await expect(page.getByRole("toolbar", { name: "Toolbar" })).toBeVisible();
});

test("스크롤해도 툴바가 상단에 고정된 채로 유지된다", async ({ page }) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const toolbar = page.getByRole("toolbar", { name: "Toolbar" });
  await expect(toolbar).toBeVisible();

  const before = await toolbar.boundingBox();
  if (before === null)
    throw new Error("스크롤 전 toolbar bounding box를 얻지 못했다");

  // toolbar의 부모(example.module.css의 .scrollArea)를 끝까지 스크롤한다.
  // 예제가 20개 문단을 넣어 스크롤이 실제로 일어나도록 만들었다(RD-001
  // 완료 조건 6, example.tsx PARAGRAPH_COUNT 참고).
  const scrollArea = toolbar.locator("..");
  await scrollArea.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const scrollTop = await scrollArea.evaluate((element) => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);

  const after = await toolbar.boundingBox();
  if (after === null)
    throw new Error("스크롤 후 toolbar bounding box를 얻지 못했다");
  // position: sticky가 실제로 적용됐다면 뷰포트 기준 y좌표가 그대로다 —
  // sticky가 없었다면(예: 클래스가 안 붙거나 스크롤 컨테이너를 잘못
  // 잡으면) 문서와 함께 위로 밀려 y가 줄어든다.
  expect(after.y).toBe(before.y);
});

test("텍스트를 선택하고 Bold를 누르면 실제로 굵게 적용된다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });

  await editable.locator("p").first().dblclick();
  await page.getByRole("button", { name: "Bold" }).click();

  await expect(editable.locator("strong")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
