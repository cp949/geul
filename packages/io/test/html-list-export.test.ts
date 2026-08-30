/**
 * 자식 없는 글머리·번호 목록의 HTML outbound 의미를 검증한다.
 * 연속 grouping, 목록 종류 전환과 명시적 시작 번호 경계를 다룬다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml } from "../src/index.js";

describe("목록 HTML 내보내기", () => {
  it("연속 flat 목록을 종류별 ul과 ol로 묶고 명시 시작 번호를 ol start로 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "b-1", type: "bulletListItem", content: [{ text: "하나" }] },
        { id: "b-2", type: "bulletListItem", content: [{ text: "둘" }] },
        {
          id: "n-1",
          type: "numberedListItem",
          startNumber: 0,
          content: [{ text: "영" }],
        },
        { id: "n-2", type: "numberedListItem", content: [{ text: "하나" }] },
        {
          id: "n-9",
          type: "numberedListItem",
          startNumber: 9,
          content: [{ text: "아홉" }],
        },
        { id: "tail", type: "paragraph", content: [{ text: "끝" }] },
      ],
    };

    expect(exportHtml(document)).toEqual({
      ok: true,
      value:
        '<ul><li data-be-block-id="b-1">하나</li><li data-be-block-id="b-2">둘</li></ul>' +
        '<ol start="0"><li data-be-block-id="n-1">영</li><li data-be-block-id="n-2">하나</li></ol>' +
        '<ol start="9"><li data-be-block-id="n-9">아홉</li></ol>' +
        '<p data-be-block-id="tail">끝</p>',
    });
  });
});
