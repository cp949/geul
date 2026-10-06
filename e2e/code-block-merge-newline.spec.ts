/**
 * 여러 줄 codeBlock을 뒤 문단 선두 Backspace로 흡수하면 개행이 문단의
 * hardBreak로 남는지 실제 브라우저에서 확인한다(Issue #281). 이전에는 문단에
 * 리터럴 `\n` text가 남아 화면은 한 줄이었고, 다음 입력에서 개행이 공백으로
 * 바뀌어 export에서도 사라졌다.
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - 리터럴 `\n`이 한 줄로 그려지는지, 다음 native 입력이 그 개행을 공백으로
 *   바꾸는지는 jsdom이 재현하지 못한다. 실제 레이아웃과 키 입력으로만
 *   확인된다.
 * 병합 문서 구조·캐럿·undo와 정규화 경로별 계약은 단위 테스트
 * (block-join/code-block.test.ts, hard-break-newline-normalize.test.ts)가
 * 소유한다.
 *
 * 문서는 showcase document-io 예제의 Import JSON으로 배치한다.
 */
import { expect, test } from "@playwright/test";

import { exportedBlocks, importBlocks } from "./support/document-io.js";
import { yieldFrame } from "./support/yield-frame.js";

test("여러 줄 codeBlock 뒤 문단 선두 Backspace 후 입력하면 개행이 두 줄로 보이고 export도 개행을 유지한다 @core", async ({
  page,
}) => {
  const editable = await importBlocks(page, [
    { id: "code-1", type: "codeBlock", content: [{ text: "foo\nbar" }] },
    { id: "p1", type: "paragraph", content: [{ text: "PQ" }] },
  ]);
  const paragraph = editable.locator('[data-geul-block-id="p1"] p');
  await expect(paragraph).toHaveText("PQ");

  await paragraph.click();
  await page.keyboard.press("Home");
  await yieldFrame(page);
  await page.keyboard.press("Backspace");
  await yieldFrame(page);
  await page.keyboard.type("Z");
  await yieldFrame(page);

  // codeBlock은 사라지고 문단 안 개행은 hardBreak(br) 하나다.
  await expect(editable.locator("pre[data-geul-code-block]")).toHaveCount(0);
  await expect(
    paragraph.locator("br:not(.ProseMirror-trailingBreak)"),
  ).toHaveCount(1);

  // 첫 줄 "foo"와 둘째 줄 "barZPQ"가 다른 줄에 그려진다.
  const lineTops = await paragraph.evaluate((element) => {
    const texts = [...element.childNodes].filter(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    return texts.map((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return {
        text: node.textContent,
        top: range.getBoundingClientRect().top,
      };
    });
  });
  expect(lineTops.map((line) => line.text)).toEqual(["foo", "barZPQ"]);
  expect(lineTops[1]!.top).toBeGreaterThan(lineTops[0]!.top);

  // export는 개행을 공백으로 바꾸지 않는다.
  expect(await exportedBlocks(page)).toEqual([
    { id: "p1", type: "paragraph", content: [{ text: "foo\nbarZPQ" }] },
  ]);
});
