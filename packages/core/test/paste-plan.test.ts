/**
 * 붙여넣기 계획(paste-plan.ts)의 판정을 표로 고정한다(Issue #306). 계획은
 * 문서를 바꾸지 않고 결과 종류만 돌려준다. 실행 결과(문서 변화)는
 * clipboard-*.test.ts의 이벤트 테스트가 소유한다. 여기서는 결과 종류마다
 * 대표 입력 하나를 둔다.
 *
 * 표 셀 계획(planTableCellPaste)은 pass·insertSlice·consume·pasteText와 표
 * 밖 null을, 기본 계획(planDefaultPaste)은 insertSlice·consume·pasteText·dispatch와
 * 블록 삽입 배치 3종(caret·blockBoundary·afterRangeDelete)을, drop 계획
 * (planPlainDrop)은 delegate·dispatch를 다룬다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  type PasteClipboard,
  planDefaultPaste,
  planPlainDrop,
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

/** PM이 파싱한 slice 자리다. 기본 계획은 이 slice를 그대로 넣는다. */
const PM_SLICE = new Slice(Fragment.empty, 0, 0);

/** 글자 n개짜리 텍스트 slice다. 셀 계획은 slice 크기로 html 내용 유무를 본다. */
const sliceOfSize = (tiptap: TiptapEditor, size: number): Slice =>
  new Slice(Fragment.from(tiptap.schema.text("x".repeat(size))), 0, 0);

const cellBlocks = (): Block[] => [
  paragraphBlock("p1", "para"),
  singleCellTable("t", "cell"),
  TAIL,
];

describe("planTableCellPaste", () => {
  it("표 밖이면 null이다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(
      planTableCellPaste(tiptap.state, clip("x"), sliceOfSize(tiptap, 1)),
    ).toBeNull();
  });

  it("CellSelection이면 pass다", () => {
    const tiptap = mountAt(cellBlocks(), at("p1", 0));
    selectCellRange(tiptap, "t-r0c0", "t-r0c0");
    expect(
      planTableCellPaste(tiptap.state, clip("x"), sliceOfSize(tiptap, 1)),
    ).toEqual({
      kind: "pass",
    });
  });

  it("셀 안에 셀 조각 slice를 붙이면 pass다", () => {
    const tiptap = mountAt(cellBlocks(), inCell("t-r0c0", 2));
    let tableSlice: Slice | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (tableSlice !== null) return false;
      if (node.type.name !== "table") return true;
      tableSlice = tiptap.state.doc.slice(pos, pos + node.nodeSize);
      return false;
    });
    if (tableSlice === null) throw new Error("표 조회 실패");
    expect(
      planTableCellPaste(
        tiptap.state,
        clip("cell", "<table></table>"),
        tableSlice,
      ),
    ).toEqual({ kind: "pass" });
  });

  it("범위 시작이 셀 안이면 끝이 표 밖이어도 셀 계획이다", () => {
    const tiptap = mountAt(cellBlocks(), inCell("t-r0c0", 2), at("tail", 2));
    expect(
      planTableCellPaste(tiptap.state, clip("ab"), sliceOfSize(tiptap, 1)),
    ).not.toBeNull();
  });

  it("무효 문자가 든 html slice는 정리해 넣는다", () => {
    const tiptap = mountAt(cellBlocks(), inCell("t-r0c0", 2));
    const dirty = new Slice(
      Fragment.from(tiptap.schema.text(`a${SOH}b`)),
      0,
      0,
    );
    const plan = planTableCellPaste(
      tiptap.state,
      clip("ab", `<p>a${SOH}b</p>`),
      dirty,
    );
    expect(plan?.kind).toBe("insertSlice");
    if (plan?.kind !== "insertSlice") return;
    expect(plan.slice.content.textBetween(0, plan.slice.content.size)).toBe(
      "ab",
    );
  });

  it("html 없는 유효한 평문은 delegate다", () => {
    const tiptap = mountAt(cellBlocks(), inCell("t-r0c0", 2));
    expect(
      planTableCellPaste(tiptap.state, clip("ab"), sliceOfSize(tiptap, 1)),
    ).toMatchObject({ kind: "insertSlice" });
  });

  it("html이 내용을 가지면 delegate다", () => {
    const tiptap = mountAt(cellBlocks(), inCell("t-r0c0", 2));
    expect(
      planTableCellPaste(
        tiptap.state,
        clip(`a${SOH}b`, "<b>x</b>"),
        sliceOfSize(tiptap, 3),
      ),
    ).toMatchObject({ kind: "insertSlice" });
  });

  it("무효 문자가 섞인 평문은 정리본 pasteText다", () => {
    const tiptap = mountAt(cellBlocks(), inCell("t-r0c0", 2));
    expect(
      planTableCellPaste(
        tiptap.state,
        clip(`a${SOH}b`),
        sliceOfSize(tiptap, 3),
      ),
    ).toEqual({
      kind: "pasteText",
      text: "ab",
    });
  });

  it("정리본이 비면 consume이다", () => {
    const tiptap = mountAt(cellBlocks(), inCell("t-r0c0", 2));
    expect(
      planTableCellPaste(tiptap.state, clip(SOH), sliceOfSize(tiptap, 1)),
    ).toEqual({
      kind: "consume",
    });
  });
});

