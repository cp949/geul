/**
 * 표 경계에 걸친 범위 선택의 Enter·Backspace·Delete 계약을 확인한다
 * (Issue #289).
 *
 * 경계 범위는 비어 있지 않은 TextSelection이고 $from과 $to가 속한 표가
 * 서로 다른 범위다. 한쪽만 표 안이거나 서로 다른 두 표 안이다. 같은 표
 * 안 범위, CellSelection, 양 끝이 표 밖인 범위(표를 완전히 감싸는 범위
 * 포함)는 대상이 아니라 현행 동작을 유지한다.
 *
 * Enter는 키만 소비한다. 문서·selection·dispatch가 불변이다. 이전에는
 * 표 셀 content가 "inline*"라 분할할 위치가 없어 예외를 던지거나 표가
 * 사라졌다.
 *
 * Backspace·Delete는 두 구간을 각각 지운다. 표 안은 셀 텍스트만 지우고
 * 셀·행·열 구조를 유지한다. 표 밖은 일반 삭제라 사이 블록·사이 표가
 * 사라지고 끝 블록은 텍스트만 줄어 남는다. 한 tr·dispatch 1회라 undo
 * 1회로 원복한다. 수식 키(Mod-Backspace·Mod-Delete)도 같은 결과다.
 *
 * 역방향 stale(DOM 캐럿은 경계 범위 밖이고 live selection만 경계 범위)에서
 * Backspace·Delete는 키를 소비하고 문서를 바꾸지 않는다. 폴스루하면 Tiptap
 * 기본 삭제가 live 범위에 적용돼 선택하지 않은 텍스트가 셀로 옮겨 갔다.
 * Enter는 DOM 캐럿 위치를 파생 기준으로 처리한다(G-EDT-002).
 *
 * 끝 블록이 상위 블록의 자식이고 상위 블록의 라벨이 범위에 들면 상위 블록이
 * 빈 paragraph가 되는 알려진 한계를 한 건으로 고정한다.
 *
 * 키 소비는 view.someProp("handleKeyDown", ...) 실 디스패치로 검증한다.
 * 실제 확장 세트(createEditor + mountTiptapEditor)를 쓴다. 실제 DOM
 * 선택과 키 입력은 e2e/table-boundary-range.spec.ts가 증명한다.
 */
import type {
  Block,
  DocumentBlock,
  InlineContent,
  TableBlock,
} from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import {
  contentTextStart,
  dispatchKeydown,
  dispatchModifiedKeydown,
} from "../block-test-support.js";
import {
  calloutBlock,
  codeBlockBlock,
  documentOf,
  editorState,
  headingBlock,
  listItemBlock,
  mounted,
  notApplicable,
  okResult,
  paragraphBlock,
  quoteBlock,
  toggleBlock,
} from "../editor-controller-support.js";
import {
  withNativeSelection,
  withoutScrollCrash,
} from "../native-selection-test-support.js";
import {
  findCellBoundaryPosition,
  selectCellRange,
} from "../table-test-support.js";
import { expectSchemaValid } from "./block-join-test-support.js";

/** 편집기 상태에서 위치를 구하는 함수. 마운트 뒤에야 위치를 알 수 있다. */
type Pos = (tiptap: TiptapEditor) => number;

/**
 * 인라인 콘텐츠를 문자열로 합친다. 텍스트 런이 아닌 원소는 "?"로 둔다.
 */
const inlineText = (content: InlineContent): string =>
  content.map((item) => ("text" in item ? item.text : "?")).join("");

/**
 * 블록 하나를 비교용 문자열로 줄인다. 표는 `table[행/행]`, 행은 셀을 `|`로
 * 잇는다. 자식은 `>{...}`로 덧붙인다. 병합 셀은 spans 인자가 있을 때만
 * `셀@행스팬x열스팬`으로 적는다.
 */
const describeBlock = (block: DocumentBlock, withSpans = false): string => {
  if (block.type === "table") {
    const rows = (block as TableBlock).rows.map((row) =>
      row.cells
        .map(
          (cell) =>
            `${inlineText(cell.content)}${
              withSpans ? `@${cell.rowSpan}x${cell.columnSpan}` : ""
            }`,
        )
        .join("|"),
    );
    return `table[${rows.join("/")}]`;
  }
  const body =
    "content" in block && Array.isArray(block.content)
      ? inlineText(block.content)
      : "";
  const children =
    "children" in block && block.children !== undefined
      ? `>{${block.children.map((child) => describeBlock(child)).join(",")}}`
      : "";
  return `${block.type}:${body}${children}`;
};

/** 문서 최상위 블록을 비교용 문자열 목록으로 줄인다. */
const outline = (
  blocks: readonly DocumentBlock[],
  withSpans = false,
): string[] => blocks.map((block) => describeBlock(block, withSpans));

/**
 * rows x columns 격자 표 블록. 셀 id는 `<id>-r<행>c<열>`이고 텍스트는
 * 기본 `c<행><열>`이다. texts를 주면 행 우선 순서로 대체한다.
 */
const gridTable = (
  id: string,
  rows: number,
  columns: number,
  texts?: readonly string[],
): Block => ({
  id,
  type: "table",
  columns: Array.from({ length: columns }, (_, c) => ({
    id: `${id}-col${c}`,
    width: 100,
  })),
  rows: Array.from({ length: rows }, (_, r) => ({
    id: `${id}-row${r}`,
    cells: Array.from({ length: columns }, (_, c) => {
      const text = texts?.[r * columns + c] ?? `c${r}${c}`;
      return {
        id: `${id}-r${r}c${c}`,
        columnId: `${id}-col${c}`,
        rowSpan: 1,
        columnSpan: 1,
        content: text === "" ? [] : [{ text }],
      };
    }),
  })),
  headerRows: 0,
  headerColumns: 0,
});

