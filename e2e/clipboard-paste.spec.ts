/**
 * 일반 clipboard 붙여넣기(Issue #38 슬라이스 10, RD-006 DELTA-02)의
 * 실제 브라우저 대표 시나리오 4개 — 구조 보존 HTML, Markdown 텍스트,
 * 표 우선 회귀, 파일 단독 clipboard의 데모 앱 배선. 우선순위·전체 블록
 * 타입 교차는 `clipboard-paste-priority.test.ts`(core, RD-006 DELTA-01)가
 * jsdom 수준에서 이미 fixture로 고정했다 — 이 파일은 그 계약이 실제
 * Chromium DOM·ClipboardEvent에서도 성립하는지만 대표적으로 재확인한다
 * (전체 블록 타입을 반복하지 않는다). HTML own-wrapper·Markdown text 2건에
 * `@core`를 붙여 Firefox/WebKit 3-엔진에서도 돈다(Issue #38 슬라이스 11,
 * `_works/roadmap/RD-001-DELTA-01.md`) — 표 우선·파일 단독 2건은 표
 * 경로(`table-paste.spec.ts`)·후속 슬라이스(Issue #152) 전용 계약이라
 * 대표성이 낮아 제외했다.
 *
 * 마지막 테스트는 원래 "파일 단독 clipboard는 무시된다"(IO-007 own
 * 경계)를 검증했으나, RD-002(Issue #152 슬라이스4, DELTA-01)가 병합되며
 * 그 계약이 spec §4/§5.2로 대체됐다 — 데모(`apps/demo`)는 RD-003
 * DELTA-04부터 `uploadFile`을 항상 등록해 뒀으므로 이제 파일 단독
 * clipboard도 media 블록을 만들고 실제 업로드까지 완주한다. 이 테스트가
 * 그 새 계약(데모 앱 배선, ADR-0007)으로 갱신됐다(RD-002 DELTA-03,
 * `_works/roadmap/result/RD-002-DELTA-03.md` "배경").
 *
 * 여러 줄 plain text 붙여넣기 배치(Issue #284)는 아래 마지막 세 테스트가
 * 실제 브라우저에서 확인한다. 배치 규칙·타입별 분기·범위 선택·transaction
 * 계약은 core 단위 테스트(`clipboard-paste-plain-multiline.test.ts`)가
 * 소유한다. 이 파일은 엔진별 클립보드·drop 경로가 같은 결과를 내는지만
 * 본다. 문서는 showcase document-io 예제의 Import JSON으로 배치하고 Export
 * JSON으로 읽는다. Ctrl+Shift+V와 drop은 chromium 전용이다.
 *
 * codeBlock에 걸친 범위에 여러 블록 HTML을 붙이는 배치(Issue #286)는 맨
 * 아래 두 테스트가 확인한다 — 기준 배치(A)와 자식 블록에서 시작하는
 * 범위(V)다. 서식 보존·숨은 codeBlock·시작이 codeBlock 안인 범위 등 나머지
 * 축은 core 단위 테스트(`clipboard-paste-code-block-range.test.ts`)가 소유한다.
 * 범위는 Range로 DOM selection을 만들고 selectionchange를 보내 동기화한다.
 *
 * text/html이 블록을 만들지 못할 때의 평문 폴백(Issue #287)은 맨 아래 두
 * 테스트가 확인한다 — 캐럿과 codeBlock에 걸친 범위(시작이 codeBlock 밖)다.
 * 빈 결과 html(`<meta>`)과 text/plain이 함께 오는 클립보드다. import 실패
 * 입력·비코드 범위·Markdown·여러 줄 평문·빈 문단 대조군·transaction 계약은
 * core 단위 테스트(`clipboard-paste-html-fallback.test.ts`)가 소유한다.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import { dispatchPaste } from "./support/clipboard.js";
import { openDemo } from "./support/demo.js";
import { exportedBlocks, importBlocks } from "./support/document-io.js";
import { trackPageErrors } from "./support/ids.js";
import { yieldFrame } from "./support/yield-frame.js";

test("own-export 중첩 wrapper HTML을 붙이면 실제 DOM에 blockGroup 중첩이 반영된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();

  const nestedHtml =
    '<div data-geul-block-id="src-parent"><p data-geul-block-id="src-parent-p">parent block</p>' +
    '<div data-geul-children="1"><div data-geul-block-id="src-child">' +
    '<p data-geul-block-id="src-child-p">child block</p></div></div></div>';

  await editable.evaluate(dispatchPaste, { html: nestedHtml });

  await expect(editable.locator("p", { hasText: "parent block" })).toHaveCount(
    1,
  );
  await expect(editable.locator("p", { hasText: "child block" })).toHaveCount(
    1,
  );
  // child block은 [data-geul-block-group] 안에서만 나타난다 — 형제가 아니라
  // 실제로 중첩됐다는 뜻이다(RD-002 own wrapper 계약, 완료 조건 5 보강).
  await expect(
    editable.locator("[data-geul-block-group] p", { hasText: "child block" }),
  ).toHaveCount(1);
  await expect(
    editable.locator("[data-geul-block-group] p", { hasText: "parent block" }),
  ).toHaveCount(0);
});

test("Markdown 문법 plain text만 붙이면 heading과 목록으로 반영된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();

  await editable.evaluate(dispatchPaste, {
    text: "# 제목\n\n- 항목 하나\n- 항목 둘",
  });

  await expect(editable.locator("h1", { hasText: "제목" })).toHaveCount(1);
  // 목록류 production 마커는 <li>가 아니라 <div data-geul-bullet-list-item>다
  // (RD-003 — production-editor-assembly.ts).
  await expect(editable.locator("[data-geul-bullet-list-item]")).toHaveCount(2);
  await expect(
    editable.locator("[data-geul-bullet-list-item]").nth(0),
  ).toContainText("항목 하나");
  await expect(
    editable.locator("[data-geul-bullet-list-item]").nth(1),
  ).toContainText("항목 둘");
});

test("서식 있는 표 HTML과 Markdown처럼 보이는 plain text가 동시에 있으면 TablePasteExtension이 처리하고 undo 1회로 복원된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();

  // "표 블록이 생겼다"만으로는 TablePasteExtension과 ClipboardPasteExtension
  // (io.importHtml의 일반 HTML 경로도 <table>을 table 블록으로 파싱할 수
  // 있다)을 구별하지 못한다 — 등록 순서를 실제로 뒤바꿔도(로컬 mutation)
  // 이 기준만으로는 RED가 재현되지 않았다. 대신 raw `style` 배경색은
  // TablePasteExtension(`parseClipboardTable`)만 읽는다 — io.importHtml의
  // 일반 표 경로는 `td`에 `style` 속성을 허용하지 않는다
  // (sanitize-schema.ts htmlAllowedAttributes.td, RD-006 DELTA-01 core
  // fixture와 같은 판별 원리를 실제 브라우저로 재확인).
  const coloredTableHtml =
    '<table><tbody><tr><td style="background-color:#FF0000;">a</td>' +
    "<td>b</td></tr></tbody></table>";

  await editable.evaluate(dispatchPaste, {
    html: coloredTableHtml,
    text: "# not a heading\n\n- not a list item",
  });

  const table = editable.locator("table");
  await expect(table).toHaveCount(1);
  await expect(table.locator("td").nth(0)).toHaveText("a");
  await expect(table.locator("td").nth(0)).toHaveCSS(
    "background-color",
    "rgb(255, 0, 0)",
  );
  await expect(table.locator("td").nth(1)).toHaveText("b");
  // Markdown 감지 경로로 새지 않았다 — heading·목록 마커가 생기지 않는다.
  await expect(editable.locator("h1")).toHaveCount(0);
  await expect(editable.locator("[data-geul-bullet-list-item]")).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect(editable.locator("table")).toHaveCount(0);
});

test("파일 단독 클립보드는 실제 uploadFile까지 완주해 media 블록을 만든다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const { editable } = await openDemo(page);
  await editable.click();

  await editable.evaluate(dispatchPaste, { fileNames: ["photo.png"] });

  // 데모(app.tsx)의 실제 uploadFile은 300ms 뒤 성공으로 resolve한다
  // (media-upload.spec.ts와 같은 mock) — toHaveAttribute의 기본 폴링이
  // 그 지연을 기다린다.
  await expect(editable.locator("img")).toHaveAttribute(
    "src",
    "https://example.com/uploads/photo.png",
  );
  expect(pageErrors).toEqual([]);
});

// "abcd" 문단의 "ab" 뒤에 캐럿을 두는 문서와 단계. 아래 세 테스트가 공유한다.
const abcdBlocks = [
  { id: "p1", type: "paragraph", content: [{ text: "abcd" }] },
  { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
];

// p1 문단을 눌러 포커스를 준 뒤 DOM selection을 "ab" 뒤로 옮기고
// selectionchange를 보내 편집기 selection을 동기화한다. 방향키로 옮기면
// 부하가 큰 실행(--workers=6)에서 selectionchange 반영이 붙여넣기보다 늦어
// 캐럿이 한 글자 앞에 선다(G-EDT-002).
const placeCaretAfterAb = async (page: Page, editable: Locator) => {
  const paragraph = editable.locator('[data-geul-block-id="p1"] p');
  await paragraph.click();
  await yieldFrame(page);
  await paragraph.evaluate((element) => {
    const text = element.firstChild;
    if (text === null) throw new Error("p1 문단 텍스트 노드가 없다");
    const range = document.createRange();
    range.setStart(text, 2);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
};

// 붙여넣기 뒤 기대 문서: 원본은 id를 지키고 자식을 얻지 않으며 둘째 줄이
// 다음 형제가 된다.
const expectedAfterPaste = [
  { id: "p1", type: "paragraph", content: [{ text: "abX" }] },
  { id: expect.any(String), type: "paragraph", content: [{ text: "Ycd" }] },
  { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
];

test("문단 중간에 여러 줄 평문을 붙이면 둘째 줄이 다음 형제 문단이 된다 @core", async ({
  page,
}) => {
  const editable = await importBlocks(page, abcdBlocks);
  await placeCaretAfterAb(page, editable);

  await editable.evaluate(dispatchPaste, { text: "X\nY" });

  expect(await exportedBlocks(page)).toEqual(expectedAfterPaste);
});

test("Ctrl+Shift+V로 여러 줄 평문을 붙여도 같은 배치이고 undo 1회로 복원된다", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "실제 시스템 클립보드 권한 부여는 chromium 전용이다",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const editable = await importBlocks(page, abcdBlocks);
  await placeCaretAfterAb(page, editable);
  await page.evaluate(() => navigator.clipboard.writeText("X\nY"));

  await page.keyboard.press("Control+Shift+V");

  expect(await exportedBlocks(page)).toEqual(expectedAfterPaste);

  // Export JSON 버튼에 포커스가 있어도 selection이 편집기 안이면 keydown
  // 폴백이 undo를 라우팅한다(G-EDT-004).
  await page.keyboard.press("Control+z");
  expect(await exportedBlocks(page)).toEqual(abcdBlocks);
});

test("여러 줄 평문을 문단 중간에 drop해도 둘째 줄이 다음 형제 문단이 된다", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "drop 재현은 chromium 전용이다(실제 OS 드래그 없이 DragEvent를 직접 보낸다)",
  );
  const editable = await importBlocks(page, abcdBlocks);
  const paragraph = editable.locator('[data-geul-block-id="p1"] p');
  await expect(paragraph).toHaveText("abcd");

  // "c" 글자 왼쪽 경계(= "ab" 뒤)의 화면 좌표를 잰다.
  const point = await paragraph.evaluate((element) => {
    const text = element.firstChild;
    if (text === null) throw new Error("문단 텍스트 노드가 없다");
    const range = document.createRange();
    range.setStart(text, 2);
    range.setEnd(text, 3);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + 1, y: rect.top + rect.height / 2 };
  });

  await editable.evaluate(
    (target, input) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("text/plain", input.text);
      target.dispatchEvent(
        new DragEvent("drop", {
          dataTransfer,
          clientX: input.x,
          clientY: input.y,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { text: "X\nY", x: point.x, y: point.y },
  );

  expect(await exportedBlocks(page)).toEqual(expectedAfterPaste);
});

// 블록 id의 첫 텍스트 노드 offset 위치로 DOM selection 범위를 만들고
// selectionchange를 보내 편집기 selection을 동기화한다(placeCaretAfterAb와
// 같은 이유, G-EDT-002). 시작 블록을 먼저 눌러 포커스를 준다.
const selectRange = async (
  page: Page,
  editable: Locator,
  from: { id: string; offset: number },
  to: { id: string; offset: number },
) => {
  await editable.locator(`[data-geul-block-id="${from.id}"] p`).first().click();
  await yieldFrame(page);
  await editable.evaluate(
    (root, input) => {
      const textOf = (id: string): Text => {
        const block = root.querySelector(`[data-geul-block-id="${id}"]`);
        const text = block?.ownerDocument
          .createTreeWalker(block, NodeFilter.SHOW_TEXT)
          .nextNode();
        if (!(text instanceof Text))
          throw new Error(`${id} 텍스트 노드가 없다`);
        return text;
      };
      const range = document.createRange();
      range.setStart(textOf(input.from.id), input.from.offset);
      range.setEnd(textOf(input.to.id), input.to.offset);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    },
    { from, to },
  );
};

const codeBlockModel = {
  id: "cb",
  type: "codeBlock",
  content: [{ text: "foobar" }],
};

test("codeBlock에 걸친 범위에 두 블록 HTML을 붙이면 둘째 블록이 형제가 되고 끝 잔여는 codeBlock이다 @core", async ({
  page,
}) => {
  const blocks = [
    { id: "p1", type: "paragraph", content: [{ text: "abcd" }] },
    codeBlockModel,
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ];
  const editable = await importBlocks(page, blocks);
  await selectRange(
    page,
    editable,
    { id: "p1", offset: 2 },
    { id: "cb", offset: 3 },
  );

  await editable.evaluate(dispatchPaste, { html: "<p>X</p><p>Y</p>" });

  expect(await exportedBlocks(page)).toEqual([
    { id: "p1", type: "paragraph", content: [{ text: "ab" }] },
    { id: expect.any(String), type: "paragraph", content: [{ text: "X" }] },
    { id: expect.any(String), type: "paragraph", content: [{ text: "Y" }] },
    { id: "cb", type: "codeBlock", content: [{ text: "bar" }] },
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ]);
});

test("자식 블록에서 시작해 최상위 codeBlock에서 끝나는 범위에 붙이면 새 블록이 그 자식과 같은 층위 형제다 @core", async ({
  page,
}) => {
  const blocks = [
    {
      id: "p1",
      type: "paragraph",
      content: [{ text: "abcd" }],
      children: [{ id: "c1", type: "paragraph", content: [{ text: "child" }] }],
    },
    codeBlockModel,
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ];
  const editable = await importBlocks(page, blocks);
  await selectRange(
    page,
    editable,
    { id: "c1", offset: 2 },
    { id: "cb", offset: 3 },
  );

  await editable.evaluate(dispatchPaste, { html: "<p>X</p><p>Y</p>" });

  expect(await exportedBlocks(page)).toEqual([
    {
      id: "p1",
      type: "paragraph",
      content: [{ text: "abcd" }],
      children: [
        { id: "c1", type: "paragraph", content: [{ text: "ch" }] },
        { id: expect.any(String), type: "paragraph", content: [{ text: "X" }] },
        { id: expect.any(String), type: "paragraph", content: [{ text: "Y" }] },
      ],
    },
    { id: "cb", type: "codeBlock", content: [{ text: "bar" }] },
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ]);
});

// 블록을 만들지 못하는 html. 폴백 시나리오 둘이 같은 클립보드를 쓴다.
const emptyResultClipboard = { html: "<meta charset='utf-8'>", text: "Q" };

test("블록을 만들지 못하는 html과 평문이 함께 있으면 캐럿에 평문이 붙는다 @core", async ({
  page,
}) => {
  const editable = await importBlocks(page, abcdBlocks);
  await placeCaretAfterAb(page, editable);

  await editable.evaluate(dispatchPaste, emptyResultClipboard);

  expect(await exportedBlocks(page)).toEqual([
    { id: "p1", type: "paragraph", content: [{ text: "abQcd" }] },
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ]);
});

test("블록을 만들지 못하는 html과 평문이 함께 있으면 codeBlock에 걸친 범위가 지워지고 평문이 붙는다 @core", async ({
  page,
}) => {
  const blocks = [
    { id: "p1", type: "paragraph", content: [{ text: "abcd" }] },
    codeBlockModel,
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ];
  const editable = await importBlocks(page, blocks);
  await selectRange(
    page,
    editable,
    { id: "p1", offset: 2 },
    { id: "cb", offset: 3 },
  );

  await editable.evaluate(dispatchPaste, emptyResultClipboard);

  expect(await exportedBlocks(page)).toEqual([
    { id: "p1", type: "paragraph", content: [{ text: "abQbar" }] },
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  ]);
});
