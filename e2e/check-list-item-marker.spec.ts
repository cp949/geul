/**
 * 체크박스 클릭 UI(decoration widget, RD-001 DELTA-05)를 production demo
 * 실 브라우저에서 검증한다. jsdom은 레이아웃을 계산하지 않아 실제 클릭이
 * marker DOM을 정확히 hit-test하는지는 core 단위 테스트로 검증할 수
 * 없다(`result/RD-001-DELTA-05.md` "적용 함정"). Slash 메뉴·Turn into
 * UI는 이 DELTA 범위 밖이라 문서는 JSON load로 구성한다.
 */
import { expect, test, type Page } from "@playwright/test";

import { openDemo } from "./support/demo.js";

/** JSON source를 통해 production demo 문서를 교체한다. */
const loadDocument = async (page: Page, document: unknown): Promise<void> => {
  await page.getByLabel("Document source").fill(JSON.stringify(document));
  await page.getByRole("button", { name: "Load JSON" }).click();
};

test("체크박스를 클릭하면 checked 표시가 반전되고 저장 JSON에 반영된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await loadDocument(page, {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "task-1",
        type: "checkListItem",
        checked: false,
        content: [{ text: "할 일" }],
      },
    ],
  });

  const marker = editable.locator(
    '[data-be-block-id="task-1"] [data-be-check-marker]',
  );
  await expect(marker).toHaveAttribute("data-be-checked", "false");
  await expect(marker).toHaveAttribute("aria-checked", "false");
  await expect(marker).toHaveAttribute("role", "checkbox");

  await marker.click();

  await expect(marker).toHaveAttribute("data-be-checked", "true");
  await expect(marker).toHaveAttribute("aria-checked", "true");

  const source = page.getByLabel("Document source");
  await page.getByRole("button", { name: "Save JSON" }).click();
  await expect(source).toContainText(/"checked":\s*true/);
});