/** 1x1 표. 셀 텍스트를 직접 정한다. 셀 id는 `<id>-r0c0`이다. */
const singleCellTable = (id: string, text: string): Block =>
  gridTable(id, 1, 1, [text]);

/**
 * 3x3 병합 표. 격자는 docWithMergedTable과 같다. 셀 텍스트는 셀 id다.
 *
 *   row-1: m-1 | m-2 | m-3
 *   row-2: m-1 | m-4 | m-4   (m-1은 rowSpan 2, m-4는 columnSpan 2)
 *   row-3: m-5 | m-6 | m-7
 */
const mergedTable = (): Block => {
  const cell = (
    id: string,
    columnId: string,
    spans: { rowSpan?: number; columnSpan?: number } = {},
  ) => ({
    id,
    columnId,
    rowSpan: spans.rowSpan ?? 1,
    columnSpan: spans.columnSpan ?? 1,
    content: [{ text: id }],
  });
  return {
    id: "mt",
    type: "table",
    columns: [
      { id: "col-1", width: 100 },
      { id: "col-2", width: 100 },
      { id: "col-3", width: 100 },
    ],
    rows: [
      {
        id: "row-1",
        cells: [
          cell("m-1", "col-1", { rowSpan: 2 }),
          cell("m-2", "col-2"),
          cell("m-3", "col-3"),
        ],
      },
      { id: "row-2", cells: [cell("m-4", "col-2", { columnSpan: 2 })] },
      {
        id: "row-3",
        cells: [
          cell("m-5", "col-1"),
          cell("m-6", "col-2"),
          cell("m-7", "col-3"),
        ],
      },
    ],
    headerRows: 0,
    headerColumns: 0,
  };
};

/** 표로 끝나는 문서는 로드 때 trailing 문단이 붙는다. 명시해 잡음을 없앤다. */
const TAIL = paragraphBlock("tail", "tail");

/**
 * 셀 내용 시작 위치 + offset. 셀 순회는 table-test-support의
 * findCellBoundaryPosition이 소유한다. 그 값은 셀 경계라 내용은 +1이다.
 */
const inCell =
  (cellId: string, offset: number): Pos =>
  (tiptap) => {
    const boundary = findCellBoundaryPosition(tiptap, cellId);
    if (boundary === null) throw new Error(`tableCell ${cellId} 조회 실패`);
    return boundary + 1 + offset;
  };

/** 블록 텍스트 시작 위치 + offset. */
const inBlock =
  (blockId: string, offset: number): Pos =>
  (tiptap) =>
    contentTextStart(tiptap, blockId) + offset;

interface RunResult extends ReturnType<typeof mounted> {
  readonly handled: boolean;
  readonly dispatchCount: number;
  readonly before: ReturnType<typeof editorState>;
  readonly anchor: number;
  readonly head: number;
}

/**
 * 문서를 마운트하고 anchor→head TextSelection을 둔 뒤 press를 실행한다.
 * 키 소비 여부와 view.dispatch 호출 횟수를 함께 돌려준다.
 */
const run = (
  blocks: Block[],
  from: Pos,
  to: Pos,
  press: (tiptap: TiptapEditor) => boolean,
): RunResult => {
  const m = mounted(documentOf(...blocks));
  const { tiptap } = m;
  const anchor = from(tiptap);
  const head = to(tiptap);
  tiptap.view.dispatch(
    tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, anchor, head),
    ),
  );
  const before = editorState(m.editor, tiptap);
  const changesBefore = m.changes.length;
  const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");
  let handled: boolean;
  let dispatchCount: number;
  try {
    handled = press(tiptap);
    dispatchCount = dispatchSpy.mock.calls.length;
  } finally {
    dispatchSpy.mockRestore();
  }
  return {
    ...m,
    handled,
    dispatchCount,
    before,
    anchor,
    head,
    changes: m.changes.slice(changesBefore),
  } as RunResult;
};

/** 키 소비만 하고 문서·selection·dispatch가 불변임을 단언한다. */
const expectNoOpConsumed = (result: RunResult): void => {
  expect(result.handled).toBe(true);
  expect(result.dispatchCount).toBe(0);
  expect(result.changes).toHaveLength(0);
  expect(editorState(result.editor, result.tiptap)).toEqual(result.before);
};

/**
 * undo 뒤 문서 블록과 selection이 실행 전과 같음을 단언한다. revision은
 * undo도 올리므로 비교하지 않는다.
 */
const expectRestored = (result: RunResult): void => {
  const now = editorState(result.editor, result.tiptap);
  expect(now.document.blocks).toEqual(result.before.document.blocks);
  expect(now.tiptapDocument).toEqual(result.before.tiptapDocument);
  expect(now.selection).toEqual(result.before.selection);
};

/** 문서 최상위 블록 요약. */
const blocksOf = (result: RunResult): string[] =>
  outline(result.editor.getDocument().blocks);

const KEYS = [
  {
    key: "Backspace",
    press: (t: TiptapEditor) => dispatchKeydown(t, "Backspace"),
  },
  { key: "Delete", press: (t: TiptapEditor) => dispatchKeydown(t, "Delete") },
] as const;

