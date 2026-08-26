/**
 * 표 마지막 셀에서 Tab을 누르면 `table-keyboard-extension.ts`의
 * `goToNextTableCellOrInsertRow` → `insertTableRow` → `createId()` 경로를
 * 실제 브라우저에서 태운다. 행 개수·캐럿 이동 자체는
 * `packages/core/test/table-keyboard-extension.test.ts`가 이미
 * 소유하므로(ADR-0007) 여기서는 그것을 다시 증명하지 않고, 오직 "발급된
 * id가 실제로 유효한 UUID v4인가"(Chrome75/83 crypto.randomUUID() 미지원
 * 회귀 — Issue #121·#124)만 증명한다.
 *
 * `table-keyboard-navigation.spec.ts`와 별도 파일로 둔 이유: `chrome83`
 * project(`playwright.config.ts`)가 파일명 `testMatch` + `grep: /@core/`
 * 조합으로 시나리오를 고른다. 같은 파일에 두면 그 파일의 다른 `@core`
 * 테스트(Shift+Tab 포커스 트랩)까지 의도치 않게 chrome83에 편입된다 —
 * `table-keyboard-navigation.spec.ts`는 그 테스트 하나만 위한 파일로
 * 남긴다.
 */
import { expect, test } from "@playwright/test";

import { insertTable, openDemo } from "./support/demo.js";
import { trackPageErrors, uuidV4Pattern } from "./support/ids.js";

test("표의 마지막 셀에서 Tab은 새 행을 추가하고 createId()가 유효한 id를 발급한다 @core", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);

  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const lastCell = table.locator("tr").last().locator("td").last();

  await lastCell.click();
  await page.keyboard.press("Tab");

  await expect(table.locator("tr")).toHaveCount(4);
  const newRowId = await table
    .locator("tr")
    .last()
    .getAttribute("data-be-row-id");
  expect(newRowId).toMatch(uuidV4Pattern);

  expect(pageErrors).toHaveLength(0);
});
