/**
 * 표 밖 기본 붙여넣기와 drop 계획의 결과 종류와 블록 배치를 고정한다.
 * 실행 뒤 문서·selection·undo는 clipboard 이벤트 테스트가 소유한다.
 */
import { Fragment, Slice } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { planDefaultPaste, planDrop } from "../src/paste-plan.js";
import { contentTextStart } from "./block-test-support.js";
import {
  codeBlockBlock,
  listItemBlock,
  paragraphBlock,
  sequentialIds,
} from "./list-item-block-type-support.js";
import {
  at,
  clip,
  mountAt,
  PM_SLICE,
  SOH,
  TAB,
} from "./paste-plan-test-support.js";

const deps = { createId: sequentialIds("p") };

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

describe("planDrop", () => {
  /** 이동·파일이 없는 외부 drop 입력을 만든다. */
  const drop = (text: string, html = "") => ({
    dragging: false,
    hasFiles: false,
    html,
    text,
  });

  it("dataTransfer가 없거나 내부 드래그·파일·html 동반이면 delegate다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    const position = () => contentTextStart(tiptap, "p1") + 1;
    expect(planDrop(tiptap.state, null, Slice.empty, position)).toEqual({
      kind: "delegate",
    });
    expect(
      planDrop(
        tiptap.state,
        { ...drop("x\ny"), dragging: true },
        Slice.empty,
        position,
      ),
    ).toEqual({ kind: "delegate" });
    expect(
      planDrop(
        tiptap.state,
        { ...drop("x\ny"), hasFiles: true },
        Slice.empty,
        position,
      ),
    ).toEqual({ kind: "delegate" });
    expect(
      planDrop(tiptap.state, drop("x\ny", "<p>x</p>"), Slice.empty, position),
    ).toEqual({ kind: "delegate" });
  });

  it("한 줄 평문은 좌표를 풀지 않고 delegate다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    let resolved = 0;
    const plan = planDrop(tiptap.state, drop("xy"), Slice.empty, () => {
      resolved += 1;
      return contentTextStart(tiptap, "p1") + 1;
    });
    expect(plan).toEqual({ kind: "delegate" });
    expect(resolved).toBe(0);
  });

  it("좌표를 못 풀면 delegate다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(
      planDrop(tiptap.state, drop("x\ny"), Slice.empty, () => null),
    ).toEqual({
      kind: "delegate",
    });
  });

  it("여러 줄 평문은 drop 위치 transaction을 dispatch한다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    const position = contentTextStart(tiptap, "p1") + 1;
    const plan = planDrop(
      tiptap.state,
      drop("x\ny"),
      Slice.empty,
      () => position,
    );
    expect(plan.kind).toBe("dispatch");
    if (plan.kind !== "dispatch") return;
    expect(plan.transaction.getMeta("uiEvent")).toBe("drop");
    expect(plan.transaction.getMeta("paste")).toBeUndefined();
    expect(plan.transaction.selection.from).toBe(position);
  });

  it("무효 문자가 든 slice는 정리본을 drop 위치에 넣는 transaction이다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 0));
    const position = contentTextStart(tiptap, "p1") + 2;
    const dirty = new Slice(
      Fragment.from(tiptap.schema.text(`x${SOH}y`)),
      0,
      0,
    );
    const plan = planDrop(
      tiptap.state,
      drop(`x${SOH}y`),
      dirty,
      () => position,
    );
    expect(plan.kind).toBe("dispatch");
    if (plan.kind !== "dispatch") return;
    expect(plan.transaction.getMeta("uiEvent")).toBe("drop");
    expect(plan.transaction.getMeta("paste")).toBeUndefined();
    expect(plan.transaction.doc.textContent).toBe("abxycd");
  });

  it("무효 문자뿐인 slice는 consume이다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 0));
    const position = contentTextStart(tiptap, "p1") + 2;
    const dirty = new Slice(Fragment.from(tiptap.schema.text(SOH)), 0, 0);
    expect(planDrop(tiptap.state, drop(SOH), dirty, () => position)).toEqual({
      kind: "consume",
    });
  });

  it("codeBlock 위치의 Tab만 든 slice는 유효라 delegate다", () => {
    const tiptap = mountAt([codeBlockBlock("cb", "code")], at("cb", 0));
    const position = contentTextStart(tiptap, "cb") + 2;
    const tabbed = new Slice(
      Fragment.from(tiptap.schema.text(`a${TAB}b`)),
      0,
      0,
    );
    expect(
      planDrop(tiptap.state, drop(`a${TAB}b`), tabbed, () => position),
    ).toEqual({ kind: "delegate" });
  });
});