describe("planDefaultPaste", () => {
  it("클립보드가 없으면 delegate다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(planDefaultPaste(tiptap.state, null, PM_SLICE, deps)).toEqual({
      kind: "insertSlice",
      slice: PM_SLICE,
    });
  });

  it("유효한 한 줄 평문은 delegate다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(planDefaultPaste(tiptap.state, clip("xy"), PM_SLICE, deps)).toEqual({
      kind: "insertSlice",
      slice: PM_SLICE,
    });
  });

  it("무효 문자가 섞인 한 줄 평문은 정리본 pasteText다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(
      planDefaultPaste(tiptap.state, clip(`x${SOH}y`), PM_SLICE, deps),
    ).toEqual({
      kind: "pasteText",
      text: "xy",
    });
  });

  it("블록을 못 만드는 html에 평문이 없으면 consume이다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(
      planDefaultPaste(tiptap.state, clip("", "<meta>"), PM_SLICE, deps),
    ).toEqual({
      kind: "consume",
    });
  });

  it("여러 줄 평문은 직접 삽입 transaction을 dispatch한다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    const plan = planDefaultPaste(tiptap.state, clip("x\ny"), PM_SLICE, deps);
    expect(plan.kind).toBe("dispatch");
  });

  it("서식 없이 붙여넣기면 html을 읽지 않는다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(
      planDefaultPaste(
        tiptap.state,
        clip("xy", "<p><b>xy</b></p>", true),
        PM_SLICE,
        deps,
      ),
    ).toEqual({ kind: "insertSlice", slice: PM_SLICE });
  });

  it("codeBlock 안 무효 문자 평문은 Tab을 남긴 pasteText다", () => {
    const tiptap = mountAt([codeBlockBlock("cb", "code")], at("cb", 2));
    expect(
      planDefaultPaste(tiptap.state, clip(`a${TAB}b${SOH}`), PM_SLICE, deps),
    ).toEqual({ kind: "pasteText", text: `a${TAB}b` });
  });

  it("codeBlock 안 유효한 평문은 delegate다", () => {
    const tiptap = mountAt([codeBlockBlock("cb", "code")], at("cb", 2));
    expect(
      planDefaultPaste(tiptap.state, clip("a\nb", "<p>a</p>"), PM_SLICE, deps),
    ).toEqual({ kind: "insertSlice", slice: PM_SLICE });
  });

  describe("블록 삽입 배치", () => {
    it("자식 없는 블록 캐럿은 caret 배치다", () => {
      const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
      const plan = planDefaultPaste(
        tiptap.state,
        clip("", "<p>X</p>"),
        PM_SLICE,
        deps,
      );
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
      const plan = planDefaultPaste(
        tiptap.state,
        clip("", "<p>X</p>"),
        PM_SLICE,
        deps,
      );
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
      const plan = planDefaultPaste(
        tiptap.state,
        clip("", "<p>X</p>"),
        PM_SLICE,
        deps,
      );
      expect(plan).toMatchObject({
        kind: "insertBlocks",
        placement: { kind: "afterRangeDelete" },
      });
    });

    it("Markdown으로 감지된 평문도 블록 삽입이다", () => {
      const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
      const plan = planDefaultPaste(
        tiptap.state,
        clip("# 제목"),
        PM_SLICE,
        deps,
      );
      expect(plan).toMatchObject({
        kind: "insertBlocks",
        placement: { kind: "caret" },
      });
    });
  });

  it("계획은 문서를 바꾸지 않는다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    const before = tiptap.state.doc;
    planDefaultPaste(tiptap.state, clip("x\ny", "<p>X</p>"), PM_SLICE, deps);
    planDefaultPaste(tiptap.state, clip("x\ny"), PM_SLICE, deps);
    expect(tiptap.state.doc).toBe(before);
  });
});

describe("planPlainDrop", () => {
  const drop = (text: string, html = "") => ({
    dragging: false,
    hasFiles: false,
    html,
    text,
  });

  it("dataTransfer가 없거나 내부 드래그·파일·html 동반이면 delegate다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    const position = () => contentTextStart(tiptap, "p1") + 1;
    expect(planPlainDrop(tiptap.state, null, position)).toEqual({
      kind: "delegate",
    });
    expect(
      planPlainDrop(
        tiptap.state,
        { ...drop("x\ny"), dragging: true },
        position,
      ),
    ).toEqual({ kind: "delegate" });
    expect(
      planPlainDrop(
        tiptap.state,
        { ...drop("x\ny"), hasFiles: true },
        position,
      ),
    ).toEqual({ kind: "delegate" });
    expect(
      planPlainDrop(tiptap.state, drop("x\ny", "<p>x</p>"), position),
    ).toEqual({ kind: "delegate" });
  });

  it("한 줄 평문은 좌표를 풀지 않고 delegate다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    let resolved = 0;
    const plan = planPlainDrop(tiptap.state, drop("xy"), () => {
      resolved += 1;
      return contentTextStart(tiptap, "p1") + 1;
    });
    expect(plan).toEqual({ kind: "delegate" });
    expect(resolved).toBe(0);
  });

  it("좌표를 못 풀면 delegate다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(planPlainDrop(tiptap.state, drop("x\ny"), () => null)).toEqual({
      kind: "delegate",
    });
  });

  it("여러 줄 평문은 drop 위치 transaction을 dispatch한다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    const position = contentTextStart(tiptap, "p1") + 1;
    const plan = planPlainDrop(tiptap.state, drop("x\ny"), () => position);
    expect(plan.kind).toBe("dispatch");
    if (plan.kind !== "dispatch") return;
    expect(plan.transaction.getMeta("uiEvent")).toBe("drop");
    expect(plan.transaction.getMeta("paste")).toBeUndefined();
    expect(plan.transaction.selection.from).toBe(position);
  });
});
