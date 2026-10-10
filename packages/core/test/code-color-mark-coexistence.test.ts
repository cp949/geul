/**
 * code 글자와 textColor·backgroundColor 마크의 공존을 고정한다(Issue #347).
 * model은 두 마크의 공존을 허용하지만, 편집기 스키마의 Code 마크는 모든
 * 마크와 배타였다. 그래서 `doc.check()`가 `Invalid collection of marks for
 * node text: code,textColor`를 던졌다. Code 마크의 excludes에서 색 마크 둘만
 * 뺀 뒤의 계약이다.
 *
 * 다루는 축은 다음과 같다.
 * - 표 셀 안 clipboard 붙여넣기: 문단 블록색+code, 셀 content의 code+색
 * - 표 셀 안 html 붙여넣기: `<code style=color>`, `<td><code style=color>`
 * - 표 밖 붙여넣기와 초기 문서 로드
 * - tiptapToModel 결과가 code와 색 마크를 잃지 않음
 * - bold+code는 이전과 같이 스키마가 거절함(범위 밖, 배타 유지)
 * - 캐럿·범위 code 토글과 색 적용 명령의 동작
 * - 커스텀 스타일 마크는 excludes 목록에 이름이 없어 code와 공존함
 */
import type { ClipboardContentBlock } from "@cp949/geul-io";
import type { Block, InlineContent } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { createEditor, type CustomStyleDefinition } from "../src/index.js";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { getTableBlock } from "../src/table-commands.js";
import { pasteClipboardContent } from "../src/table-paste-commands.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import { contentTextStart } from "./block-test-support.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  documentOf,
  mounted,
  mountTiptapEditor,
  paragraphBlock,
} from "./list-item-block-type-support.js";
import { gridTable, inCell } from "./table-boundary-test-support.js";
import { pasteIn, textSelection } from "./table-cell-paste-test-support.js";
import {
  createTableFixtureEditor,
  docWithParagraph,
  docWithTwoRowTable,
  placeCaretInCell,
} from "./table-test-support.js";

const RED = "#FF0000";
const BLUE = "#0000FF";
const YELLOW = "#FFFF00";

/** code와 textColor를 함께 가진 한 조각이다. */
const codeRed: InlineContent = [
  {
    text: "x",
    marks: [{ type: "code" }, { type: "textColor", color: RED }],
  },
];

/** 편집기 PM 문서가 스키마를 통과하는지 확인한다. 위반이면 던진다. */
const expectSchemaValid = (editor: Editor) => {
  expect(() => editor.state.doc.check()).not.toThrow();
};

/** 표 안 캐럿 붙여넣기 뒤 table-1의 좌상단 셀 content를 읽는다. */
const firstCellContent = (editor: Editor): InlineContent | undefined => {
  const table = getTableBlock(editor, "table-1");
  if (!table.ok) throw new Error("표 조회 실패");
  return table.value.rows[0]?.cells[0]?.content;
};

/** 한 셀짜리 표 clipboard 블록이다. */
const tableBlockWith = (content: InlineContent): ClipboardContentBlock => ({
  type: "table",
  data: {
    columnCount: 1,
    rows: [
      {
        cells: [{ columnIndex: 0, rowSpan: 1, columnSpan: 1, content }],
      },
    ],
  },
});

/** 마크 type 이름만 뽑는다. */
const markTypes = (content: InlineContent | undefined): string[] =>
  (content ?? []).flatMap((item) =>
    "marks" in item && item.marks !== undefined
      ? item.marks.map((mark) => mark.type)
      : [],
  );

describe("표 셀 안 clipboard 붙여넣기의 code와 색 마크 공존", () => {
  it("문단 블록색과 code 글자를 셀에 붙여도 문서가 스키마를 통과하고 두 마크가 남는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");

    const result = pasteClipboardContent(
      editor,
      [
        {
          type: "paragraph",
          content: [{ text: "x", marks: [{ type: "code" }] }],
          textColor: BLUE,
        },
        tableBlockWith([{ text: "y" }]),
      ],
      sequentialIds("paste"),
    );

    expect(result.ok).toBe(true);
    expectSchemaValid(editor);
    expect(firstCellContent(editor)?.[0]).toEqual({
      text: "x",
      marks: [{ type: "code" }, { type: "textColor", color: BLUE }],
    });
  });

  it("표 블록 셀 content의 code와 textColor가 셀에 붙어도 스키마를 통과하고 두 마크가 남는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");

    const result = pasteClipboardContent(
      editor,
      [tableBlockWith(codeRed)],
      sequentialIds("paste"),
    );

    expect(result.ok).toBe(true);
    expectSchemaValid(editor);
    expect(markTypes(firstCellContent(editor)).sort()).toEqual([
      "code",
      "textColor",
    ]);
  });
});

