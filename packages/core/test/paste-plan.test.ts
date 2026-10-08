/**
 * 붙여넣기 계획(paste-plan.ts)의 판정을 표로 고정한다(Issue #306). 계획은
 * 문서를 바꾸지 않고 결과 종류만 돌려준다. 실행 결과(문서 변화)는
 * clipboard-*.test.ts의 이벤트 테스트가 소유한다. 여기서는 결과 종류마다
 * 대표 입력 하나를 둔다.
 *
 * 표 셀 계획(planTableCellPaste)은 pass·insertSlice·consume·pasteText·dispatch와
 * 표 밖 null을(CellSelection의 조건별 결과는 Issue #300·#308, 셀 안 여러 줄 평문은
 * Issue #299), 기본 계획(planDefaultPaste)은 insertSlice·consume·pasteText·dispatch와
 * 블록 삽입 배치 3종(caret·blockBoundary·afterRangeDelete)을, drop 계획
 * (planDrop)은 delegate·dispatch·consume을 다룬다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import { __pastedCells } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  type PasteClipboard,
  planDefaultPaste,
  planDrop,
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
import { inBlock, inCell } from "./table-boundary-test-support.js";
import {
  findCell,
  firstCellBlocks,
  kindsInDoc,
  lastCellBlocks,
} from "./table-cell-paste-test-support.js";
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

describe("planTableCellPaste", () => {
  it("표 밖이면 null이다", () => {
    const tiptap = mountAt([paragraphBlock("p1", "abcd")], at("p1", 2));
    expect(
      planTableCellPaste(tiptap.state, clip("x"), sliceOfSize(tiptap, 1)),
    ).toBeNull();
  });

  describe("CellSelection(Issue #300)", () => {
    // 단일 셀 CellSelection이다. 평문 정책은 셀 개수와 무관하다.
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

    // 표 행 전체 slice다. __pastedCells가 셀 조각으로 판정한다. 셀 하나
    // CellSelection의 from·to로 자른 slice는 셀 안 인라인 내용이라 셀 조각이
    // 아니다(Issue #308 작업 중 확인).
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
