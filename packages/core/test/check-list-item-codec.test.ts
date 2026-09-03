/**
 * checkListItem 저장 모델과 ProseMirror blockContainer 표현의 양방향
 * 직대응을 검증한다(Issue #38 슬라이스 6 RD-001 DELTA-02). 안정 ID, inline
 * content, 임의 children과 checked를 다룬다. checked는 model 필수 필드라
 * toggleListItem.collapsed와 달리 "부재" 상태가 없다 — true/false 두 상태만
 * 다룬다. bulletListItem/numberedListItem의 대응 계약은 list-item-codec.test.ts가
 * 소유한다.
 */
import { parseDocument, type Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { modelToTiptap } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { sequentialIds } from "./editor-controller-support.js";

/** 모델 parser를 통과한 checkListItem 문서를 만들어 codec 입력의 유효성을 고정한다. */
function checkDocument(): Document {
  const parsed = parseDocument({
    formatVersion: 1,
    revision: 3,
    blocks: [
      {
        id: "check-checked",
        type: "checkListItem",
        checked: true,
        content: [{ text: "checked" }],
        children: [
          {
            id: "paragraph-child",
            type: "paragraph",
            content: [{ text: "arbitrary child" }],
          },
        ],
      },
      {
        id: "check-unchecked",
        type: "checkListItem",
        checked: false,
        content: [{ text: "unchecked" }],
      },
    ],
  });
  if (!parsed.ok)
    throw new Error(`checkListItem fixture 준비 실패: ${parsed.error.message}`);
  return parsed.value;
}

const expectedPmDocument: TiptapJsonNode = {
  type: "doc",
  content: [
    {
      type: "blockContainer",
      attrs: {
        blockId: "check-checked",
        textColor: null,
        backgroundColor: null,
        textAlignment: null,
      },
      content: [
        {
          type: "checkListItem",
          attrs: { checked: true },
          content: [{ type: "text", text: "checked" }],
        },
        {
          type: "blockGroup",
          content: [
            {
              type: "blockContainer",
              attrs: {
                blockId: "paragraph-child",
                textColor: null,
                backgroundColor: null,
                textAlignment: null,
              },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "arbitrary child" }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "blockContainer",
      attrs: {
        blockId: "check-unchecked",
        textColor: null,
        backgroundColor: null,
        textAlignment: null,
      },
      content: [
        {
          type: "checkListItem",
          attrs: { checked: false },
          content: [{ type: "text", text: "unchecked" }],
        },
      ],
    },
  ],
};

describe("checkListItem model·PM codec 직대응", () => {
  it("checked의 true/false 두 상태를 model에서 PM으로 정확히 인코드한다", () => {
    expect(modelToTiptap(checkDocument())).toEqual({
      ok: true,
      value: expectedPmDocument,
    });
  });

  it("checked의 true/false 두 상태를 PM에서 model 저장형으로 정확히 디코드한다", () => {
    expect(
      tiptapToModel(expectedPmDocument, 3, sequentialIds("generated")),
    ).toEqual({
      ok: true,
      value: checkDocument(),
    });
  });

  it("PM attrs.checked가 없으면 DOCUMENT_INVALID로 거절한다(model 필수 필드라 numberedListItem.startNumber·toggleListItem.collapsed처럼 필드 생략으로 표현할 수 없다)", () => {
    const pmWithoutChecked: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "check-absent" },
          content: [
            {
              type: "checkListItem",
              content: [{ type: "text", text: "no checked attr" }],
            },
          ],
        },
      ],
    };

    expect(
      tiptapToModel(pmWithoutChecked, 0, sequentialIds("generated")),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
  });

  it("checkListItem codec 결과는 최종 model parseDocument 검증을 통과해야 한다", () => {
    const invalidPm: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "invalid-check" },
          content: [
            {
              type: "checkListItem",
              attrs: { checked: "yes" },
              content: [{ type: "text", text: "invalid" }],
            },
          ],
        },
      ],
    };

    expect(
      tiptapToModel(invalidPm, 0, sequentialIds("generated")),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
  });
});
