/**
 * GFM 체크 목록 import가 `- [ ]`/`- [x]`를 강등하지 않고 `checkListItem`
 * `checked` boolean으로 정확히 매핑하는지 검증한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importMarkdown } from "../src/index.js";

/**
 * 성공한 Markdown import 결과를 반환한다. 실패하면 구조화된 오류 메시지를
 * 그대로 노출해 fixture 문제와 importer 회귀를 구분한다.
 */
const importDocument = (source: string): Document => {
  const result = importMarkdown(source);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.document;
};

describe("체크 목록 GFM 가져오기", () => {
  it("- [x] 항목을 checked: true인 checkListItem으로 만든다", () => {
    const document = importDocument("- [x] 완료");
    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "checkListItem",
        checked: true,
        content: [{ text: "완료" }],
      },
    ]);
  });

  it("- [ ] 항목을 checked: false인 checkListItem으로 만든다", () => {
    const document = importDocument("- [ ] 미완료");
    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "checkListItem",
        checked: false,
        content: [{ text: "미완료" }],
      },
    ]);
  });

  it("task 항목 import는 LIST_DOWNGRADED 경고를 내지 않는다", () => {
    const result = importMarkdown(["- [x] 완료", "- [ ] 미완료"].join("\n"));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.warnings).toEqual([]);
  });

  it("task 아닌 일반 글머리 항목은 기존과 동일하게 bulletListItem으로 판정한다(회귀 방지)", () => {
    const document = importDocument("- 일반");
    expect(document.blocks).toEqual([
      { id: "markdown-1", type: "bulletListItem", content: [{ text: "일반" }] },
    ]);
  });

  it("checkListItem도 다른 목록 항목처럼 재귀 children을 보존한다", () => {
    const document = importDocument(
      ["- [x] 부모", "  - 자식", "- [ ] 다음"].join("\n"),
    );
    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "checkListItem",
        checked: true,
        content: [{ text: "부모" }],
        children: [
          {
            id: "markdown-2",
            type: "bulletListItem",
            content: [{ text: "자식" }],
          },
        ],
      },
      {
        id: "markdown-3",
        type: "checkListItem",
        checked: false,
        content: [{ text: "다음" }],
      },
    ]);
  });
});