describe("표 셀 안 html 붙여넣기의 code와 색 마크 공존", () => {
  it.each([
    {
      name: "`<code style=color>` 여러 블록",
      html: `<p><code style="color:${RED}">x</code></p><p>y</p>`,
      text: "x\ny",
    },
    {
      name: "`<td><code style=color>`를 가진 표",
      html: `<table><tr><td><code style="color:${RED}">x</code></td></tr></table><p>y</p>`,
      text: "x\ny",
    },
  ])(
    "셀에 html($name)을 붙여도 문서가 스키마를 통과하고 code와 색 마크가 남는다",
    ({ html, text }) => {
      const result = pasteIn(
        [
          paragraphBlock("p1", "para"),
          gridTable("t", 1, 1, ["cell"]),
          paragraphBlock("tail", "tail"),
        ],
        textSelection(inCell("t-r0c0", 4)),
        { "text/html": html, "text/plain": text },
      );

      expectSchemaValid(result.tiptap);
      const types = new Set<string>();
      result.tiptap.state.doc.descendants((node) => {
        for (const mark of node.marks) types.add(mark.type.name);
      });
      expect([...types].sort()).toEqual(["code", "textColor"]);
    },
  );
});

describe("표 밖 붙여넣기와 초기 문서 로드의 code와 색 마크 공존", () => {
  it("표 밖 clipboard 붙여넣기의 code와 색 마크 글자가 스키마를 통과한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);

    const result = pasteClipboardContent(
      editor,
      [
        {
          type: "paragraph",
          content: [
            {
              text: "x",
              marks: [
                { type: "code" },
                { type: "textColor", color: RED },
                { type: "backgroundColor", color: YELLOW },
              ],
            },
          ],
        },
        tableBlockWith([{ text: "y" }]),
      ],
      sequentialIds("paste"),
    );

    expect(result.ok).toBe(true);
    expectSchemaValid(editor);
  });

  it("code와 textColor를 가진 문단으로 초기 문서를 열어도 스키마를 통과한다", () => {
    const { tiptap } = mounted(
      documentOf({ id: "b1", type: "paragraph", content: codeRed }),
    );

    expectSchemaValid(tiptap);
  });

  it("code와 두 색 마크를 가진 표 셀로 초기 문서를 열어도 스키마를 통과한다", () => {
    const table = gridTable("t", 1, 1, [""]) as Extract<
      Block,
      { type: "table" }
    >;
    const cell = table.rows[0]?.cells[0];
    if (cell === undefined) throw new Error("fixture 준비 실패");
    cell.content = [
      {
        text: "x",
        marks: [
          { type: "code" },
          { type: "textColor", color: RED },
          { type: "backgroundColor", color: YELLOW },
        ],
      },
    ];
    const { tiptap } = mounted(documentOf(table, paragraphBlock("tail", "t")));

    expectSchemaValid(tiptap);
  });
});

describe("tiptapToModel이 code와 색 마크를 잃지 않는다", () => {
  it("초기 문서의 code+textColor 문단이 model로 돌아와도 두 마크가 남는다", () => {
    const { tiptap } = mounted(
      documentOf({ id: "b1", type: "paragraph", content: codeRed }),
    );

    const model = tiptapToModel(
      tiptap.getJSON() as TiptapJsonNode,
      0,
      sequentialIds("model"),
    );

    if (!model.ok) throw new Error(model.error.code);
    const block = model.value.blocks[0];
    const content =
      block !== undefined && "content" in block && Array.isArray(block.content)
        ? block.content
        : undefined;
    expect(markTypes(content).sort()).toEqual(["code", "textColor"]);
  });

  it("표 셀 안 붙여넣기 결과의 model 셀 content가 code와 backgroundColor 마크를 가진다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    pasteClipboardContent(
      editor,
      [
        {
          type: "paragraph",
          content: [{ text: "x", marks: [{ type: "code" }] }],
          backgroundColor: YELLOW,
        },
        tableBlockWith([{ text: "y" }]),
      ],
      sequentialIds("paste"),
    );

    expect(firstCellContent(editor)?.[0]).toEqual({
      text: "x",
      marks: [{ type: "code" }, { type: "backgroundColor", color: YELLOW }],
    });
  });
});

