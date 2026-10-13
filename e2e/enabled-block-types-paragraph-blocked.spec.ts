/**
 * `enabledBlockTypes`가 `paragraph`를 막은 편집기에서 빈 목록 항목의 Backspace와
 * Enter가 엔진과 무관하게 같은 결과를 내는지 실제 브라우저에서 확인한다(Issue #411).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - 키 소비 여부가 엔진 동작을 가른다. 종료 규칙이 키를 소비하지 않으면 키가
 *   Tiptap 기본 체인으로 새고, 체인이 받는 selection 해석이 엔진마다 달라 Chromium은
 *   변화 없음, Firefox는 항목을 앞 블록의 자식으로 들여쓰기했다. jsdom의 합성
 *   keydown은 Firefox 쪽 결과와 같아 이 엔진 차이를 재현하지 못한다.
 * 문서 구조·selection·undo 단위의 세부 계약은 단위 테스트
 * (block-join/list-item-paragraph-blocked.test.ts,
 * block-split-paragraph-blocked.test.ts)가 소유한다.
 *
 * showcase 예제 16의 두 번째 편집기를 쓴다. 문서는 heading 하나와 빈 bullet 둘이고
 * `paragraph`를 막았다. 편집기가 둘이라 locator를 두 번째 편집기로 좁힌다.
 * `@core` 태그로 Firefox와 WebKit에서도 돈다. WebKit은 이 환경에서 실행하지 못했다.
 */
import { expect, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";
import { yieldFrame } from "./support/yield-frame.js";

const HEADING_ID = "showcase-enabled-block-types-blocked-heading";
const BULLET_1_ID = "showcase-enabled-block-types-blocked-bullet-1";
const BULLET_2_ID = "showcase-enabled-block-types-blocked-bullet-2";

test("paragraph를 막은 편집기에서 heading 뒤 빈 bullet의 Backspace는 항목을 지우고 들여쓰지 않으며 빈 bullet의 Enter는 새 빈 bullet을 연다 @core", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/enabled-block-types");
  // 첫 편집기는 table만 막은 슬래시 메뉴 편집기다. 두 번째가 paragraph를 막았다.
  const editable = page.getByRole("textbox", { name: "Editor" }).nth(1);
  const blocks = editable.locator("[data-geul-block-id]");
  const markers = editable.locator("[data-geul-list-marker]");
  const heading = editable.locator(`[data-geul-block-id="${HEADING_ID}"]`);
  const contentOf = (blockId: string) =>
    editable.locator(`[data-geul-block-id="${blockId}"] > div`).first();

  await expect(blocks).toHaveCount(3);
  await expect(markers).toHaveCount(2);

  // Backspace: 첫 빈 bullet이 사라지고 heading의 자식으로 들여쓰이지 않는다.
  await contentOf(BULLET_1_ID).click();
  await page.keyboard.press("Backspace");
  await yieldFrame(page);

  await expect(
    editable.locator(`[data-geul-block-id="${BULLET_1_ID}"]`),
  ).toHaveCount(0);
  await expect(blocks).toHaveCount(2);
  await expect(markers).toHaveCount(1);
  await expect(heading.locator("[data-geul-block-id]")).toHaveCount(0);
  await expect(heading).toContainText("Heading");

  // Enter: 남은 빈 bullet이 문단으로 바뀌지 않고 같은 목록의 새 빈 bullet을 연다.
  await contentOf(BULLET_2_ID).click();
  await page.keyboard.press("Enter");
  await yieldFrame(page);

  await expect(blocks).toHaveCount(3);
  await expect(markers).toHaveCount(2);
  await expect(heading.locator("[data-geul-block-id]")).toHaveCount(0);
});
