/**
 * 토글 제목·토글 목록의 exportHtml 산출 형상을 고정한다(로드맵 D4,
 * RD-005-DELTA-01.md "착수 전 결정"). `<details data-be-toggleable="true"
 * open? data-be-collapsed?>` + `<summary>` + 선택적 `<div data-be-children>`.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml } from "../src/index.js";

const exportOk = (document: Document): string => {
  const result = exportHtml(document);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

describe("토글 제목 exportHtml 형상", () => {
  it("collapsed 미설정은 open만 붙는다", () => {
    const html = exportOk({
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
    });
    expect(html).toBe(
      '<details data-be-block-id="h-1" data-be-toggleable="true" open><summary><h2 data-be-block-id="h-1">제목</h2></summary></details>',
    );
  });

  it('collapsed: true는 open이 빠지고 data-be-collapsed="true"가 붙는다', () => {
    const html = exportOk({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "h-1",
          type: "heading",
          level: 2,
          content: [{ text: "제목" }],
          isToggleable: true,
          collapsed: true,
        },
      ],
    });
    expect(html).toBe(
      '<details data-be-block-id="h-1" data-be-toggleable="true" data-be-collapsed="true"><summary><h2 data-be-block-id="h-1">제목</h2></summary></details>',
    );
  });

  it('collapsed: false(명시)는 open과 data-be-collapsed="false"가 함께 붙는다', () => {
    const html = exportOk({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "h-1",
          type: "heading",
          level: 2,
          content: [{ text: "제목" }],
          isToggleable: true,
          collapsed: false,
        },
      ],
    });
    expect(html).toBe(
      '<details data-be-block-id="h-1" data-be-toggleable="true" data-be-collapsed="false" open><summary><h2 data-be-block-id="h-1">제목</h2></summary></details>',
    );
  });

  it("children이 있으면 <summary> 다음에 data-be-children 컨테이너가 온다", () => {
    const html = exportOk({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "h-1",
          type: "heading",
          level: 2,
          content: [{ text: "부모" }],
          isToggleable: true,
          children: [
            { id: "p-1", type: "paragraph", content: [{ text: "자식" }] },
          ],
        },
      ],
    });
    expect(html).toBe(
      '<details data-be-block-id="h-1" data-be-toggleable="true" open><summary><h2 data-be-block-id="h-1">부모</h2></summary><div data-be-children="1"><p data-be-block-id="p-1">자식</p></div></details>',
    );
  });
});

describe("토글 목록 exportHtml 형상", () => {
  it("<li>가 아니라 독립 <details>로 나온다", () => {
    const html = exportOk({
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "t-1", type: "toggleListItem", content: [{ text: "항목" }] },
      ],
    });
    expect(html).toBe(
      '<details data-be-block-id="t-1" data-be-toggleable="true" open><summary data-be-block-id="t-1">항목</summary></details>',
    );
  });

  it("children이 있으면 <summary> 다음에 data-be-children 컨테이너가 온다", () => {
    const html = exportOk({
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
          ],
        },
      ],
    });
    expect(html).toBe(
      '<details data-be-block-id="t-1" data-be-toggleable="true" data-be-collapsed="true"><summary data-be-block-id="t-1">부모</summary><div data-be-children="1"><p data-be-block-id="p-1">자식</p></div></details>',
    );
  });
});
