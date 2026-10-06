/**
 * 블록 타입 변환 버튼이 core 거절 조건을 반영하는지 실제 브라우저에서
 * 확인한다(Issue #245). 비활성이어야 하는 자리에서 버튼이 활성으로 남아
 * 눌러도 문서가 그대로인 결함이다.
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - 실제 붙여넣기로 codeBlock에 들어간 탭 문자와 실제 키보드 selection이
 *   만드는 여러 codeBlock 선택에서 툴바 상태가 갱신되는지는 jsdom이 재현하지
 *   못한다.
 * 사유 매핑·메뉴 옵션 비활성·클릭 가드의 세부 계약은 단위 테스트
 * (static-toolbar-block-type-blockers.test.tsx)가 소유한다.
 *
 * 샘플 문서(`샘플 불러오기`)를 쓴다. block-10은 자식이 있는 토글, block-13은
 * 코드 블록이다.
 */
import { expect, test, type Page } from "@playwright/test";

import { dispatchPaste } from "./support/clipboard.js";
import { openShowcasePage } from "./support/showcase.js";
import { blockId, placeCaretIn } from "./support/static-toolbar-sample.js";
import { yieldFrame } from "./support/yield-frame.js";

const CHILDREN_REASON = "Can't convert a block with nested blocks to code";
const INVALID_TEXT_REASON =
  "Can't convert this code block — it contains a tab or control character";
const GENERIC_REASON = "Can't convert this block to that type";

/** 샘플을 불러오고 편집 영역과 자주 쓰는 컨트롤을 돌려준다. */
const openSample = async (page: Page) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  const editable = page.getByRole("textbox", { name: "Editor" });
  return {
    editable,
    trigger: page.getByRole("button", { name: "Block type" }),
    listbox: page.getByRole("listbox", { name: "Block type" }),
    quote: page.getByRole("button", { name: "Quote" }),
    code: page.getByRole("button", { name: "Code", exact: true }),
    bullet: page.getByRole("button", { name: "Bulleted List" }),
  };
};

test("자식이 있는 블록은 Code 버튼이 비활성이고 눌러도 문서가 그대로다", async ({
  page,
}) => {
  const { editable, trigger, listbox, code, quote } = await openSample(page);
  // 토글은 목록류라 Code가 막힌다. 먼저 Text로 바꿔 자식이 있는 문단을 만든다.
  await placeCaretIn(
    page,
    editable.getByText("펼쳐서 보는 토글 항목", { exact: true }),
  );
  await trigger.click();
  await listbox.getByRole("option", { name: "Text" }).click();
  await expect(blockId(editable, 10)).toContainText(
    "토글 안에 중첩된 문단이다.",
  );

  await expect(code).toHaveAttribute("aria-disabled", "true");
  await expect(code).toHaveAttribute("title", CHILDREN_REASON);
  await expect(quote).toHaveAttribute("aria-disabled", "false");

  const before = await editable.innerHTML();
  // aria-disabled 버튼은 Playwright가 클릭을 거부한다. 가드를 보려고 강제한다.
  await code.click({ force: true });
  await yieldFrame(page);
  expect(await editable.innerHTML()).toBe(before);
  await expect(editable.locator("pre[data-geul-code-block]")).toHaveCount(1);
});

test("탭이 든 codeBlock은 일반 블록 변환 버튼과 메뉴 옵션이 비활성이다", async ({
  page,
}) => {
  const { editable, trigger, listbox, quote } = await openSample(page);
  const codeLine = editable.locator("pre[data-geul-code-block] code").first();
  await placeCaretIn(page, codeLine);
  await expect(quote).toHaveAttribute("aria-disabled", "false");

  await editable.locator('[contenteditable="true"]').evaluate(dispatchPaste, {
    text: "if (x) {\n\treturn 1;\n}",
  });
  await yieldFrame(page);

  await expect(quote).toHaveAttribute("aria-disabled", "true");
  await expect(quote).toHaveAttribute("title", INVALID_TEXT_REASON);

  await trigger.click();
  const heading = listbox.getByRole("option", { name: "Heading 1" });
  await expect(heading).toHaveAttribute("aria-disabled", "true");
  await expect(heading).toHaveAttribute("title", INVALID_TEXT_REASON);
  await heading.click({ force: true });
  // 비활성 옵션은 누르면 메뉴를 닫지 않고 변환하지 않는다.
  await expect(listbox).toBeVisible();
  await expect(editable.locator("pre[data-geul-code-block]")).toHaveCount(1);
});

test("codeBlock만 여러 개 선택하면 변환 버튼이 비활성이고 섞이면 활성이다", async ({
  page,
}) => {
  const { editable, quote, bullet } = await openSample(page);
  // block-2(문단)와 block-3(제목)을 각각 Code로 바꿔 인접한 codeBlock 둘을 만든다.
  for (const number of [2, 3]) {
    await placeCaretIn(page, blockId(editable, number));
    await page.getByRole("button", { name: "Code", exact: true }).click();
    await expect(
      editable.locator("pre[data-geul-code-block]").nth(number - 2),
    ).toBeVisible();
  }

  await placeCaretIn(page, blockId(editable, 2));
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowDown");
  await yieldFrame(page);

  await expect(quote).toHaveAttribute("aria-disabled", "true");
  await expect(quote).toHaveAttribute("title", GENERIC_REASON);
  await expect(bullet).toHaveAttribute("aria-disabled", "true");

  // 문단이 섞이면 활성이다.
  await placeCaretIn(page, blockId(editable, 3));
  await page.keyboard.press("Shift+ArrowDown");
  await yieldFrame(page);
  await expect(quote).toHaveAttribute("aria-disabled", "false");
});

test("탭이 든 codeBlock의 블록 메뉴에는 Turn into 섹션이 없다", async ({
  page,
}) => {
  const { editable } = await openSample(page);
  const codeBlock = editable.locator("pre[data-geul-code-block]").first();
  await placeCaretIn(page, codeBlock.locator("code"));
  await editable.locator('[contenteditable="true"]').evaluate(dispatchPaste, {
    text: "if (x) {\n\treturn 1;\n}",
  });
  await yieldFrame(page);
  // 붙여넣기가 이 codeBlock에 닿았는지 먼저 확인한다.
  await expect
    .poll(() =>
      codeBlock
        .locator("code")
        .evaluate((el) => el.textContent?.includes("\t")),
    )
    .toBe(true);
  // 창 뷰포트 위쪽 밖에 블록 top이 1px만 나가도 gutter 앵커가 밖이라 숨는다(#277).
  // hover의 자동 스크롤은 그 경계에 멈출 수 있어 블록을 뷰포트 안으로 먼저 둔다.
  await codeBlock.evaluate((element) => {
    window.scrollBy(0, element.getBoundingClientRect().top - 100);
  });
  await codeBlock.hover();
  const handle = page.getByRole("button", {
    name: "Drag to reorder, click for options",
  });
  await expect(handle).toBeVisible();
  await handle.click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByText("Turn into")).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});
