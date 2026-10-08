/**
 * 표 셀 붙여넣기 계획의 입력 우선순위·반환 종류와 transaction을 고정한다.
 * 표 밖 null, 셀 조각 pass, HTML·평문 fallback, CellSelection 선택 대체와
 * 여러 줄 hardBreak를 다룬다. 문서 반영·selection·undo는 이벤트 테스트가 소유한다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { __pastedCells } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";

import { planTableCellPaste } from "../src/table-cell-paste-plan.js";
import { documentOf, mounted } from "./editor-controller-support.js";
import { paragraphBlock } from "./list-item-block-type-support.js";
import { at, clip, mountAt, PM_SLICE, SOH } from "./paste-plan-test-support.js";
import {
  inBlock,
  inCell,
  type Pos,
  setLiveSelection,
} from "./table-boundary-test-support.js";
import {
  findCell,
  firstCellBlocks,
  kindsInDoc,
  lastCellBlocks,
  rowDocument,
  selectFirstTwoCells,
} from "./table-cell-paste-test-support.js";
import { selectCellRange } from "./table-test-support.js";

/** 글자 n개짜리 텍스트 slice다. 셀 계획은 slice 크기로 html 내용 유무를 본다. */
const sliceOfSize = (tiptap: TiptapEditor, size: number): Slice =>
  new Slice(Fragment.from(tiptap.schema.text("x".repeat(size))), 0, 0);

/** 실제 내용이 있는 인라인 텍스트 slice를 만든다. PM 파싱 결과 대역이다. */
const textSlice = (tiptap: TiptapEditor, text: string): Slice =>
  new Slice(Fragment.from(tiptap.schema.text(text)), 0, 0);

