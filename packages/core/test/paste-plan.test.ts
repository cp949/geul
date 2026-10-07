/**
 * 붙여넣기 계획(paste-plan.ts)의 판정을 표로 고정한다(Issue #306). 계획은
 * 문서를 바꾸지 않고 결과 종류만 돌려준다. 실행 결과(문서 변화)는
 * clipboard-*.test.ts의 이벤트 테스트가 소유한다. 여기서는 결과 종류마다
 * 대표 입력 하나를 둔다.
 *
 * 표 셀 계획(planTableCellPaste)은 pass·delegate·consume·pasteText와 표 밖
 * null을, 기본 계획(planDefaultPaste)은 delegate·consume·pasteText·dispatch와
 * 블록 삽입 배치 3종(caret·blockBoundary·afterRangeDelete)을 다룬다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  type PasteClipboard,
  planDefaultPaste,
  planTableCellPaste,
} from "../src/paste-plan.js";
import { contentTextStart } from "./block-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  listItemBlock,
  mountTiptapEditor,
  paragraphBlock,
  sequentialIds,
} from "./list-item-block-type-support.js";
import {
  inCell,
  singleCellTable,
  TAIL,
} from "./table-boundary-test-support.js";
import { selectCellRange } from "./table-test-support.js";

const SOH = String.fromCharCode(1);
const TAB = String.fromCharCode(9);

/**
 * 문서를 마운트하고 anchor→head 위치를 TextSelection으로 둔다. head를
 * 생략하면 캐럿이다.
 */
const mountAt = (
  blocks: Block[],
  anchor: (tiptap: TiptapEditor) => number,
  head: (tiptap: TiptapEditor) => number = anchor,
): TiptapEditor => {
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("id"),
  });
  const { tiptap } = mountTiptapEditor(editor);
  tiptap.view.dispatch(
    tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, anchor(tiptap), head(tiptap)),
    ),
  );
  return tiptap;
};

/** 블록 텍스트 시작 + offset 위치를 만든다. */
const at =
  (id: string, offset: number) =>
  (tiptap: TiptapEditor): number =>
    contentTextStart(tiptap, id) + offset;

/** 클립보드 값을 만든다. plain은 서식 없이 붙여넣기 신호다. */
const clip = (text: string, html = "", plain = false): PasteClipboard => ({
  html,
  text,
  plain,
});

const deps = { createId: sequentialIds("p") };

const cellBlocks = (): Block[] => [
  paragraphBlock("p1", "para"),
  singleCellTable("t", "cell"),
  TAIL,
];

describe("planTableCellPaste", () => {
  it("표 밖이면 null이다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(planTableCellPaste(tiptap.state, clip("x"), 1)).toBeNull();
  });

  it("CellSelection이면 pass다", () => {
    const tiptap = mountAt(cellBlocks(), at("p1", 0));
    selectCellRange(tiptap, "t-r0c0", "t-r0c0");
    expect(planTableCellPaste(tiptap.state, clip("x"), 1)).toEqual({
      kind: "pass",
    });
  });

  it("html 없는 유효한 평문은 delegate다", () => {
    const tiptap = mountAt(cellBlocks(), inCell("t-r0c0", 2));
    expect(planTableCellPaste(tiptap.state, clip("ab"), 1)).toEqual({
      kind: "delegate",
    });
  });

  it("html이 내용을 가지면 delegate다", () => {
    const tiptap = mountAt(cellBlocks(), inCell("t-r0c0", 2));
    expect(
      planTableCellPaste(tiptap.state, clip(`a${SOH}b`, "<b>x</b>"), 3),
    ).toEqual({ kind: "delegate" });
  });

  it("무효 문자가 섞인 평문은 정리본 pasteText다", () => {
    const tiptap = mountAt(cellBlocks(), inCell("t-r0c0", 2));
    expect(planTableCellPaste(tiptap.state, clip(`a${SOH}b`), 3)).toEqual({
      kind: "pasteText",
      text: "ab",
    });
  });

  it("정리본이 비면 consume이다", () => {
    const tiptap = mountAt(cellBlocks(), inCell("t-r0c0", 2));
    expect(planTableCellPaste(tiptap.state, clip(SOH), 1)).toEqual({
      kind: "consume",
    });
  });
});

