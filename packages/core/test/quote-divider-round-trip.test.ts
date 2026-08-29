/**
 * quote·divider가 model→Tiptap PM→model 왕복에서 위치·id·content·children을
 * 그대로 보존하는지, 01b가 걸어둔 임시 거절이 실제 변환으로 교체됐는지,
 * heading level 1-6 전 구간이 왕복되는지를 검증한다(DELTA-04). trailing
 * paragraph 정규화(슬라이스 2)와 분리하려고 대부분의 왕복 문서는 paragraph로
 * 끝나게 구성하고, 정규화 자체를 확인하는 케이스만 quote/divider로 끝나는
 * 문서를 쓴다.
 */
import type { Block, Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import { modelToTiptap } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import {
  dividerBlock,
  documentOf,
  headingLevels456Document,
  oneCellTableBlock,
  paragraphDocument,
  quoteBlock,
  sequentialIds,
} from "./editor-controller-support.js";

/**
 * initialDocument를 createEditor로 로드하고 저장 블록 배열을 돌려준다.
 * model→PM→model 왕복 단언(toEqual(initialDocument.blocks))이 반복되는
 * 각 it에서 createId: sequentialIds("gen") 생성 규칙을 통일한다.
 */
const roundTripBlocks = (initialDocument: Document): Block[] =>
  createEditor({
    initialDocument,
    createId: sequentialIds("gen"),
  }).getDocument().blocks;

describe("quote 왕복", () => {
  it("children(heading·table·divider 혼재) 있는 quote가 model→PM→model 왕복에서 id·content·children 그대로 보존된다", () => {
    const initialDocument = documentOf(
      quoteBlock("quote-1", "quote text", [
        {
          id: "child-heading",
          type: "heading",
          level: 2,
          content: [{ text: "child heading" }],
        },
        oneCellTableBlock("child-table"),
        dividerBlock("child-divider"),
      ]),
      { id: "tail-1", type: "paragraph", content: [{ text: "tail" }] },
    );

    expect(roundTripBlocks(initialDocument)).toEqual(initialDocument.blocks);
  });

  it("children 없는 quote와 빈 content quote가 왕복 보존된다", () => {
    const initialDocument = documentOf(
      quoteBlock("quote-2", "no children"),
      { id: "quote-3", type: "quote", content: [] },
      { id: "tail-1", type: "paragraph", content: [{ text: "tail" }] },
    );

    expect(roundTripBlocks(initialDocument)).toEqual(initialDocument.blocks);
  });

  it("quote가 다른 블록의 자식 위치에 있어도 왕복 보존된다", () => {
    const initialDocument = documentOf(
      {
        id: "parent-1",
        type: "paragraph",
        content: [{ text: "parent" }],
        children: [quoteBlock("quote-4", "nested quote")],
      },
      { id: "tail-1", type: "paragraph", content: [{ text: "tail" }] },
    );

    expect(roundTripBlocks(initialDocument)).toEqual(initialDocument.blocks);
  });
});

describe("divider 왕복", () => {
  it("최상위 divider가 위치·id 그대로 왕복 보존된다", () => {
    const initialDocument = documentOf(
      { id: "p-1", type: "paragraph", content: [{ text: "before" }] },
      dividerBlock("divider-1"),
      { id: "p-2", type: "paragraph", content: [{ text: "after" }] },
    );

    expect(roundTripBlocks(initialDocument)).toEqual(initialDocument.blocks);
  });

  it("paragraph·quote의 자식 위치(blockGroup 안) divider가 왕복 보존된다", () => {
    const initialDocument = documentOf(
      {
        id: "parent-1",
        type: "paragraph",
        content: [{ text: "parent" }],
        children: [dividerBlock("divider-2")],
      },
      {
        id: "quote-parent",
        type: "quote",
        content: [{ text: "quote parent" }],
        children: [dividerBlock("divider-3")],
      },
      { id: "tail-1", type: "paragraph", content: [{ text: "tail" }] },
    );

    expect(roundTripBlocks(initialDocument)).toEqual(initialDocument.blocks);
  });

  it("modelToTiptap이 divider 노드 attrs에 모델 id를 명시 배정한다", () => {
    const initialDocument = documentOf(dividerBlock("divider-9"), {
      id: "tail-1",
      type: "paragraph",
      content: [{ text: "tail" }],
    });

    const result = modelToTiptap(initialDocument);
    if (!result.ok) throw new Error("modelToTiptap 실패");

    const dividerNode = result.value.content?.find(
      (node) => node.type === "divider",
    );
    expect(dividerNode?.attrs).toEqual({ blockId: "divider-9" });
  });
});

describe("임시 거절 제거(01b 계약 반전)", () => {
  it("quote·divider 문서가 createEditor·replaceDocument에서 로드된다", () => {
    const quoteDocument = documentOf(quoteBlock("quote-1", "hello"), {
      id: "tail-1",
      type: "paragraph",
      content: [{ text: "tail" }],
    });
    const dividerDocument = documentOf(dividerBlock("divider-1"), {
      id: "tail-2",
      type: "paragraph",
      content: [{ text: "tail" }],
    });

    expect(() =>
      createEditor({ initialDocument: quoteDocument }),
    ).not.toThrow();

    const editor = createEditor({
      initialDocument: paragraphDocument("kept"),
    });
    expect(editor.replaceDocument(dividerDocument)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks).toEqual(dividerDocument.blocks);
  });

  it("미지 Tiptap 블록 타입은 여전히 DOCUMENT_INVALID로 거절된다", () => {
    const result = tiptapToModel(
      { type: "doc", content: [{ type: "foo" }] },
      0,
      sequentialIds("gen"),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
  });
});

describe("로드 시 trailing 정규화(슬라이스 2 불변식, 코드 무변경)", () => {
  it("divider로 끝나는 문서를 로드하면 빈 paragraph가 추가되고 저장 JSON이 정규화 후 동등하다", () => {
    const initialDocument = documentOf(
      { id: "p-1", type: "paragraph", content: [{ text: "before" }] },
      dividerBlock("divider-1"),
    );

    expect(roundTripBlocks(initialDocument)).toEqual([
      ...initialDocument.blocks,
      { id: "gen-1", type: "paragraph", content: [] },
    ]);
  });

  it("quote로 끝나는 문서도 같다", () => {
    const initialDocument = documentOf(
      { id: "p-1", type: "paragraph", content: [{ text: "before" }] },
      quoteBlock("quote-1", "closing"),
    );

    expect(roundTripBlocks(initialDocument)).toEqual([
      ...initialDocument.blocks,
      { id: "gen-1", type: "paragraph", content: [] },
    ]);
  });
});

describe("heading level 1-6", () => {
  it("level 4·5·6 heading 문서가 왕복 보존된다", () => {
    const initialDocument = headingLevels456Document();

    expect(roundTripBlocks(initialDocument)).toEqual(initialDocument.blocks);
  });

  it("tiptapToModel이 level 7 heading 노드를 DOCUMENT_INVALID로 거절한다", () => {
    const result = tiptapToModel(
      {
        type: "doc",
        content: [
          {
            type: "blockContainer",
            attrs: { blockId: "h7" },
            content: [{ type: "heading", attrs: { level: 7 }, content: [] }],
          },
        ],
      },
      0,
      sequentialIds("gen"),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
  });
});
