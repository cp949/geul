/**
 * GFM import가 어떤 입력에서도 toggle heading(isToggleable)이나
 * toggleListItem을 만들지 않음을 고정한다(spec §7.2 — GFM에는 토글 문법
 * 자체가 없다, RD-005 완료 조건 4번). importer 코드 변경이 없는 회귀 고정
 * 테스트다.
 */
import { describe, expect, it } from "vitest";

import { importMarkdown } from "../src/index.js";

/**
 * 성공한 Markdown import 결과를 반환한다. 실패 메시지를 그대로 노출해
 * fixture 파싱 실패와 구조 단언 실패를 구분한다.
 */
const importDocument = (source: string) => {
  const result = importMarkdown(source);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

describe("GFM import는 토글을 만들지 않는다", () => {
  it("일반 heading import는 isToggleable/collapsed 필드가 없다", () => {
    const { document } = importDocument("## 제목\n");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "heading",
        level: 2,
        content: [{ text: "제목" }],
      },
    ]);
  });

  it("일반 글머리 목록 import는 bulletListItem이다(toggleListItem 아님)", () => {
    const { document } = importDocument("* 항목\n");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "bulletListItem",
        content: [{ text: "항목" }],
      },
    ]);
  });

  it("체크 목록 import는 checkListItem이다(toggleListItem 아님)", () => {
    const { document } = importDocument("- [ ] 할 일\n");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "checkListItem",
        checked: false,
        content: [{ text: "할 일" }],
      },
    ]);
  });

  it("리터럴 <details>/<summary> HTML은 raw HTML로 다운그레이드되고 toggle을 만들지 않는다", () => {
    const { document } = importDocument(
      "<details><summary>제목</summary>\n\n내용\n\n</details>\n",
    );

    const hasToggle = document.blocks.some(
      (block) =>
        block.type === "toggleListItem" ||
        (block.type === "heading" && block.isToggleable === true),
    );
    expect(hasToggle).toBe(false);
  });
});
