/**
 * 표 셀에서 뒤 문단으로 걸친 범위 선택의 Enter·Backspace를 실제 브라우저에서
 * 확인한다(Issue #289). 이전에는 Enter가 예외를 던졌고 Backspace는 선택하지
 * 않은 뒷부분 텍스트를 셀로 옮기거나 셀을 지웠다.
 *
 * Issue #317이 두 건을 더한다. 셀 맨 앞 Backspace가 문서·캐럿·undo 스택을
 * 바꾸지 않는 것, 첫 블록이 표일 때 첫 셀 시작부터 문서 끝까지 범위 삭제가
 * 표 구조를 유지하며 동작하는 것이다.
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - 실제 DOM selection이 셀 텍스트에서 뒤 문단 텍스트로 걸칠 때 편집기가
 *   그 선택을 경계 범위 TextSelection으로 읽는지는 jsdom이 재현하지 못한다.
 *   키 핸들러 앞단이 DOM 파생 selection 판정이라 실제 선택과 키 입력으로만
 *   확인된다.
 * 경계 범위 판정과 삭제 규칙, 구조(셀·행·열)·캐럿·undo·수식 키 계약은 단위
 * 테스트(packages/core/test/block-join/table-boundary-range.test.ts)가
 * 소유한다.
 *
 * 문서는 showcase document-io 예제의 Import JSON으로 배치하고 Export JSON으로
 * 읽는다. Firefox는 표 셀 사이 범위를 다중 range로 만들어 selection 모양이
 * 달라질 수 있어 chromium만 돌린다(@core 편입 없음).
 */
import { expect, type Page, test } from "@playwright/test";

import { exportedBlocks, importBlocks } from "./support/document-io.js";
import { trackPageErrors } from "./support/ids.js";
import {
  blocks,
  selectFromCellToParagraph,
  selectFromParagraphToCell,
  table2x2,
} from "./support/table-boundary.js";
import { yieldFrame } from "./support/yield-frame.js";

test("표 셀(1,1)에서 뒤 문단으로 걸친 범위를 Backspace하면 양쪽 선택 텍스트만 지우고 표 구조를 유지한다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const editable = await importBlocks(page, blocks());

  await selectFromCellToParagraph(
    page,
    editable,
    { index: 3, offset: 2 },
    { id: "w", offset: 2 },
  );
  await page.keyboard.press("Backspace");
  await yieldFrame(page);

  const expected = structuredClone(table2x2);
  expected.rows[1]!.cells[1]!.content = [{ text: "c1" }];
  expect(await exportedBlocks(page)).toEqual([
    expected,
    { id: "w", type: "paragraph", content: [{ text: "yz" }] },
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ]);
  expect(pageErrors).toEqual([]);
});

test("표 셀에서 뒤 문단으로 걸친 범위를 Enter하면 예외 없이 문서가 그대로다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const editable = await importBlocks(page, blocks());

  await selectFromCellToParagraph(
    page,
    editable,
    { index: 3, offset: 2 },
    { id: "w", offset: 2 },
  );
  await page.keyboard.press("Enter");
  await yieldFrame(page);

  expect(await exportedBlocks(page)).toEqual(blocks());
  expect(pageErrors).toEqual([]);
});

test("앞 문단에서 표 셀로 걸친 범위를 Enter하면 문단이 분할되지 않고 표가 그대로다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const before = [
    { id: "a", type: "paragraph", content: [{ text: "abcd" }] },
    table2x2,
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ];
  const editable = await importBlocks(page, before);

  await selectFromParagraphToCell(
    page,
    editable,
    { id: "a", offset: 2 },
    { index: 3, offset: 1 },
  );
  await page.keyboard.press("Enter");
  await yieldFrame(page);

  expect(await exportedBlocks(page)).toEqual(before);
  expect(pageErrors).toEqual([]);
});

// DOM selection의 anchor를 "셀 순번과 텍스트 offset"으로 읽는다. 셀 밖이면 null.
const caretInCell = (page: Page) =>
  page.evaluate(() => {
    const selection = document.getSelection();
    const anchor = selection?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    const cell = element?.closest("td");
    if (selection === null || anchor === null || anchor === undefined) {
      return null;
    }
    if (cell === null || cell === undefined) return null;
    const cells = Array.from(document.querySelectorAll(".ProseMirror td"));
    return {
      cell: cells.indexOf(cell),
      offset: selection.anchorOffset,
      collapsed: selection.isCollapsed,
    };
  });

test("셀 맨 앞 Backspace는 문서와 캐럿을 바꾸지 않고 undo 항목을 남기지 않는다 (Issue #317)", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const before = [
    { id: "a", type: "paragraph", content: [{ text: "abcd" }] },
    table2x2,
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ];
  const editable = await importBlocks(page, before);

  // 앞 문단에 실제 편집을 하나 만든다. 셀 맨 앞 Backspace가 빈 undo 항목을
  // 남겼다면 첫 Control+z는 그 항목만 되돌려 이 편집이 남는다.
  await editable.locator('[data-geul-block-id="a"] p').first().click();
  await page.keyboard.press("End");
  await page.keyboard.type("Z");
  await yieldFrame(page);

  // 셀(1,0) 맨 앞에 캐럿을 둔다.
  await editable.locator("td").nth(2).click();
  await page.keyboard.press("Home");
  await yieldFrame(page);
  expect(await caretInCell(page)).toEqual({
    cell: 2,
    offset: 0,
    collapsed: true,
  });

  await page.keyboard.press("Backspace");
  await yieldFrame(page);

  // 수정 전: 캐럿이 문서 끝(tail)으로 갔다.
  expect(await caretInCell(page)).toEqual({
    cell: 2,
    offset: 0,
    collapsed: true,
  });
  expect(await exportedBlocks(page)).toEqual([
    { id: "a", type: "paragraph", content: [{ text: "abcdZ" }] },
    table2x2,
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ]);

  await page.keyboard.press("Control+z");
  await yieldFrame(page);

  expect(await exportedBlocks(page)).toEqual(before);
  expect(pageErrors).toEqual([]);
});

test("첫 블록이 표일 때 첫 셀 시작부터 문서 끝까지 범위를 Backspace하면 표 구조를 유지하고 텍스트만 지운다 (Issue #317)", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const before = [
    table2x2,
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ];
  const editable = await importBlocks(page, before);

  await selectFromCellToParagraph(
    page,
    editable,
    { index: 0, offset: 0 },
    { id: "tail", offset: 4 },
  );
  await page.keyboard.press("Backspace");
  await yieldFrame(page);

  // 수정 전: 문서 불변. clearDocument가 만든 cellId 없는 셀을 revision guard가
  // 되돌려 삭제가 통째로 사라졌다.
  const expected = structuredClone(table2x2);
  for (const row of expected.rows) {
    for (const cell of row.cells) cell.content = [];
  }
  expect(await exportedBlocks(page)).toEqual([
    expected,
    { id: "tail", type: "paragraph", content: [] },
  ]);

  await page.keyboard.press("Control+z");
  await yieldFrame(page);

  expect(await exportedBlocks(page)).toEqual(before);
  expect(pageErrors).toEqual([]);
});
