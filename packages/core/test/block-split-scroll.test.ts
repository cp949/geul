/**
 * Enter 계열 블록 분할이 결과 캐럿을 화면 안으로 스크롤하도록 분할
 * transaction에 표시하는지 검증한다(Issue #427). jsdom은 실제 스크롤을 못
 * 하므로 dispatch된 transaction의 scrolledIntoView 플래그로 고정한다.
 *
 * 키는 view.someProp("handleKeyDown", ...)로 보내 실제 keymap을 거친다.
 * CodeBlockExitExtension(priority 1_100)과 BlockSplitExtension(priority
 * 101)의 우선순위까지 포함해 각 분기가 실제로 어느 dispatch를 타는지
 * 검증한다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { contentTextStart, dispatchKeydown } from "./block-test-support.js";
import {
  codeBlockBlock,
  collectDispatched,
  documentOf,
  listItemBlock,
  mounted,
  onlyDocChangedTransaction,
  paragraphBlock,
} from "./editor-controller-support.js";
import {
  expectNoOpConsumed,
  inBlock,
  inCell,
  run,
  setLiveSelection,
  singleCellTable,
  TAIL,
} from "./table-boundary-test-support.js";

/** blocks를 마운트하고 anchor→head 범위(같으면 캐럿)를 둔다. */
const mountWithSelection = (
  blocks: Block[],
  anchor: (tiptap: TiptapEditor) => number,
  head: (tiptap: TiptapEditor) => number = anchor,
) => {
  const harness = mounted(documentOf(...blocks));
  const { tiptap } = harness;
  setLiveSelection(tiptap, anchor(tiptap), head(tiptap));
  return harness;
};

/**
 * codeBlock 시작 범위 Enter가 범위를 지운 뒤 캐럿을 두는 콘텐츠 노드 타입.
 * enterOverCodeBlockRange와 같은 deleteRange·near 보정으로 계산해 각
 * 케이스가 의도한 분기를 타는지 전제로 확인한다.
 */
const caretParentAfterRangeDelete = (tiptap: TiptapEditor): string => {
  const { from, to } = tiptap.state.selection;
  const tr = tiptap.state.tr.deleteRange(from, to);
  const selection = tr.selection.empty
    ? tr.selection
    : TextSelection.near(tr.doc.resolve(tr.selection.from));
  return selection.$from.parent.type.name;
};

describe("일반 블록 Enter 분할의 스크롤 표시", () => {
  it("문단 끝 접힌 캐럿 Enter는 분할 transaction에 스크롤을 표시한다", () => {
    const { tiptap } = mountWithSelection(
      [paragraphBlock("source", "text"), paragraphBlock("tail", "t")],
      inBlock("source", "text".length),
    );
    const dispatched = collectDispatched(tiptap);

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    expect(onlyDocChangedTransaction(dispatched)?.scrolledIntoView).toBe(true);
  });

  it("문단 안 범위 선택 Enter는 삭제·분할 transaction에 스크롤을 표시한다", () => {
    const { tiptap } = mountWithSelection(
      [paragraphBlock("source", "ABCDEF"), paragraphBlock("tail", "t")],
      inBlock("source", 2),
      inBlock("source", 4),
    );
    const dispatched = collectDispatched(tiptap);

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    expect(onlyDocChangedTransaction(dispatched)?.scrolledIntoView).toBe(true);
  });

  it("빈 목록 항목 Enter는 paragraph 전환 transaction에 스크롤을 표시한다", () => {
    const { editor, tiptap } = mountWithSelection(
      [
        listItemBlock("item", "bulletListItem", ""),
        paragraphBlock("tail", "t"),
      ],
      inBlock("item", 0),
    );
    const dispatched = collectDispatched(tiptap);

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    expect(onlyDocChangedTransaction(dispatched)?.scrolledIntoView).toBe(true);
    // 분할이 아닌 paragraph 탈출 분기를 탔는지 확인한다.
    expect(editor.getDocument().blocks[0]).toEqual(paragraphBlock("item", ""));
  });
});

