/**
 * toggleListItem 저장 모델과 ProseMirror blockContainer 표현의 양방향
 * 직대응을 검증한다(Issue #38 슬라이스 6 RD-003). 안정 ID, inline content,
 * 임의 children과 collapsed를 다룬다. bulletListItem/numberedListItem의
 * 대응 계약은 list-item-codec.test.ts가 소유한다.
 */
import { parseDocument, type Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { modelToTiptap } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { sequentialIds } from "./editor-controller-support.js";

/** 모델 parser를 통과한 toggleListItem 문서를 만들어 codec 입력의 유효성을 고정한다. */
function toggleDocument(): Document {
  const parsed = parseDocument({
    formatVersion: 1,
    revision: 3,
    blocks: [
      {
        id: "toggle-collapsed",
        type: "toggleListItem",
        collapsed: true,
        content: [{ text: "toggle" }],
        children: [
          {
            id: "paragraph-child",
            type: "paragraph",
            content: [{ text: "arbitrary child" }],
          },
        ],
      },
      {
        id: "toggle-explicit-false",
        type: "toggleListItem",
        collapsed: false,
        content: [{ text: "explicit false" }],
      },
      {
        id: "toggle-absent",
        type: "toggleListItem",
        content: [{ text: "no collapsed field" }],
      },
    ],
  });
  if (!parsed.ok)
    throw new Error(
      `toggleListItem fixture 준비 실패: ${parsed.error.message}`,
    );
  return parsed.value;
}

const expectedPmDocument: TiptapJsonNode = {
  type: "doc",
  content: [
    {
      type: "blockContainer",
      attrs: {
        blockId: "toggle-collapsed",
        textColor: null,
        backgroundColor: null,
        textAlignment: null,
      },
      content: [
        {
          type: "toggleListItem",
          attrs: { collapsed: true },
          content: [{ type: "text", text: "toggle" }],
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
        blockId: "toggle-explicit-false",
        textColor: null,
        backgroundColor: null,
        textAlignment: null,
      },
      content: [
        {
          type: "toggleListItem",
          attrs: { collapsed: false },
          content: [{ type: "text", text: "explicit false" }],
        },
      ],
    },
    {
      type: "blockContainer",
      attrs: {
        blockId: "toggle-absent",
        textColor: null,
        backgroundColor: null,
        textAlignment: null,
      },
      content: [
        {
          type: "toggleListItem",
          attrs: { collapsed: null },
          content: [{ type: "text", text: "no collapsed field" }],
        },
      ],
    },
  ],
};

describe("toggleListItem model·PM codec 직대응", () => {
  it("collapsed의 true/false/부재 세 상태를 model에서 PM으로 정확히 인코드한다", () => {
    expect(modelToTiptap(toggleDocument())).toEqual({
      ok: true,
      value: expectedPmDocument,
    });
  });

  it("collapsed의 true/false/부재 세 상태를 PM에서 model 저장형으로 정확히 디코드한다", () => {
    expect(
      tiptapToModel(expectedPmDocument, 3, sequentialIds("generated")),
    ).toEqual({
      ok: true,
      value: toggleDocument(),
    });
  });

  it("toggleListItem codec 결과는 최종 model parseDocument 검증을 통과해야 한다", () => {
    const invalidPm: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "invalid-toggle" },
          content: [
            {
              type: "toggleListItem",
              attrs: { collapsed: "yes" },
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
