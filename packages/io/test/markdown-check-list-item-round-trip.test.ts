/**
 * 체크 목록의 checked 상태가 GFM export→import round-trip에서 보존되는지
 * 검증한다(RD-002 완료 조건 2번). GFM은 own-format ID를 보존하지 않으므로
 * 다른 GFM 목록 round-trip 테스트와 동일하게 ID를 제외한 의미로 비교한다.
 */
import type { Block, Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown, importMarkdown } from "../src/index.js";

type BlockMeaning = Record<string, unknown>;

/**
 * GFM이 보존하지 않는 안정 ID만 제거해 재귀 구조와 순서를 비교한다.
 */
const blockMeaning = (block: Block): BlockMeaning => {
  const withoutId = Object.fromEntries(
    Object.entries(block).filter(([key]) => key !== "id" && key !== "children"),
  );
  if (!("children" in block) || block.children === undefined) {
    return withoutId;
  }
  return {
    ...withoutId,
    children: block.children.map(blockMeaning),
  };
};

/**
 * strict export와 재-import가 성공했다고 단언하고 ID를 제외한 블록 의미가
 * 원본과 같은지 비교한다.
 */
const expectMeaningRoundTrip = (document: Document): void => {
  const exported = exportMarkdown(document, { mode: "strict" });
  expect(exported.ok).toBe(true);
  if (!exported.ok) throw new Error(exported.error.code);

  const imported = importMarkdown(exported.value);
  expect(imported.ok).toBe(true);
  if (!imported.ok) throw new Error(imported.error.message);
  expect(imported.value.warnings).toEqual([]);
  expect(imported.value.document.blocks.map(blockMeaning)).toEqual(
    document.blocks.map(blockMeaning),
  );
};

describe("체크 목록 GFM round-trip", () => {
  it("checked true/false 항목과 children을 무손실 왕복한다", () => {
    expectMeaningRoundTrip({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "c-1",
          type: "checkListItem",
          checked: true,
          content: [{ text: "부모" }],
          children: [
            { id: "c-2", type: "bulletListItem", content: [{ text: "자식" }] },
          ],
        },
        {
          id: "c-3",
          type: "checkListItem",
          checked: false,
          content: [{ text: "다음" }],
        },
      ],
    });
  });

  it("bulletListItem과 checkListItem이 인접해도 각자 타입·checked를 그대로 왕복한다", () => {
    expectMeaningRoundTrip({
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "b-1", type: "bulletListItem", content: [{ text: "글머리" }] },
        {
          id: "c-1",
          type: "checkListItem",
          checked: false,
          content: [{ text: "체크" }],
        },
      ],
    });
  });
});
