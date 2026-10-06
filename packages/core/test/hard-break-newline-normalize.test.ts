/**
 * hardBreak를 받는 textblock에 남은 리터럴 `\n` text를 hardBreak로 바꾸는
 * 정규화 appendTransaction을 고정한다(Issue #281).
 *
 * paragraph·heading·quote·목록 항목·callout·표 셀은 content가 "inline*"라
 * 개행을 hardBreak 노드로 담아야 한다. codeBlock 텍스트가 범위 삭제·붙여넣기·
 * 끌어 옮기기로 이 블록들에 들어오면 리터럴 `\n` text가 남았다. 화면은 한
 * 줄이고 export는 두 줄이며 다음 입력에서 개행이 공백으로 바뀌었다.
 *
 * 다루는 축:
 * - 변환 결과와 mark 보존, 부모별 적용 범위(codeBlock 제외).
 * - 문자 입력·Backspace·Delete·Enter·deleteSelection·paste·끌어 옮기기·
 *   setText 경로.
 * - revision 1회·undo 1회(G-EDT-001)와 캐럿 위치 보존.
 * - 탐색 범위가 이번 트랜잭션이 바꾼 textblock으로 한정되는 구조(PIT-0034:
 *   시간 상한 대신 순회 대상 수로 판정한다).
 */
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import {
  changedInlineParentPositions,
  normalizeLiteralNewlines,
} from "../src/hard-break-newline-normalize-extension.js";
import {
  containerOf,
  contentTextStart,
  dispatchKeydown,
  inlineShape,
  literalNewlineTexts,
  typeNativeText,
} from "./block-test-support.js";
import { expectSchemaValid } from "./block-join/block-join-test-support.js";
import { pasteData } from "./clipboard-test-support.js";
import {
  calloutBlock,
  codeBlockBlock,
  documentOf,
  headingBlock,
  listItemBlock,
  mounted,
  oneCellTableBlock,
  paragraphBlock,
  quoteBlock,
} from "./editor-controller-support.js";

/** blockId 컨테이너의 콘텐츠 노드(첫 자식). 없으면 던진다. */
const contentOf = (
  tiptap: Pick<TiptapEditor, "state">,
  blockId: string,
): PmNode => {
  const content = containerOf(tiptap, blockId).firstChild;
  if (content === null) throw new Error(`blockContainer ${blockId} 내용 없음`);
  return content;
};

/** 표 첫 셀의 inline 텍스트 시작 위치. */
const firstCellTextStart = (tiptap: Pick<TiptapEditor, "state">): number => {
  let found: number | null = null;
  tiptap.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "tableCell") {
      found = pos + 1;
      return false;
    }
    return true;
  });
  if (found === null) throw new Error("tableCell 조회 실패");
  return found;
};

describe("리터럴 개행 정규화", () => {
  it('문단에 tr.insertText("x\\ny")를 넣으면 리터럴 개행 text 없이 x·hardBreak·y가 된다', () => {
    const { tiptap } = mounted(documentOf(paragraphBlock("p1", "ab")));
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p1") + 2);

    tiptap.view.dispatch(tiptap.state.tr.insertText("x\ny"));

    expect(literalNewlineTexts(tiptap.state.doc)).toEqual([]);
    expect(inlineShape(contentOf(tiptap, "p1"))).toEqual([
      "abx",
      "<hardBreak>",
      "y",
    ]);
    expectSchemaValid(tiptap);
  });

  it("mark가 있는 text는 앞뒤 조각과 hardBreak가 같은 mark를 갖고 export는 한 런 그대로다", () => {
    const { editor, tiptap } = mounted(documentOf(paragraphBlock("p1", "")));
    const bold = tiptap.schema.marks.bold;
    if (bold === undefined) throw new Error("bold mark 조회 실패");
    const start = contentTextStart(tiptap, "p1");

    tiptap.view.dispatch(
      tiptap.state.tr.insert(
        start,
        tiptap.schema.text("x\ny", [bold.create()]),
      ),
    );

    const paragraph = contentOf(tiptap, "p1");
    expect(inlineShape(paragraph)).toEqual(["x", "<hardBreak>", "y"]);
    paragraph.forEach((child) => {
      expect(child.marks.map((mark) => mark.type.name)).toEqual(["bold"]);
    });
    expect(editor.getDocument().blocks).toEqual([
      {
        id: "p1",
        type: "paragraph",
        content: [{ text: "x\ny", marks: [{ type: "bold" }] }],
      },
    ]);
  });

  it("연속 개행은 빈 text를 만들지 않고 hardBreak만 잇는다", () => {
    const { tiptap } = mounted(documentOf(paragraphBlock("p1", "")));
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p1"));

    tiptap.view.dispatch(tiptap.state.tr.insertText("\nx\n\n"));

    expect(inlineShape(contentOf(tiptap, "p1"))).toEqual([
      "<hardBreak>",
      "x",
      "<hardBreak>",
      "<hardBreak>",
    ]);
  });
});