describe("표 경계 범위 Enter는 키만 소비하고 문서를 바꾸지 않는다(Issue #289)", () => {
  const enter = (t: TiptapEditor) => dispatchKeydown(t, "Enter");

  it.each([
    { name: "셀 0 -> 뒤 문단 1", cell: 0, tail: 1 },
    { name: "셀 0 -> 뒤 문단 2", cell: 0, tail: 2 },
    { name: "셀 2 -> 뒤 문단 2", cell: 2, tail: 2 },
    { name: "셀 0 -> 뒤 문단 4(끝)", cell: 0, tail: 4 },
  ])(
    "표 셀에서 뒤 문단으로 걸친 범위($name)를 no-op으로 소비한다",
    ({ cell, tail }) => {
      const result = run(
        [singleCellTable("t", "cell"), paragraphBlock("w", "wxyz"), TAIL],
        inCell("t-r0c0", cell),
        inBlock("w", tail),
        enter,
      );

      expectNoOpConsumed(result);
      expect(blocksOf(result)).toEqual([
        "table[cell]",
        "paragraph:wxyz",
        "paragraph:tail",
      ]);
    },
  );

  it("뒤 블록이 toggle의 자식 codeBlock이어도 no-op으로 소비한다", () => {
    const result = run(
      [
        singleCellTable("t", "cell"),
        toggleBlock("tg", "label", {
          children: [codeBlockBlock("cb", "ef\ngh")],
        }),
        TAIL,
      ],
      inCell("t-r0c0", 1),
      inBlock("cb", 4),
      enter,
    );

    expectNoOpConsumed(result);
  });

  it.each([
    {
      name: "1x1 표",
      table: singleCellTable("t", "cell"),
      cell: "t-r0c0",
      offset: 2,
    },
    { name: "2x2 표", table: gridTable("t", 2, 2), cell: "t-r0c0", offset: 1 },
  ])(
    "앞 문단에서 $name 셀로 걸친 범위(역방향 포함)를 no-op으로 소비한다",
    ({ table, cell, offset }) => {
      for (const reversed of [false, true]) {
        const from = inBlock("a", 2);
        const to = inCell(cell, offset);
        const result = reversed
          ? run([paragraphBlock("a", "abcd"), table, TAIL], to, from, enter)
          : run([paragraphBlock("a", "abcd"), table, TAIL], from, to, enter);

        expectNoOpConsumed(result);
        expect(result.tiptap.state.selection.empty).toBe(false);
      }
    },
  );

  it("codeBlock에서 시작해 셀로 끝나는 범위도 no-op이다(enterOverCodeBlockRange보다 앞선다)", () => {
    const result = run(
      [codeBlockBlock("cb", "abcd"), singleCellTable("t", "cell"), TAIL],
      inBlock("cb", 2),
      inCell("t-r0c0", 2),
      enter,
    );

    expectNoOpConsumed(result);
    expect(blocksOf(result)).toEqual([
      "codeBlock:abcd",
      "table[cell]",
      "paragraph:tail",
    ]);
  });

  it("서로 다른 두 표에 걸친 범위를 no-op으로 소비한다", () => {
    const result = run(
      [
        singleCellTable("t1", "cell"),
        paragraphBlock("m", "mmmm"),
        singleCellTable("t2", "cell"),
        TAIL,
      ],
      inCell("t1-r0c0", 2),
      inCell("t2-r0c0", 2),
      enter,
    );

    expectNoOpConsumed(result);
  });
});

