/**
 * top-level CustomBlock(model, RD-002-DELTA-01)이 포함된 문서를 이 에디터가
 * 로드하려 하면 EDITOR_FEATURE_UNAVAILABLE로 명시적으로 거절하는지
 * 확인한다 — PM atom 노드 등록(registry, RD-002-DELTA-06)이 아직 없어
 * 조용히 무시하거나 잘못 렌더링할 수 없다.
 */
import type { Block, Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  documentOf,
  documentWithContent,
  paragraphBlock,
} from "./editor-controller-support.js";

const widget = { id: "widget-1", type: "myWidget", content: "none" as const };

const documentWithCustomBlock: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [paragraphBlock("p1", "hi"), widget],
};

describe("EDITOR_FEATURE_UNAVAILABLE: top-level CustomBlock 로드 거절", () => {
  it("초기 문서에 CustomBlock이 있으면 createEditor가 던진다", () => {
    expect(() =>
      createEditor({ initialDocument: documentWithCustomBlock }),
    ).toThrow(/myWidget/);
  });

  it("replaceDocument로 CustomBlock 문서를 넣으면 EDITOR_FEATURE_UNAVAILABLE을 반환한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(paragraphBlock("p1", "hi")),
    });

    const result = editor.replaceDocument(documentWithCustomBlock);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EDITOR_FEATURE_UNAVAILABLE",
        message: expect.stringContaining("myWidget"),
      },
    });
  });

  it("CustomBlock이 없는 기존 문서는 회귀 없이 그대로 로드된다", () => {
    expect(() =>
      createEditor({ initialDocument: documentOf(paragraphBlock("p1", "hi")) }),
    ).not.toThrow();
  });
});

/**
 * model의 InlineContent 위젠(RD-002-DELTA-13)이 열어 준 커스텀 inline
 * 원소(EXT-002)·CustomTextMark(EXT-003)가 문단·table 셀·중첩 children
 * content에 있으면 core가 EDITOR_FEATURE_UNAVAILABLE로 거절하는지 확인한다
 * — customInlineContent/customStyles registry(추후 DELTA)가 아직 없어
 * 조용히 무시하거나 PM이 알 수 없는 방식으로 크래시하게 둘 수 없다
 * (RD-002-DELTA-14).
 */
describe("EDITOR_FEATURE_UNAVAILABLE: 커스텀 inline 원소·마크 거절", () => {
  const freshEditor = () =>
    createEditor({ initialDocument: documentOf(paragraphBlock("p1", "hi")) });

  it("문단 content에 커스텀 inline 원소가 있으면 거절한다", () => {
    const editor = freshEditor();

    const result = editor.replaceDocument(
      documentWithContent([{ type: "custom", customType: "myWidget" }]),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EDITOR_FEATURE_UNAVAILABLE",
        message: expect.stringContaining(
          'contains an unregistered custom inline type "myWidget"',
        ),
      },
    });
  });

  it("table 셀 content에 커스텀 inline 원소가 있어도 동일하게 거절한다", () => {
    const documentWithCustomCell: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        paragraphBlock("p1", "hi"),
        {
          id: "table-1",
          type: "table",
          columns: [{ id: "col-1", width: 160 }],
          rows: [
            {
              id: "row-1",
              cells: [
                {
                  id: "cell-1",
                  columnId: "col-1",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ type: "custom", customType: "myWidget" }],
                },
              ],
            },
          ],
          headerRows: 0,
          headerColumns: 0,
        },
      ],
    };
    const editor = freshEditor();

    const result = editor.replaceDocument(documentWithCustomCell);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EDITOR_FEATURE_UNAVAILABLE",
        message:
          'Block table-1 cell cell-1 contains an unregistered custom inline type "myWidget"',
      },
    });
  });

  it("text 런의 marks에 CustomTextMark가 있으면 거절한다(빈 mark 배열 등 기존 DOCUMENT_INVALID 판정과 코드가 구분된다)", () => {
    const editor = freshEditor();

    const result = editor.replaceDocument(
      documentWithContent([
        {
          text: "hi",
          marks: [{ type: "highlight", props: { shade: "yellow" } }],
        },
      ]),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EDITOR_FEATURE_UNAVAILABLE",
        message: expect.stringContaining(
          'contains an unregistered custom mark type "highlight"',
        ),
      },
    });
  });

  it("중첩 children의 content에 커스텀 원소가 있어도 재귀적으로 거절된다", () => {
    const nestedHeadingWithCustomContent: Block = {
      id: "child-1",
      type: "heading",
      level: 1,
      content: [{ type: "custom", customType: "myWidget" }],
    };
    const editor = freshEditor();

    const result = editor.replaceDocument(
      documentOf(paragraphBlock("p1", "hi", [nestedHeadingWithCustomContent])),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EDITOR_FEATURE_UNAVAILABLE",
        message: expect.stringContaining(
          'contains an unregistered custom inline type "myWidget"',
        ),
      },
    });
  });

  it("기존 8종 마크·14종 block만 있는 문서는 회귀 없이 그대로 로드된다", () => {
    expect(() =>
      createEditor({
        initialDocument: documentWithContent([
          { text: "bold", marks: [{ type: "bold" }] },
        ]),
      }),
    ).not.toThrow();
  });
});