describe("codeBlock 시작 범위 Enter의 스크롤 표시", () => {
  it("범위를 지운 뒤 캐럿이 codeBlock에 남는 분기는 스크롤을 표시한다", () => {
    const { tiptap } = mountWithSelection(
      [
        codeBlockBlock("code", "code"),
        paragraphBlock("p1", "PQRS"),
        paragraphBlock("after", "끝"),
      ],
      inBlock("code", 2),
      inBlock("p1", 2),
    );
    expect(caretParentAfterRangeDelete(tiptap)).toBe("codeBlock");
    const dispatched = collectDispatched(tiptap);

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    expect(onlyDocChangedTransaction(dispatched)?.scrolledIntoView).toBe(true);
  });

  it("범위를 지운 뒤 캐럿이 일반 블록에 닿아 분할하는 분기는 스크롤을 표시한다", () => {
    const { tiptap } = mountWithSelection(
      [
        codeBlockBlock("code", "code"),
        paragraphBlock("p1", "PQRS"),
        paragraphBlock("after", "끝"),
      ],
      inBlock("code", 0),
      inBlock("p1", 2),
    );
    expect(caretParentAfterRangeDelete(tiptap)).toBe("paragraph");
    const dispatched = collectDispatched(tiptap);

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    expect(onlyDocChangedTransaction(dispatched)?.scrolledIntoView).toBe(true);
  });
});

describe("codeBlock 전용 Enter·Shift-Enter의 스크롤 표시", () => {
  it("트레일링 개행 뒤 double Enter 탈출은 스크롤을 표시한다", () => {
    const { editor, tiptap } = mountWithSelection(
      [codeBlockBlock("code", "code\n"), paragraphBlock("tail", "꼬리")],
      inBlock("code", "code\n".length),
    );
    const dispatched = collectDispatched(tiptap);

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    expect(onlyDocChangedTransaction(dispatched)?.scrolledIntoView).toBe(true);
    // 일반 개행 삽입이 아닌 탈출 분기를 탔는지 확인한다.
    expect(editor.getDocument().blocks[0]).toEqual(
      codeBlockBlock("code", "code"),
    );
    expect(tiptap.state.selection.head).toBe(contentTextStart(tiptap, "tail"));
  });

  it("codeBlock 끝 Shift-Enter 분할은 스크롤을 표시한다", () => {
    const { editor, tiptap } = mountWithSelection(
      [codeBlockBlock("code", "code"), paragraphBlock("tail", "꼬리")],
      inBlock("code", "code".length),
    );
    const dispatched = collectDispatched(tiptap);

    expect(dispatchKeydown(tiptap, "Enter", true)).toBe(true);

    expect(onlyDocChangedTransaction(dispatched)?.scrolledIntoView).toBe(true);
    // codeBlock 안 개행 삽입이 아닌 새 paragraph 형제 분할 분기를 탔는지 확인한다.
    expect(editor.getDocument().blocks).toEqual([
      codeBlockBlock("code", "code"),
      paragraphBlock("id-1", ""),
      paragraphBlock("tail", "꼬리"),
    ]);
    expect(tiptap.state.selection.head).toBe(contentTextStart(tiptap, "id-1"));
  });
});

describe("표 경계 범위 Enter는 스크롤 표시와 무관하게 dispatch하지 않는다", () => {
  const enter = (tiptap: TiptapEditor) => dispatchKeydown(tiptap, "Enter");

  it("표 셀에서 뒤 문단으로 걸친 범위 Enter는 키만 소비하고 dispatch가 0건이다", () => {
    const result = run(
      [singleCellTable("t", "cell"), paragraphBlock("w", "wxyz"), TAIL],
      inCell("t-r0c0", 0),
      inBlock("w", 1),
      enter,
    );

    expectNoOpConsumed(result);
  });

  it("codeBlock에서 표 셀로 걸친 범위 Enter는 키만 소비하고 dispatch가 0건이다", () => {
    const result = run(
      [codeBlockBlock("code", "code"), singleCellTable("t", "cell"), TAIL],
      inBlock("code", 2),
      inCell("t-r0c0", 2),
      enter,
    );

    expectNoOpConsumed(result);
  });
});
