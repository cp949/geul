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
 */
import { expect, test } from "@playwright/test";

import { dispatchPaste } from "./support/clipboard.js";
import { openDemo } from "./support/demo.js";
import { trackPageErrors } from "./support/ids.js";

test("own-export 중첩 wrapper HTML을 붙이면 실제 DOM에 blockGroup 중첩이 반영된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();

  const nestedHtml =
    '<div data-be-block-id="src-parent"><p data-be-block-id="src-parent-p">parent block</p>' +
    '<div data-be-children="1"><div data-be-block-id="src-child">' +
    '<p data-be-block-id="src-child-p">child block</p></div></div></div>';

  await editable.evaluate(dispatchPaste, { html: nestedHtml });

  await expect(editable.locator("p", { hasText: "parent block" })).toHaveCount(
    1,
  );
  await expect(editable.locator("p", { hasText: "child block" })).toHaveCount(
    1,
  );
  // child block은 [data-be-block-group] 안에서만 나타난다 — 형제가 아니라
  // 실제로 중첩됐다는 뜻이다(RD-002 own wrapper 계약, 완료 조건 5 보강).
  await expect(
    editable.locator("[data-be-block-group] p", { hasText: "child block" }),
  ).toHaveCount(1);
  await expect(
    editable.locator("[data-be-block-group] p", { hasText: "parent block" }),
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
  // 목록류 production 마커는 <li>가 아니라 <div data-be-bullet-list-item>다
  // (RD-003 — production-editor-assembly.ts).
  await expect(editable.locator("[data-be-bullet-list-item]")).toHaveCount(2);
  await expect(
    editable.locator("[data-be-bullet-list-item]").nth(0),
  ).toContainText("항목 하나");
  await expect(
    editable.locator("[data-be-bullet-list-item]").nth(1),
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
  await expect(editable.locator("[data-be-bullet-list-item]")).toHaveCount(0);

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