describe("정규화 적용 범위", () => {
  it("codeBlock 안 리터럴 개행은 그대로 둔다(GREEN 유지 대상)", () => {
    const { tiptap } = mounted(
      documentOf(codeBlockBlock("code1", "ab"), paragraphBlock("tail", "t")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "code1") + 2);

    tiptap.view.dispatch(tiptap.state.tr.insertText("x\ny"));

    expect(inlineShape(contentOf(tiptap, "code1"))).toEqual(["abx\ny"]);
  });

  it.each([
    ["heading", () => headingBlock("t1", 1, "ab")],
    ["quote", () => quoteBlock("t1", "ab")],
    ["bulletListItem", () => listItemBlock("t1", "bulletListItem", "ab")],
    ["callout", () => calloutBlock("t1", "ab")],
  ] as const)(
    "%s는 hardBreak를 받으므로 리터럴 개행을 hardBreak로 바꾼다(RED 대상)",
    (_label, makeBlock) => {
      const { tiptap } = mounted(
        documentOf(makeBlock(), paragraphBlock("tail", "t")),
      );
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "t1") + 2);

      tiptap.view.dispatch(tiptap.state.tr.insertText("x\ny"));

      expect(literalNewlineTexts(tiptap.state.doc)).toEqual([]);
      expect(inlineShape(contentOf(tiptap, "t1"))).toEqual([
        "abx",
        "<hardBreak>",
        "y",
      ]);
    },
  );

  it("표 셀은 hardBreak를 받으므로 리터럴 개행을 hardBreak로 바꾼다(RED 대상)", () => {
    const { tiptap } = mounted(
      documentOf(oneCellTableBlock("table1"), paragraphBlock("tail", "t")),
    );
    tiptap.commands.setTextSelection(firstCellTextStart(tiptap));

    tiptap.view.dispatch(tiptap.state.tr.insertText("x\ny"));

    expect(literalNewlineTexts(tiptap.state.doc)).toEqual([]);
    expectSchemaValid(tiptap);
  });
});

/**
 * 문단 "abcd"의 "ab" 뒤부터 codeBlock "foo\nbar"의 "fo" 뒤까지 범위를 잡은
 * 문서. codeBlock 꼬리 "o\nbar"가 문단으로 들어오는 경로의 공통 배치다.
 */
const rangeIntoCodeBlock = () => {
  const harness = mounted(
    documentOf(
      paragraphBlock("p1", "abcd"),
      codeBlockBlock("code1", "foo\nbar"),
      paragraphBlock("tail", "tail"),
    ),
  );
  const { tiptap } = harness;
  tiptap.commands.setTextSelection({
    from: contentTextStart(tiptap, "p1") + 2,
    to: contentTextStart(tiptap, "code1") + 2,
  });
  return harness;
};

