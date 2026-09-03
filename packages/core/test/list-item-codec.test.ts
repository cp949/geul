/**
 * 글머리·번호 목록 저장 모델과 ProseMirror blockContainer 표현의 양방향
 * 직대응을 검증한다. 안정 ID, inline content, 임의 children과 startNumber를 다룬다.
 */
import { parseDocument, type Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { modelToTiptap } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { sequentialIds } from "./editor-controller-support.js";

/** 모델 parser를 통과한 목록 문서를 만들어 codec 입력의 유효성을 고정한다. */
function listDocument(): Document {
  const parsed = parseDocument({
    formatVersion: 1,
    revision: 7,
    blocks: [
      {
        id: "bullet-1",
        type: "bulletListItem",
        content: [{ text: "bullet" }],
        children: [
          {
            id: "numbered-auto",
            type: "numberedListItem",
            content: [{ text: "nested" }],
            children: [
              {
                id: "paragraph-child",
                type: "paragraph",
                content: [{ text: "arbitrary child" }],
              },
            ],
          },
        ],
      },
      {
        id: "numbered-explicit",
        type: "numberedListItem",
        startNumber: 0,
        content: [{ text: "zero" }],
      },
    ],
  });
  if (!parsed.ok)
    throw new Error(`목록 fixture 준비 실패: ${parsed.error.message}`);
  return parsed.value;
}

const expectedPmDocument: TiptapJsonNode = {
  type: "doc",
  content: [
    {
      type: "blockContainer",
      attrs: {
        blockId: "bullet-1",
        textColor: null,
        backgroundColor: null,
        textAlignment: null,
      },
      content: [
        {
          type: "bulletListItem",
          content: [{ type: "text", text: "bullet" }],
        },
        {
          type: "blockGroup",
          content: [
            {
              type: "blockContainer",
              attrs: {
                blockId: "numbered-auto",
                textColor: null,
                backgroundColor: null,
                textAlignment: null,
              },
              content: [
                {
                  type: "numberedListItem",
                  attrs: { startNumber: null },
                  content: [{ type: "text", text: "nested" }],
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
          ],
        },
      ],
    },
    {
      type: "blockContainer",
      attrs: {
        blockId: "numbered-explicit",
        textColor: null,
        backgroundColor: null,
        textAlignment: null,
      },
      content: [
        {
          type: "numberedListItem",
          attrs: { startNumber: 0 },
          content: [{ type: "text", text: "zero" }],
        },
      ],
    },
  ],
};

describe("목록 model·PM codec 직대응", () => {
  it("최상위와 중첩 목록을 model에서 PM으로 정확히 인코드한다", () => {
    expect(modelToTiptap(listDocument())).toEqual({
      ok: true,
      value: expectedPmDocument,
    });
  });

  it("최상위와 중첩 목록을 PM에서 model 저장형으로 정확히 디코드한다", () => {
    expect(
      tiptapToModel(expectedPmDocument, 7, sequentialIds("generated")),
    ).toEqual({
      ok: true,
      value: listDocument(),
    });
  });

  it("목록 codec 결과는 최종 model parseDocument 검증을 통과해야 한다", () => {
    const invalidPm: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "invalid-number" },
          content: [
            {
              type: "numberedListItem",
              attrs: { startNumber: "2" },
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
