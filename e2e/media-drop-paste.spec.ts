/**
 * File drop의 F2 좌표 판정(RD-002 DELTA-01, Issue #152 슬라이스4)이 실제
 * 브라우저 레이아웃(`getBoundingClientRect`/`view.posAtCoords`)에서도
 * 성립하는지 검증한다. core 유닛(`media-drop-paste-extension.test.ts`)은
 * 이 두 값을 테스트 안에서 monkeypatch로 주입했다 — jsdom은 실제
 * 레이아웃이 없다(ADR-0007 "실제 레이아웃"). 두 시나리오 모두 데모의
 * 실제 `uploadFile`(mock 아님, app.tsx)까지 완주해 최종 url 반영도 함께
 * 확인한다 — drop이 실제 uploadFile까지 닿는 데모 앱 배선은 jsdom
 * 계층에 데모 앱 자체가 없어 e2e만 증명할 수 있다(ADR-0007 "데모 앱
 * 배선"). 다중 파일 순서·독립 성공/실패·no-op 회귀는 core가 이미
 * 소유해 여기서 반복하지 않는다(`_works/roadmap/result/RD-002-DELTA-03.md`
 * "배경" 참고).
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import { openDemo } from "./support/demo.js";

/**
 * 대상 엘리먼트에 실제 좌표(clientX/clientY)를 가진 DragEvent("drop")를
 * 직접 디스패치한다. `support/clipboard.ts::dispatchPaste`와 같은 이유로
 * 실제 OS 드래그 없이 파일 payload를 재현한다 — 이 스펙이 첫 소비 파일이라
 * 로컬에 둔다(G-TST-002, 3번째 소비 파일에서 공용 승격). Chromium
 * 전용이라(RD-002.md "제외 범위") Firefox의 ClipboardEvent 생성자 문제
 * (`dispatchPaste` 주석)와 달리 `DragEvent` 생성자에 `dataTransfer`를
 * 직접 넘긴다 — 알려진 엔진별 우회 필요성이 없다.
 *
 * Playwright `locator.evaluate(dispatchDrop, input)`으로 브라우저 컨텍스트
 * 안에서 실행된다 — 함수 본문이 그대로 직렬화되므로 클로저로 외부 값을
 * 참조하지 않는다.
 */
const dispatchDrop = (
  target: Element,
  input: { fileNames: string[]; clientX: number; clientY: number },
): void => {
  const dataTransfer = new DataTransfer();
  for (const name of input.fileNames) {
    dataTransfer.items.add(new File(["x"], name, { type: "text/plain" }));
  }
  const event = new DragEvent("drop", {
    dataTransfer,
    clientX: input.clientX,
    clientY: input.clientY,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
};

/**
 * 두 문단 블록("one"·"two")을 만들고 "two" 블록의 blockContainer
 * (`[data-be-block-id]`) 실측 rect를 반환한다. F2 판정(production
 * `resolveDropTarget`)이 좌표와 비교하는 대상이 이 blockContainer 자신의
 * rect이지 안쪽 `<p>`가 아니라서, 두 drop 시나리오가 이 helper를 공유한다.
 */
const setupTwoParagraphsAndTargetBox = async (
  page: Page,
  editable: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> => {
  await editable.click();
  await page.keyboard.type("one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("two");

  const targetBlock = editable
    .locator("[data-be-block-id]")
    .filter({ hasText: "two" });
  await expect(targetBlock).toBeVisible();
  const box = await targetBlock.boundingBox();
  if (box === null) throw new Error("대상 블록의 bounding box를 얻지 못했다");
  return box;
};

test("drop 좌표가 대상 블록 rect 실측 위쪽 절반이면 그 블록 앞에 삽입되고 실제 업로드까지 완주한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const box = await setupTwoParagraphsAndTargetBox(page, editable);

  await editable.evaluate(dispatchDrop, {
    fileNames: ["photo.png"],
    clientX: box.x + box.width / 2,
    clientY: box.y + 2,
  });

  const blocks = editable.locator("[data-be-block-id]");
  await expect(blocks).toHaveCount(3);
  // 순서: one → media(앞에 삽입) → two.
  await expect(blocks.nth(0)).toContainText("one");
  await expect(blocks.nth(1).locator("img")).toHaveAttribute(
    "src",
    "https://example.com/uploads/photo.png",
  );
  await expect(blocks.nth(2)).toContainText("two");
});

test("drop 좌표가 대상 블록 rect 실측 아래쪽 절반이면 그 블록 뒤에 삽입되고 실제 업로드까지 완주한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const box = await setupTwoParagraphsAndTargetBox(page, editable);

  await editable.evaluate(dispatchDrop, {
    fileNames: ["photo.png"],
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height - 2,
  });

  // media 블록이 마지막이 되면 TrailingBlockExtension이 빈 paragraph를
  // 하나 더 붙인다(atom 뒤에는 항상 캐럿을 둘 자리가 필요하다) — "위쪽"
  // 시나리오는 media 뒤에 "two"가 남아 이 append가 필요 없다.
  const blocks = editable.locator("[data-be-block-id]");
  await expect(blocks).toHaveCount(4);
  // 순서: one → two → media(뒤에 삽입) → 빈 trailing paragraph.
  await expect(blocks.nth(0)).toContainText("one");
  await expect(blocks.nth(1)).toContainText("two");
  await expect(blocks.nth(2).locator("img")).toHaveAttribute(
    "src",
    "https://example.com/uploads/photo.png",
  );
});