describe("bold와 code는 스키마가 계속 배타로 둔다", () => {
  it("bold+code 문단을 스키마로 검증하면 이전처럼 거절한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const schema = editor.schema;

    const paragraph = schema.nodes.paragraph?.create(null, [
      schema.text("x", [
        schema.marks.bold!.create(),
        schema.marks.code!.create(),
      ]),
    ]);
    expect(() => paragraph?.check()).toThrow(/Invalid collection of marks/);
  });

  it("italic·underline·strike·link도 code와 함께 있으면 스키마가 거절한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const schema = editor.schema;

    const marks = {
      italic: schema.marks.italic!.create(),
      underline: schema.marks.underline!.create(),
      strike: schema.marks.strike!.create(),
      link: schema.marks.link!.create({ href: "https://example.com" }),
    };
    for (const [name, mark] of Object.entries(marks)) {
      const paragraph = schema.nodes.paragraph?.create(null, [
        schema.text("x", [mark, schema.marks.code!.create()]),
      ]);
      expect(() => paragraph?.check(), name).toThrow(
        /Invalid collection of marks/,
      );
    }
  });
});

/** 한 문단 b1(content)을 마운트하고 문자 범위 [from, to)를 선택한다. */
const mountedParagraph = (
  content: InlineContent,
  from: number,
  to: number = from,
) => {
  const fixture = mounted(documentOf({ id: "b1", type: "paragraph", content }));
  const start = contentTextStart(fixture.tiptap, "b1");
  fixture.tiptap.commands.setTextSelection({
    from: start + from,
    to: start + to,
  });
  return fixture;
};

/** b1의 inline content를 저장 문서 형태로 읽는다. */
const contentOfB1 = (fixture: ReturnType<typeof mountedParagraph>) => {
  const block = fixture.editor.getBlock("b1");
  return block !== undefined && "content" in block ? block.content : undefined;
};

const ok = { ok: true, value: undefined };

describe("code와 색 조합의 범위 명령", () => {
  it("code+textColor 글자에 다른 textColor를 적용하면 code는 남고 색만 바뀐다", () => {
    const fixture = mountedParagraph(
      [
        {
          text: "abc",
          marks: [{ type: "code" }, { type: "textColor", color: RED }],
        },
      ],
      0,
      3,
    );

    expect(fixture.editor.commands.toggleInlineTextColor(BLUE)).toEqual(ok);

    expect(contentOfB1(fixture)).toEqual([
      {
        text: "abc",
        marks: [{ type: "code" }, { type: "textColor", color: BLUE }],
      },
    ]);
    expectSchemaValid(fixture.tiptap);
  });

  it("code 글자에 textColor와 backgroundColor를 차례로 적용하면 세 마크가 남는다", () => {
    const fixture = mountedParagraph(
      [{ text: "abc", marks: [{ type: "code" }] }],
      0,
      3,
    );

    expect(fixture.editor.commands.toggleInlineTextColor(RED)).toEqual(ok);
    expect(fixture.editor.commands.toggleInlineBackgroundColor(YELLOW)).toEqual(
      ok,
    );

    expect(contentOfB1(fixture)).toEqual([
      {
        text: "abc",
        marks: [
          { type: "code" },
          { type: "textColor", color: RED },
          { type: "backgroundColor", color: YELLOW },
        ],
      },
    ]);
    expectSchemaValid(fixture.tiptap);
  });

  it("색이 있는 평문에 toggleCode를 적용하면 색을 지우지 않고 code를 더한다", () => {
    const fixture = mountedParagraph(
      [{ text: "abc", marks: [{ type: "textColor", color: RED }] }],
      0,
      3,
    );

    expect(fixture.editor.commands.toggleCode()).toEqual(ok);

    expect(contentOfB1(fixture)).toEqual([
      {
        text: "abc",
        marks: [{ type: "code" }, { type: "textColor", color: RED }],
      },
    ]);
    expectSchemaValid(fixture.tiptap);
  });

  it("code+textColor 글자에 toggleCode를 적용하면 code만 해제하고 색은 남긴다", () => {
    const fixture = mountedParagraph(
      [
        {
          text: "abc",
          marks: [{ type: "code" }, { type: "textColor", color: RED }],
        },
      ],
      0,
      3,
    );

    expect(fixture.editor.commands.toggleCode()).toEqual(ok);

    expect(contentOfB1(fixture)).toEqual([
      { text: "abc", marks: [{ type: "textColor", color: RED }] },
    ]);
    expectSchemaValid(fixture.tiptap);
  });

  it("code+textColor 글자에서 textColor를 null로 해제하면 code는 남는다", () => {
    const fixture = mountedParagraph(
      [
        {
          text: "abc",
          marks: [{ type: "code" }, { type: "textColor", color: RED }],
        },
      ],
      0,
      3,
    );

    expect(fixture.editor.commands.toggleInlineTextColor(null)).toEqual(ok);

    expect(contentOfB1(fixture)).toEqual([
      { text: "abc", marks: [{ type: "code" }] },
    ]);
  });

  it("bold 글자에 toggleCode를 적용하면 bold가 빠지고 code만 남는다(배타 유지)", () => {
    const fixture = mountedParagraph(
      [{ text: "abc", marks: [{ type: "bold" }] }],
      0,
      3,
    );

    expect(fixture.editor.commands.toggleCode()).toEqual(ok);

    expect(contentOfB1(fixture)).toEqual([
      { text: "abc", marks: [{ type: "code" }] },
    ]);
    expectSchemaValid(fixture.tiptap);
  });
});