describe("문단 중간–codeBlock 중간 범위 경로", () => {
  it.each([
    [
      "문자 입력",
      (h: ReturnType<typeof rangeIntoCodeBlock>) => {
        typeNativeText(h.tiptap, "Z");
      },
    ],
    [
      "Backspace",
      (h: ReturnType<typeof rangeIntoCodeBlock>) => {
        dispatchKeydown(h.tiptap, "Backspace");
      },
    ],
    [
      "Delete",
      (h: ReturnType<typeof rangeIntoCodeBlock>) => {
        dispatchKeydown(h.tiptap, "Delete");
      },
    ],
    [
      "Enter",
      (h: ReturnType<typeof rangeIntoCodeBlock>) => {
        dispatchKeydown(h.tiptap, "Enter");
      },
    ],
    [
      "deleteSelection",
      (h: ReturnType<typeof rangeIntoCodeBlock>) => {
        h.tiptap.commands.deleteSelection();
      },
    ],
    [
      'paste "X"',
      (h: ReturnType<typeof rangeIntoCodeBlock>) => {
        pasteData(h.editable, { "text/plain": "X" });
      },
    ],
    [
      'paste "X\\nY"',
      (h: ReturnType<typeof rangeIntoCodeBlock>) => {
        pasteData(h.editable, { "text/plain": "X\nY" });
      },
    ],
  ] as const)("%s 결과에 리터럴 개행 text가 없다", (_label, act) => {
    const harness = rangeIntoCodeBlock();

    act(harness);

    expect(literalNewlineTexts(harness.tiptap.state.doc)).toEqual([]);
    expectSchemaValid(harness.tiptap);
  });

  it("codeBlock 조각을 문단으로 끌어 옮겨도 리터럴 개행 text가 남지 않는다", () => {
    const { tiptap } = mounted(
      documentOf(
        paragraphBlock("p1", "abcd"),
        codeBlockBlock("code1", "foo\nbar"),
        paragraphBlock("tail", "tail"),
      ),
    );
    const sourceFrom = contentTextStart(tiptap, "code1") + 2;
    const sourceTo = sourceFrom + "o\nb".length;
    const target = contentTextStart(tiptap, "p1") + 2;
    const slice = tiptap.state.doc.slice(sourceFrom, sourceTo);

    // drop과 같은 순서다. 대상이 원본보다 앞이라 삽입 뒤 원본 범위를 매핑해 지운다.
    const tr = tiptap.state.tr.replaceRange(target, target, slice);
    tr.delete(tr.mapping.map(sourceFrom), tr.mapping.map(sourceTo));
    tiptap.view.dispatch(tr);

    expect(literalNewlineTexts(tiptap.state.doc)).toEqual([]);
    expect(inlineShape(contentOf(tiptap, "code1"))).toEqual(["foar"]);
    expectSchemaValid(tiptap);
  });

  it('setText("p1", "x\\ny")도 x·hardBreak·y가 된다', () => {
    const { editor, tiptap } = mounted(documentOf(paragraphBlock("p1", "ab")));

    expect(editor.commands.setText("p1", "x\ny")).toEqual({
      ok: true,
      value: undefined,
    });

    expect(inlineShape(contentOf(tiptap, "p1"))).toEqual([
      "x",
      "<hardBreak>",
      "y",
    ]);
  });
});

