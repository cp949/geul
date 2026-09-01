/**
 * HTML 체크 목록 import가 `data-be-checked` 속성으로 checkListItem을
 * 판정하고, own-format round-trip에서 raw warning 오탐을 내지 않는지
 * 검증한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

/**
 * 성공한 HTML import 결과를 반환한다. 실패하면 구조화된 오류 메시지를
 * 그대로 노출해 fixture 문제와 importer 회귀를 구분한다.
 */
const importDocument = (html: string): Document => {
  const result = importHtml(html);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.document;
};

describe("체크 목록 HTML 가져오기", () => {
  it("data-be-checked=true인 li를 checked: true인 checkListItem으로 만든다", () => {
    const document = importDocument(
      '<ul><li data-be-block-id="c-1" data-be-checked="true">완료</li></ul>',
    );
    expect(document.blocks).toEqual([
      {
        id: "c-1",
        type: "checkListItem",
        checked: true,
        content: [{ text: "완료" }],
      },
    ]);
  });

  it("data-be-checked=false인 li를 checked: false인 checkListItem으로 만든다", () => {
    const document = importDocument(
      '<ul><li data-be-block-id="c-1" data-be-checked="false">미완료</li></ul>',
    );
    expect(document.blocks).toEqual([
      {
        id: "c-1",
        type: "checkListItem",
        checked: false,
        content: [{ text: "미완료" }],
      },
    ]);
  });

  it("data-be-checked 값이 정확히 true가 아니면(임의 문자열) checked: false로 읽는다", () => {
    const document = importDocument(
      '<ul><li data-be-block-id="c-1" data-be-checked="yes">모호</li></ul>',
    );
    expect(document.blocks).toEqual([
      {
        id: "c-1",
        type: "checkListItem",
        checked: false,
        content: [{ text: "모호" }],
      },
    ]);
  });

  it("data-be-checked가 없는 li는 기존과 동일하게 tag 기반으로 판정한다", () => {
    const document = importDocument(
      '<ul><li data-be-block-id="b-1">글머리</li></ul>' +
        '<ol><li data-be-block-id="n-1">번호</li></ol>',
    );
    expect(document.blocks).toEqual([
      { id: "b-1", type: "bulletListItem", content: [{ text: "글머리" }] },
      { id: "n-1", type: "numberedListItem", content: [{ text: "번호" }] },
    ]);
  });

  it("own-format round-trip에서 dataBeChecked에 대한 UNSAFE_ATTRIBUTE_REMOVED 오탐 경고를 내지 않는다", () => {
    const result = importHtml(
      '<ul><li data-be-block-id="c-1" data-be-checked="true">완료</li></ul>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.warnings).toEqual([]);
  });

  it("checkListItem도 다른 목록 항목처럼 재귀 children을 보존한다", () => {
    const document = importDocument(
      '<ul><li data-be-block-id="c-1" data-be-checked="true"><p>부모</p>' +
        '<p data-be-block-id="p-1">자식</p></li></ul>',
    );
    expect(document.blocks).toEqual([
      {
        id: "c-1",
        type: "checkListItem",
        checked: true,
        content: [{ text: "부모" }],
        children: [
          { id: "p-1", type: "paragraph", content: [{ text: "자식" }] },
        ],
      },
    ]);
  });
});