describe("planTableCellPaste", () => {
  it("표 밖이면 null이다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(
      planTableCellPaste(tiptap.state, clip("x"), sliceOfSize(tiptap, 1)),
    ).toBeNull();
  });

  describe("CellSelection(Issue #300)", () => {
    /** 단일 셀 CellSelection이다. 평문 정책은 셀 개수와 무관하다. */
    const mountCellSelected = (): TiptapEditor => {
      const tiptap = mountAt(lastCellBlocks(), at("p1", 0));
      selectCellRange(tiptap, "t-r0c0", "t-r0c0");
      return tiptap;
    };

    // Issue #308이 정정: 수정 전에는 pass였다.
    it("html이 실제 내용을 가지면 html 인라인 내용으로 선택을 대체하는 dispatch다(Issue #308)", () => {
      const tiptap = mountCellSelected();
      const plan = planTableCellPaste(
        tiptap.state,
        clip("x", "<b>x</b>"),
        sliceOfSize(tiptap, 1),
      );
      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      expect(kindsInDoc(plan.transaction.doc, "t-r0c0")).toEqual(["x*bold"]);
      expect(tiptap.state.doc.textContent).toBe("paracelltail");
    });

    it("html이 실제 내용을 가져도 셀 인라인 줄이 0개이면 평문 dispatch, 평문도 비면 consume이다(Issue #308)", () => {
      const tiptap = mountCellSelected();
      const plan = planTableCellPaste(
        tiptap.state,
        clip("X", "<p></p><p></p>"),
        sliceOfSize(tiptap, 1),
      );
      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      expect(kindsInDoc(plan.transaction.doc, "t-r0c0")).toEqual(["X"]);
      expect(
        planTableCellPaste(
          tiptap.state,
          clip("", "<p></p><p></p>"),
          sliceOfSize(tiptap, 1),
        ),
      ).toEqual({ kind: "consume" });
    });

    it("클립보드가 없으면 pass다", () => {
      const tiptap = mountCellSelected();
      expect(
        planTableCellPaste(tiptap.state, null, sliceOfSize(tiptap, 1)),
      ).toEqual({ kind: "pass" });
    });

    it("평문이 비면 pass다", () => {
      const tiptap = mountCellSelected();
      expect(
        planTableCellPaste(tiptap.state, clip(""), sliceOfSize(tiptap, 1)),
      ).toEqual({ kind: "pass" });
    });

    /**
     * 표 행 전체 slice다. __pastedCells가 셀 조각으로 판정한다. 셀 하나
     * CellSelection의 from·to로 자른 slice는 셀 안 인라인 내용이라 셀 조각이
     * 아니다(Issue #308 작업 중 확인).
     */
    const rowsSlice = (tiptap: TiptapEditor): Slice => {
      const { doc } = tiptap.state;
      const tableStart = doc.child(0).nodeSize;
      const slice = doc.slice(
        tableStart + 1,
        tableStart + doc.child(1).nodeSize - 1,
      );
      expect(__pastedCells(slice)).not.toBeNull();
      return slice;
    };

    it("셀 조각 slice는 html이 없으면 평문이 있어도 pass다", () => {
      const tiptap = mountCellSelected();
      expect(
        planTableCellPaste(tiptap.state, clip("x"), rowsSlice(tiptap)),
      ).toEqual({ kind: "pass" });
    });

    // Issue #308이 정정: html이 있으면 셀 조각 판정보다 html 분기가 먼저다.
    // 목록 html이 CellSelection 문맥에서 셀 조각으로 판정되기 때문이다. 표
    // html은 TablePasteExtension이 이 계획보다 먼저 처리해 실제 붙여넣기에서는
    // 여기 오지 않는다. importHtml이 실패하는 html(`<table></table>`)은 평문
    // 정책이다. 수정 전 기존 테스트(셀 범위로 자른 slice + 이 html → pass)는
    // 셀 조각이 아니라 html 실제 내용 분기로 pass였다.
    it("셀 조각 slice에 셀 인라인으로 바꿀 수 없는 html이 오면 평문 dispatch다(Issue #308)", () => {
      const tiptap = mountCellSelected();
      const plan = planTableCellPaste(
        tiptap.state,
        clip("x", "<table></table>"),
        rowsSlice(tiptap),
      );
      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      expect(kindsInDoc(plan.transaction.doc, "t-r0c0")).toEqual(["x"]);
    });

    it("셀 조각 slice라도 목록 html이면 셀 인라인으로 넣는다(Issue #308)", () => {
      const tiptap = mountCellSelected();
      const plan = planTableCellPaste(
        tiptap.state,
        clip("a\nb", "<ul><li>a</li><li>b</li></ul>"),
        rowsSlice(tiptap),
      );
      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      expect(kindsInDoc(plan.transaction.doc, "t-r0c0")).toEqual([
        "a",
        "br",
        "b",
      ]);
    });

    it("html 없는 유효한 평문은 선택을 대체하는 dispatch다. 계획은 문서를 바꾸지 않는다", () => {
      const tiptap = mountCellSelected();
      const plan = planTableCellPaste(
        tiptap.state,
        clip("X"),
        sliceOfSize(tiptap, 1),
      );
      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      expect(plan.transaction.doc.textContent).toBe("paraXtail");
      expect(tiptap.state.doc.textContent).toBe("paracelltail");
    });

    // Issue #308 분기는 정리한 slice가 실제 내용을 가질 때만 탄다. 빈 slice
    // html은 #300 판정 그대로다. 평문까지 비면 이전처럼 pass다.
    it("빈 slice html에 평문도 비면 #300과 같이 pass다(Issue #308 분기 밖)", () => {
      const tiptap = mountCellSelected();
      expect(
        planTableCellPaste(tiptap.state, clip("", "<meta>"), PM_SLICE),
      ).toEqual({ kind: "pass" });
    });

    it("빈 slice html이면 평문을 dispatch로 넣는다", () => {
      const tiptap = mountCellSelected();
      expect(
        planTableCellPaste(tiptap.state, clip("X", "<meta>"), PM_SLICE)?.kind,
      ).toBe("dispatch");
    });

    it("무효 문자가 섞인 평문은 pasteText가 아니라 정리본 dispatch다", () => {
      const tiptap = mountCellSelected();
      const plan = planTableCellPaste(
        tiptap.state,
        clip(`a${SOH}b`),
        sliceOfSize(tiptap, 3),
      );
      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      expect(plan.transaction.doc.textContent).toBe("paraabtail");
    });

    it("정리본이 비면 consume이다", () => {
      const tiptap = mountCellSelected();
      expect(
        planTableCellPaste(tiptap.state, clip(SOH), sliceOfSize(tiptap, 1)),
      ).toEqual({ kind: "consume" });
    });
  });

  it("셀 안에 셀 조각 slice를 붙이면 pass다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 2));
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
    const tiptap = mountAt(
      lastCellBlocks(),
      inCell("t-r0c0", 2),
      at("tail", 2),
    );
    expect(
      planTableCellPaste(tiptap.state, clip("ab"), sliceOfSize(tiptap, 1)),
    ).not.toBeNull();
  });

  it("무효 문자가 든 html slice는 정리해 넣는다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 2));
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
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 2));
    expect(
      planTableCellPaste(tiptap.state, clip("ab"), sliceOfSize(tiptap, 1)),
    ).toMatchObject({ kind: "insertSlice" });
  });

  it("html이 내용을 가지면 delegate다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 2));
    expect(
      planTableCellPaste(
        tiptap.state,
        clip(`a${SOH}b`, "<b>x</b>"),
        sliceOfSize(tiptap, 3),
      ),
    ).toMatchObject({ kind: "insertSlice" });
  });

  it("무효 문자가 섞인 평문은 정리본 pasteText다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 2));
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
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 2));
    expect(
      planTableCellPaste(tiptap.state, clip(SOH), sliceOfSize(tiptap, 1)),
    ).toEqual({
      kind: "consume",
    });
  });
});