describe("planDefaultPaste", () => {
  it("클립보드가 없으면 delegate다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(planDefaultPaste(tiptap.state, null, deps)).toEqual({
      kind: "delegate",
    });
  });

  it("유효한 한 줄 평문은 delegate다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(planDefaultPaste(tiptap.state, clip("xy"), deps)).toEqual({
      kind: "delegate",
    });
  });

  it("무효 문자가 섞인 한 줄 평문은 정리본 pasteText다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(planDefaultPaste(tiptap.state, clip(`x${SOH}y`), deps)).toEqual({
      kind: "pasteText",
      text: "xy",
    });
  });

  it("블록을 못 만드는 html에 평문이 없으면 consume이다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(planDefaultPaste(tiptap.state, clip("", "<meta>"), deps)).toEqual({
      kind: "consume",
    });
  });

  it("여러 줄 평문은 직접 삽입 transaction을 dispatch한다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    const plan = planDefaultPaste(tiptap.state, clip("x\ny"), deps);
    expect(plan.kind).toBe("dispatch");
  });

  it("서식 없이 붙여넣기면 html을 읽지 않는다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(
      planDefaultPaste(
        tiptap.state,
        clip("xy", "<p><b>xy</b></p>", true),
        deps,
      ),
    ).toEqual({ kind: "delegate" });
  });

  it("codeBlock 안 무효 문자 평문은 Tab을 남긴 pasteText다", () => {
    const tiptap = mountAt([codeBlockBlock("cb", "code")], at("cb", 2));
    expect(
      planDefaultPaste(tiptap.state, clip(`a${TAB}b${SOH}`), deps),
    ).toEqual({ kind: "pasteText", text: `a${TAB}b` });
  });

  it("codeBlock 안 유효한 평문은 delegate다", () => {
    const tiptap = mountAt([codeBlockBlock("cb", "code")], at("cb", 2));
    expect(
      planDefaultPaste(tiptap.state, clip("a\nb", "<p>a</p>"), deps),
    ).toEqual({ kind: "delegate" });
  });

  describe("블록 삽입 배치", () => {
    it("자식 없는 블록 캐럿은 caret 배치다", () => {
      const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
      const plan = planDefaultPaste(tiptap.state, clip("", "<p>X</p>"), deps);
      expect(plan).toMatchObject({
        kind: "insertBlocks",
        placement: { kind: "caret", depth: 1 },
      });
    });

    it("자식 있는 블록의 끝 캐럿은 blockBoundary 배치다", () => {
      const tiptap = mountAt(
        [
          listItemBlock("li", "bulletListItem", "parent", {
            children: [paragraphBlock("c1", "child")],
          }),
        ],
        at("li", 6),
      );
      const plan = planDefaultPaste(tiptap.state, clip("", "<p>X</p>"), deps);
      expect(plan).toMatchObject({
        kind: "insertBlocks",
        placement: { kind: "blockBoundary", placement: { depth: 2 } },
      });
    });

    it("다른 블록에서 시작해 자식 있는 블록 끝에서 끝나는 범위는 afterRangeDelete 배치다", () => {
      const tiptap = mountAt(
        [
          paragraphBlock("p1", "abcd"),
          listItemBlock("li", "bulletListItem", "parent", {
            children: [paragraphBlock("c1", "child")],
          }),
        ],
        at("p1", 2),
        at("li", 6),
      );
      const plan = planDefaultPaste(tiptap.state, clip("", "<p>X</p>"), deps);
      expect(plan).toMatchObject({
        kind: "insertBlocks",
        placement: { kind: "afterRangeDelete" },
      });
    });

    it("Markdown으로 감지된 평문도 블록 삽입이다", () => {
      const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
      const plan = planDefaultPaste(tiptap.state, clip("# 제목"), deps);
      expect(plan).toMatchObject({
        kind: "insertBlocks",
        placement: { kind: "caret" },
      });
    });
  });

  it("계획은 문서를 바꾸지 않는다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    const before = tiptap.state.doc;
    planDefaultPaste(tiptap.state, clip("x\ny", "<p>X</p>"), deps);
    planDefaultPaste(tiptap.state, clip("x\ny"), deps);
    expect(tiptap.state.doc).toBe(before);
  });
});
