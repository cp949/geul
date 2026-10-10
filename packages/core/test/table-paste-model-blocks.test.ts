/**
 * 클립보드 시퀀스가 model의 모든 비표 블록을 붙이는 계약을 고정한다
 * (Issue #356 RD-005). 파서는 아직 paragraph·heading·두 목록 항목·codeBlock·
 * divider·table만 내지만, core는 ClipboardContentBlock의 모든 variant를 받는다.
 *
 * 다루는 축은 다음과 같다.
 * - 표 밖: 최상위 codeBlock·divider, quote·callout·checkListItem·toggleListItem·
 *   미디어 4종·iframe이 붙고 model로 읽은 모양이 입력과 같다.
 * - 새 필드: textAlignment, codeBlock wrap·caption이 문서에 남는다.
 * - 표 옆 순서와 첫 표 캐럿 이동.
 * - id 재발급 순서: 부모 다음 자식(문서 순서)이다.
 * - 검증 거절: model이 거절하는 필드와 깊이 초과는 뮤테이션 전에 거절한다.
 * - 표 안 캐럿: 새 type의 content와 children이 셀 줄이 된다. 글자 없는 블록은
 *   줄이 없다. 최상위 codeBlock은 #351 줄 정책을 따른다.
 *
 * 표 밖 경로는 프로덕션 편집기를 쓴다. 표 fixture 스키마에는 quote·미디어 노드가
 * 없다. 표 안 경로는 노드를 만들지 않아 표 fixture로 충분하다.
 */
import type { ClipboardContentBlock } from "@cp949/geul-io";
import {
  type DocumentBlock,
  type InlineContent,
  MAX_NESTING_DEPTH,
  type QuoteBlock,
  type TableBlock,
} from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { getTableBlock } from "../src/table-commands.js";
import { pasteClipboardContent } from "../src/table-paste-commands.js";
import {
  clipBlock,
  clipCodeBlock,
  clipDivider,
  clipParagraph,
} from "./clipboard-block-test-support.js";
import { blocksOf, setupPasteSelection } from "./clipboard-test-support.js";
import { paragraphBlock, sequentialIds } from "./editor-controller-support.js";
import {
  createTableFixtureEditor,
  docWithTwoRowTable,
  placeCaretInCell,
} from "./table-test-support.js";

/** 셀 텍스트가 행 우선으로 주어진 클립보드 표다. */
const clipTable = (rows: string[][]): ClipboardContentBlock => ({
  type: "table",
  data: {
    columnCount: rows[0]?.length ?? 0,
    rows: rows.map((texts) => ({
      cells: texts.map((text, columnIndex) => ({
        columnIndex,
        rowSpan: 1,
        columnSpan: 1,
        content: [{ text }],
      })),
    })),
  },
});

const table2x2 = clipTable([
  ["a", "b"],
  ["c", "d"],
]);

/**
 * 블록 트리에서 id를 지운다. 표는 type만 남긴다. 클립보드 입력과 model로 읽은
 * 문서를 같은 모양으로 비교하려고 쓴다.
 */
const withoutIds = (
  blocks: readonly (DocumentBlock | ClipboardContentBlock)[],
): unknown[] =>
  blocks.map((block) => {
    if (block.type === "table") return { type: "table" };
    const rest: Record<string, unknown> = { ...block };
    delete rest.id;
    if ("children" in block && block.children !== undefined) {
      rest.children = withoutIds(block.children);
    }
    return rest;
  });

/** 문단 p1 "hello" 끝에 캐럿을 둔 프로덕션 편집기다. */
const setupHello = () =>
  setupPasteSelection([paragraphBlock("p1", "hello")], { id: "p1", offset: 5 });

const helloShape = { type: "paragraph", content: [{ text: "hello" }] };

/**
 * 문서 끝 빈 문단이다. 프로덕션 편집기는 마지막 블록이 문단이 아니면 빈 문단을
 * 덧붙인다. 붙여넣기와 무관한 편집기 동작이다.
 */
const trailingShape = { type: "paragraph", content: [] };

/** 프로덕션 편집기 표 밖에 시퀀스를 붙인다. */
const pasteOutside = (content: ClipboardContentBlock[]) => {
  const { editor, tiptap } = setupHello();
  const result = pasteClipboardContent(tiptap, content, sequentialIds("paste"));
  return { editor, tiptap, result };
};

