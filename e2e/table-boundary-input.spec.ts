/**
 * 표 경계에 걸친 범위 선택의 글자 입력·Cut·붙여넣기·Shift-Enter·IME 조합
 * 시작을 실제 브라우저에서 확인한다(Issue #292). 이전에는 이 경로들이 PM
 * 기본 삭제·삽입을 타서 선택하지 않은 뒷부분 텍스트가 셀로 옮겨 가거나
 * 표가 사라졌다. Enter·Backspace는 table-boundary-range.spec.ts(#289)가
 * 확인한다.
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - 실제 DOM selection이 셀 텍스트와 문단 텍스트에 걸칠 때 편집기가 그
 *   선택을 경계 범위 TextSelection으로 읽는지, 실제 키 입력(keypress)·
 *   Ctrl+X(cut 이벤트)·IME(compositionstart)가 어느 핸들러를 타는지는
 *   jsdom이 재현하지 못한다.
 * 경계 범위 판정과 삭제 규칙, 구조(셀·행·열)·캐럿·undo·방향별 경로·stale
 * 계약은 단위 테스트(packages/core/test/table-boundary-input.test.ts)가
 * 소유한다. 끌어 놓기는 jsdom 합성 drop으로 그 테스트가 증명하고 여기서는
 * 실제 드래그를 만들지 않는다.
 *
 * 문서는 showcase document-io 예제의 Import JSON으로 배치하고 Export JSON으로
 * 읽는다. Firefox는 표 셀 사이 범위를 다중 range로 만들어 selection 모양이
 * 달라질 수 있어 chromium만 돌린다(@core 편입 없음).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { dispatchPaste } from "./support/clipboard.js";
import { exportedBlocks, importBlocks } from "./support/document-io.js";
import { trackPageErrors } from "./support/ids.js";
import {
  blocks,
  selectFromCellToParagraph,
  selectFromParagraphToCell,
  table2x2,
} from "./support/table-boundary.js";
import { yieldFrame } from "./support/yield-frame.js";

type Cells = [string, string, string, string];

/** 2x2 표의 셀 텍스트만 바꾼 표 블록. 빈 문자열은 빈 셀이다. */
const tableWith = (texts: Cells) => {
  const table = structuredClone(table2x2);
  texts.forEach((text, index) => {
    const cell = table.rows[Math.floor(index / 2)]!.cells[index % 2]!;
    cell.content = text === "" ? [] : [{ text }];
  });
  return table;
};

const paragraph = (id: string, text: string) => ({
  id,
  type: "paragraph",
  content: [{ text }],
});

const beforeBlocks = () => [
  paragraph("a", "abcd"),
  table2x2,
  paragraph("tail", "tail"),
];

/** 셀(1,1) offset 2에서 뒤 문단 offset 2까지 정방향 범위를 선택한다(셀 -> 뒤 문단). */
const selectCellToParagraph = async (page: Page, editable: Locator) => {
  await selectFromCellToParagraph(
    page,
    editable,
    { index: 3, offset: 2 },
    { id: "w", offset: 2 },
  );
};

/** 셀(1,1) offset 2에서 뒤 문단 offset 2까지 지운 문서. 끝 문단은 남은 텍스트를 가진다. */
const afterCellToParagraph = (cell: string, between = "") => [
  tableWith(["c00", "c01", "c10", cell]),
  paragraph("w", `${between}yz`),
  paragraph("tail", "tail"),
];

test("표 셀에서 뒤 문단으로 걸친 범위에 글자를 입력하면 선택한 텍스트만 지우고 시작 셀에 입력한다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const editable = await importBlocks(page, blocks());

  await selectCellToParagraph(page, editable);
  await page.keyboard.type("Q");
  await yieldFrame(page);

  expect(await exportedBlocks(page)).toEqual(afterCellToParagraph("c1Q"));
  expect(pageErrors).toEqual([]);
});

test("앞 문단에서 표 셀로 걸친 범위에 글자를 입력하면 선택한 텍스트만 지우고 앞 문단에 입력한다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const editable = await importBlocks(page, beforeBlocks());

  await selectFromParagraphToCell(
    page,
    editable,
    { id: "a", offset: 2 },
    { index: 0, offset: 1 },
  );
  await page.keyboard.type("Q");
  await yieldFrame(page);

  expect(await exportedBlocks(page)).toEqual([
    paragraph("a", "abQ"),
    tableWith(["00", "c01", "c10", "c11"]),
    paragraph("tail", "tail"),
  ]);
  expect(pageErrors).toEqual([]);
});

test("역방향 선택(뒤 문단에서 표 셀로)에도 같은 위치에 입력한다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const editable = await importBlocks(page, blocks());

  // anchor가 뒤 문단이고 head가 셀이다. 범위 시작은 셀이다.
  await selectFromParagraphToCell(
    page,
    editable,
    { id: "w", offset: 2 },
    { index: 3, offset: 2 },
  );
  await page.keyboard.type("Q");
  await yieldFrame(page);

  expect(await exportedBlocks(page)).toEqual(afterCellToParagraph("c1Q"));
  expect(pageErrors).toEqual([]);
});

test("표 셀에서 뒤 문단으로 걸친 범위를 Ctrl+X로 자르면 선택한 텍스트만 지우고 삽입은 없다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const editable = await importBlocks(page, blocks());

  await selectCellToParagraph(page, editable);
  await page.keyboard.press("Control+x");
  await yieldFrame(page);

  expect(await exportedBlocks(page)).toEqual(afterCellToParagraph("c1"));
  expect(pageErrors).toEqual([]);
});

