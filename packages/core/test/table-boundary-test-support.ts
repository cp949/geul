/**
 * 표 경계 범위 테스트(Issue #289·#292)가 공유하는 fixture와 위치·selection
 * 헬퍼를 소유한다. 두 번째 소비 파일(table-boundary-input.test.ts)이 생긴
 * 시점에 table-boundary-range.test.ts의 로컬 사본을 이 모듈로 올렸다
 * (G-TST-002).
 *
 * - 표 fixture: gridTable·singleCellTable·mergedTable
 * - 요약: outline(최상위 블록을 문자열 목록으로 줄인다)
 * - 위치: inCell·inBlock(마운트 뒤 문서 위치 산출)
 * - selection: withDomSelection(DOM selection)·setLiveSelection(live selection)
 * - 실행: run(마운트·selection 설정·동작 실행·dispatch 횟수 기록)과
 *   expectNoOpConsumed·expectRestored·blocksOf 단언
 */
import type {
  Block,
  DocumentBlock,
  InlineContent,
  TableBlock,
} from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { expect, vi } from "vitest";

import type { CreateEditorOptions, EditorController } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  editorState,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";
import {
  withNativeSelection,
  withoutScrollCrash,
} from "./native-selection-test-support.js";
import { findCellBoundaryPosition } from "./table-test-support.js";

/** 편집기 상태에서 위치를 구하는 함수. 마운트 뒤에야 위치를 알 수 있다. */
export type Pos = (tiptap: TiptapEditor) => number;

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
export const outline = (
  blocks: readonly DocumentBlock[],
  withSpans = false,
): string[] => blocks.map((block) => describeBlock(block, withSpans));

/**
 * rows x columns 격자 표 블록. 셀 id는 `<id>-r<행>c<열>`이고 텍스트는
 * 기본 `c<행><열>`이다. texts를 주면 행 우선 순서로 대체한다.
 */
export const gridTable = (
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
export const singleCellTable = (id: string, text: string): Block =>
  gridTable(id, 1, 1, [text]);

/**
 * 3x3 병합 표. 격자는 docWithMergedTable과 같다. 셀 텍스트는 셀 id다.
 *
 *   row-1: m-1 | m-2 | m-3
 *   row-2: m-1 | m-4 | m-4   (m-1은 rowSpan 2, m-4는 columnSpan 2)
 *   row-3: m-5 | m-6 | m-7
 */
export const mergedTable = (): Block => {
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
export const TAIL = paragraphBlock("tail", "tail");

/**
 * 셀 내용 시작 위치 + offset. 셀 순회는 table-test-support의
 * findCellBoundaryPosition이 소유한다. 그 값은 셀 경계라 내용은 +1이다.
 */
export const inCell =
  (cellId: string, offset: number): Pos =>
  (tiptap) => {
    const boundary = findCellBoundaryPosition(tiptap, cellId);
    if (boundary === null) throw new Error(`tableCell ${cellId} 조회 실패`);
    return boundary + 1 + offset;
  };

/** 블록 텍스트 시작 위치 + offset. */
export const inBlock =
  (blockId: string, offset: number): Pos =>
  (tiptap) =>
    contentTextStart(tiptap, blockId) + offset;

/**
 * DOM selection을 anchor→head 문서 위치로 두고 fn을 실행한다. 위치가 속한
 * 텍스트블록 시작의 DOM 노드를 기준으로 offset을 계산한다. 정리는
 * withNativeSelection이 맡는다(G-TST-003).
 */
export const withDomSelection = (
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
export const setLiveSelection = (
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

export interface RunResult extends ReturnType<typeof mounted> {
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
export const run = (
  blocks: Block[],
  from: Pos,
  to: Pos,
  press: (tiptap: TiptapEditor, editor: EditorController) => boolean,
  options: Partial<CreateEditorOptions> = {},
): RunResult => {
  const m = mounted(documentOf(...blocks), options);
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
    handled = press(tiptap, m.editor);
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
export const expectNoOpConsumed = (result: RunResult): void => {
  expect(result.handled).toBe(true);
  expect(result.dispatchCount).toBe(0);
  expect(result.changes).toHaveLength(0);
  expect(editorState(result.editor, result.tiptap)).toEqual(result.before);
};

/**
 * undo 뒤 문서 블록과 selection이 실행 전과 같음을 단언한다. revision은
 * undo도 올리므로 비교하지 않는다.
 */
export const expectRestored = (result: RunResult): void => {
  const now = editorState(result.editor, result.tiptap);
  expect(now.document.blocks).toEqual(result.before.document.blocks);
  expect(now.tiptapDocument).toEqual(result.before.tiptapDocument);
  expect(now.selection).toEqual(result.before.selection);
};

/** 문서 최상위 블록 요약. */
export const blocksOf = (result: RunResult): string[] =>
  outline(result.editor.getDocument().blocks);
