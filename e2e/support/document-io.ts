/**
 * showcase document-io 예제의 Import JSON·Export JSON으로 문서를 배치하고
 * 읽는 e2e 공용 helper다. 임의 블록 문서를 편집기에 바로 로드하는 기존
 * 관례를 두 번째 소비 파일(clipboard-paste.spec.ts, Issue #284)이 생겨 여기로
 * 승격했다(G-TST-002).
 */
import { expect, type Page } from "@playwright/test";

import { openShowcasePage } from "./showcase.js";

/**
 * document-io 예제를 열고 blocks를 Import JSON으로 불러온다. 불러온 뒤의
 * 편집 영역 locator를 돌려준다.
 */
export const importBlocks = async (page: Page, blocks: unknown[]) => {
  await openShowcasePage(page, "/examples/document-io");
  await page
    .getByRole("textbox", { name: "Document JSON" })
    .fill(JSON.stringify({ formatVersion: 1, revision: 0, blocks }));
  await page.getByRole("button", { name: "Import JSON" }).click();
  await expect(page.getByRole("status")).toHaveText("Imported.");
  return page.locator(".ProseMirror");
};

/** Export JSON 결과의 blocks를 읽는다. */
export const exportedBlocks = async (page: Page): Promise<unknown[]> => {
  await page.getByRole("button", { name: "Export JSON" }).click();
  const json = await page
    .getByRole("textbox", { name: "Document JSON" })
    .inputValue();
  return (JSON.parse(json) as { blocks: unknown[] }).blocks;
};
