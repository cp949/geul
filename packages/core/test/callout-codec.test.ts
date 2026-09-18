/**
 * callout 저장 모델과 ProseMirror blockContainer 표현의 양방향 직대응을
 * 검증한다(Issue #209 RD-002 DELTA-01). 안정 ID, inline content, 임의
 * children과 icon을 다룬다. paragraph/heading/quote의 대응 계약은 각자
 * codec 테스트가 소유한다(toggleListItem.collapsed와 같은 null=필드 부재
 * 패턴을 icon에도 그대로 적용).
 */
import { parseDocument, type Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { modelToTiptap } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { sequentialIds } from "./editor-controller-support.js";

/** 모델 parser를 통과한 callout 문서를 만들어 codec 입력의 유효성을 고정한다. */
function calloutDocument(): Document {
  const parsed = parseDocument({
    formatVersion: 1,
    revision: 3,
    blocks: [
      {
        id: "callout-with-icon",
        type: "callout",
        icon: "💡",
        content: [{ text: "callout" }],
        children: [
          {
            id: "paragraph-child",
            type: "paragraph",
            content: [{ text: "arbitrary child" }],
          },
        ],
      },
      {
        id: "callout-no-icon",
        type: "callout",
        content: [{ text: "no icon field" }],
      },
    ],
  });
  if (!parsed.ok)
    throw new Error(`callout fixture 준비 실패: ${parsed.error.message}`);
  return parsed.value;
}

const expectedPmDocument: TiptapJsonNode = {
  type: "doc",
  content: [
    {
      type: "blockContainer",
      attrs: {
        blockId: "callout-with-icon",
        textColor: null,
        backgroundColor: null,
        textAlignment: null,
      },
      content: [
        {
          type: "callout",
          attrs: { icon: "💡" },
          content: [{ type: "text", text: "callout" }],
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
        blockId: "callout-no-icon",
        textColor: null,
        backgroundColor: null,
        textAlignment: null,
      },
      content: [
        {
          type: "callout",
          attrs: { icon: null },
          content: [{ type: "text", text: "no icon field" }],
        },
      ],
    },
  ],
};

describe("callout model·PM codec 직대응", () => {
  it("icon 값/부재 두 상태를 model에서 PM으로 정확히 인코드한다", () => {
    expect(modelToTiptap(calloutDocument())).toEqual({
      ok: true,
      value: expectedPmDocument,
    });
  });

  it("icon 값/부재 두 상태를 PM에서 model 저장형으로 정확히 디코드한다", () => {
    expect(
      tiptapToModel(expectedPmDocument, 3, sequentialIds("generated")),
    ).toEqual({
      ok: true,
      value: calloutDocument(),
    });
  });

  it("callout codec 결과는 최종 model parseDocument 검증을 통과해야 한다", () => {
    const invalidPm: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "invalid-callout" },
          content: [
            {
              type: "callout",
              attrs: { icon: "" },
              content: [{ type: "text", text: "empty icon" }],
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