describe("표 경계 범위 Backspace·Delete는 선택한 텍스트만 지운다(Issue #289)", () => {
  describe.each(KEYS)("$key", ({ press }) => {
    it.each([
      { type: "paragraph", tail: paragraphBlock("w", "wxyz") },
      { type: "heading", tail: headingBlock("w", 1, "wxyz") },
      { type: "quote", tail: quoteBlock("w", "wxyz") },
      {
        type: "bulletListItem",
        tail: listItemBlock("w", "bulletListItem", "wxyz"),
      },
      { type: "callout", tail: calloutBlock("w", "wxyz") },
    ])(
      "2x2 표 셀(1,1)에서 뒤 $type 블록으로 걸친 범위는 양쪽 텍스트만 지운다",
      ({ type, tail }) => {
        const result = run(
          [gridTable("t", 2, 2), tail, TAIL],
          inCell("t-r1c1", 2),
          inBlock("w", 2),
          press,
        );

        expect(result.handled).toBe(true);
        expect(blocksOf(result)).toEqual([
          "table[c00|c01/c10|c1]",
          `${type}:yz`,
          "paragraph:tail",
        ]);
        expectSchemaValid(result.tiptap);
      },
    );

    it.each([
      { type: "heading", tail: headingBlock("w", 1, "wxyz") },
      { type: "quote", tail: quoteBlock("w", "wxyz") },
      {
        type: "bulletListItem",
        tail: listItemBlock("w", "bulletListItem", "wxyz"),
      },
      { type: "codeBlock", tail: codeBlockBlock("w", "wxyz") },
      { type: "callout", tail: calloutBlock("w", "wxyz") },
      { type: "paragraph", tail: paragraphBlock("w", "wxyz") },
    ])(
      "1x1 표 셀에서 뒤 $type 블록으로 걸친 범위는 양쪽 텍스트만 지운다",
      ({ type, tail }) => {
        const result = run(
          [singleCellTable("t", "cell"), tail, TAIL],
          inCell("t-r0c0", 2),
          inBlock("w", 2),
          press,
        );

        expect(result.handled).toBe(true);
        expect(blocksOf(result)).toEqual([
          "table[ce]",
          `${type}:yz`,
          "paragraph:tail",
        ]);
        expectSchemaValid(result.tiptap);
      },
    );

    it("앞 문단에서 1x1 표 셀로 걸친 범위는 앞 문단 `ab`와 셀 `ll`을 남긴다", () => {
      const result = run(
        [paragraphBlock("a", "abcd"), singleCellTable("t", "cell"), TAIL],
        inBlock("a", 2),
        inCell("t-r0c0", 2),
        press,
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "paragraph:ab",
        "table[ll]",
        "paragraph:tail",
      ]);
      expectSchemaValid(result.tiptap);
    });

    it("앞 문단에서 2x2 표 셀(0,0)로 걸친 범위는 앞 문단 `ab`와 셀 `00`을 남긴다", () => {
      const result = run(
        [paragraphBlock("a", "abcd"), gridTable("t", 2, 2), TAIL],
        inBlock("a", 2),
        inCell("t-r0c0", 1),
        press,
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "paragraph:ab",
        "table[00|c01/c10|c11]",
        "paragraph:tail",
      ]);
      expectSchemaValid(result.tiptap);
    });

    it("앞 문단에서 2x2 표 셀(1,1)로 걸친 범위는 범위 안 셀 셋을 비우고 구조를 유지한다", () => {
      const result = run(
        [paragraphBlock("a", "abcd"), gridTable("t", 2, 2), TAIL],
        inBlock("a", 2),
        inCell("t-r1c1", 2),
        press,
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "paragraph:ab",
        "table[|/|1]",
        "paragraph:tail",
      ]);
      expectSchemaValid(result.tiptap);
    });

    it("범위가 앞 블록 끝에서 시작하면 앞 블록은 그대로고 셀 텍스트만 지운다", () => {
      const result = run(
        [paragraphBlock("a", "abcd"), singleCellTable("t", "cell"), TAIL],
        inBlock("a", 4),
        inCell("t-r0c0", 2),
        press,
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "paragraph:abcd",
        "table[ll]",
        "paragraph:tail",
      ]);
      expectSchemaValid(result.tiptap);
    });

    it("셀 사이의 블록은 삭제하고 끝 블록은 남긴다", () => {
      const result = run(
        [
          singleCellTable("t", "cell"),
          paragraphBlock("m", "mmmm"),
          paragraphBlock("w", "wxyz"),
          TAIL,
        ],
        inCell("t-r0c0", 2),
        inBlock("w", 2),
        press,
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "table[ce]",
        "paragraph:yz",
        "paragraph:tail",
      ]);
      expectSchemaValid(result.tiptap);
    });

    it("서로 다른 두 표는 각 셀 텍스트만 지우고 사이 블록을 삭제하며 두 표를 유지한다", () => {
      const result = run(
        [
          singleCellTable("t1", "cell"),
          paragraphBlock("m", "mmmm"),
          singleCellTable("t2", "cell"),
          TAIL,
        ],
        inCell("t1-r0c0", 2),
        inCell("t2-r0c0", 2),
        press,
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "table[ce]",
        "table[ll]",
        "paragraph:tail",
      ]);
      expectSchemaValid(result.tiptap);
    });

    it("범위가 끝 블록 텍스트 전부를 덮으면 끝 블록은 빈 블록으로 남는다", () => {
      const result = run(
        [singleCellTable("t", "cell"), paragraphBlock("w", "wxyz"), TAIL],
        inCell("t-r0c0", 2),
        inBlock("w", 4),
        press,
      );

      expect(result.handled).toBe(true);
      // 병합·삭제·표 소실이 없다.
      expect(blocksOf(result)).toEqual([
        "table[ce]",
        "paragraph:",
        "paragraph:tail",
      ]);
      expectSchemaValid(result.tiptap);
    });

    it("끝 블록에 자식이 있으면 자식이 그대로 남는다", () => {
      const result = run(
        [
          singleCellTable("t", "cell"),
          paragraphBlock("w", "wxyz", [paragraphBlock("wc", "child")]),
          TAIL,
        ],
        inCell("t-r0c0", 2),
        inBlock("w", 2),
        press,
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "table[ce]",
        "paragraph:yz>{paragraph:child}",
        "paragraph:tail",
      ]);
      expectSchemaValid(result.tiptap);
    });

    it("병합 셀 표에서도 셀 텍스트만 지우고 rowSpan·columnSpan을 유지한다", () => {
      const result = run(
        [mergedTable(), paragraphBlock("w", "wxyz"), TAIL],
        inCell("m-7", 2),
        inBlock("w", 2),
        press,
      );

      expect(result.handled).toBe(true);
      expect(outline(result.editor.getDocument().blocks, true)).toEqual([
        "table[m-1@2x1|m-2@1x1|m-3@1x1/m-4@1x2/m-5@1x1|m-6@1x1|m-@1x1]",
        "paragraph:yz",
        "paragraph:tail",
      ]);
      expectSchemaValid(result.tiptap);
    });

    it("병합 셀(rowSpan 2)에서 시작해도 뒤 셀을 모두 비우고 구조를 유지한다", () => {
      const result = run(
        [mergedTable(), paragraphBlock("w", "wxyz"), TAIL],
        inCell("m-1", 1),
        inBlock("w", 2),
        press,
      );

      expect(result.handled).toBe(true);
      expect(outline(result.editor.getDocument().blocks, true)).toEqual([
        "table[m@2x1|@1x1|@1x1/@1x2/@1x1|@1x1|@1x1]",
        "paragraph:yz",
        "paragraph:tail",
      ]);
      expectSchemaValid(result.tiptap);
    });

    it("캐럿은 범위 시작에 접히고, dispatch 1회·undo 1회로 문서와 selection이 원복된다", () => {
      // 시작이 셀인 경우.
      const fromCell = run(
        [gridTable("t", 2, 2), paragraphBlock("w", "wxyz"), TAIL],
        inCell("t-r1c1", 2),
        inBlock("w", 2),
        press,
      );
      expect(fromCell.handled).toBe(true);
      expect(fromCell.dispatchCount).toBe(1);
      expect(fromCell.changes).toHaveLength(1);
      expect(fromCell.tiptap.state.selection.empty).toBe(true);
      expect(fromCell.tiptap.state.selection.from).toBe(fromCell.anchor);

      expect(fromCell.editor.commands.undo()).toEqual(okResult);
      expectRestored(fromCell);
      expect(fromCell.editor.commands.undo()).toEqual(notApplicable("undo"));

      // 시작이 앞 블록인 경우.
      const fromBlock = run(
        [paragraphBlock("a", "abcd"), gridTable("t", 2, 2), TAIL],
        inBlock("a", 2),
        inCell("t-r1c1", 1),
        press,
      );
      expect(fromBlock.handled).toBe(true);
      expect(fromBlock.dispatchCount).toBe(1);
      expect(fromBlock.changes).toHaveLength(1);
      expect(fromBlock.tiptap.state.selection.empty).toBe(true);
      expect(fromBlock.tiptap.state.selection.from).toBe(fromBlock.anchor);

      expect(fromBlock.editor.commands.undo()).toEqual(okResult);
      expectRestored(fromBlock);
      expect(fromBlock.editor.commands.undo()).toEqual(notApplicable("undo"));
    });

    it("선택 방향이 반대(head가 앞)여도 같은 결과다", () => {
      const result = run(
        [paragraphBlock("a", "abcd"), singleCellTable("t", "cell"), TAIL],
        inCell("t-r0c0", 2),
        inBlock("a", 2),
        press,
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "paragraph:ab",
        "table[ll]",
        "paragraph:tail",
      ]);
      expect(result.tiptap.state.selection.from).toBe(result.head);
    });
  });
});

