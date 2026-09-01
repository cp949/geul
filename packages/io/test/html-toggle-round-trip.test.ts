/**
 * 토글 제목(HeadingBlock.isToggleable/collapsed)과 토글 목록
 * (ToggleListItemBlock)이 own HTML export→import round-trip에서
 * isToggleable·collapsed·콘텐츠·children을 보존하는지 검증한다(RD-005
 * 완료 조건 1번). collapsed는 undefined/true/false 3상태를 모두 구분해
 * 보존해야 한다(RD-005-DELTA-01.md "착수 전 결정" 참고).
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

const roundTrip = (document: Document) => {
  const exported = exportHtml(document);
  expect(exported.ok).toBe(true);
  if (!exported.ok) throw new Error(exported.error.message);
  const imported = importHtml(exported.value);
  expect(imported.ok).toBe(true);
  if (!imported.ok) throw new Error(imported.error.message);
  return {
    html: exported.value,
    document: imported.value.document,
    warnings: imported.value.warnings,
  };
};

describe("토글 제목 HTML round-trip", () => {
  it("collapsed 미설정 heading을 무손실 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "h-1",
          type: "heading",
          level: 2,
          content: [{ text: "제목" }],
          isToggleable: true,
        },
      ],
    };
    const result = roundTrip(document);
    expect(result.document.blocks).toEqual(document.blocks);
    expect(result.warnings).toEqual([]);
  });

  it("collapsed: true heading을 무손실 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "h-1",
          type: "heading",
          level: 3,
          content: [{ text: "제목" }],
          isToggleable: true,
          collapsed: true,
        },
      ],
    };
    const result = roundTrip(document);
    expect(result.document.blocks).toEqual(document.blocks);
    expect(result.warnings).toEqual([]);
  });

  it("collapsed: false(명시) heading을 collapsed 미설정과 구분해 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "h-1",
          type: "heading",
          level: 3,
          content: [{ text: "제목" }],
          isToggleable: true,
          collapsed: false,
        },
      ],
    };
    const result = roundTrip(document);
    expect(result.document.blocks).toEqual(document.blocks);
    expect(result.document.blocks[0]).toHaveProperty("collapsed", false);
    expect(result.warnings).toEqual([]);
  });

  it("children이 있는 toggle heading이 children을 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "h-1",
          type: "heading",
          level: 2,
          content: [{ text: "부모" }],
          isToggleable: true,
          collapsed: true,
          children: [
            { id: "p-1", type: "paragraph", content: [{ text: "자식" }] },
          ],
        },
      ],
    };
    const result = roundTrip(document);
    expect(result.document.blocks).toEqual(document.blocks);
    expect(result.warnings).toEqual([]);
  });

  it("isToggleable이 아닌 heading은 기존과 동일하게 <details> 없이 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "h-1", type: "heading", level: 2, content: [{ text: "일반" }] },
      ],
    };
    const result = roundTrip(document);
    expect(result.html).toBe('<h2 data-be-block-id="h-1">일반</h2>');
    expect(result.document.blocks).toEqual(document.blocks);
    expect(result.warnings).toEqual([]);
  });
});

describe("토글 목록 HTML round-trip", () => {
  it("collapsed 미설정 toggleListItem을 무손실 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "t-1", type: "toggleListItem", content: [{ text: "항목" }] },
      ],
    };
    const result = roundTrip(document);
    expect(result.document.blocks).toEqual(document.blocks);
    expect(result.warnings).toEqual([]);
  });

  it("collapsed: true/false toggleListItem을 각각 구분해 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "t-1",
          type: "toggleListItem",
          content: [{ text: "접힘" }],
          collapsed: true,
        },
        {
          id: "t-2",
          type: "toggleListItem",
          content: [{ text: "펼침" }],
          collapsed: false,
        },
      ],
    };
    const result = roundTrip(document);
    expect(result.document.blocks).toEqual(document.blocks);
    expect(result.warnings).toEqual([]);
  });

  it("children이 있는 toggleListItem이 children을 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "t-1",
          type: "toggleListItem",
          content: [{ text: "부모" }],
          collapsed: true,
          children: [
            { id: "p-1", type: "paragraph", content: [{ text: "자식" }] },
            {
              id: "t-2",
              type: "toggleListItem",
              content: [{ text: "중첩 토글" }],
            },
          ],
        },
      ],
    };
    const result = roundTrip(document);
    expect(result.document.blocks).toEqual(document.blocks);
    expect(result.warnings).toEqual([]);
  });

  it("인접한 toggleListItem은 <ul>로 묶이지 않고 각각 독립 <details>로 나온다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "t-1", type: "toggleListItem", content: [{ text: "하나" }] },
        { id: "t-2", type: "toggleListItem", content: [{ text: "둘" }] },
      ],
    };
    const result = roundTrip(document);
    expect(result.html).not.toContain("<ul>");
    expect(result.document.blocks).toEqual(document.blocks);
    expect(result.warnings).toEqual([]);
  });
});

describe("own-format이 아닌 <details> 방어", () => {
  it("data-be-toggleable 없는 <details>는 own-format으로 인식하지 않고 평면 처리한다", () => {
    const result = importHtml(
      "<details><summary>FAQ</summary><p>답변</p></details>",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(
      result.value.document.blocks.some(
        (block) => block.type === "toggleListItem",
      ),
    ).toBe(false);
    expect(
      result.value.document.blocks.some((block) => block.type === "heading"),
    ).toBe(false);
  });

  it("summary가 첫 자식이 아닌 own-format 마커 <details>는 평면 처리한다(크래시 없음)", () => {
    const result = importHtml(
      '<details data-be-toggleable="true"><p>본문</p><summary>제목</summary></details>',
    );
    expect(result.ok).toBe(true);
  });
});
