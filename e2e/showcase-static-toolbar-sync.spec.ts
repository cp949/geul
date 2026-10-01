/**
 * StaticToolbar가 빠른 클릭 뒤에도 현재 블록 상태를 표시하는지 확인한다
 * (RD-001-DELTA-03, Issue #218 결함 1·1a).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007 "네이티브 입력의 기본 동작"):
 * 결함 원인이 포인터 클릭의 `mousedown → mouseup → selectionchange` 순서와
 * ProseMirror의 `selectionchange` 리스너 재등록 순서다. jsdom은 실제 포인터
 * 선택을 만들지 않아 이 순서를 재현하지 못한다. 구독 등록·해제와 명령
 * 호출 경로는 단위 테스트(static-toolbar-subscription.test.tsx)가 소유한다.
 *
 * 클릭은 Playwright 기본 `click()`을 쓴다. `click({ delay })`로 누름 시간을
 * 늘리면 `mouseup`이 상태를 바로잡아 결함이 재현되지 않는다.
 */
import { expect, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

test("빠른 클릭으로 Quote 블록에서 다른 문단으로 옮기면 Quote 버튼이 해제 표시가 된다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  const quoteButton = page.getByRole("button", { name: "Quote" });

  await editable.locator('[data-geul-block-id$="block-3"]').click();
  await quoteButton.click();
  await expect(quoteButton).toHaveAttribute("aria-pressed", "true");

  await editable.locator('[data-geul-block-id$="block-5"]').click();

  await expect(quoteButton).toHaveAttribute("aria-pressed", "false");
});

test("빠른 클릭 직후 블록 타입 select로 변환하면 클릭한 문단이 바뀐다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });

  await editable.locator('[data-geul-block-id$="block-1"]').click();
  await editable.locator('[data-geul-block-id$="block-4"]').click();
  // selectionchange는 포인터 입력 뒤 비동기로 발화한다. 한 macrotask를
  // 양보해 ProseMirror가 새 selection을 반영하게 한다. 사람이 만드는
  // 클릭 간격(수십 ms)보다 훨씬 짧아 "빠른 클릭"의 성격은 유지된다.
  await page.evaluate(
    () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
  );
  // selectOption은 마우스 이벤트 없이 값을 바꾼다 — 결함 1a의 재현 조건이다.
  await page
    .getByRole("combobox", { name: "Block type" })
    .selectOption("heading-1");

  await expect(
    editable.locator('[data-geul-block-id$="block-4"] h1'),
  ).toHaveCount(1);
  await expect(editable.locator("h1")).toHaveCount(1);
});