describe("code와 색 조합의 접힌 캐럿 명령", () => {
  it("code stored mark 위에 textColor를 더하면 허용하고 입력 글자가 두 마크를 가진다", () => {
    const fixture = mountedParagraph([{ text: "abc" }], 1);
    expect(fixture.editor.commands.toggleCaretMark("code")).toEqual(ok);

    expect(fixture.editor.commands.toggleCaretTextColor(RED)).toEqual(ok);

    expect(fixture.tiptap.state.storedMarks?.map((m) => m.type.name)).toEqual([
      "code",
      "textColor",
    ]);
    fixture.tiptap.commands.insertContent("X");
    expect(contentOfB1(fixture)).toEqual([
      { text: "a" },
      {
        text: "X",
        marks: [{ type: "code" }, { type: "textColor", color: RED }],
      },
      { text: "bc" },
    ]);
    expectSchemaValid(fixture.tiptap);
  });

  it("textColor stored mark 위에 code를 더하면 허용한다", () => {
    const fixture = mountedParagraph([{ text: "abc" }], 1);
    expect(fixture.editor.commands.toggleCaretTextColor(RED)).toEqual(ok);

    expect(fixture.editor.commands.toggleCaretMark("code")).toEqual(ok);

    expect(fixture.tiptap.state.storedMarks?.map((m) => m.type.name)).toEqual([
      "code",
      "textColor",
    ]);
  });

  it("code stored mark이면 bold는 계속 COMMAND_NOT_APPLICABLE로 거절한다", () => {
    const fixture = mountedParagraph([{ text: "abc" }], 1);
    expect(fixture.editor.commands.toggleCaretMark("code")).toEqual(ok);

    expect(fixture.editor.commands.toggleCaretMark("bold")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "toggleCaretMark" },
    });
  });

  it("code+textColor 글자 안 캐럿에서 PM 마크는 둘이고 getSelectionMarks는 code만 보고한다", () => {
    const fixture = mountedParagraph(
      [
        {
          text: "abc",
          marks: [{ type: "code" }, { type: "textColor", color: RED }],
        },
      ],
      1,
    );

    // getSelectionMarks는 기본 서식 5종만 보고한다. 색은 PM 마크로 본다.
    expect(fixture.editor.getSelectionMarks()).toEqual(["code"]);
    expect(
      fixture.tiptap.state.selection.$from.marks().map((m) => m.type.name),
    ).toEqual(["code", "textColor"]);
  });
});

describe("code와 커스텀 스타일 마크 공존", () => {
  const highlight: CustomStyleDefinition = {
    render: () => ({ className: "highlight" }),
  };

  it("code와 커스텀 스타일 마크를 가진 초기 문서가 스키마를 통과하고 두 마크가 남는다", () => {
    const editor = createEditor({
      initialDocument: documentOf({
        id: "b1",
        type: "paragraph",
        content: [
          {
            text: "abc",
            marks: [{ type: "code" }, { type: "highlight", props: { a: 1 } }],
          },
        ],
      }),
      customStyles: { highlight },
    });
    const { tiptap } = mountTiptapEditor(editor);

    expectSchemaValid(tiptap);
    expect(editor.getBlock("b1")).toMatchObject({
      content: [
        {
          text: "abc",
          marks: [{ type: "code" }, { type: "highlight", props: { a: 1 } }],
        },
      ],
    });
  });

  it("code 글자에 toggleCustomStyle을 적용해도 code가 남고 스키마를 통과한다", () => {
    const editor = createEditor({
      initialDocument: documentOf({
        id: "b1",
        type: "paragraph",
        content: [{ text: "abc", marks: [{ type: "code" }] }],
      }),
      customStyles: { highlight },
    });
    const { tiptap } = mountTiptapEditor(editor);
    const start = contentTextStart(tiptap, "b1");
    tiptap.commands.setTextSelection({ from: start, to: start + 3 });

    expect(editor.commands.toggleCustomStyle("highlight", { a: 1 })).toEqual(
      ok,
    );

    expectSchemaValid(tiptap);
    expect(editor.getBlock("b1")).toMatchObject({
      content: [
        {
          text: "abc",
          marks: [{ type: "code" }, { type: "highlight", props: { a: 1 } }],
        },
      ],
    });
  });
});
