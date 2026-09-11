/**
 * 표 안에서 Tab/Shift+Tab이 브라우저의 순차 포커스 이동을 실제로 소비하는지,
 * 그리고 세로 화살표(ArrowUp/ArrowDown)가 실제 렌더 레이아웃 위에서 같은
 * 열의 다음/이전 행으로 옮기는지 검증한다. 셀 탐색 자체(캐럿이 어느 셀로
 * 가는가, 마지막 셀에서 행이 늘어나는가, undo 단계가 몇인가)는 브라우저가
 * 기여하는 것이 없어 `packages/core/test/`가 단독으로 소유한다 — ADR 0007,
 * Issue #90.
 *
 * Tab 한 건이 브라우저를 필요로 하는 이유: jsdom은 Tab 순차 포커스 이동을
 * 구현하지 않아, `preventDefault`를 아무도 부르지 않아도 `activeElement`가
 * 그대로다(jsdom@27.0.1 실측). 그래서 jsdom에서 "포커스가 셀 밖으로 나가지
 * 않았다"는 단언은 무조건 통과하는 공허한 단언이 된다.
 * `table-keyboard-extension.test.ts`가 증명하는 것은 첫 셀에서도
 * `goToPreviousTableCell`이 `true`를 돌려준다는 *계약*이고, 브라우저가 그
 * `true`를 지켜 포커스를 표 안에 붙잡아 두는 *효과*는 여기서만 보인다.
 *
 * 세로 화살표 건이 브라우저를 필요로 하는 이유는 다르다 —
 * `moveTableCellCaret`(`table-keyboard-extension.ts`)의 개입 여부는
 * `view.endOfTextblock("up"/"down")`이 실제 렌더 rect(`Range.getClientRects`)로
 * "캐럿이 셀의 시각적 마지막/첫 줄에 있는가"를 판정한 결과에 달려 있다.
 * jsdom은 이 API가 없어 그 판정이 예외를 던지고(실측,
 * `table-keyboard-extension.test.ts`의 jsdom 안전망 테스트가 그 예외를
 * 잡아 개입하지 않음만 증명한다), ADR 0007이 "실제 레이아웃"으로 꼽는
 * 여섯 사유 중 하나와 정확히 같다 — jsdom 대응은 계약(경계일 때만 개입해
 * `nextCell`로 옮긴다)만 증명하고, 실제 브라우저 레이아웃 위에서 그 경계
 * 판정이 참으로 발동해 캐럿이 실제로 옮겨가는 *효과*는 여기서만 보인다.
 *
 * 3엔진(firefox·webkit) 태그가 여기 붙는 이유: contenteditable에서 Tab이
 * 순차 포커스 이동을 하는지, `preventDefault`가 그것을 막는지, 그리고
 * `getClientRects` 기반 줄 경계 판정이 정확히 같은 값을 주는지는 엔진마다
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

test("1행1열에서 ArrowDown은 2행1열로, 거기서 ArrowUp은 다시 1행1열로 캐럿을 옮긴다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const table = await insertTable(page, editable);
  const firstRowFirstCell = table.locator("tr").nth(0).locator("td").nth(0);
  const secondRowFirstCell = table.locator("tr").nth(1).locator("td").nth(0);

  await firstRowFirstCell.click();
  await page.keyboard.press("ArrowDown");
  // 표 격자를 모르는 브라우저 기본 좌표 이동에 맡겨졌다면 2행1열이 아닌
  // 다른 칸(또는 표 밖)에 떨어질 수 있다 — 타이핑 결과로 도착 칸을 증명한다.
  await page.keyboard.type("A");

  await expect(secondRowFirstCell).toHaveText("A");
  await expect(firstRowFirstCell).toHaveText("");

  await page.keyboard.press("ArrowUp");
  await page.keyboard.type("B");

  await expect(firstRowFirstCell).toHaveText("B");
  await expect(secondRowFirstCell).toHaveText("A");
});
