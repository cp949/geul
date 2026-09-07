/**
 * 모바일 project(`isMobile`/`hasTouch`, R4 슬라이스6 RD-001) 배선 자체를
 * 검증한다. 실제 기능별 touch 시나리오(드래그 핸들, 가상 키보드 회피,
 * MediaResizeHandles)는 후속 DELTA가 이 파일 또는 각 기능 spec에 추가한다.
 */
import { expect, test } from "@playwright/test";

import { openDemo } from "./support/demo.js";

test("모바일 project에서 데모가 로드되고 탭으로 편집기에 초점을 준다 @mobile", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.tap();
  await page.keyboard.type("Hello mobile");

  await expect(editable).toContainText("Hello mobile");
});