describe("표 밖에서 model 비표 블록이 붙는다", () => {
  it.each([
    ["codeBlock", clipCodeBlock("let a = 1;\n\tb", { language: "javascript" })],
    ["divider", clipDivider()],
  ])("최상위 %s가 든 시퀀스가 붙는다", (_name, block) => {
    const { editor, result } = pasteOutside([block, table2x2]);

    expect(result.ok).toBe(true);
    expect(withoutIds(blocksOf(editor))).toEqual([
      helloShape,
      ...withoutIds([block, table2x2]),
      trailingShape,
    ]);
  });

  it("quote·callout·checkListItem·toggleListItem·미디어 4종·iframe이 model 모양 그대로 붙는다", () => {
    const sequence: ClipboardContentBlock[] = [
      clipBlock({
        type: "quote",
        content: [{ text: "q" }],
        children: [
          clipParagraph([{ text: "c1" }]),
          clipParagraph([{ text: "c2" }]),
        ],
      }),
      clipBlock({ type: "callout", content: [{ text: "co" }], icon: "i" }),
      clipBlock({
        type: "checkListItem",
        checked: true,
        content: [{ text: "done" }],
      }),
      clipBlock({
        type: "toggleListItem",
        content: [{ text: "t" }],
        children: [clipParagraph([{ text: "inside" }])],
      }),
      table2x2,
      clipBlock({
        type: "file",
        url: "https://example.com/a.pdf",
        name: "a.pdf",
      }),
      clipBlock({
        type: "image",
        url: "https://example.com/a.png",
        caption: "cap",
        previewWidth: 320,
        textAlignment: "center",
        showPreview: true,
      }),
      clipBlock({ type: "video", url: "https://example.com/a.mp4" }),
      clipBlock({
        type: "audio",
        url: "https://example.com/a.mp3",
        showPreview: false,
      }),
      clipBlock({
        type: "iframe",
        url: "https://example.com/embed",
        aspectRatio: "16:9",
      }),
    ];

    const { editor, result } = pasteOutside(sequence);

    expect(result.ok).toBe(true);
    expect(withoutIds(blocksOf(editor))).toEqual([
      helloShape,
      ...withoutIds(sequence),
      trailingShape,
    ]);
  });

  it("textAlignment와 codeBlock wrap·caption이 붙은 문서에 남는다", () => {
    const sequence: ClipboardContentBlock[] = [
      clipParagraph([{ text: "p" }], { textAlignment: "right" }),
      clipBlock({
        type: "quote",
        content: [{ text: "q" }],
        textAlignment: "center",
      }),
      clipCodeBlock("x", { language: "javascript", wrap: true, caption: "c" }),
      table2x2,
    ];

    const { editor, result } = pasteOutside(sequence);

    expect(result.ok).toBe(true);
    expect(withoutIds(blocksOf(editor))).toEqual([
      helloShape,
      ...withoutIds(sequence),
      trailingShape,
    ]);
  });

  it("표 옆 새 종류 블록의 순서를 지키고 캐럿은 첫 표 좌상단 셀로 간다", () => {
    const { editor, tiptap, result } = pasteOutside([
      clipBlock({
        type: "quote",
        content: [{ text: "q" }],
        children: [clipParagraph([{ text: "qc" }])],
      }),
      clipDivider(),
      clipBlock({ type: "image", url: "https://example.com/a.png" }),
      table2x2,
      clipBlock({ type: "callout", content: [{ text: "after" }] }),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("붙여넣기 실패");
    const blocks = blocksOf(editor);
    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "quote",
      "divider",
      "image",
      "table",
      "callout",
      "paragraph",
    ]);
    if (blocks[4]?.type !== "table") throw new Error("표 아님");
    const table = blocks[4] as TableBlock;
    expect(result.value.blockId).toBe(table.id);
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.type.name).toBe("tableCell");
    expect(selection.$from.parent.attrs.cellId).toBe(
      table.rows[0]?.cells[0]?.id,
    );
    expect(selection.$from.parentOffset).toBe(0);
  });

  it("비표 블록 id는 부모 다음 자식 순서로 새로 발급하고 임시 id를 쓰지 않는다", () => {
    const { editor, result } = pasteOutside([
      clipBlock({
        type: "quote",
        content: [{ text: "q" }],
        children: [
          clipBlock({
            type: "callout",
            content: [{ text: "c" }],
            children: [clipParagraph([{ text: "p" }])],
          }),
          clipDivider(),
        ],
      }),
      table2x2,
    ]);

    expect(result.ok).toBe(true);
    if (blocksOf(editor)[1]?.type !== "quote") throw new Error("quote 아님");
    const quote = blocksOf(editor)[1] as QuoteBlock;
    const callout = quote.children?.[0];
    expect([
      quote.id,
      callout?.id,
      callout !== undefined && "children" in callout
        ? callout.children?.[0]?.id
        : undefined,
      quote.children?.[1]?.id,
    ]).toEqual(["paste-1", "paste-2", "paste-3", "paste-4"]);
  });
});

