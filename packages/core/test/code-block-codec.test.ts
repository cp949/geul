/**
 * CodeBlock의 독자 문서 정규형과 ProseMirror blockContainer(codeBlock)
 * 표현 사이 무손실 변환을 검증한다. 최상위·중첩 배치, source와 language
 * 경계값, 관용하지 않아야 하는 PM shape를 함께 다룬다.
 */
import {
  type Block,
  type CodeBlock,
  type Document,
  parseDocument,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { modelToTiptap } from "../src/model-to-tiptap.js";
import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import { documentOf, sequentialIds } from "./editor-controller-support.js";

/**
 * 각 케이스가 source와 language 차이만 드러내도록 CodeBlock 저장 정규형을
 * 만든다. source가 빈 문자열이면 모델 계약에 맞춰 content를 빈 배열로 둔다.
 */
const codeBlock = (
  id: string,
  source: string,
  language?: string,
): CodeBlock => ({
  id,
  type: "codeBlock",
  content: source === "" ? [] : [{ text: source }],
  ...(language === undefined ? {} : { language }),
});

/**
 * model parser가 유효성 판정과 known language 정규화를 끝낸 문서만 codec에
 * 전달한다. 실패하면 core 테스트 입력 자체가 계약을 어긴 것이므로 즉시 멈춘다.
 */
const canonicalDocument = (...blocks: Block[]): Document => {
  const parsed = parseDocument(documentOf(...blocks));
  if (!parsed.ok)
    throw new Error(`CodeBlock fixture 준비 실패: ${parsed.error.message}`);
  return parsed.value;
};

/**
 * 유효한 최소 CodeBlock container를 만든다. invalid PM shape 케이스는 반환된
 * leaf나 container에 필요한 위반만 덮어써서 다른 실패 원인을 섞지 않는다.
 */
const codeBlockContainer = (
  content: TiptapJsonNode[] = [],
  language: unknown = null,
): TiptapJsonNode => ({
  type: "blockContainer",
  attrs: { blockId: "code-1" },
  content: [
    {
      type: "codeBlock",
      attrs: { language },
      content,
    },
  ],
});

describe("CodeBlock codec 왕복", () => {
  it("최상위와 중첩 CodeBlock의 빈 source·LF·Tab·language 값을 그대로 왕복한다", () => {
    const initial = canonicalDocument(
      codeBlock("empty", ""),
      codeBlock("lf-tab", "const x = 1;\n\treturn x;", " JS "),
      codeBlock("unknown", "unknown", " Custom Lang "),
      {
        id: "parent",
        type: "paragraph",
        content: [{ text: "parent" }],
        children: [
          codeBlock("nested-empty", "", "text"),
          codeBlock("nested-source", "a\n\tb", " Exact Unknown "),
        ],
      },
    );

    const encoded = modelToTiptap(initial);
    if (!encoded.ok) throw new Error("modelToTiptap 실패");
    const decoded = tiptapToModel(encoded.value, 0, sequentialIds("gen"));

    expect(decoded).toEqual({ ok: true, value: initial });
  });

  it("model-to-PM은 CodeBlock을 language attr이 있는 단일 leaf container로 인코드한다", () => {
    const initial = canonicalDocument(
      codeBlock("empty", ""),
      codeBlock("source", "first\n\tsecond", "javascript"),
      {
        id: "parent",
        type: "paragraph",
        content: [],
        children: [codeBlock("nested", "nested", " Exact Unknown ")],
      },
    );

    expect(modelToTiptap(initial)).toEqual({
      ok: true,
      value: {
        type: "doc",
        content: [
          {
            type: "blockContainer",
            attrs: { blockId: "empty" },
            content: [
              { type: "codeBlock", attrs: { language: null }, content: [] },
            ],
          },
          {
            type: "blockContainer",
            attrs: { blockId: "source" },
            content: [
              {
                type: "codeBlock",
                attrs: { language: "javascript" },
                content: [{ type: "text", text: "first\n\tsecond" }],
              },
            ],
          },
          {
            type: "blockContainer",
            attrs: { blockId: "parent" },
            content: [
              { type: "paragraph", content: [] },
              {
                type: "blockGroup",
                content: [
                  {
                    type: "blockContainer",
                    attrs: { blockId: "nested" },
                    content: [
                      {
                        type: "codeBlock",
                        attrs: { language: " Exact Unknown " },
                        content: [{ type: "text", text: "nested" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it("PM-to-model은 모든 text child를 source 하나로 합치고 빈 source를 정규형으로 만든다", () => {
    const result = tiptapToModel(
      {
        type: "doc",
        content: [
          codeBlockContainer(
            [
              { type: "text", text: "first\n" },
              { type: "text", text: "\t" },
              { type: "text", text: "last" },
            ],
            " JS ",
          ),
          {
            ...codeBlockContainer(),
            attrs: { blockId: "empty" },
          },
        ],
      },
      3,
      sequentialIds("gen"),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        formatVersion: 1,
        revision: 3,
        blocks: [
          codeBlock("code-1", "first\n\tlast", "javascript"),
          codeBlock("empty", ""),
        ],
      },
    });
  });

  it.each([
    {
      이름: "text가 아닌 child",
      container: codeBlockContainer([{ type: "hardBreak" }]),
    },
    {
      이름: "mark가 있는 text child",
      container: codeBlockContainer([
        { type: "text", text: "marked", marks: [{ type: "bold" }] },
      ]),
    },
    {
      이름: "문자열이나 null이 아닌 language attr",
      container: codeBlockContainer([], 42),
    },
    {
      이름: "자체 blockGroup",
      container: {
        ...codeBlockContainer(),
        content: [
          ...(codeBlockContainer().content ?? []),
          { type: "blockGroup", content: [] },
        ],
      },
    },
  ])(
    "지원하지 않는 CodeBlock PM shape($이름)를 DOCUMENT_INVALID로 거절한다",
    ({ container }) => {
      const result = tiptapToModel(
        { type: "doc", content: [container] },
        0,
        sequentialIds("gen"),
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID" },
      });
    },
  );

  it("literal Tab과 unknown language를 core에서 추가 보정하지 않는다", () => {
    const initial = canonicalDocument(
      codeBlock("code-1", "\talpha\n\tbeta", " Unknown Language "),
    );
    const encoded = modelToTiptap(initial);
    if (!encoded.ok) throw new Error("modelToTiptap 실패");

    expect(encoded.value.content?.[0]?.content?.[0]).toEqual({
      type: "codeBlock",
      attrs: { language: " Unknown Language " },
      content: [{ type: "text", text: "\talpha\n\tbeta" }],
    });
    expect(tiptapToModel(encoded.value, 0, sequentialIds("gen"))).toEqual({
      ok: true,
      value: initial,
    });
  });
});
