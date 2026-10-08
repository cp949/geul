/**
 * 표 셀 안 여러 블록 html 붙여넣기에서 importHtml이 실패했을 때의 계획을 고정한다
 * (Issue #304). 외부 입력 실패는 Result다. 실패하면 셀 인라인 변환을 건너뛰고
 * 이전 계획으로 내려간다. 실제 html로는 importHtml 실패를 만들기 어려워
 * importHtml만 실패로 바꾼다. 나머지 io 내보내기는 원본 그대로다.
 * CellSelection의 서식 있는 html(Issue #308)은 실패하면 평문 정책(#300)이다.
 */
import { importHtml } from "@cp949/geul-io";
import { Fragment, Slice } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vitest";

import { planTableCellPaste } from "../src/table-cell-paste-plan.js";
import { documentOf, mounted } from "./editor-controller-support.js";
import { inCell, setLiveSelection } from "./table-boundary-test-support.js";
import {
  firstCellBlocks,
  kindsInDoc,
  lastCellBlocks,
  selectFirstTwoCells,
} from "./table-cell-paste-test-support.js";

vi.mock("@cp949/geul-io", async (importOriginal) => {
  const original = await importOriginal<typeof import("@cp949/geul-io")>();
  return {
    ...original,
    importHtml: vi.fn(() => ({
      ok: false,
      error: { code: "HTML_PARSE_FAILED", message: "forced" },
    })),
  };
});

describe("planTableCellPaste importHtml 실패(Issue #304)", () => {
  it("importHtml이 실패하면 이전 계획(insertSlice)이다. 던지지 않는다", () => {
    const m = mounted(documentOf(...lastCellBlocks()));
    const caret = inCell("t-r0c0", 4)(m.tiptap);
    setLiveSelection(m.tiptap, caret, caret);

    const plan = planTableCellPaste(
      m.tiptap.state,
      { html: "<p>a</p><p>b</p>", text: "a\nb", plain: false },
      new Slice(Fragment.from(m.tiptap.schema.text("x")), 0, 0),
    );

    expect(importHtml).toHaveBeenCalled();
    expect(plan?.kind).toBe("insertSlice");
  });
});

describe("planTableCellPaste CellSelection importHtml 실패(Issue #308)", () => {
  it("importHtml이 실패하면 평문 정책 dispatch다. pass로 가지 않는다", () => {
    const m = mounted(documentOf(...firstCellBlocks()));
    selectFirstTwoCells(m.tiptap);

    const plan = planTableCellPaste(
      m.tiptap.state,
      { html: "<b>x</b>", text: "ab", plain: false },
      new Slice(Fragment.from(m.tiptap.schema.text("x")), 0, 0),
    );

    expect(importHtml).toHaveBeenCalled();
    expect(plan?.kind).toBe("dispatch");
    if (plan?.kind !== "dispatch") return;
    expect(kindsInDoc(plan.transaction.doc, "g-r0c0")).toEqual(["ab"]);
    expect(kindsInDoc(plan.transaction.doc, "g-r0c1")).toEqual([]);
  });

  it("importHtml이 실패하고 평문도 비면 consume이다", () => {
    const m = mounted(documentOf(...firstCellBlocks()));
    selectFirstTwoCells(m.tiptap);

    expect(
      planTableCellPaste(
        m.tiptap.state,
        { html: "<b>x</b>", text: "", plain: false },
        new Slice(Fragment.from(m.tiptap.schema.text("x")), 0, 0),
      ),
    ).toEqual({ kind: "consume" });
  });
});
