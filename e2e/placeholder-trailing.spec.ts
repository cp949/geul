/**
 * Issue #38 슬라이스 2 — 빈 블록 placeholder(UI-009)와 문서 끝 trailing
 * paragraph 불변식(UI-010)의 브라우저 시나리오. placeholder는
 * data-placeholder 데코레이션(core)과 ::before 표시 규칙(react CSS)의
 * 조립을, trailing은 로드 시점 자동 추가와 저장 JSON 반영을 확인한다.
 */
import { expect, test } from "@playwright/test";

import { openDemo } from "./support/demo.js";

test("빈 paragraph는 캐럿이 있을 때만 placeholder를 보인다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const emptyParagraph = editable.locator("p[data-placeholder]");

  // 데모 초기 문서는 빈 문단 하나다 — 클릭으로 캐럿이 들어가면 placeholder가
  // 붙는다.
  await editable.click();
  await expect(emptyParagraph).toHaveCount(1);
  await expect(emptyParagraph).toHaveAttribute(
    "data-placeholder",
    "Enter text or type '/' for commands",
  );

  // react 표시 규칙([data-placeholder]::before)이 실제로 적용된다 — 규칙이
  // 빠지면 content가 "none"으로 계산된다.
  const beforeContent = await emptyParagraph.evaluate(
    (element) => getComputedStyle(element, "::before").content,
  );
  expect(beforeContent).not.toBe("none");

  // 입력이 생기면 placeholder가 사라진다.
  await page.keyboard.type("x");
  await expect(editable.locator("[data-placeholder]")).toHaveCount(0);
});

test("heading으로 끝나는 문서를 로드하면 trailing paragraph가 생기고 빈 heading은 placeholder를 상시 보인다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const source = page.getByLabel("Document source");

  await source.fill(
    JSON.stringify({
      formatVersion: 1,
      revision: 0,
      blocks: [{ id: "head-1", type: "heading", level: 2, content: [] }],
    }),
  );
  await page.getByRole("button", { name: "Load JSON" }).click();

  // trailing paragraph(UI-010): heading으로 끝나는 문서 로드 시 빈 문단이
  // 자동으로 뒤따른다.
  await expect(editable.locator("h2")).toHaveCount(1);
  await expect(editable.locator("p")).toHaveCount(1);

  // 빈 heading placeholder는 캐럿 위치와 무관하게 상시 보인다.
  await expect(editable.locator("h2")).toHaveAttribute(
    "data-placeholder",
    "Heading 2",
  );

  // trailing paragraph는 저장 JSON에도 포함된다(로드 정규화 수용, R-5).
  await page.getByRole("button", { name: "Save JSON" }).click();
  const saved = JSON.parse(await source.inputValue());
  expect(saved.blocks).toHaveLength(2);
  expect(saved.blocks[1]).toMatchObject({ type: "paragraph", content: [] });
});
