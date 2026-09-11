/**
 * uploadFile 콜백 없이(File panel 예제, `/examples/file-panel`) 이미지를
 * drag&drop하면 로컬 프리뷰(ADR 0015)가 즉시 보이는데, File Panel이
 * url===null만 보고 "빈 블록"으로 오판해 그 이미지 위에 곧바로 열려
 * 겹쳐 보이던 회귀를 고정한다(사용자 보고, 2026-09-11 — "드래그&드롭하면
 * UI가 깨져"). `packages/react/test/file-panel.test.tsx`의 fakeController
 * 단위 테스트가 이미 이 분기(getPendingLocalPreviews 조회)를 고정하지만,
 * 실제 drop 좌표 판정·로컬 프리뷰 attrs 생성·File Panel selectionchange
 * 관측까지 이어지는 전체 배선은 실제 브라우저에서만 증명된다(ADR-0007).
 *
 * `media-drop-paste.spec.ts`의 dispatchDrop과 동일 기법이지만 그 파일은
 * "실제 uploadFile까지 완주"가 전제라 uploadFile이 등록된 데모만 쓴다
 * (RD-002.md 범위) — 이 spec은 정반대로 uploadFile이 **없는** 예제가
 * 필요해 별도 파일로 둔다. dispatchDrop 자체는 그 파일이 "3번째 소비
 * 파일에서 공용 승격" 하기로 정해둔 로컬 헬퍼라(G-TST-002 주석) 이 2번째
 * 소비 파일은 승격하지 않고 그대로 복제한다. 파일 내용은 로컬 프리뷰
 * attrs 생성 자체를 확인할 뿐 실제 디코딩 여부는 이 spec의 관심사가
 * 아니라(kitchen sink data url spec과 다른 관심사) demo.ts::chooseFile과
 * 같은 이유로 고정 텍스트 payload를 그대로 쓴다.
 */
import { expect, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

const dispatchDrop = (
  target: Element,
  input: { fileName: string; clientX: number; clientY: number },
): void => {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(
    new File(["x"], input.fileName, { type: "image/png" }),
  );
  const event = new DragEvent("drop", {
    dataTransfer,
    clientX: input.clientX,
    clientY: input.clientY,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
};

test("uploadFile 콜백 없이 이미지를 drop하면 로컬 프리뷰만 보이고 File Panel은 겹쳐 열리지 않는다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/file-panel");
  const editable = page
    .getByRole("textbox", { name: "Editor" })
    .locator('[contenteditable="true"]');
  await editable.click();
  await page.keyboard.type("sample");

  const targetBlock = editable
    .locator("[data-geul-block-id]")
    .filter({ hasText: "sample" });
  const box = await targetBlock.boundingBox();
  if (box === null) throw new Error("대상 블록의 bounding box를 얻지 못했다");

  await editable.evaluate(dispatchDrop, {
    fileName: "photo.png",
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height - 2,
  });

  await expect(editable.locator("img")).toHaveAttribute("src", /^blob:/);
  await expect(page.getByRole("toolbar", { name: "File panel" })).toHaveCount(
    0,
  );
});