describe("planTableCellPaste 여러 줄 평문(Issue #299)", () => {
  /** 계획 transaction이 만든 셀 t-r0c0의 자식을 종류 목록으로 줄인다. */
  const cellKinds = (tr: Transaction): string[] => {
    const kinds: string[] = [];
    findCell(tr.doc, "t-r0c0").forEach((child) => {
      kinds.push(child.isText ? (child.text ?? "") : child.type.name);
    });
    return kinds;
  };

  it("셀 안 캐럿의 여러 줄 평문은 hardBreak를 이은 dispatch다. 계획은 문서를 바꾸지 않는다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));

    const plan = planTableCellPaste(
      tiptap.state,
      clip("a\nb"),
      sliceOfSize(tiptap, 1),
    );

    expect(plan?.kind).toBe("dispatch");
    if (plan?.kind !== "dispatch") return;
    expect(cellKinds(plan.transaction)).toEqual(["cella", "hardBreak", "b"]);
    expect(tiptap.state.doc.textContent).toBe("paracelltail");
  });

  it("무효 문자가 섞인 여러 줄은 pasteText가 아니라 정리본 dispatch다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));

    const plan = planTableCellPaste(
      tiptap.state,
      clip(`a${SOH}b\nc`),
      sliceOfSize(tiptap, 3),
    );

    expect(plan?.kind).toBe("dispatch");
    if (plan?.kind !== "dispatch") return;
    expect(cellKinds(plan.transaction)).toEqual(["cellab", "hardBreak", "c"]);
  });

  it("빈 slice html + 여러 줄 평문도 dispatch다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));

    expect(
      planTableCellPaste(tiptap.state, clip("a\nb", "<meta>"), PM_SLICE)?.kind,
    ).toBe("dispatch");
  });

  it("서식 있는 html은 서식 없이 붙여넣기 신호가 없으면 insertSlice, 있으면 평문 dispatch다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));
    const slice = sliceOfSize(tiptap, 1);

    expect(
      planTableCellPaste(tiptap.state, clip("a\nb", "<b>x</b>"), slice)?.kind,
    ).toBe("insertSlice");
    expect(
      planTableCellPaste(tiptap.state, clip("a\nb", "<b>x</b>", true), slice)
        ?.kind,
    ).toBe("dispatch");
  });

  it("한 줄 평문은 서식 없이 붙여넣기 신호가 있어도 현행 계획이다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));

    expect(
      planTableCellPaste(
        tiptap.state,
        clip("ab", "<b>x</b>", true),
        sliceOfSize(tiptap, 1),
      )?.kind,
    ).toBe("insertSlice");
  });

  it("정리본이 비는 입력은 consume이다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));

    expect(
      planTableCellPaste(tiptap.state, clip(SOH), sliceOfSize(tiptap, 1)),
    ).toEqual({ kind: "consume" });
  });

  it("CellSelection의 연속 개행은 hardBreak 하나다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 0));
    selectCellRange(tiptap, "t-r0c0", "t-r0c0");

    const plan = planTableCellPaste(
      tiptap.state,
      clip("a\n\nb"),
      sliceOfSize(tiptap, 1),
    );

    expect(plan?.kind).toBe("dispatch");
    if (plan?.kind !== "dispatch") return;
    expect(cellKinds(plan.transaction)).toEqual(["a", "hardBreak", "b"]);
  });
});