describe("표 경계 범위 수식 키는 Backspace·Delete와 같은 결과다(Issue #289)", () => {
  it.each([
    {
      label: "Mod-Backspace",
      base: (t: TiptapEditor) => dispatchKeydown(t, "Backspace"),
      mod: (t: TiptapEditor) =>
        dispatchModifiedKeydown(t, "Backspace", { ctrlKey: true }),
    },
    {
      label: "Shift-Backspace",
      base: (t: TiptapEditor) => dispatchKeydown(t, "Backspace"),
      mod: (t: TiptapEditor) =>
        dispatchModifiedKeydown(t, "Backspace", { shiftKey: true }),
    },
    {
      label: "Mod-Delete",
      base: (t: TiptapEditor) => dispatchKeydown(t, "Delete"),
      mod: (t: TiptapEditor) =>
        dispatchModifiedKeydown(t, "Delete", { ctrlKey: true }),
    },
  ])(
    "$label 가 기본 키와 같은 소비·문서·selection·dispatch 횟수를 낸다",
    ({ base, mod }) => {
      const blocks = () => [
        gridTable("t", 2, 2),
        paragraphBlock("w", "wxyz"),
        TAIL,
      ];
      const expected = run(
        blocks(),
        inCell("t-r1c1", 2),
        inBlock("w", 2),
        base,
      );
      const actual = run(blocks(), inCell("t-r1c1", 2), inBlock("w", 2), mod);

      expect(actual.handled).toBe(true);
      expect(blocksOf(actual)).toEqual([
        "table[c00|c01/c10|c1]",
        "paragraph:yz",
        "paragraph:tail",
      ]);
      expect(actual.handled).toBe(expected.handled);
      expect(actual.dispatchCount).toBe(expected.dispatchCount);
      expect(editorState(actual.editor, actual.tiptap)).toEqual(
        editorState(expected.editor, expected.tiptap),
      );
    },
  );
});