describe("새 종류 블록의 잘못된 입력은 뮤테이션 전에 거절한다", () => {
  /** quote 사슬이다. 가장 바깥 quote가 depth 1이다. */
  const quoteChain = (depth: number): ClipboardContentBlock => {
    let block = clipBlock({ type: "quote", content: [{ text: "leaf" }] });
    for (let level = 1; level < depth; level += 1) {
      block = clipBlock({ type: "quote", content: [], children: [block] });
    }
    return block;
  };

  it.each<[string, ClipboardContentBlock, unknown]>([
    [
      "quote content의 빈 텍스트 런",
      clipBlock({ type: "quote", content: [{ text: "" }] }),
      expect.stringContaining("empty text run"),
    ],
    [
      "callout textColor 소문자 hex",
      clipBlock({ type: "callout", content: [], textColor: "#ff0000" }),
      expect.stringContaining("textColor"),
    ],
    [
      "quote textAlignment 범위 밖 값",
      clipBlock({
        type: "quote",
        content: [],
        textAlignment: "justify" as "left",
      }),
      expect.stringContaining("textAlignment"),
    ],
    [
      "checked 없는 checkListItem",
      clipBlock({ type: "checkListItem", content: [] } as never),
      expect.stringContaining("checked"),
    ],
    [
      "image previewWidth 음수",
      clipBlock({ type: "image", previewWidth: -1 }),
      expect.stringContaining("previewWidth"),
    ],
    [
      "iframe javascript URL",
      clipBlock({ type: "iframe", url: "javascript:alert(1)" }),
      expect.stringContaining("url"),
    ],
    [
      "quote children 안 audio의 비canonical 배경색",
      clipBlock({
        type: "quote",
        content: [],
        children: [clipBlock({ type: "audio", backgroundColor: "red" })],
      }),
      expect.stringContaining("backgroundColor"),
    ],
    [
      "callout의 빈 icon",
      clipBlock({ type: "callout", content: [], icon: "" }),
      expect.stringContaining("icon"),
    ],
    [
      `MAX_NESTING_DEPTH(${MAX_NESTING_DEPTH})를 넘는 quote 중첩`,
      quoteChain(MAX_NESTING_DEPTH + 1),
      `Nesting depth exceeds ${MAX_NESTING_DEPTH}`,
    ],
  ])(
    "%s는 CLIPBOARD_CONTENT_INVALID로 거절하고 문서·selection을 바꾸지 않는다",
    (_name, block, message) => {
      const { editor, tiptap } = setupHello();
      const before = editor.getDocument();
      const docBefore = tiptap.state.doc.toJSON();
      const selectionBefore = tiptap.state.selection.toJSON();

      const result = pasteClipboardContent(
        tiptap,
        [block, table2x2],
        sequentialIds("paste"),
      );

      expect(result).toEqual({
        ok: false,
        error: {
          code: "CLIPBOARD_CONTENT_INVALID",
          message,
        },
      });
      expect(editor.getDocument()).toEqual(before);
      expect(tiptap.state.doc.toJSON()).toEqual(docBefore);
      expect(tiptap.state.selection.toJSON()).toEqual(selectionBefore);
    },
  );

  it.each<[string, ClipboardContentBlock]>([
    ["divider", clipDivider()],
    ["codeBlock", clipCodeBlock("x")],
    ["image", clipBlock({ type: "image", url: "https://example.com/a.png" })],
    ["iframe", clipBlock({ type: "iframe", url: "https://example.com/e" })],
  ])(
    "children을 가질 수 없는 %s에 children이 있으면 거절하고 문서·selection을 바꾸지 않는다",
    (type, leafBlock) => {
      const { editor, tiptap } = setupHello();
      const before = editor.getDocument();
      const docBefore = tiptap.state.doc.toJSON();
      const selectionBefore = tiptap.state.selection.toJSON();
      // 타입은 리프 children을 막는다. 공개 API의 런타임 입력을 흉내 낸다.
      const withChildren = {
        ...leafBlock,
        children: [clipParagraph([{ text: "lost" }])],
      } as ClipboardContentBlock;

      const result = pasteClipboardContent(
        tiptap,
        [
          clipBlock({ type: "quote", content: [], children: [withChildren] }),
          table2x2,
        ],
        sequentialIds("paste"),
      );

      expect(result).toEqual({
        ok: false,
        error: {
          code: "CLIPBOARD_CONTENT_INVALID",
          message: `Clipboard ${type} block cannot have children`,
        },
      });
      expect(editor.getDocument()).toEqual(before);
      expect(tiptap.state.doc.toJSON()).toEqual(docBefore);
      expect(tiptap.state.selection.toJSON()).toEqual(selectionBefore);
    },
  );

  it("문단·제목의 children은 model이 허용해 붙는다", () => {
    const sequence: ClipboardContentBlock[] = [
      clipParagraph([{ text: "p" }], {
        children: [clipParagraph([{ text: "pc" }])],
      }),
      clipBlock({
        type: "heading",
        level: 2,
        content: [{ text: "h" }],
        children: [clipBlock({ type: "callout", content: [{ text: "hc" }] })],
      }),
      table2x2,
    ];

    const { editor, result } = pasteOutside(sequence);

    expect(result.ok).toBe(true);
    expect(withoutIds(blocksOf(editor))).toEqual([
      helloShape,
      ...withoutIds(sequence),
      trailingShape,
    ]);
  });

  it("깊이 한계 바로 안쪽 quote 중첩은 붙는다", () => {
    const { result } = pasteOutside([quoteChain(MAX_NESTING_DEPTH), table2x2]);

    expect(result.ok).toBe(true);
  });
});