describe("planTableCellPaste 여러 블록 html(Issue #304)", () => {
  const TWO_PARAGRAPHS = "<p>a</p><p>b</p>";

  /** 셀 조각 slice다. 표 안에서 복사한 셀을 PM이 이렇게 파싱한다. */
  const cellFragmentSlice = (tiptap: TiptapEditor): Slice => {
    let found: Slice | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (found !== null) return false;
      if (node.type.name !== "table") return true;
      found = tiptap.state.doc.slice(pos, pos + node.nodeSize);
      return false;
    });
    if (found === null) throw new Error("표 조회 실패");
    return found;
  };

  it("문단 둘은 hardBreak를 이은 dispatch다. 계획은 문서를 바꾸지 않고 meta를 단다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));
    const before = tiptap.state.doc;

    const plan = planTableCellPaste(
      tiptap.state,
      clip("a\nb", TWO_PARAGRAPHS),
      sliceOfSize(tiptap, 1),
    );

    expect(plan?.kind).toBe("dispatch");
    if (plan?.kind !== "dispatch") return;
    expect(kindsInDoc(plan.transaction.doc, "t-r0c0")).toEqual([
      "cella",
      "br",
      "b",
    ]);
    expect(plan.transaction.getMeta("paste")).toBe(true);
    expect(plan.transaction.getMeta("uiEvent")).toBe("paste");
    expect(plan.transaction.scrolledIntoView).toBe(true);
    expect(tiptap.state.doc).toBe(before);
  });

  it("목록 html이 셀 조각 slice로 파싱돼도 셀 조각 pass보다 먼저 dispatch다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));

    const plan = planTableCellPaste(
      tiptap.state,
      clip("a\nb", "<ul><li>a</li><li>b</li></ul>"),
      cellFragmentSlice(tiptap),
    );

    expect(plan?.kind).toBe("dispatch");
  });

  it("표를 포함한 html은 이 분기를 타지 않는다. 셀 조각이면 pass다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));

    const plan = planTableCellPaste(
      tiptap.state,
      clip("a\tb", "<table><tr><td>a</td><td>b</td></tr></table>"),
      cellFragmentSlice(tiptap),
    );

    expect(plan).toEqual({ kind: "pass" });
  });

  it("표와 문단 여러 개가 섞인 html은 줄이 둘이어도 이전 계획이다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));

    const plan = planTableCellPaste(
      tiptap.state,
      clip("a", "<table><tr><td>x</td></tr></table><p>a</p><p>b</p>"),
      sliceOfSize(tiptap, 1),
    );

    expect(plan?.kind).toBe("insertSlice");
  });

  it.each([
    { name: "문단 하나", html: "<p>a</p>" },
    { name: "굵은 글자", html: "<b>x</b>" },
    { name: "목록 항목 하나", html: "<ul><li>a</li></ul>" },
    { name: "codeBlock 하나", html: "<pre><code>a\nb</code></pre>" },
  ])("content 블록이 하나인 html($name)은 이전 계획이다", ({ html }) => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));

    const plan = planTableCellPaste(
      tiptap.state,
      clip("a", html),
      sliceOfSize(tiptap, 1),
    );

    expect(plan?.kind).toBe("insertSlice");
  });

  // Issue #304 리뷰로 정정: 전에는 줄이 1개 이하인 "빈 문단이 섞인 문단 하나"
  // (`<p>a</p><p></p>`)를 이전 계획(insertSlice)으로 단언했다. 이전 경로는 표
  // 뒤에 빈 문단을 남기는 결함이었다. 이제 남은 한 줄을 셀에 넣는 dispatch다.
  it.each([
    { name: "빈 문단이 섞인 문단 하나", html: "<p>a</p><p></p>" },
    { name: "빈 첫 문단", html: "<p></p><p>a</p>" },
  ])(
    "블록이 둘 이상이면 줄이 1개 남아도 dispatch다($name, Issue #304 리뷰로 정정)",
    ({ html }) => {
      const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));

      const plan = planTableCellPaste(
        tiptap.state,
        clip("a", html),
        sliceOfSize(tiptap, 1),
      );

      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      expect(kindsInDoc(plan.transaction.doc, "t-r0c0")).toEqual(["cella"]);
    },
  );

  it("줄이 모두 비는 html은 이전 계획이다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));

    const plan = planTableCellPaste(
      tiptap.state,
      clip("a", "<p></p><p></p>"),
      sliceOfSize(tiptap, 1),
    );

    expect(plan?.kind).toBe("insertSlice");
  });

  it("클립보드가 없으면 이전 계획이다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));

    expect(
      planTableCellPaste(tiptap.state, null, sliceOfSize(tiptap, 1))?.kind,
    ).toBe("insertSlice");
  });

  it("서식 없이 붙여넣기 신호가 있으면 html을 보지 않고 평문을 넣는다", () => {
    const tiptap = mountAt(lastCellBlocks(), inCell("t-r0c0", 4));

    const plan = planTableCellPaste(
      tiptap.state,
      clip("x\ny", TWO_PARAGRAPHS, true),
      sliceOfSize(tiptap, 1),
    );

    expect(plan?.kind).toBe("dispatch");
    if (plan?.kind !== "dispatch") return;
    expect(kindsInDoc(plan.transaction.doc, "t-r0c0")).toEqual([
      "cellx",
      "br",
      "y",
    ]);
  });

  // Issue #308이 정정: 수정 전에는 pass였다. CellSelection은 이 분기 대신
  // CellSelection html 분기가 받는다. 선택 셀 내용을 대체한다(기존 "cell"이
  // 남지 않는다).
  it("CellSelection은 이 분기를 타지 않고 CellSelection html 분기가 선택을 대체한다(Issue #308이 정정)", () => {
    const tiptap = mountAt(lastCellBlocks(), at("p1", 0));
    selectCellRange(tiptap, "t-r0c0", "t-r0c0");

    const plan = planTableCellPaste(
      tiptap.state,
      clip("a\nb", TWO_PARAGRAPHS),
      sliceOfSize(tiptap, 1),
    );

    expect(plan?.kind).toBe("dispatch");
    if (plan?.kind !== "dispatch") return;
    expect(kindsInDoc(plan.transaction.doc, "t-r0c0")).toEqual([
      "a",
      "br",
      "b",
    ]);
  });

  it("직접 삽입 대상이 아닌 범위(다른 셀에 걸침·표 밖에서 끝남)는 이전 계획이다", () => {
    const grid = mountAt(
      firstCellBlocks(),
      inCell("g-r0c0", 1),
      inCell("g-r0c1", 1),
    );
    const across = mountAt(
      lastCellBlocks(),
      inCell("t-r0c0", 2),
      inBlock("tail", 2),
    );

    expect(
      planTableCellPaste(
        grid.state,
        clip("a\nb", TWO_PARAGRAPHS),
        sliceOfSize(grid, 1),
      )?.kind,
    ).toBe("insertSlice");
    expect(
      planTableCellPaste(
        across.state,
        clip("a\nb", TWO_PARAGRAPHS),
        sliceOfSize(across, 1),
      )?.kind,
    ).toBe("insertSlice");
  });

  it("표 밖 캐럿은 null이다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));

    expect(
      planTableCellPaste(
        tiptap.state,
        clip("a\nb", TWO_PARAGRAPHS),
        sliceOfSize(tiptap, 1),
      ),
    ).toBeNull();
  });
});

