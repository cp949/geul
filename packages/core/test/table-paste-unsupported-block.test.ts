/**
 * 클립보드 시퀀스의 블록 모양 계약 두 가지를 고정한다 (Issue #356 RD-004).
 * - 미지원 variant 거절: 새 ClipboardContentBlock 타입은 model의 모든 비표
 *   블록을 담지만 core는 paragraph, heading, 두 목록 항목, codeBlock, divider,
 *   table만 붙인다. 그 밖의 type(quote, callout 등)은 최상위든 목록 항목
 *   children 안이든 표 안 캐럿이든 CLIPBOARD_CONTENT_INVALID로 거절하고 문서를
 *   바꾸지 않는다. 조립 함수도 같은 거절을 하는 방어선이다.
 * - id 재발급: 파서의 임시 id(`clipboard-…`)는 문서에 들어가지 않는다.
 * codeBlock 내용이 마크 없는 평문 런이 아닌 입력의 거절도 함께 본다.
 */
import type { ClipboardContentBlock } from "@cp949/geul-io";
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { pasteClipboardContent } from "../src/table-paste-commands.js";
import { buildOutOfTableSequence } from "../src/table-paste-sequence.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import {
  clipBullet,
  clipCodeBlock,
  clipParagraph,
} from "./clipboard-block-test-support.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  buildTestSchema,
  createTableFixtureEditor,
  docWithParagraph,
  docWithTwoRowTable,
  placeCaretInCell,
} from "./table-test-support.js";

/** 셀 하나짜리 표 블록이다. */
const tableBlock = (text: string): ClipboardContentBlock => ({
  type: "table",
  data: {
    columnCount: 1,
    rows: [
      {
        cells: [
          { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [{ text }] },
        ],
      },
    ],
  },
});

/** 파서가 아직 내지 않는 비표 블록이다. */
const quoteBlock: ClipboardContentBlock = {
  id: "clipboard-quote",
  type: "quote",
  content: [{ text: "q" }],
};

const calloutBlock: ClipboardContentBlock = {
  id: "clipboard-callout",
  type: "callout",
  content: [{ text: "c" }],
};

const quoteRejected = {
  ok: false,
  error: {
    code: "CLIPBOARD_CONTENT_INVALID",
    message: "Unsupported clipboard block type: quote",
  },
};

describe("미지원 variant를 거절한다", () => {
  it("표 밖 최상위 quote는 CLIPBOARD_CONTENT_INVALID로 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const before = editor.getJSON() as TiptapJsonNode;

    const result = pasteClipboardContent(
      editor,
      [clipParagraph([{ text: "p" }]), quoteBlock, tableBlock("A")],
      sequentialIds("paste"),
    );

    expect(result).toEqual(quoteRejected);
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("목록 항목 children 안 callout도 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const before = editor.getJSON() as TiptapJsonNode;

    const result = pasteClipboardContent(
      editor,
      [
        clipBullet([{ text: "item" }], { children: [calloutBlock] }),
        tableBlock("A"),
      ],
      sequentialIds("paste"),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CLIPBOARD_CONTENT_INVALID",
        message: "Unsupported clipboard block type: callout",
      },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("표 안 캐럿에서도 표 앞 quote를 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = pasteClipboardContent(
      editor,
      [quoteBlock, tableBlock("x")],
      sequentialIds("paste"),
    );

    expect(result).toEqual(quoteRejected);
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("조립 함수도 최상위 quote를 거절한다 (검증을 거치지 않는 방어선)", () => {
    const result = buildOutOfTableSequence(
      buildTestSchema(),
      [quoteBlock, tableBlock("A")],
      sequentialIds("id"),
    );

    expect(result).toEqual(quoteRejected);
  });

  it("조립 함수는 목록 항목 children 안 quote도 거절한다", () => {
    const result = buildOutOfTableSequence(
      buildTestSchema(),
      [clipBullet([{ text: "item" }], { children: [quoteBlock] })],
      sequentialIds("id"),
    );

    expect(result).toEqual(quoteRejected);
  });
});

describe("codeBlock 내용이 평문 런이 아니면 거절한다", () => {
  it("목록 항목 children 안 codeBlock에 커스텀 inline 원소가 있으면 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const before = editor.getJSON() as TiptapJsonNode;
    const code = clipCodeBlock("x");
    if (code.type !== "codeBlock") throw new Error("codeBlock 아님");

    const result = pasteClipboardContent(
      editor,
      [
        clipBullet([{ text: "item" }], {
          children: [
            { ...code, content: [{ type: "custom", customType: "widget" }] },
          ],
        }),
        tableBlock("A"),
      ],
      sequentialIds("paste"),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CLIPBOARD_CONTENT_INVALID",
        message: "CodeBlock content must be plain text runs",
      },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });
});

describe("붙여넣을 때 블록 id를 재발급한다", () => {
  /** model 블록 트리의 모든 id를 깊이 우선으로 모은다. */
  const collectIds = (blocks: Document["blocks"]): string[] =>
    blocks.flatMap((block) => [
      block.id,
      ...("children" in block ? collectIds(block.children ?? []) : []),
    ]);

  it("파서 임시 id(clipboard-…)가 붙여넣은 문서의 blockId로 남지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);

    const result = pasteClipboardContent(
      editor,
      [
        clipParagraph([{ text: "p" }]),
        clipBullet([{ text: "item" }], {
          children: [
            clipParagraph([{ text: "child" }]),
            clipCodeBlock("let a = 1;"),
          ],
        }),
        tableBlock("A"),
      ],
      sequentialIds("paste"),
    );

    expect(result.ok).toBe(true);
    const model = tiptapToModel(
      editor.getJSON() as TiptapJsonNode,
      0,
      sequentialIds("model"),
    );
    if (!model.ok) throw new Error(model.error.code);
    const ids = collectIds(model.value.blocks);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    expect(ids.filter((id) => id.startsWith("clipboard-"))).toEqual([]);
  });
});
