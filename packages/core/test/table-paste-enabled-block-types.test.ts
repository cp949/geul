/**
 * enabledBlockTypes가 막은 타입이 든 클립보드를 TablePasteExtension이 가로채지 않고
 * 물러나, ClipboardPasteExtension의 text/plain 폴백(Issue #318)으로 넘어가는
 * 계약을 고정한다(Issue #328). 예전에는 표 확장이 막은 타입을 몰라
 * `TypeError: Schema is missing table/...`, `RangeError: Unknown node type: ...`를
 * 던지고 붙여넣기가 사라졌다.
 *
 * 다루는 축은 표 차단 편집기의 TSV·html 표(캐럿·범위), 평문 없는 html 표,
 * 표와 문단·목록이 섞인 html, 표 허용 편집기에서 다른 타입(제목·목록·목록 children)을
 * 막은 경우, 대조군(미지정·막은 타입 없음·허용 타입만), undo 계약이다.
 * 입력은 mock 없이 실입력으로 유발한다. 모든 케이스에서 미처리 예외와
 * onPasteRejected 호출이 없어야 한다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import type { CreateEditorOptions } from "../src/index.js";
import {
  blocksOf,
  outline,
  pasteData,
  setupPasteSelection,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  oneCellTableBlock,
  paragraphBlock,
  tableBlockIn,
} from "./editor-controller-support.js";

type EnabledBlockTypes = NonNullable<CreateEditorOptions["enabledBlockTypes"]>;

const DENY_TABLE: EnabledBlockTypes = { mode: "deny", types: ["table"] };
const DENY_QUOTE: EnabledBlockTypes = { mode: "deny", types: ["quote"] };
const DENY_HEADING: EnabledBlockTypes = { mode: "deny", types: ["heading"] };
const DENY_BULLET: EnabledBlockTypes = {
  mode: "deny",
  types: ["bulletListItem"],
};
const DENY_NUMBERED: EnabledBlockTypes = {
  mode: "deny",
  types: ["numberedListItem"],
};
const ALLOW_PARAGRAPH: EnabledBlockTypes = {
  mode: "allow",
  types: ["paragraph"],
};

// 기준 문서: first, second 두 문단.
const twoParagraphs = (): Block[] => [
  paragraphBlock("p1", "first"),
  paragraphBlock("p2", "second"),
];

// 캐럿은 first 안(fi|rst), 범위는 first 앞 3글자(fir)다.
const CARET = { id: "p1", offset: 2 };
const RANGE_START = { id: "p1", offset: 0 };
const RANGE_END = { id: "p1", offset: 3 };
const atCaret = { from: CARET };
const atRange = { from: RANGE_START, to: RANGE_END };

type Selection = { from: typeof CARET; to?: typeof CARET };

const TABLE_HTML =
  "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>";
const TSV = "a\tb\nc\td";

// 붙여넣기 한 번의 결과다. 예외·거절 통지·문서·selection을 함께 돌려준다.
type PasteResult = {
  outline: string[];
  errors: unknown[];
  rejected: unknown[];
};

const pasteOutline = (
  enabledBlockTypes: EnabledBlockTypes | undefined,
  selection: Selection,
  clipboard: Record<string, string>,
): PasteResult => {
  const rejected: unknown[] = [];
  const { editor, editable } = setupPasteSelection(
    twoParagraphs(),
    selection.from,
    selection.to,
    {
      ...(enabledBlockTypes === undefined ? {} : { enabledBlockTypes }),
      onPasteRejected: (reason) => rejected.push(reason),
    },
  );
  let errors: unknown[] = [];
  withUnhandledErrorTracking((tracked) => {
    pasteData(editable, clipboard);
    errors = [...tracked];
  });
  return { outline: outline(blocksOf(editor)), errors, rejected };
};

// 예외·거절 통지 없이 기대 outline이 나오는지 한 번에 단언한다.
const expectPlainFallback = (result: PasteResult, expected: string[]): void => {
  expect(result.errors).toEqual([]);
  expect(result.rejected).toEqual([]);
  expect(result.outline).toEqual(expected);
};

describe("표 차단 편집기는 TSV·html 표를 평문으로 폴백한다(Issue #328)", () => {
  describe("평문만 TSV", () => {
    it("캐럿에서 탭이 지워진 평문 두 줄이 들어간다", () => {
      const result = pasteOutline(DENY_TABLE, atCaret, {
        "text/plain": TSV,
      });

      expectPlainFallback(result, ["p:fiab", "p:cdrst", "p:second"]);
    });

    it("범위에서는 선택 글자가 평문으로 대체된다", () => {
      const result = pasteOutline(DENY_TABLE, atRange, {
        "text/plain": TSV,
      });

      expectPlainFallback(result, ["p:ab", "p:cdst", "p:second"]);
    });
  });

  describe("html 표와 TSV 평문", () => {
    it("캐럿에서 TSV 평문과 같은 결과다", () => {
      const result = pasteOutline(DENY_TABLE, atCaret, {
        "text/html": TABLE_HTML,
        "text/plain": TSV,
      });

      expectPlainFallback(result, ["p:fiab", "p:cdrst", "p:second"]);
    });

    it("범위에서도 TSV 평문과 같은 결과다", () => {
      const result = pasteOutline(DENY_TABLE, atRange, {
        "text/html": TABLE_HTML,
        "text/plain": TSV,
      });

      expectPlainFallback(result, ["p:ab", "p:cdst", "p:second"]);
    });
  });

  describe("평문 없는 html 표", () => {
    it("캐럿에서 문서가 그대로다", () => {
      const result = pasteOutline(DENY_TABLE, atCaret, {
        "text/html": TABLE_HTML,
      });

      expectPlainFallback(result, ["p:first", "p:second"]);
    });

    it("범위에서도 문서가 그대로다", () => {
      const result = pasteOutline(DENY_TABLE, atRange, {
        "text/html": TABLE_HTML,
      });

      expectPlainFallback(result, ["p:first", "p:second"]);
    });

    it("selection도 바뀌지 않는다", () => {
      const { editable, tiptap } = setupPasteSelection(
        twoParagraphs(),
        RANGE_START,
        RANGE_END,
        { enabledBlockTypes: DENY_TABLE },
      );
      const selection = tiptap.state.selection;

      withUnhandledErrorTracking((errors) => {
        pasteData(editable, { "text/html": TABLE_HTML });

        expect(errors).toEqual([]);
      });

      expect(tiptap.state.selection.eq(selection)).toBe(true);
    });
  });

  describe("문단과 표가 섞인 html", () => {
    const html = `<p>x</p>${TABLE_HTML}<p>y</p>`;
    const plain = "x\na\tb\nc\td\ny";

    it("캐럿에서 평문 네 줄이 들어간다", () => {
      const result = pasteOutline(DENY_TABLE, atCaret, {
        "text/html": html,
        "text/plain": plain,
      });

      expectPlainFallback(result, [
        "p:fix",
        "p:ab",
        "p:cd",
        "p:yrst",
        "p:second",
      ]);
    });

    it("범위에서는 선택 글자가 평문으로 대체된다", () => {
      const result = pasteOutline(DENY_TABLE, atRange, {
        "text/html": html,
        "text/plain": plain,
      });

      expectPlainFallback(result, ["p:x", "p:ab", "p:cd", "p:yst", "p:second"]);
    });
  });
});

describe("allow 모드에서 문단·표·목록이 섞인 html은 평문으로 폴백한다(Issue #328)", () => {
  const html = `<p>x</p>${TABLE_HTML}<ul><li>l</li></ul>`;
  const plain = "x\na\tb\nc\td\nl";

  it("캐럿에서 평문 네 줄이 들어간다", () => {
    const result = pasteOutline(ALLOW_PARAGRAPH, atCaret, {
      "text/html": html,
      "text/plain": plain,
    });

    expectPlainFallback(result, [
      "p:fix",
      "p:ab",
      "p:cd",
      "p:lrst",
      "p:second",
    ]);
  });

  it("범위에서는 선택 글자가 평문으로 대체된다", () => {
    const result = pasteOutline(ALLOW_PARAGRAPH, atRange, {
      "text/html": html,
      "text/plain": plain,
    });

    expectPlainFallback(result, ["p:x", "p:ab", "p:cd", "p:lst", "p:second"]);
  });
});

describe("표를 허용해도 다른 막은 타입이 섞이면 표까지 평문으로 폴백한다(Issue #328)", () => {
  it("deny heading이면 제목과 표가 든 html이 평문으로 들어간다", () => {
    const result = pasteOutline(DENY_HEADING, atCaret, {
      "text/html": `<h1>x</h1>${TABLE_HTML}`,
      "text/plain": "x\na\tb\nc\td",
    });

    expectPlainFallback(result, ["p:fix", "p:ab", "p:cdrst", "p:second"]);
  });

  it("deny bulletListItem이면 목록과 표가 든 html이 평문으로 들어간다", () => {
    const result = pasteOutline(DENY_BULLET, atCaret, {
      "text/html": `<ul><li>l</li></ul>${TABLE_HTML}`,
      "text/plain": "l\na\tb\nc\td",
    });

    expectPlainFallback(result, ["p:fil", "p:ab", "p:cdrst", "p:second"]);
  });

  it("deny numberedListItem이면 목록 항목 children 안의 번호 목록도 걸러 평문으로 들어간다", () => {
    const result = pasteOutline(DENY_NUMBERED, atCaret, {
      "text/html": `<ul><li>a<ol><li>b</li></ol></li></ul>${TABLE_HTML}`,
      "text/plain": "a\nb\na\tb\nc\td",
    });

    expectPlainFallback(result, [
      "p:fia",
      "p:b",
      "p:ab",
      "p:cdrst",
      "p:second",
    ]);
  });
});

describe("대조군", () => {
  it("enabledBlockTypes 미지정이면 TSV가 표 블록이 된다", () => {
    const result = pasteOutline(undefined, atCaret, { "text/plain": TSV });

    expect(result.errors).toEqual([]);
    expect(result.outline).toEqual(["p:first", "table:", "p:second"]);
  });

  it("enabledBlockTypes 미지정이면 html 표가 표 블록이 된다", () => {
    const result = pasteOutline(undefined, atCaret, {
      "text/html": TABLE_HTML,
      "text/plain": TSV,
    });

    expect(result.errors).toEqual([]);
    expect(result.outline).toEqual(["p:first", "table:", "p:second"]);
  });

  it("표를 허용하고 입력에 없는 quote만 막으면 표가 블록으로 들어간다", () => {
    const result = pasteOutline(DENY_QUOTE, atCaret, {
      "text/html": TABLE_HTML,
      "text/plain": TSV,
    });

    expect(result.errors).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.outline).toEqual(["p:first", "table:", "p:second"]);
  });

  it("허용 타입만 든 문단+표 혼합 html은 문단과 표로 들어간다", () => {
    const result = pasteOutline(DENY_QUOTE, atCaret, {
      "text/html": `<p>x</p>${TABLE_HTML}`,
      "text/plain": "x\na\tb\nc\td",
    });

    expect(result.errors).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.outline).toEqual(["p:first", "p:x", "table:", "p:second"]);
  });
});

describe("파서가 거절하는 큰 TSV도 표 차단 편집기에서는 평문으로 폴백한다(Issue #328)", () => {
  it("표 차단이면 파싱 전에 물러나 onPasteRejected 없이 평문이 들어간다", () => {
    // 열 수가 표 한도(MAX_TABLE_COLUMNS 10,000)를 넘어 파서가
    // CLIPBOARD_TABLE_INVALID로 거절하는 한 줄 TSV다.
    const wideTsv = Array.from({ length: 10_001 }, () => "a").join("\t");

    const result = pasteOutline(DENY_TABLE, atCaret, { "text/plain": wideTsv });

    expect(result.errors).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.outline).toEqual([
      `p:fi${"a".repeat(10_001)}rst`,
      "p:second",
    ]);
  });
});

describe("표 셀 안 캐럿은 막은 타입이 있어도 이전처럼 격자에 채운다(Issue #328)", () => {
  // 셀 안은 격자 연산만 해서 PM 제목·목록 노드를 만들지 않는다. 막은 타입 검사로
  // 물러나면 평문 폴백도 없이 붙여넣기가 사라진다.
  const cellTexts = (editor: Parameters<typeof blocksOf>[0]): string[][] =>
    tableBlockIn(editor.getDocument()).rows.map((row) =>
      row.cells.map((cell) =>
        cell.content.map((item) => ("text" in item ? item.text : "")).join(""),
      ),
    );

  const pasteIntoCell = (
    enabledBlockTypes: EnabledBlockTypes,
    clipboard: Record<string, string>,
  ) => {
    const rejected: unknown[] = [];
    const { editor, editable, tiptap } = setupPasteSelection(
      [paragraphBlock("p1", "first"), oneCellTableBlock("t1")],
      CARET,
      CARET,
      {
        enabledBlockTypes,
        onPasteRejected: (reason) => rejected.push(reason),
      },
    );
    let cellPos = -1;
    tiptap.state.doc.descendants((node, pos) => {
      if (cellPos === -1 && node.type.name === "tableCell") cellPos = pos;
      return cellPos === -1;
    });
    tiptap.commands.setTextSelection(cellPos + 1);
    let errors: unknown[] = [];
    withUnhandledErrorTracking((tracked) => {
      pasteData(editable, clipboard);
      errors = [...tracked];
    });
    return { cells: cellTexts(editor), errors, rejected };
  };

  it("deny heading이어도 제목이 든 html 표가 셀 격자에 채워진다", () => {
    const result = pasteIntoCell(DENY_HEADING, {
      "text/html": `<h1>x</h1>${TABLE_HTML}`,
      "text/plain": `x\n${TSV}`,
    });

    expect(result.errors).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.cells).toEqual([
      ["x\na", "b"],
      ["c", "d"],
    ]);
  });

  it("deny bulletListItem이어도 목록이 든 html 표가 셀 격자에 채워진다", () => {
    const result = pasteIntoCell(DENY_BULLET, {
      "text/html": `<ul><li>l</li></ul>${TABLE_HTML}`,
      "text/plain": `l\n${TSV}`,
    });

    expect(result.errors).toEqual([]);
    expect(result.rejected).toEqual([]);
    // 목록 항목은 셀 줄이 되어 막은 타입을 문서에 만들지 않는다(Issue #345).
    expect(result.cells).toEqual([
      ["l\na", "b"],
      ["c", "d"],
    ]);
  });
});

describe("undo 계약", () => {
  const cases: {
    name: string;
    selection: Selection;
    clipboard: Record<string, string>;
    changesDocument: boolean;
  }[] = [
    {
      name: "평문 없는 html 표(캐럿)",
      selection: atCaret,
      changesDocument: false,
      clipboard: { "text/html": TABLE_HTML },
    },
    {
      name: "평문 없는 html 표(범위)",
      selection: atRange,
      changesDocument: false,
      clipboard: { "text/html": TABLE_HTML },
    },
    {
      name: "문단·표 혼합 폴백(캐럿)",
      selection: atCaret,
      changesDocument: true,
      clipboard: {
        "text/html": `<p>x</p>${TABLE_HTML}<p>y</p>`,
        "text/plain": "x\na\tb\nc\td\ny",
      },
    },
    {
      name: "문단·표 혼합 폴백(범위)",
      selection: atRange,
      changesDocument: true,
      clipboard: {
        "text/html": `<p>x</p>${TABLE_HTML}<p>y</p>`,
        "text/plain": "x\na\tb\nc\td\ny",
      },
    },
  ];

  it.each(cases)(
    "$name: undo 1회로 문서와 selection이 붙여넣기 전으로 돌아간다",
    ({ selection, clipboard, changesDocument }) => {
      const { editor, editable, tiptap } = setupPasteSelection(
        twoParagraphs(),
        selection.from,
        selection.to,
        { enabledBlockTypes: DENY_TABLE },
      );
      const before = outline(blocksOf(editor));
      const selectionBefore = tiptap.state.selection;

      pasteData(editable, clipboard);

      // 폴백이 실제로 문서를 바꿨는지 먼저 확인해 undo 단언이 헛돌지 않게 한다.
      expect(outline(blocksOf(editor)).join("|") !== before.join("|")).toBe(
        changesDocument,
      );
      tiptap.commands.undo();

      expect(outline(blocksOf(editor))).toEqual(before);
      expect(tiptap.state.selection.eq(selectionBefore)).toBe(true);
    },
  );
});