describe("표 경계 범위 대상 밖은 현행 동작을 유지한다(Issue #289)", () => {
  it("표를 완전히 감싸는 범위는 표를 지우고 양 끝 블록을 병합한다", () => {
    const result = run(
      [
        paragraphBlock("a", "abcd"),
        singleCellTable("t", "cell"),
        paragraphBlock("w", "wxyz"),
        TAIL,
      ],
      inBlock("a", 2),
      inBlock("w", 2),
      (t) => dispatchKeydown(t, "Backspace"),
    );

    expect(result.handled).toBe(true);
    expect(blocksOf(result)).toEqual(["paragraph:abyz", "paragraph:tail"]);
  });

  it("표 밖 범위는 일반 범위 삭제로 병합한다", () => {
    const result = run(
      [paragraphBlock("a", "abcd"), paragraphBlock("w", "wxyz"), TAIL],
      inBlock("a", 2),
      inBlock("w", 2),
      (t) => dispatchKeydown(t, "Backspace"),
    );

    expect(result.handled).toBe(true);
    expect(blocksOf(result)).toEqual(["paragraph:abyz", "paragraph:tail"]);
  });

  it("같은 표 안 셀 사이 범위 Backspace는 경계 범위 삭제가 아니라 기존 동작(문서 불변, 캐럿만 이동)이다", () => {
    const result = run(
      [gridTable("t", 2, 2), TAIL],
      inCell("t-r0c0", 1),
      inCell("t-r1c1", 1),
      (t) => dispatchKeydown(t, "Backspace"),
    );

    // 경계 범위로 취급하면 겹친 셀 텍스트가 지워진다(`c`·`1` 등). 기존
    // 경로는 문서 전체를 바꾸지 않는다. 문서 전체를 기준과 비교한다.
    expect(result.handled).toBe(true);
    expect(result.dispatchCount).toBe(1);
    expect(blocksOf(result)).toEqual([
      "table[c00|c01/c10|c11]",
      "paragraph:tail",
    ]);
    expect(result.tiptap.state.selection.empty).toBe(true);
  });

  it("같은 표 안 한 셀 범위 Enter는 경계 범위 no-op이 아니라 표 키보드 계약(아래 셀로 이동)을 탄다", () => {
    const result = run(
      [gridTable("t", 2, 2, ["cccc", "c01", "c10", "c11"]), TAIL],
      inCell("t-r0c0", 1),
      inCell("t-r0c0", 3),
      (t) => dispatchKeydown(t, "Enter"),
    );

    // 경계 범위 no-op이면 dispatch 0회에 selection이 그대로다.
    expect(result.handled).toBe(true);
    expect(result.dispatchCount).toBe(1);
    const { selection } = result.tiptap.state;
    expect([selection.anchor, selection.head]).not.toEqual([
      result.anchor,
      result.head,
    ]);
    expect(blocksOf(result)).toEqual([
      "table[cccc|c01/c10|c11]",
      "paragraph:tail",
    ]);
  });

  it("같은 표 안 셀 사이 범위 Enter는 키를 소비하고 문서를 바꾸지 않는다", () => {
    const result = run(
      [gridTable("t", 2, 2, ["cccc", "c01", "c10", "c11"]), TAIL],
      inCell("t-r0c0", 1),
      inCell("t-r1c1", 1),
      (t) => dispatchKeydown(t, "Enter"),
    );

    expect(result.handled).toBe(true);
    expect(blocksOf(result)).toEqual([
      "table[cccc|c01/c10|c11]",
      "paragraph:tail",
    ]);
  });

  it("CellSelection은 경계 범위로 취급하지 않는다", () => {
    const m = mounted(
      documentOf(gridTable("t", 2, 2), paragraphBlock("w", "wxyz"), TAIL),
    );
    selectCellRange(m.tiptap, "t-r0c0", "t-r0c1");
    const handled = dispatchKeydown(m.tiptap, "Backspace");

    expect(handled).toBe(true);
    // tableEditing이 선택한 셀(첫 행)의 내용을 비운다. 뒤 문단은 그대로다.
    expect(outline(m.editor.getDocument().blocks)).toEqual([
      "table[|/c10|c11]",
      "paragraph:wxyz",
      "paragraph:tail",
    ]);
  });
});

/**
 * DOM selection을 anchor→head 문서 위치로 두고 fn을 실행한다. 위치가 속한
 * 텍스트블록 시작의 DOM 노드를 기준으로 offset을 계산한다. 정리는
 * withNativeSelection이 맡는다(G-TST-003).
 */
const withDomSelection = (
  tiptap: TiptapEditor,
  anchor: number,
  head: number,
  fn: () => void,
): void => {
  const point = (pos: number) => {
    const base = tiptap.state.doc.resolve(pos).start();
    const dom = tiptap.view.domAtPos(base);
    return {
      node: dom.node.childNodes[0] ?? dom.node,
      offset: pos - base,
    };
  };
  const anchorPoint = point(anchor);
  const headPoint = point(head);
  withNativeSelection(
    tiptap.view.dom,
    () => withoutScrollCrash(tiptap, fn),
    anchorPoint.node,
    anchorPoint.offset,
    headPoint.node,
    headPoint.offset,
  );
};

/** live selection을 문서 위치 anchor→head TextSelection으로 둔다. */
const setLiveSelection = (
  tiptap: TiptapEditor,
  anchor: number,
  head: number,
): void => {
  tiptap.view.dispatch(
    tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, anchor, head),
    ),
  );
};