describe("정규화 원자성과 캐럿", () => {
  it('tr.insertText("x\\ny")는 revision 1회·undo 1회로 원래 문서에 돌아간다', () => {
    const { editor, changes, tiptap } = mounted(
      documentOf(paragraphBlock("p1", "ab")),
    );
    const beforeJson = tiptap.state.doc.toJSON();
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p1") + 2);

    tiptap.view.dispatch(tiptap.state.tr.insertText("x\ny"));

    expect(editor.getDocument().revision).toBe(1);
    expect(changes).toHaveLength(1);
    expect(literalNewlineTexts(tiptap.state.doc)).toEqual([]);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("범위 Backspace는 revision 1회·undo 1회로 원래 문서에 돌아간다", () => {
    const { editor, changes, tiptap } = rangeIntoCodeBlock();
    const beforeJson = tiptap.state.doc.toJSON();

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(editor.getDocument().revision).toBe(1);
    expect(changes).toHaveLength(1);
    expect(literalNewlineTexts(tiptap.state.doc)).toEqual([]);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("문단 중간 삽입 뒤 캐럿은 삽입한 y 뒤라 다음 글자가 y와 b 사이에 들어간다", () => {
    const { tiptap } = mounted(documentOf(paragraphBlock("p1", "ab")));
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p1") + 1);

    tiptap.view.dispatch(tiptap.state.tr.insertText("x\ny"));
    typeNativeText(tiptap, "Z");

    expect(inlineShape(contentOf(tiptap, "p1"))).toEqual([
      "ax",
      "<hardBreak>",
      "yZb",
    ]);
  });

  it("범위 Backspace 뒤 캐럿은 접합점이라 다음 글자가 ab와 o 사이에 들어간다", () => {
    const { tiptap } = rangeIntoCodeBlock();

    dispatchKeydown(tiptap, "Backspace");
    typeNativeText(tiptap, "Z");

    expect(inlineShape(contentOf(tiptap, "p1"))).toEqual([
      "abZo",
      "<hardBreak>",
      "bar",
    ]);
  });
});

describe("정규화 탐색 범위", () => {
  it("한 문단 타이핑은 바뀐 그 textblock 하나만 탐색 대상으로 돌려준다", () => {
    const { tiptap } = mounted(
      documentOf(
        ...Array.from({ length: 200 }, (_, index) =>
          paragraphBlock(`p${String(index)}`, `text ${String(index)}`),
        ),
      ),
    );
    const target = contentTextStart(tiptap, "p100");
    const state = EditorState.create({ doc: tiptap.state.doc });
    const tr = state.tr.insertText("Z", target);

    const positions = changedInlineParentPositions(tr.doc, [tr]);

    expect(positions).toEqual([target - 1]);
  });

  it("여러 트랜잭션의 바뀐 범위를 마지막 문서 좌표로 합친다", () => {
    const { tiptap } = mounted(
      documentOf(
        paragraphBlock("p0", "aa"),
        paragraphBlock("p1", "bb"),
        paragraphBlock("p2", "cc"),
      ),
    );
    const state = EditorState.create({ doc: tiptap.state.doc });
    const first = state.tr.insertText("XYZ", contentTextStart(tiptap, "p0"));
    const second = state
      .apply(first)
      .tr.insertText("Q", contentTextStart(tiptap, "p2") + "XYZ".length);

    const positions = changedInlineParentPositions(second.doc, [first, second]);

    expect(positions).toEqual([
      contentTextStart(tiptap, "p0") - 1,
      contentTextStart(tiptap, "p2") - 1 + "XYZ".length,
    ]);
  });

  it("정규화 본체는 바뀌지 않은 문단의 리터럴 개행을 건드리지 않고 바뀐 문단만 바꾼다", () => {
    const { tiptap } = mounted(
      documentOf(
        ...Array.from({ length: 50 }, (_, index) =>
          paragraphBlock(`p${String(index)}`, `text ${String(index)}`),
        ),
      ),
    );
    // 정규화 플러그인이 없는 상태에서 p0에 리터럴 개행을 심는다.
    const base = EditorState.create({ doc: tiptap.state.doc });
    const seeded = base.apply(
      base.tr.insertText("a\nb", contentTextStart(tiptap, "p0")),
    );
    const typeAt = (blockId: string) =>
      seeded.tr.insertText("Z", contentTextStart({ state: seeded }, blockId));

    const typedElsewhere = typeAt("p25");
    const untouched = normalizeLiteralNewlines(
      [typedElsewhere],
      seeded.apply(typedElsewhere),
    );
    const typedInSeeded = typeAt("p0");
    const normalized = normalizeLiteralNewlines(
      [typedInSeeded],
      seeded.apply(typedInSeeded),
    );

    expect(untouched).toBeNull();
    expect(normalized).not.toBeNull();
    expect(
      literalNewlineTexts((normalized as NonNullable<typeof normalized>).doc),
    ).toEqual([]);
  });
});

describe("정규화 mark와 storedMarks", () => {
  it.each([
    ["bold", {}],
    ["italic", {}],
    ["code", {}],
    ["link", { href: "https://example.com" }],
  ] as const)(
    "%s mark text의 리터럴 개행은 양쪽 조각과 hardBreak가 같은 mark를 갖는 유효한 문서가 된다",
    (markName, attrs) => {
      const { tiptap } = mounted(documentOf(paragraphBlock("p0", "x")));
      const { schema } = tiptap.state;
      const mark = schema.marks[markName]?.create(attrs);
      if (mark === undefined) throw new Error(`${markName} mark 없음`);
      const base = EditorState.create({ doc: tiptap.state.doc });
      const tr = base.tr.replaceWith(
        contentTextStart(tiptap, "p0"),
        contentTextStart(tiptap, "p0"),
        schema.text("a\nb", [mark]),
      );

      const normalized = normalizeLiteralNewlines([tr], base.apply(tr));

      if (normalized === null) throw new Error("정규화 트랜잭션이 없다");
      normalized.doc.check();
      const paragraph = normalized.doc.firstChild?.firstChild;
      expect(inlineShape(paragraph)).toEqual(["a", "<hardBreak>", "b", "x"]);
      expect(
        [0, 1, 2, 3].map((index) =>
          paragraph?.child(index).marks.map((m) => m.type.name),
        ),
      ).toEqual([[markName], [markName], [markName], []]);
    },
  );

  it("storedMarks를 정규화 뒤에도 유지한다", () => {
    const { tiptap } = mounted(documentOf(paragraphBlock("p0", "x")));
    const { schema } = tiptap.state;
    const bold = schema.marks.bold?.create();
    if (bold === undefined) throw new Error("bold mark 없음");
    const base = EditorState.create({ doc: tiptap.state.doc });
    const tr = base.tr
      .insertText("a\nb", contentTextStart(tiptap, "p0"))
      .setStoredMarks([bold]);
    const applied = base.apply(tr);

    const normalized = normalizeLiteralNewlines([tr], applied);

    if (normalized === null) throw new Error("정규화 트랜잭션이 없다");
    expect(applied.apply(normalized).storedMarks).toEqual([bold]);
  });
});