describe("표 안 캐럿에서 새 종류 블록은 셀 줄이 된다", () => {
  /** 표 안 캐럿 붙여넣기 뒤 table-1의 네 셀 content를 읽는다. */
  const cellContents = (editor: Editor): Array<InlineContent | undefined> => {
    const table = getTableBlock(editor, "table-1");
    if (!table.ok) throw new Error("표 조회 실패");
    return table.value.rows.flatMap((row) =>
      row.cells.map((cell) => cell.content),
    );
  };

  /** 표 fixture 좌상단 셀에 캐럿을 두고 시퀀스를 붙인다. */
  const pasteInCell = (content: ClipboardContentBlock[]) => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const result = pasteClipboardContent(
      editor,
      content,
      sequentialIds("paste"),
    );
    return { editor, result };
  };

  it("quote·callout·checkListItem·toggleListItem의 content와 children이 표 앞뒤 셀 줄로 합쳐진다", () => {
    const { editor, result } = pasteInCell([
      clipBlock({
        type: "quote",
        content: [{ text: "Q" }],
        children: [
          clipParagraph([{ text: "Q1" }]),
          clipParagraph([{ text: "Q2" }]),
        ],
      }),
      clipBlock({ type: "callout", content: [{ text: "C" }] }),
      table2x2,
      clipBlock({
        type: "checkListItem",
        checked: false,
        content: [{ text: "K" }],
        children: [
          clipBlock({
            type: "toggleListItem",
            content: [{ text: "T" }],
            children: [clipParagraph([{ text: "T1" }])],
          }),
        ],
      }),
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)).toEqual([
      [{ text: "Q\nQ1\nQ2\nC\na" }],
      [{ text: "b" }],
      [{ text: "c" }],
      [{ text: "d\nK\nT\nT1" }],
    ]);
  });

  it("divider·미디어·iframe은 줄이 없다", () => {
    const { editor, result } = pasteInCell([
      clipDivider(),
      clipBlock({ type: "image", url: "https://example.com/a.png" }),
      table2x2,
      clipBlock({ type: "iframe", url: "https://example.com/embed" }),
      clipBlock({ type: "file", name: "a.pdf" }),
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)).toEqual([
      [{ text: "a" }],
      [{ text: "b" }],
      [{ text: "c" }],
      [{ text: "d" }],
    ]);
  });

  it("새 종류 블록의 블록 색은 줄의 색 마크가 된다", () => {
    const { editor, result } = pasteInCell([
      clipBlock({
        type: "callout",
        content: [{ text: "C" }],
        textColor: "#FF0000",
      }),
      table2x2,
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)[0]).toEqual([
      { text: "C", marks: [{ type: "textColor", color: "#FF0000" }] },
      { text: "\na" },
    ]);
  });

  it("최상위 codeBlock은 줄마다 셀 줄이고 Tab과 공백뿐인 줄을 지운다(Issue #351 정책)", () => {
    const { editor, result } = pasteInCell([
      clipCodeBlock("x\n\t  y\n \t\nz"),
      table2x2,
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)[0]).toEqual([{ text: "x\n  y\nz\na" }]);
  });
});
