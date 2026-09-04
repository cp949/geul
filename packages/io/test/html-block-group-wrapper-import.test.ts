/**
 * 생산 편집기 in-editor copy가 실제로 만드는 production wrapper HTML
 * (`blockContainer`→`div[data-be-block-id]`, `blockGroup`→
 * `div[data-be-block-group]`)을 `io.importHtml`이 spec §7.1 own wrapper
 * 계약의 alternate 표현으로 인식하는지 검증한다(Issue #38 슬라이스 10
 * RD-002). 비중첩 단일 블록의 wrapper 소실, paragraph/heading/quote를
 * 부모로 한 중첩 보존, divider·codeBlock을 자식으로 한 중첩 보존, 원본
 * `data-be-block-id` 값 보존, `data-be-block-group` 속성의 sanitize
 * 허용, 그리고 own 마커 없는 임의 외부 HTML을 오인식하지 않는지를
 * 함께 다룬다. 기존 own-export document HTML 회귀는 이 파일이 아니라
 * `html-round-trip.test.ts` 등 기존 파일이 재실행으로 계속 지킨다.
 */
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

describe("production data-be-block-group wrapper 편입", () => {
  it("중첩 없는 단일 paragraph는 wrapper가 사라지고 원본 id를 보존한다", () => {
    const result = importHtml('<div data-be-block-id="A"><p>text</p></div>');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      { id: "A", type: "paragraph", content: [{ text: "text" }] },
    ]);
  });

  it("paragraph 부모 + paragraph 자식은 형제가 아니라 children으로 중첩된다", () => {
    const result = importHtml(
      '<div data-be-block-id="P"><p>parent</p>' +
        '<div data-be-block-group=""><div data-be-block-id="C"><p>child</p></div></div></div>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      {
        id: "P",
        type: "paragraph",
        content: [{ text: "parent" }],
        children: [
          { id: "C", type: "paragraph", content: [{ text: "child" }] },
        ],
      },
    ]);
  });

  it("heading 부모 + paragraph 자식도 같은 방식으로 중첩된다", () => {
    const result = importHtml(
      '<div data-be-block-id="P"><h2>parent</h2>' +
        '<div data-be-block-group=""><div data-be-block-id="C"><p>child</p></div></div></div>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      {
        id: "P",
        type: "heading",
        level: 2,
        content: [{ text: "parent" }],
        children: [
          { id: "C", type: "paragraph", content: [{ text: "child" }] },
        ],
      },
    ]);
  });

  // production은 own-export와 달리 blockquote 안에 <p>를 두지 않고
  // 텍스트를 blockquote에 직접 낸다(quote-extension.ts content:"inline*").
  it("quote 부모 + paragraph 자식도 같은 방식으로 중첩된다", () => {
    const result = importHtml(
      '<div data-be-block-id="P"><blockquote>parent</blockquote>' +
        '<div data-be-block-group=""><div data-be-block-id="C"><p>child</p></div></div></div>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      {
        id: "P",
        type: "quote",
        content: [{ text: "parent" }],
        children: [
          { id: "C", type: "paragraph", content: [{ text: "child" }] },
        ],
      },
    ]);
  });

  // divider는 model에 children 필드가 없어 parent 자리에 올 수 없다 —
  // child 자리(다른 블록의 children 배열 원소)로만 검증한다.
  it("paragraph 부모 + divider 자식도 children으로 중첩되고 자체 id를 보존한다", () => {
    const result = importHtml(
      '<div data-be-block-id="P"><p>parent</p>' +
        '<div data-be-block-group=""><hr data-be-block-id="C"></div></div>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      {
        id: "P",
        type: "paragraph",
        content: [{ text: "parent" }],
        children: [{ id: "C", type: "divider" }],
      },
    ]);
  });

  it("paragraph 부모 + codeBlock 자식도 children으로 중첩되고 원본 id를 보존한다", () => {
    const result = importHtml(
      '<div data-be-block-id="P"><p>parent</p>' +
        '<div data-be-block-group=""><div data-be-block-id="C">' +
        '<pre data-be-code-block=""><code>code</code></pre></div></div></div>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      {
        id: "P",
        type: "paragraph",
        content: [{ text: "parent" }],
        children: [{ id: "C", type: "codeBlock", content: [{ text: "code" }] }],
      },
    ]);
  });

  it("own 마커가 전혀 없는 임의 외부 div는 새 1-child 분기를 타지 않는다", () => {
    // 안전장치 확인: 흔한 CMS 출력(<div><p>...</p></div>)이 바깥 div의
    // data-be-block-id 없이도 own-wrapper로 오인식되면 이 케이스의 결과가
    // production 케이스와 우연히 같아진다 — 게이트가 실제로 걸려 있는지는
    // id가 항상 새로 발급된다는 사실(고정된 원본 id를 반영하지 않음)로
    // 구분한다.
    const result = importHtml("<div><p>흔한 문단</p></div>");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      { id: "html-1", type: "paragraph", content: [{ text: "흔한 문단" }] },
    ]);
  });

  it("data-be-block-id가 빈 문자열인 wrapper는 1-child 분기를 타지 않는다", () => {
    const result = importHtml('<div data-be-block-id=""><p>text</p></div>');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      { id: "html-1", type: "paragraph", content: [{ text: "text" }] },
    ]);
  });

  // model CodeBlock은 children 필드가 없는 리프다(divider와 동형) —
  // blockContainer.content 표현도 leafBlockContent 뒤에 blockGroup을 허용하지
  // 않아 정상 생산 출력에는 나타날 수 없는 조합이지만, 조작된 외부 HTML은
  // 이 모양을 만들 수 있다. wrapper 인식을 취소해(1블록 pre로 평탄 처리)
  // children 데이터를 형제로 보존한다 — 스키마 위반 Document를 만들지
  // 않는다.
  it("codeBlock에 data-be-block-group 형제가 있으면 wrapper 인식을 취소하고 평탄 처리한다", () => {
    const result = importHtml(
      '<div data-be-block-id="P"><pre data-be-code-block=""><code>code</code></pre>' +
        '<div data-be-block-group=""><div data-be-block-id="C"><p>child</p></div></div></div>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const block of result.value.document.blocks) {
      expect(block).not.toHaveProperty("children");
    }
  });

  it("data-be-block-group 속성은 sanitize를 통과한다", () => {
    const result = importHtml(
      '<div data-be-block-id="P"><p>parent</p>' +
        '<div data-be-block-group=""><div data-be-block-id="C"><p>child</p></div></div></div>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings).not.toContainEqual(
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        attribute: "dataBeBlockGroup",
      }),
    );
  });
});
