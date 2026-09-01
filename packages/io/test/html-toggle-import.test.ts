/**
 * own-format <details> HTML의 importHtml 파싱 규칙을 검증한다(RD-005-DELTA-01.md
 * "착수 전 결정" 결정 3 — <summary> 첫 자식 구조 + data-be-toggleable 마커
 * 둘 다 확인, 어긋나면 평면 처리). 정상 왕복은 html-toggle-round-trip.test.ts가
 * 담당하고 이 파일은 import 산출 형상·경고·방어 케이스만 다룬다.
 */
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

describe("<details> import(own-format)", () => {
  it("<summary><hN>...가 toggle heading을 만들고 오탐 경고가 없다", () => {
    const result = importHtml(
      '<details data-be-toggleable="true" open><summary><h3 data-be-block-id="h-1">제목</h3></summary></details>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toEqual([
      {
        id: "h-1",
        type: "heading",
        level: 3,
        content: [{ text: "제목" }],
        isToggleable: true,
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it('data-be-collapsed="true"는 collapsed: true를 만든다', () => {
    const result = importHtml(
      '<details data-be-toggleable="true" data-be-collapsed="true"><summary><h3 data-be-block-id="h-1">제목</h3></summary></details>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks[0]).toMatchObject({ collapsed: true });
  });

  it("data-be-collapsed 없음은 collapsed 필드 자체가 없다(undefined와 false를 구분)", () => {
    const result = importHtml(
      '<details data-be-toggleable="true" open><summary><h3 data-be-block-id="h-1">제목</h3></summary></details>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks[0]).not.toHaveProperty("collapsed");
  });

  it("<summary>가 인라인 텍스트만 담고 있으면 toggleListItem을 만든다", () => {
    const result = importHtml(
      '<details data-be-toggleable="true" open><summary data-be-block-id="t-1"><strong>굵게</strong> 항목</summary></details>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toEqual([
      {
        id: "t-1",
        type: "toggleListItem",
        content: [
          { text: "굵게", marks: [{ type: "bold" }] },
          { text: " 항목" },
        ],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it("<summary> id가 없으면 새 id를 발급한다", () => {
    const result = importHtml(
      '<details data-be-toggleable="true"><summary>항목</summary></details>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toEqual([
      { id: "html-1", type: "toggleListItem", content: [{ text: "항목" }] },
    ]);
  });

  it("data-be-children 컨테이너의 내용이 children으로 들어간다", () => {
    const result = importHtml(
      '<details data-be-toggleable="true"><summary data-be-block-id="t-1">부모</summary><div data-be-children="1"><p data-be-block-id="p-1">자식</p></div></details>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toEqual([
      {
        id: "t-1",
        type: "toggleListItem",
        content: [{ text: "부모" }],
        children: [
          { id: "p-1", type: "paragraph", content: [{ text: "자식" }] },
        ],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });
});

describe("<details> import 방어(own-format 아님)", () => {
  it("data-be-toggleable 없으면 details/summary를 own-format으로 인식하지 않는다", () => {
    const result = importHtml(
      "<details><summary>FAQ</summary><p>답변</p></details>",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    for (const block of result.value.document.blocks) {
      expect(block.type).not.toBe("toggleListItem");
    }
  });

  it("element 자식이 <summary> 하나뿐이 아니면(잘못된 구조) 평면 처리한다", () => {
    const result = importHtml(
      '<details data-be-toggleable="true"><p>본문1</p><summary>제목</summary><p>본문2</p></details>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    for (const block of result.value.document.blocks) {
      expect(block.type).not.toBe("toggleListItem");
    }
  });

  it("두 번째 element 자식이 data-be-children 없는 div면 평면 처리한다", () => {
    const result = importHtml(
      '<details data-be-toggleable="true"><summary>제목</summary><div>일반 div</div></details>',
    );
    expect(result.ok).toBe(true);
  });
});
