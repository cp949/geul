/**
 * 체크 목록의 HTML outbound 의미를 검증한다. `<ul>` tag 판정과
 * `data-be-checked` 속성을 다룬다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml } from "../src/index.js";

describe("체크 목록 HTML 내보내기", () => {
  it("checked true/false 항목을 ul과 data-be-checked 속성으로 내보낸다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "c-1",
          type: "checkListItem",
          checked: true,
          content: [{ text: "완료" }],
        },
        {
          id: "c-2",
          type: "checkListItem",
          checked: false,
          content: [{ text: "미완료" }],
        },
      ],
    };

    expect(exportHtml(document)).toEqual({
      ok: true,
      value:
        '<ul><li data-be-block-id="c-1" data-be-checked="true">완료</li>' +
        '<li data-be-block-id="c-2" data-be-checked="false">미완료</li></ul>',
    });
  });

  it("bulletListItem과 checkListItem이 인접해도 종류별로 다른 ul로 나눈다", () => {
    const document: Document = {
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
    };

    expect(exportHtml(document)).toEqual({
      ok: true,
      value:
        '<ul><li data-be-block-id="b-1">글머리</li></ul>' +
        '<ul><li data-be-block-id="c-1" data-be-checked="false">체크</li></ul>',
    });
  });
});
