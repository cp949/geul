/**
 * 표 셀 붙여넣기 테스트가 공유하는 문서 fixture·선택·실행 헬퍼를 소유한다
 * (G-TST-002). 셀 캐럿·같은 셀 범위·셀 안 여러 줄·CellSelection 붙여넣기
 * 이벤트 테스트와 붙여넣기 계획 테스트가 같은 문서와 실행 절차를 쓴다.
 *
 * - 문서: lastCellBlocks(1x1 표 t)·firstCellBlocks(1x2 표 g)·atomBlocks(셀 안
 *   인라인 atom)
 * - 기대 요약: docOutline(앞뒤 문단 사이에 표 요약을 끼운다)
 * - 선택: Place·textSelection·atomSelected·selectFirstTwoCells
 * - 편집기 옵션: withTag(인라인 atom 렌더 등록)
 * - 실행: pasteIn(마운트·선택·paste 이벤트 dispatch·호출 감시)
 * - PM 조회: findCell(cellId로 셀 노드를 찾는다)
 *
 * 표 fixture 원본(gridTable·singleCellTable·TAIL)과 위치 헬퍼(inCell)는
 * table-boundary-test-support.ts가, 셀 범위 선택은 table-test-support.ts가
 * 소유한다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { vi } from "vitest";

import type { CreateEditorOptions } from "../src/index.js";
import { dispatchPasteData } from "./clipboard-test-support.js";
import {
  documentOf,
  editorState,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";
import {
  gridTable,
  inCell,
  outline,
  type Pos,
  setLiveSelection,
  singleCellTable,
  TAIL,
} from "./table-boundary-test-support.js";
import { selectCellRange } from "./table-test-support.js";

/** 선택을 두는 함수. 마운트 뒤에야 문서 위치를 알 수 있다. */
export type Place = (tiptap: TiptapEditor) => void;

/** anchor→head TextSelection을 둔다. head를 생략하면 캐럿이다. */
export const textSelection =
  (anchor: Pos, head: Pos = anchor): Place =>
  (tiptap) => {
    setLiveSelection(tiptap, anchor(tiptap), head(tiptap));
  };

/**
 * 기준 문서: 문단 p1 "para", 1x1 표(셀 t-r0c0 "cell"), tail. 셀이 표의 마지막
 * 셀이다.
 */
export const lastCellBlocks = (): Block[] => [
  paragraphBlock("p1", "para"),
  singleCellTable("t", "cell"),
  TAIL,
];

/** 마지막이 아닌 셀 문서: 문단 p1 "para", 1x2 표("c1"|"c2"), tail. */
export const firstCellBlocks = (): Block[] => [
  paragraphBlock("p1", "para"),
  gridTable("g", 1, 2, ["c1", "c2"]),
  TAIL,
];

/**
 * 셀 t-r0c0이 "ab"+atom+"cd"인 문서. 인라인 atom NodeSelection을 본다. atom은
 * withTag가 등록하는 myTag다.
 */
export const atomBlocks = (): Block[] => {
  const table = singleCellTable("t", "") as Extract<Block, { type: "table" }>;
  const cell = table.rows[0]?.cells[0];
  if (cell === undefined) throw new Error("fixture 준비 실패");
  cell.content = [
    { text: "ab" },
    { type: "custom", customType: "myTag" },
    { text: "cd" },
  ];
  return [paragraphBlock("p1", "para"), table, TAIL];
};

/**
 * atomBlocks의 인라인 atom myTag를 렌더하는 편집기 옵션. 등록이 없으면 custom
 * 인라인 콘텐츠를 문서에 올릴 수 없다.
 */
export const withTag: Pick<CreateEditorOptions, "customInlineContent"> = {
  customInlineContent: {
    myTag: {
      render: () => {
        const element = document.createElement("span");
        element.textContent = "tag";
        return element;
      },
    },
  },
};

/** atomBlocks 셀 안 인라인 atom(셀 offset 2)을 NodeSelection으로 고른다. */
export const atomSelected: Place = (tiptap) => {
  tiptap.view.dispatch(
    tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, inCell("t-r0c0", 2)(tiptap)),
    ),
  );
};

/**
 * 표 g의 첫 행 두 셀(g-r0c0·g-r0c1)을 CellSelection으로 고른다. 표 g는
 * gridTable("g", ...)로 만든 문서면 된다.
 */
export const selectFirstTwoCells: Place = (tiptap) =>
  selectCellRange(tiptap, "g-r0c0", "g-r0c1");

/**
 * 최상위 블록 요약의 기대값. 앞 문단 p1 "para"와 tail 사이에 middle을 끼운다.
 * 표는 table[셀|셀]이고 hardBreak는 개행 문자다.
 */
export const docOutline = (...middle: string[]): string[] => [
  "paragraph:para",
  ...middle,
  "paragraph:tail",
];

/**
 * 문서에서 cellId가 같은 셀 노드를 찾는다. 모델 요약이 보여 주지 못하는 PM
 * 노드 구성(text·hardBreak, 마크)을 직접 비교하려고 쓴다. 편집기 문서와 계획
 * transaction 문서를 모두 받는다.
 */
export const findCell = (doc: PmNode, cellId: string): PmNode => {
  let found: PmNode | null = null;
  doc.descendants((node) => {
    if (node.type.name === "tableCell" && node.attrs.cellId === cellId) {
      found = node;
    }
    return found === null;
  });
  if (found === null) throw new Error(`tableCell ${cellId} 조회 실패`);
  return found;
};

/**
 * pasteIn 옵션. 편집기 옵션은 붙여넣기 테스트가 쓰는 두 항목만 받는다. shift이면
 * Ctrl+Shift+V다.
 */
export type PasteInOptions = Pick<
  CreateEditorOptions,
  "customInlineContent" | "pasteHandler"
> & { shift?: boolean };

/**
 * 문서를 마운트하고 선택을 둔 뒤 paste 이벤트를 dispatch한다. view.pasteText와
 * view.dispatch는 붙여넣기 직전에 감시를 시작한다. 이벤트 소비 여부와 호출
 * 횟수를 함께 본다. shift이면 Ctrl+Shift+V다. PM은 view.input.shiftKey로 평문
 * 요청을 알아본다.
 */
export const pasteIn = (
  blocks: Block[],
  place: Place,
  entries: Record<string, string>,
  options: PasteInOptions = {},
) => {
  const { shift = false, ...editorOptions } = options;
  const m = mounted(documentOf(...blocks), editorOptions);
  place(m.tiptap);
  if (shift) {
    (
      m.tiptap.view as unknown as { input: { shiftKey: boolean } }
    ).input.shiftKey = true;
  }
  const before = editorState(m.editor, m.tiptap);
  const pasteText = vi.spyOn(m.tiptap.view, "pasteText");
  const dispatch = vi.spyOn(m.tiptap.view, "dispatch");
  const event = dispatchPasteData(m.tiptap.view.dom, entries);
  return {
    ...m,
    before,
    pasteText,
    dispatch,
    event,
    blocks: () => outline(m.editor.getDocument().blocks),
  };
};