describe("표 경계 범위는 DOM 파생 selection 기준으로 live 문서에 적용한다(Issue #289, G-EDT-002)", () => {
  it("DOM selection이 경계 범위이고 live selection이 다르면 DOM 기준으로 Backspace를 적용한다", () => {
    const m = mounted(
      documentOf(gridTable("t", 2, 2), paragraphBlock("w", "wxyz"), TAIL),
    );
    const { tiptap } = m;
    const anchor = inCell("t-r1c1", 2)(tiptap);
    const head = inBlock("w", 2)(tiptap);
    // live selection은 경계 범위가 아닌 다른 위치(뒤 꼬리 문단 끝)다.
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        TextSelection.create(tiptap.state.doc, inBlock("tail", 4)(tiptap)),
      ),
    );
    const anchorDom = tiptap.view.domAtPos(inCell("t-r1c1", 0)(tiptap));
    const headDom = tiptap.view.domAtPos(inBlock("w", 0)(tiptap));
    const anchorText = anchorDom.node.childNodes[0] ?? anchorDom.node;
    const headText = headDom.node.childNodes[0] ?? headDom.node;

    withNativeSelection(
      tiptap.view.dom,
      () => {
        withoutScrollCrash(tiptap, () => {
          expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
        });
      },
      anchorText,
      anchor - inCell("t-r1c1", 0)(tiptap),
      headText,
      head - inBlock("w", 0)(tiptap),
    );

    expect(outline(m.editor.getDocument().blocks)).toEqual([
      "table[c00|c01/c10|c1]",
      "paragraph:yz",
      "paragraph:tail",
    ]);
    expectSchemaValid(tiptap);
  });

  describe.each([
    {
      key: "Backspace",
      press: (t: TiptapEditor) => dispatchKeydown(t, "Backspace"),
    },
    { key: "Delete", press: (t: TiptapEditor) => dispatchKeydown(t, "Delete") },
  ])(
    "DOM selection이 경계 범위이고 live selection이 다르면 $key 도 DOM 기준으로 적용한다",
    ({ press }) => {
      it("live가 뒤 꼬리 문단 끝 캐럿이어도 DOM 경계 범위를 지운다", () => {
        const m = mounted(
          documentOf(gridTable("t", 2, 2), paragraphBlock("w", "wxyz"), TAIL),
        );
        const { tiptap } = m;
        setLiveSelection(
          tiptap,
          inBlock("tail", 4)(tiptap),
          inBlock("tail", 4)(tiptap),
        );

        withDomSelection(
          tiptap,
          inCell("t-r1c1", 2)(tiptap),
          inBlock("w", 2)(tiptap),
          () => {
            expect(press(tiptap)).toBe(true);
          },
        );

        expect(outline(m.editor.getDocument().blocks)).toEqual([
          "table[c00|c01/c10|c1]",
          "paragraph:yz",
          "paragraph:tail",
        ]);
        expectSchemaValid(tiptap);
      });
    },
  );

  it("DOM selection이 경계 범위이고 live selection이 다르면 Enter는 문서를 바꾸지 않고 소비한다", () => {
    const m = mounted(
      documentOf(gridTable("t", 2, 2), paragraphBlock("w", "wxyz"), TAIL),
    );
    const { tiptap } = m;
    setLiveSelection(
      tiptap,
      inBlock("tail", 4)(tiptap),
      inBlock("tail", 4)(tiptap),
    );
    const before = editorState(m.editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");
    try {
      withDomSelection(
        tiptap,
        inCell("t-r1c1", 2)(tiptap),
        inBlock("w", 2)(tiptap),
        () => {
          expect(dispatchKeydown(tiptap, "Enter")).toBe(true);
        },
      );
      expect(dispatchSpy).not.toHaveBeenCalled();
    } finally {
      dispatchSpy.mockRestore();
    }

    expect(editorState(m.editor, tiptap)).toEqual(before);
  });
});

describe("표 경계 범위 역방향 stale은 live 경계 범위를 건드리지 않고 소비한다(Issue #289, G-EDT-002)", () => {
  /**
   * live selection은 셀 offset 2부터 뒤 문단 offset 2까지 경계 범위, DOM
   * selection은 첫 문단 맨 앞 캐럿이다. 폴스루하면 Tiptap 기본 삭제·분할이
   * live 경계 범위에 적용돼 셀이 `ceyz`로 손상된다.
   */
  const reverseStale = (press: (t: TiptapEditor) => boolean, domCaret: Pos) => {
    const m = mounted(
      documentOf(
        paragraphBlock("a", "aaaa"),
        singleCellTable("t", "cell"),
        paragraphBlock("w", "wxyz"),
        TAIL,
      ),
    );
    const { tiptap } = m;
    setLiveSelection(
      tiptap,
      inCell("t-r0c0", 2)(tiptap),
      inBlock("w", 2)(tiptap),
    );
    const before = editorState(m.editor, tiptap);
    const changesBefore = m.changes.length;
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");
    const outcome = { handled: false, dispatchCount: 0 };
    try {
      withDomSelection(tiptap, domCaret(tiptap), domCaret(tiptap), () => {
        outcome.handled = press(tiptap);
        outcome.dispatchCount = dispatchSpy.mock.calls.length;
      });
    } finally {
      dispatchSpy.mockRestore();
    }
    return {
      m,
      before,
      ...outcome,
      changes: m.changes.length - changesBefore,
    };
  };

  // DOM 캐럿 위치에 따라 핸들러가 false를 돌려주는 분기가 다르다. 첫 문단
  // 맨 앞은 Backspace가 폴스루하는 지점이고, 마지막 문단 끝은 Delete가 병합
  // 대상 없이(next === null) false를 돌려주는 지점이다. 셀 안 캐럿은 둘 다
  // 파생 위치에 caret 처리가 없어 false다.
  const carets = [
    { caret: "첫 문단 맨 앞", at: inBlock("a", 0) },
    { caret: "마지막 문단 끝", at: inBlock("tail", 4) },
    { caret: "셀 안", at: inCell("t-r0c0", 1) },
  ];

  it.each(
    ["Backspace", "Delete"].flatMap((key) =>
      carets.map((entry) => ({ key, ...entry })),
    ),
  )(
    "$key: DOM 캐럿($caret)이 경계 범위 밖이고 live가 경계 범위이면 키를 소비하고 문서를 바꾸지 않는다",
    ({ key, at }) => {
      const { m, before, handled, dispatchCount, changes } = reverseStale(
        (t) => dispatchKeydown(t, key),
        at,
      );

      // 선택하지 않은 텍스트(`yz`)가 셀로 옮겨 가지 않는다.
      expect(outline(m.editor.getDocument().blocks)).toEqual([
        "paragraph:aaaa",
        "table[cell]",
        "paragraph:wxyz",
        "paragraph:tail",
      ]);
      expect(handled).toBe(true);
      expect(dispatchCount).toBe(0);
      expect(changes).toBe(0);
      expect(editorState(m.editor, m.tiptap)).toEqual(before);
    },
  );

  // Enter는 DOM 캐럿이 일반 텍스트 블록이면 그 위치를 파생 기준으로 분할한다
  // (정상 동작). live 경계 범위의 셀·뒤 문단 텍스트는 건드리지 않는다. 셀 안
  // 캐럿은 표 키보드 계약이 소비한다. 어느 경우에도 `ceyz` 손상이 없다.
  it.each([
    {
      caret: "첫 문단 맨 앞",
      at: inBlock("a", 0),
      blocks: [
        "paragraph:",
        "paragraph:aaaa",
        "table[cell]",
        "paragraph:wxyz",
        "paragraph:tail",
      ],
    },
    {
      caret: "마지막 문단 끝",
      at: inBlock("tail", 4),
      blocks: [
        "paragraph:aaaa",
        "table[cell]",
        "paragraph:wxyz",
        "paragraph:tail",
        "paragraph:",
      ],
    },
    {
      caret: "셀 안",
      at: inCell("t-r0c0", 1),
      blocks: [
        "paragraph:aaaa",
        "table[cell]",
        "paragraph:wxyz",
        "paragraph:tail",
      ],
    },
  ])(
    "Enter: DOM 캐럿($caret)이 경계 범위 밖이고 live가 경계 범위이면 파생 위치 기준으로 처리하고 live 범위의 텍스트를 보존한다",
    ({ at, blocks }) => {
      const { m, handled } = reverseStale(
        (t) => dispatchKeydown(t, "Enter"),
        at,
      );

      expect(handled).toBe(true);
      expect(outline(m.editor.getDocument().blocks)).toEqual(blocks);
      expectSchemaValid(m.tiptap);
    },
  );
});