describe("CellSelection 평문 붙여넣기(Issue #300)", () => {
  describe("계획 transaction(P3)", () => {
    // 이벤트 결과는 리터럴 개행 정규화(Issue #281)가 보정해 같아진다. 보정 전
    // 계획 자체가 hardBreak 노드를 담는지 직접 본다.
    it("여러 줄 계획은 문자열 개행이 아니라 hardBreak 노드를 담는다", () => {
      const m = mounted(documentOf(...rowDocument()));
      selectFirstTwoCells(m.tiptap);

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "", text: "X\nY", plain: false },
        Slice.empty,
      );

      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      const firstCell = plan.transaction.doc.child(1).child(0).child(0);
      const kinds: string[] = [];
      firstCell.forEach((child) => {
        kinds.push(child.isText ? `text:${child.text}` : child.type.name);
      });
      expect(kinds).toEqual(["text:X", "hardBreak", "text:Y"]);
      expect(plan.transaction.getMeta("paste")).toBe(true);
      expect(plan.transaction.getMeta("uiEvent")).toBe("paste");
      expect(plan.transaction.scrolledIntoView).toBe(true);
    });
  });

  describe("html 분기(P5)", () => {
    // 서식 없이 붙여넣기(Ctrl+Shift+V)면 PM이 평문으로 slice를 만든다. 그 slice를
    // prosemirror-tables에 맡기면 같은 NOID 되돌림이 일어난다. html이 함께 와도
    // 평문 정책이 선택을 대체한다.
    it("서식 없이 붙여넣기 신호가 있으면 서식 있는 html이 와도 평문 정책이 적용된다", () => {
      const m = mounted(documentOf(...rowDocument()));
      selectFirstTwoCells(m.tiptap);

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "<b>x</b>", text: "ab", plain: true },
        textSlice(m.tiptap, "ab"),
      );

      expect(plan?.kind).toBe("dispatch");
    });

    // Issue #308이 정정: 수정 전 계획은 pass였다.
    it("서식 없이 붙여넣기 신호가 없으면 서식 있는 html을 셀 인라인으로 넣는다(Issue #308이 정정)", () => {
      const m = mounted(documentOf(...rowDocument()));
      selectFirstTwoCells(m.tiptap);

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "<b>x</b>", text: "ab", plain: false },
        textSlice(m.tiptap, "x"),
      );

      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      expect(kindsInDoc(plan.transaction.doc, "g-r0c0")).toEqual(["x*bold"]);
      expect(kindsInDoc(plan.transaction.doc, "g-r0c1")).toEqual([]);
    });
  });
});

