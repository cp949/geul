/**
 * 표 안에서 Tab/Shift+Tab이 브라우저의 순차 포커스 이동을 실제로 소비하는지
 * 검증한다. 셀 탐색 자체(캐럿이 어느 셀로 가는가, 마지막 셀에서 행이
 * 늘어나는가, undo 단계가 몇인가)는 브라우저가 기여하는 것이 없어
 * `packages/core/test/`가 단독으로 소유한다 — ADR 0007, Issue #90.
 *
 * 남은 한 건이 브라우저를 필요로 하는 이유: jsdom은 Tab 순차 포커스 이동을
 * 구현하지 않아, `preventDefault`를 아무도 부르지 않아도 `activeElement`가
 * 그대로다(jsdom@27.0.1 실측). 그래서 jsdom에서 "포커스가 셀 밖으로 나가지
 * 않았다"는 단언은 무조건 통과하는 공허한 단언이 된다.
 * `table-keyboard-extension.test.ts`가 증명하는 것은 첫 셀에서도
 * `goToPreviousTableCell`이 `true`를 돌려준다는 *계약*이고, 브라우저가 그
 * `true`를 지켜 포커스를 표 안에 붙잡아 두는 *효과*는 여기서만 보인다.
 *
 * 3엔진(firefox·webkit) 태그가 여기 붙는 이유: contenteditable에서 Tab이
 * 순차 포커스 이동을 하는지와 `preventDefault`가 그것을 막는지는 엔진마다
 * 갈리는 영역이다.
 */
import { expect, test } from "@playwright/test";

import { insertTable, openDemo } from "./support/demo.js";

test("표의 첫 셀에서 Shift+Tab은 표 밖으로 포커스를 넘기지 않는다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const firstCell = table.locator("tr").nth(0).locator("td").nth(0);

  await firstCell.click();
  await page.keyboard.press("Shift+Tab");
  // 포커스가 표 밖으로 나갔다면 이 타이핑은 셀에 닿지 않는다.
  await page.keyboard.type("A");

  await expect(firstCell).toHaveText("A");
});
