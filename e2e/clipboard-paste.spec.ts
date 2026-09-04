/**
 * 일반 clipboard 붙여넣기(Issue #38 슬라이스 10, RD-006 DELTA-02)의
 * 실제 브라우저 대표 시나리오 4개 — 구조 보존 HTML, Markdown 텍스트,
 * 표 우선 회귀, 파일 단독 무시. 우선순위·전체 블록 타입 교차는
 * `clipboard-paste-priority.test.ts`(core, RD-006 DELTA-01)가 jsdom
 * 수준에서 이미 fixture로 고정했다 — 이 파일은 그 계약이 실제 Chromium
 * DOM·ClipboardEvent에서도 성립하는지만 대표적으로 재확인한다(전체
 * 블록 타입을 반복하지 않는다). `@core`를 붙이지 않는다 — Firefox/
 * WebKit 3-엔진 게이트는 슬라이스 11 범위다.
 */
import { expect, test } from "@playwright/test";

import { dispatchPaste } from "./support/clipboard.js";
import { openDemo } from "./support/demo.js";
import { trackPageErrors } from "./support/ids.js";

test("own-export 중첩 wrapper HTML을 붙이면 실제 DOM에 blockGroup 중첩이 반영된다", async ({
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

test("Markdown 문법 plain text만 붙이면 heading과 목록으로 반영된다", async ({
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

test("파일 단독 클립보드는 실제 ClipboardEvent로도 무시되고 문서가 바뀌지 않는다", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page);
  const { editable } = await openDemo(page);
  await editable.click();

  const before = await editable.innerHTML();

  await editable.evaluate(dispatchPaste, { fileNames: ["photo.png"] });

  // ProseMirror는 파일 단독 붙여넣기에서 clipboardData만으로 읽을 수 없는
  // 콘텐츠를 판정하려고 화면 밖 임시 contenteditable(`position: fixed;
  // left: -10000px`)을 순간적으로 만들었다가 지운다 — Geul 코드가 만드는
  // DOM이 아니라 ProseMirror 내부 구현 세부다. `editable` locator(role
  // 기반)가 그 임시 노드까지 함께 집어 strict mode 위반을 낼 수 있어,
  // 정착된 실제 편집기 root(`.tiptap.ProseMirror`, 임시 노드는 이 클래스가
  // 없다)만 골라 폴링한다.
  await expect
    .poll(() => page.locator(".tiptap.ProseMirror").innerHTML())
    .toBe(before);
  expect(pageErrors).toEqual([]);
});