describe("표 경계 범위 stale이어도 파생 selection 기준의 정상 동작은 바뀌지 않는다(Issue #289, G-EDT-002)", () => {
  it("live가 경계 범위이고 DOM 캐럿이 표 셀 안이면 Enter는 표 키보드 계약(아래 셀로 이동)을 따른다", () => {
    const m = mounted(
      documentOf(
        paragraphBlock("a", "aaaa"),
        gridTable("t", 2, 2),
        paragraphBlock("w", "wxyz"),
        TAIL,
      ),
    );
    const { tiptap } = m;
    setLiveSelection(
      tiptap,
      inCell("t-r0c0", 1)(tiptap),
      inBlock("w", 2)(tiptap),
    );

    withDomSelection(
      tiptap,
      inCell("t-r0c0", 1)(tiptap),
      inCell("t-r0c0", 1)(tiptap),
      () => {
        expect(dispatchKeydown(tiptap, "Enter")).toBe(true);
      },
    );

    expect(outline(m.editor.getDocument().blocks)).toEqual([
      "paragraph:aaaa",
      "table[c00|c01/c10|c11]",
      "paragraph:wxyz",
      "paragraph:tail",
    ]);
    // 아래 셀(1,0) 안으로 이동한다. 이동 방식은 표 키보드 계약이 소유한다.
    const { selection } = tiptap.state;
    expect(selection.from).toBeGreaterThanOrEqual(inCell("t-r1c0", 0)(tiptap));
    expect(selection.to).toBeLessThanOrEqual(inCell("t-r1c0", 3)(tiptap));
  });
});

describe("끝 블록이 상위 블록의 자식이면 알려진 한계가 있다(Issue #289)", () => {
  const child = () => paragraphBlock("b", "wxyz");
  const withChild = (block: Block): Block =>
    ({ ...block, children: [child()] }) as Block;

  it.each([
    { type: "heading", parent: withChild(headingBlock("x", 2, "xxxx")) },
    { type: "quote", parent: quoteBlock("x", "xxxx", [child()]) },
    { type: "callout", parent: calloutBlock("x", "xxxx", "i", [child()]) },
    {
      type: "toggleListItem",
      parent: toggleBlock("x", "xxxx", { children: [child()] }),
    },
  ])(
    "알려진 한계: 라벨이 범위에 든 $type 상위 블록은 타입과 attrs를 잃고 빈 paragraph가 된다",
    ({ parent }) => {
      const result = run(
        [singleCellTable("t", "cell"), parent, TAIL],
        inCell("t-r0c0", 2),
        inBlock("b", 2),
        (t) => dispatchKeydown(t, "Backspace"),
      );

      expect(result.handled).toBe(true);
      // 선택하지 않은 텍스트는 보존된다. 상위 블록은 paragraph가 된다.
      expect(blocksOf(result)).toEqual([
        "table[ce]",
        "paragraph:>{paragraph:yz}",
        "paragraph:tail",
      ]);
      result.tiptap.state.doc.check();
      expectSchemaValid(result.tiptap);
    },
  );
});