describe("표 셀 안 여러 줄 평문 붙여넣기(Issue #299)", () => {
  describe("직접 삽입 대상 밖(C12)", () => {
    /**
     * 부모가 다른 범위는 계획 판정만 본다. 표 경계 범위는 실행기가 먼저
     * 지운 뒤 호출 시점 state로 다시 판정한다(Issue #292).
     */
    const planFor = (blocks: Block[], anchor: Pos, head: Pos, text: string) => {
      const m = mounted(documentOf(...blocks));
      setLiveSelection(m.tiptap, anchor(m.tiptap), head(m.tiptap));
      return planTableCellPaste(
        m.tiptap.state,
        { html: "", text, plain: false },
        Slice.empty,
      );
    };

    it("시작이 셀 안이고 끝이 표 밖인 범위는 직접 삽입하지 않는다", () => {
      const plan = planFor(
        lastCellBlocks(),
        inCell("t-r0c0", 2),
        inBlock("tail", 2),
        "a\nb",
      );

      expect(plan?.kind).toBe("insertSlice");
    });

    it("다른 셀에 걸친 TextSelection은 직접 삽입하지 않는다", () => {
      const plan = planFor(
        firstCellBlocks(),
        inCell("g-r0c0", 1),
        inCell("g-r0c1", 1),
        "a\nb",
      );

      expect(plan?.kind).toBe("insertSlice");
    });

    it("셀 조각 slice는 pass다", () => {
      const m = mounted(documentOf(...lastCellBlocks()));
      setLiveSelection(
        m.tiptap,
        inCell("t-r0c0", 2)(m.tiptap),
        inCell("t-r0c0", 2)(m.tiptap),
      );
      let tableSlice: Slice | null = null;
      m.tiptap.state.doc.descendants((node, pos) => {
        if (tableSlice !== null) return false;
        if (node.type.name !== "table") return true;
        tableSlice = m.tiptap.state.doc.slice(pos, pos + node.nodeSize);
        return false;
      });
      if (tableSlice === null) throw new Error("표 조회 실패");

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "<table></table>", text: "a\nb", plain: false },
        tableSlice,
      );

      expect(plan).toEqual({ kind: "pass" });
    });

    it("표 밖 캐럿은 null이다", () => {
      const plan = planFor(
        lastCellBlocks(),
        inBlock("p1", 2),
        inBlock("p1", 2),
        "a\nb",
      );

      expect(plan).toBeNull();
    });
  });

  describe("transaction 계약(C13)", () => {
    it("계획은 paste·uiEvent meta와 scrollIntoView를 단 dispatch이고 문서를 바꾸지 않는다", () => {
      const m = mounted(documentOf(...lastCellBlocks()));
      setLiveSelection(
        m.tiptap,
        inCell("t-r0c0", 4)(m.tiptap),
        inCell("t-r0c0", 4)(m.tiptap),
      );
      const before = m.tiptap.state.doc;

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "", text: "a\nb", plain: false },
        new Slice(Fragment.empty, 0, 0),
      );

      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      expect(plan.transaction.getMeta("paste")).toBe(true);
      expect(plan.transaction.getMeta("uiEvent")).toBe("paste");
      expect(plan.transaction.scrolledIntoView).toBe(true);
      expect(m.tiptap.state.doc).toBe(before);
    });

    // 이벤트 결과는 리터럴 개행 정규화(Issue #281)가 보정해 같아질 수 있다.
    // 보정 전 계획 자체가 hardBreak 노드를 담는지 직접 본다.
    it("계획 transaction은 개행 문자가 아니라 hardBreak 노드를 담는다", () => {
      const m = mounted(documentOf(...lastCellBlocks()));
      setLiveSelection(
        m.tiptap,
        inCell("t-r0c0", 4)(m.tiptap),
        inCell("t-r0c0", 4)(m.tiptap),
      );

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "", text: "a\nb", plain: false },
        Slice.empty,
      );

      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      expect(kindsInDoc(plan.transaction.doc, "t-r0c0")).toEqual([
        "cella",
        "br",
        "b",
      ]);
    });
  });
});
