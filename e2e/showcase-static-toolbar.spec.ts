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

test("블록 타입 컨트롤이 늘어나도 데모 패널 폭 안에서 한 줄로 보인다", async ({
  page,
}) => {
  // 블록 타입 select를 Text/Heading으로 줄이고 Quote·Code·목록 4종을
  // 아이콘 버튼으로 뺀 뒤(회귀 확인) 툴바 컨트롤 수가 10개에서 16개로
  // 늘었다 — ExamplePage의 50/50 split 폭(그대로 두면 553px 안팎)에서는
  // 마지막 컨트롤(Background color) 하나만 둘째 줄로 밀려나는 모양이
  // 났다. 이 예제만 `wide` 데모 패널을 써 한 줄에 들어가야 한다.
  await openShowcasePage(page, "/examples/static-toolbar");
  const toolbar = page.getByRole("toolbar", { name: "Toolbar" });
  await expect(toolbar).toBeVisible();

  const rowTops = await toolbar.evaluate((element) =>
    Array.from(element.children).map(
      (child) => Math.round(child.getBoundingClientRect().y * 100) / 100,
    ),
  );
  const uniqueRows = new Set(rowTops);
  expect(uniqueRows.size).toBe(1);
});

test("블록 타입 아이콘 버튼 연속 클릭이 항상 같은 블록에 적용된다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const block1 = editable.locator('[data-geul-block-id$="block-1"]');

  await editable.locator("p").first().click();
  await page.getByRole("button", { name: "Quote" }).click();
  await expect(block1.locator("blockquote")).toHaveCount(1);
  await expect(editable.locator("blockquote")).toHaveCount(1);

  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(block1.locator("pre[data-geul-code-block]")).toHaveCount(1);
  await expect(editable.locator("pre[data-geul-code-block]")).toHaveCount(1);

  await expect(page.getByRole("combobox", { name: "Block type" })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("button", { name: "Code", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
