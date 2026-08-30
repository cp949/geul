/**
 * 자식 없는 글머리·번호 목록의 GFM outbound 의미를 검증한다.
 * 연속 grouping과 번호 목록의 시작 marker 경계를 다룬다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown } from "../src/index.js";

describe("목록 GFM 내보내기", () => {
  it("연속 flat 목록을 unordered와 ordered list로 내보내고 명시 시작 번호를 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "b-1", type: "bulletListItem", content: [{ text: "하나" }] },
        { id: "b-2", type: "bulletListItem", content: [{ text: "둘" }] },
        {
          id: "n-3",
          type: "numberedListItem",
          startNumber: 3,
          content: [{ text: "셋" }],
        },
        { id: "n-4", type: "numberedListItem", content: [{ text: "넷" }] },
        {
          id: "n-9",
          type: "numberedListItem",
          startNumber: 9,
          content: [{ text: "아홉" }],
        },
        { id: "tail", type: "paragraph", content: [{ text: "끝" }] },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "* 하나\n* 둘\n\n3. 셋\n3. 넷\n\n9) 아홉\n\n끝\n",
    });
  });

  it("9자리 상한 시작 번호 뒤의 implicit 항목도 ordered list에 유지한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "n-max",
          type: "numberedListItem",
          startNumber: 999_999_999,
          content: [{ text: "상한" }],
        },
        {
          id: "n-next",
          type: "numberedListItem",
          content: [{ text: "다음" }],
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "999999999. 상한\n999999999. 다음\n",
    });
  });
});