test("표 셀에서 뒤 문단으로 걸친 범위에 plain text를 붙여넣으면 선택한 텍스트만 지우고 시작 셀에 붙인다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const editable = await importBlocks(page, blocks());

  await selectCellToParagraph(page, editable);
  await editable.evaluate(dispatchPaste, { text: "PP" });
  await yieldFrame(page);

  expect(await exportedBlocks(page)).toEqual(afterCellToParagraph("c1PP"));
  expect(pageErrors).toEqual([]);
});

// Shift-Enter 네 방향. head가 표 밖인 A·D와 head가 셀인 B·C 모두 지운 뒤
// 캐럿에 줄바꿈을 넣는다. 내보낸 문서에서 hardBreak는 `\n` 텍스트다.
const afterToAnchorParagraph = () => [
  paragraph("a", "ab\n"),
  tableWith(["00", "c01", "c10", "c11"]),
  paragraph("tail", "tail"),
];
const SHIFT_ENTER = [
  {
    name: "A 셀에서 뒤 문단으로(정방향, head 표 밖)",
    doc: () => blocks(),
    select: (page: Page, editable: Locator) =>
      selectFromCellToParagraph(
        page,
        editable,
        { index: 3, offset: 2 },
        { id: "w", offset: 2 },
      ),
    expected: () => afterCellToParagraph("c1\n"),
  },
  {
    name: "D 셀에서 앞 문단으로(역방향, head 표 밖)",
    doc: () => beforeBlocks(),
    select: (page: Page, editable: Locator) =>
      selectFromCellToParagraph(
        page,
        editable,
        { index: 0, offset: 1 },
        { id: "a", offset: 2 },
      ),
    expected: afterToAnchorParagraph,
  },
  {
    name: "B 뒤 문단에서 셀로(역방향, head 셀)",
    doc: () => blocks(),
    select: (page: Page, editable: Locator) =>
      selectFromParagraphToCell(
        page,
        editable,
        { id: "w", offset: 2 },
        { index: 3, offset: 2 },
      ),
    expected: () => afterCellToParagraph("c1\n"),
  },
  {
    name: "C 앞 문단에서 셀로(정방향, head 셀)",
    doc: () => beforeBlocks(),
    select: (page: Page, editable: Locator) =>
      selectFromParagraphToCell(
        page,
        editable,
        { id: "a", offset: 2 },
        { index: 0, offset: 1 },
      ),
    expected: afterToAnchorParagraph,
  },
] as const;

for (const entry of SHIFT_ENTER) {
  test(`Shift+Enter는 경계 범위를 지우고 캐럿에 줄바꿈을 넣는다 — ${entry.name}`, async ({
    page,
  }) => {
    const pageErrors = trackPageErrors(page);
    const editable = await importBlocks(page, entry.doc());

    await entry.select(page, editable);
    await page.keyboard.press("Shift+Enter");
    await yieldFrame(page);

    expect(await exportedBlocks(page)).toEqual(entry.expected());
    expect(pageErrors).toEqual([]);
  });
}

test("IME 조합을 시작하면 경계 범위를 먼저 지우고 조합 결과를 시작 셀에 넣는다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const editable = await importBlocks(page, blocks());
  await editable.evaluate((root) => {
    const log: string[] = [];
    for (const type of ["compositionstart", "compositionend"]) {
      root.addEventListener(type, () => log.push(type));
    }
    (window as unknown as { __imeLog: string[] }).__imeLog = log;
  });

  await selectCellToParagraph(page, editable);
  // CDP로 실제 IME 조합을 만든다. 조합 중 텍스트를 두 번 갱신하고 확정한다.
  const client = await page.context().newCDPSession(page);
  await client.send("Input.imeSetComposition", {
    text: "ㅎ",
    selectionStart: 1,
    selectionEnd: 1,
  });
  await client.send("Input.imeSetComposition", {
    text: "하",
    selectionStart: 1,
    selectionEnd: 1,
  });
  await client.send("Input.insertText", { text: "한" });
  await yieldFrame(page);

  const log = await page.evaluate(
    () => (window as unknown as { __imeLog: string[] }).__imeLog,
  );
  expect(log).toContain("compositionstart");
  expect(await exportedBlocks(page)).toEqual(afterCellToParagraph("c1한"));
  expect(pageErrors).toEqual([]);
});

test("읽기 전용이면 경계 범위를 자르는 cut 이벤트가 문서를 바꾸지 않는다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const editable = await importBlocks(page, blocks());

  // Tiptap 편집기를 읽기 전용으로 바꾼다. PM은 handleDOMEvents를 editable
  // 검사 없이 실행해 이 확장이 직접 막아야 한다. 읽기 전용 DOM에서는 키 입력이
  // cut 이벤트를 만들지 않아 합성 이벤트를 보낸다(G-TST-001).
  await editable.evaluate((root) => {
    (
      root as unknown as { editor: { setEditable(value: boolean): void } }
    ).editor.setEditable(false);
  });
  await selectCellToParagraph(page, editable);
  await editable.evaluate((root) => {
    const event = new Event("cut", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: new DataTransfer(),
      configurable: true,
    });
    root.dispatchEvent(event);
  });
  await yieldFrame(page);

  expect(await exportedBlocks(page)).toEqual(blocks());
  expect(pageErrors).toEqual([]);
});

test("붙일 내용이 없는 붙여넣기는 경계 범위를 지우지 않는다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const editable = await importBlocks(page, blocks());

  await selectCellToParagraph(page, editable);
  await editable.evaluate(dispatchPaste, {});
  await yieldFrame(page);

  expect(await exportedBlocks(page)).toEqual(blocks());
  expect(pageErrors).toEqual([]);
});
