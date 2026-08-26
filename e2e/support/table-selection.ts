/**
 * 표 셀 범위를 드래그로 선택하는 e2e 공용 헬퍼.
 * `table-cell-selection.spec.ts`·`table-format.spec.ts`가 갖고 있던 바이트
 * 단위 동일 사본을 여기로 모은다.
 */
import type { Locator, Page } from "@playwright/test";

export const dragSelectCells = async (
  page: Page,
  fromCell: Locator,
  toCell: Locator,
) => {
  const fromBox = await fromCell.boundingBox();
  const toBox = await toCell.boundingBox();
  if (fromBox === null || toBox === null) {
    throw new Error("Bounding boxes were not available");
  }
  await page.mouse.move(
    fromBox.x + fromBox.width / 2,
    fromBox.y + fromBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
};
