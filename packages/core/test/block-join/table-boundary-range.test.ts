/**
 * 표 경계에 걸친 범위 선택의 Enter·Backspace·Delete 계약을 확인한다
 * (Issue #289).
 *
 * 경계 범위는 비어 있지 않은 TextSelection이고 $from과 $to가 속한 표가
 * 서로 다른 범위다. 한쪽만 표 안이거나 서로 다른 두 표 안이다. CellSelection,
 * 양 끝이 표 밖인 범위(표를 완전히 감싸는 범위 포함)는 대상이 아니라 현행
 * 동작을 유지한다. 같은 표 안 범위는 Issue #317에서 갱신했다. 경계 범위 삭제
 * 대상은 아니지만, Backspace·Delete는 키를 소비하고 문서·selection을 바꾸지
 * 않는다(셀 사이 범위의 소유 테스트는 table-cell-boundary-key.test.ts).
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
 * 첫 블록이 표이고 범위가 첫 셀 시작에서 시작하면 선택이 문서 전체를 덮는다
 * (Issue #317). Tiptap Keymap의 clearDocument가 appendTransaction에서
 * clearNodes()로 cellId가 null인 셀을 만들었고 revision guard가 삭제를 통째로
 * 되돌렸다. deleteTableBoundaryRange의 tr에 preventClearDocument 메타를 걸어
 * 이 경로를 막는다. Backspace·Delete·Cut이 같은 함수를 거친다.
 *
 * 끝 블록이 상위 블록의 자식이면 라벨이 범위에 든 상위 블록은 타입과 attrs를
 * 유지한 빈 라벨로 남는다(Issue #293). 이전에는 빈 paragraph가 되거나 끝
 * 블록이 다른 부모로 합류하거나 서브트리가 사라졌다. 끝이 표 셀인 경우와
 * 체인 앞 형제 삭제도 같은 규칙이다.
 *
 * 키 소비는 view.someProp("handleKeyDown", ...) 실 디스패치로 검증한다.
 * 실제 확장 세트(createEditor + mountTiptapEditor)를 쓴다. 실제 DOM
 * 선택과 키 입력은 e2e/table-boundary-range.spec.ts가 증명한다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import {
  dispatchKeydown,
  dispatchModifiedKeydown,
} from "../block-test-support.js";
import {
  calloutBlock,
  checkListItemBlock,
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
  blocksOf,
  expectNoOpConsumed,
  expectRestored,
  gridTable,
  inBlock,
  inCell,
  mergedTable,
  outline,
  type Pos,
  run,
  type RunResult,
  setLiveSelection,
  singleCellTable,
  TAIL,
  withDomSelection,
} from "../table-boundary-test-support.js";
import { selectCellRange } from "../table-test-support.js";
// jsdom에 없는 ClipboardEvent·DataTransfer 폴리필을 등록한다(Cut 테스트).
import "../clipboard-test-support.js";
import { expectSchemaValid } from "./block-join-test-support.js";

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

  it.each(["Backspace", "Delete"])(
    "같은 표 안 셀 사이 범위 %s는 경계 범위 삭제가 아니라 키만 소비하고 아무것도 바꾸지 않는다(Issue #317)",
    (key) => {
      const result = run(
        [gridTable("t", 2, 2), TAIL],
        inCell("t-r0c0", 1),
        inCell("t-r1c1", 1),
        (t) => dispatchKeydown(t, key),
      );

      // 경계 범위로 취급하면 겹친 셀 텍스트가 지워진다(`c`·`1` 등). Enter와
      // 같은 no-op 소비 계약이다. 이전에는 PM 기본 경로가 문서를 바꿨다가
      // revision guard가 되돌려 캐럿이 문서 끝으로 가고 undo 항목이 남았다.
      expectNoOpConsumed(result);
      expect(result.tiptap.can().undo()).toBe(false);
      expect(blocksOf(result)).toEqual([
        "table[c00|c01/c10|c11]",
        "paragraph:tail",
      ]);
    },
  );

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

describe("첫 블록이 표이고 범위가 첫 셀 시작에서 문서 끝까지면 표 구조를 유지하고 텍스트만 지운다(Issue #317)", () => {
  const cut = (tiptap: TiptapEditor): boolean => {
    const event = new ClipboardEvent("cut", {
      clipboardData: new DataTransfer(),
      bubbles: true,
      cancelable: true,
    });
    tiptap.view.dom.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const key = (name: string) => (tiptap: TiptapEditor) =>
    dispatchKeydown(tiptap, name);
  const modKey = (name: string) => (tiptap: TiptapEditor) =>
    dispatchModifiedKeydown(tiptap, name, { ctrlKey: true });

  const fixture = (): Block[] => [gridTable("t", 2, 2), TAIL];

  it.each([
    { name: "Backspace", press: key("Backspace") },
    { name: "Delete", press: key("Delete") },
    { name: "Mod-Backspace", press: modKey("Backspace") },
    { name: "Mod-Delete", press: modKey("Delete") },
    { name: "Cut", press: cut },
  ])(
    "$name 키는 셀 텍스트와 뒤 문단 텍스트를 지우고 표를 유지한다",
    ({ press }) => {
      const result = run(
        fixture(),
        inCell("t-r0c0", 0),
        inBlock("tail", 4),
        press,
      );

      // 수정 전: 문서 불변, 캐럿 문서 끝, canUndo=true. clearDocument가 만든
      // cellId null 셀을 revision guard가 되돌렸다.
      expect(result.handled).toBe(true);
      expect(result.dispatchCount).toBe(1);
      expect(blocksOf(result)).toEqual(["table[|/|]", "paragraph:"]);
      expectSchemaValid(result.tiptap);
      const { selection } = result.tiptap.state;
      expect(selection.empty).toBe(true);
      expect(selection.from).toBe(result.anchor);
    },
  );

  it("셀 id와 표 구조(행·열)가 그대로다", () => {
    const result = run(
      fixture(),
      inCell("t-r0c0", 0),
      inBlock("tail", 4),
      key("Backspace"),
    );

    const cellIds: string[] = [];
    let rowCount = 0;
    result.tiptap.state.doc.descendants((node) => {
      if (node.type.name === "tableRow") rowCount += 1;
      if (node.type.name === "tableCell") cellIds.push(node.attrs.cellId);
      return true;
    });
    expect(rowCount).toBe(2);
    expect(cellIds).toEqual(["t-r0c0", "t-r0c1", "t-r1c0", "t-r1c1"]);
  });

  it("undo 1회로 문서와 selection이 원복된다", () => {
    const result = run(
      fixture(),
      inCell("t-r0c0", 0),
      inBlock("tail", 4),
      key("Backspace"),
    );

    expect(result.tiptap.commands.undo()).toBe(true);
    expectRestored(result);
  });

  it("역방향 선택(head가 첫 셀 시작)도 같다", () => {
    const result = run(
      fixture(),
      inBlock("tail", 4),
      inCell("t-r0c0", 0),
      key("Backspace"),
    );

    expect(blocksOf(result)).toEqual(["table[|/|]", "paragraph:"]);
  });

  it("첫 셀 중간에서 시작하면 앞 글자는 남는다(기준선)", () => {
    const result = run(
      fixture(),
      inCell("t-r0c0", 1),
      inBlock("tail", 4),
      key("Backspace"),
    );

    expect(blocksOf(result)).toEqual(["table[c|/|]", "paragraph:"]);
  });
});

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

// 라벨이 범위에 든 상위 블록(Issue #293). 끝 블록이 상위 블록의 자식이면
// 그 상위 블록은 타입과 attrs를 유지한 채 빈 라벨로 남는다. 기준 문서 D는
// [table 1x1 "cell", X "xxxx" > 자식 B "wxyz", paragraph "tail"]이고
// 선택은 셀 offset 2 -> B offset 2다.
describe("라벨이 범위에 든 상위 블록은 타입과 attrs를 유지한 빈 라벨로 남는다(Issue #293)", () => {
  const child = () => paragraphBlock("b", "wxyz");
  const withChild = (block: Block): Block =>
    ({ ...block, children: [child()] }) as Block;

  // 상위가 될 수 있는 8종 중 라벨 타입과 attrs가 있는 7종(paragraph 제외).
  const PARENTS = [
    {
      type: "heading",
      make: () => withChild(headingBlock("x", 2, "xxxx")),
      attrs: { type: "heading", level: 2 },
    },
    {
      type: "quote",
      make: () => quoteBlock("x", "xxxx", [child()]),
      attrs: { type: "quote" },
    },
    {
      type: "callout",
      make: () => calloutBlock("x", "xxxx", "i", [child()]),
      attrs: { type: "callout", icon: "i" },
    },
    {
      type: "toggleListItem",
      make: () =>
        toggleBlock("x", "xxxx", { collapsed: false, children: [child()] }),
      attrs: { type: "toggleListItem", collapsed: false },
    },
    {
      type: "bulletListItem",
      make: () =>
        listItemBlock("x", "bulletListItem", "xxxx", { children: [child()] }),
      attrs: { type: "bulletListItem" },
    },
    {
      type: "numberedListItem",
      make: () =>
        listItemBlock("x", "numberedListItem", "xxxx", {
          startNumber: 3,
          children: [child()],
        }),
      attrs: { type: "numberedListItem", startNumber: 3 },
    },
    {
      type: "checkListItem",
      make: () => withChild(checkListItemBlock("x", "xxxx", true)),
      attrs: { type: "checkListItem", checked: true },
    },
  ] as const;

  const KEYS_293 = [
    ...KEYS,
    {
      key: "Mod-Backspace",
      press: (t: TiptapEditor) =>
        dispatchModifiedKeydown(t, "Backspace", { ctrlKey: true }),
    },
    {
      key: "Mod-Delete",
      press: (t: TiptapEditor) =>
        dispatchModifiedKeydown(t, "Delete", { ctrlKey: true }),
    },
  ];

  const modelBlocks = (result: RunResult) => result.editor.getDocument().blocks;
  const expectIntact = (result: RunResult): void => {
    result.tiptap.state.doc.check();
    expectSchemaValid(result.tiptap);
  };
  const cellToChild = (
    blocks: Block[],
    press: (t: TiptapEditor) => boolean,
    childId = "b",
    childOffset = 2,
  ) => run(blocks, inCell("t-r0c0", 2), inBlock(childId, childOffset), press);

  describe.each(KEYS_293)("$key", ({ press }) => {
    it.each(PARENTS)(
      "$type 상위 블록은 타입과 attrs를 유지하고 라벨이 비며 자식 B는 `yz`다",
      ({ type, make, attrs }) => {
        const result = cellToChild(
          [singleCellTable("t", "cell"), make(), TAIL],
          press,
        );

        expect(result.handled).toBe(true);
        expect(blocksOf(result)).toEqual([
          "table[ce]",
          `${type}:>{paragraph:yz}`,
          "paragraph:tail",
        ]);
        expect(modelBlocks(result)[1]).toMatchObject(attrs);
        expectIntact(result);
      },
    );

    it("조부모 `X > Y > B`는 X·Y가 모두 타입과 attrs를 유지하고 라벨이 빈다", () => {
      const result = cellToChild(
        [
          singleCellTable("t", "cell"),
          quoteBlock("x", "xxxx", [calloutBlock("y", "yyyy", "i", [child()])]),
          TAIL,
        ],
        press,
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "table[ce]",
        "quote:>{callout:>{paragraph:yz}}",
        "paragraph:tail",
      ]);
      expect(modelBlocks(result)[1]).toMatchObject({
        type: "quote",
        children: [
          {
            type: "callout",
            icon: "i",
            children: [{ type: "paragraph" }],
          },
        ],
      });
      expectIntact(result);
    });

    it.each([
      {
        name: "X > B",
        parent: () => quoteBlock("x", "xxxx", [child()]),
        expected: "quote:>{paragraph:}",
      },
      {
        name: "X > [S, B]",
        parent: () =>
          quoteBlock("x", "xxxx", [paragraphBlock("s", "ss"), child()]),
        expected: "quote:>{paragraph:}",
      },
      {
        name: "X > Y > B",
        parent: () =>
          quoteBlock("x", "xxxx", [calloutBlock("y", "yyyy", "i", [child()])]),
        expected: "quote:>{callout:>{paragraph:}}",
      },
      {
        name: "X > [B, C]",
        parent: () =>
          quoteBlock("x", "xxxx", [child(), paragraphBlock("c", "cc")]),
        expected: "quote:>{paragraph:,paragraph:cc}",
      },
    ])(
      "끝 블록 텍스트를 전부 덮어도($name) 서브트리가 사라지지 않고 B는 빈 텍스트로 남는다",
      ({ parent, expected }) => {
        const result = cellToChild(
          [singleCellTable("t", "cell"), parent(), TAIL],
          press,
          "b",
          4,
        );

        expect(result.handled).toBe(true);
        expect(blocksOf(result)).toEqual([
          "table[ce]",
          expected,
          "paragraph:tail",
        ]);
        expect(modelBlocks(result)[1]).toMatchObject({ type: "quote" });
        expectIntact(result);
      },
    );
  });

  it("끝 블록이 최상위이면 B 전체를 덮어도 빈 B가 남는 기준선이 그대로다", () => {
    const result = run(
      [singleCellTable("t", "cell"), paragraphBlock("w", "wxyz"), TAIL],
      inCell("t-r0c0", 2),
      inBlock("w", 4),
      (t) => dispatchKeydown(t, "Backspace"),
    );

    expect(blocksOf(result)).toEqual([
      "table[ce]",
      "paragraph:",
      "paragraph:tail",
    ]);
  });

  it("앞 형제 `X > [S, B]`에서 S는 삭제되고 X는 유지된다", () => {
    const result = cellToChild(
      [
        singleCellTable("t", "cell"),
        {
          ...headingBlock("x", 2, "xxxx"),
          children: [paragraphBlock("s", "ss"), child()],
        } as Block,
        TAIL,
      ],
      (t) => dispatchKeydown(t, "Backspace"),
    );

    expect(blocksOf(result)).toEqual([
      "table[ce]",
      "heading:>{paragraph:yz}",
      "paragraph:tail",
    ]);
    expect(modelBlocks(result)[1]).toMatchObject({ type: "heading", level: 2 });
    expectIntact(result);
  });

  it("뒤 형제 `X > [B, C]`에서 C는 그대로 남는다", () => {
    const result = cellToChild(
      [
        singleCellTable("t", "cell"),
        quoteBlock("x", "xxxx", [child(), paragraphBlock("c", "cc")]),
        TAIL,
      ],
      (t) => dispatchKeydown(t, "Backspace"),
    );

    expect(blocksOf(result)).toEqual([
      "table[ce]",
      "quote:>{paragraph:yz,paragraph:cc}",
      "paragraph:tail",
    ]);
    expectIntact(result);
  });

  describe("끝이 표 셀이면 표의 상위 블록에도 같은 규칙이다", () => {
    const fromT = inCell("t-r0c0", 2);
    const toU = inCell("u-r0c0", 2);

    it("5i: 표 t의 셀에서 `X > [표 u]`의 u 셀까지 범위는 X가 타입과 attrs를 유지하고 라벨이 빈다", () => {
      const result = run(
        [
          singleCellTable("t", "cell"),
          {
            ...headingBlock("x", 2, "xxxx"),
            children: [singleCellTable("u", "cell")],
          } as Block,
          TAIL,
        ],
        fromT,
        toU,
        (t) => dispatchKeydown(t, "Backspace"),
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "table[ce]",
        "heading:>{table[ll]}",
        "paragraph:tail",
      ]);
      expect(modelBlocks(result)[1]).toMatchObject({
        type: "heading",
        level: 2,
      });
      expectIntact(result);
    });

    it("5j: 표 u 앞 형제 S는 삭제되고 X는 유지되며 u 셀은 선택 구간만 지워진다", () => {
      const result = run(
        [
          singleCellTable("t", "cell"),
          calloutBlock("x", "xxxx", "i", [
            paragraphBlock("s", "ss"),
            singleCellTable("u", "cell"),
          ]),
          TAIL,
        ],
        fromT,
        toU,
        (t) => dispatchKeydown(t, "Backspace"),
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "table[ce]",
        "callout:>{table[ll]}",
        "paragraph:tail",
      ]);
      expect(modelBlocks(result)[1]).toMatchObject({
        type: "callout",
        icon: "i",
      });
      expectIntact(result);
    });
  });

  describe("표가 상위 블록의 자식이고 끝 블록이 다른 상위 블록의 자식이다", () => {
    it("5f: `X1 > [table]`의 셀에서 `X2 > [B]`까지 범위는 B가 X2의 자식으로 남고 X1에 합류하지 않는다", () => {
      const result = run(
        [
          quoteBlock("x1", "x1x1", [singleCellTable("t", "cell")]),
          calloutBlock("x2", "xxxx", "i", [child()]),
          TAIL,
        ],
        inCell("t-r0c0", 2),
        inBlock("b", 2),
        (t) => dispatchKeydown(t, "Backspace"),
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "quote:x1x1>{table[ce]}",
        "callout:>{paragraph:yz}",
        "paragraph:tail",
      ]);
      expect(modelBlocks(result)[1]).toMatchObject({
        type: "callout",
        icon: "i",
      });
      expectIntact(result);
    });

    it("`X1 > [table, Z]` -> `X2 > [B]`에서 Z는 삭제되고 X2는 유지된다", () => {
      const result = run(
        [
          quoteBlock("x1", "x1x1", [
            singleCellTable("t", "cell"),
            paragraphBlock("z", "zz"),
          ]),
          calloutBlock("x2", "xxxx", "i", [child()]),
          TAIL,
        ],
        inCell("t-r0c0", 2),
        inBlock("b", 2),
        (t) => dispatchKeydown(t, "Backspace"),
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "quote:x1x1>{table[ce]}",
        "callout:>{paragraph:yz}",
        "paragraph:tail",
      ]);
      expectIntact(result);
    });
  });

  it("dispatch 1회, undo 1회로 문서와 selection이 원복되고 캐럿은 범위 시작에 접힌다", () => {
    const blocks = () => [
      singleCellTable("t", "cell"),
      quoteBlock("x", "xxxx", [
        paragraphBlock("s", "ss"),
        calloutBlock("y", "yyyy", "i", [child()]),
      ]),
      TAIL,
    ];
    const result = cellToChild(blocks(), (t) =>
      dispatchKeydown(t, "Backspace"),
    );

    expect(result.dispatchCount).toBe(1);
    expect(result.changes).toHaveLength(1);
    expect(result.tiptap.state.selection.empty).toBe(true);
    expect(result.tiptap.state.selection.from).toBe(result.anchor);
    expect(blocksOf(result)).toEqual([
      "table[ce]",
      "quote:>{callout:>{paragraph:yz}}",
      "paragraph:tail",
    ]);
    expectIntact(result);

    expect(result.editor.commands.undo()).toEqual(okResult);
    expectRestored(result);
    expect(result.editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  describe("대상 밖은 현행이다", () => {
    it("시작 쪽 거울 5a: 표가 X의 자식이고 범위가 X 라벨 중간에서 시작하면 라벨 꼬리 텍스트만 지운다", () => {
      const result = run(
        [
          {
            ...headingBlock("x", 2, "xxxx"),
            children: [singleCellTable("t", "cell")],
          } as Block,
          TAIL,
        ],
        inBlock("x", 2),
        inCell("t-r0c0", 2),
        (t) => dispatchKeydown(t, "Backspace"),
      );

      expect(blocksOf(result)).toEqual([
        "heading:xx>{table[ll]}",
        "paragraph:tail",
      ]);
      expect(modelBlocks(result)[0]).toMatchObject({
        type: "heading",
        level: 2,
      });
      expectIntact(result);
    });

    it("시작 쪽 거울 5d: X 라벨과 표 사이 형제는 삭제된다", () => {
      const result = run(
        [
          quoteBlock("x", "xxxx", [
            paragraphBlock("s", "ss"),
            singleCellTable("t", "cell"),
          ]),
          TAIL,
        ],
        inBlock("x", 2),
        inCell("t-r0c0", 2),
        (t) => dispatchKeydown(t, "Backspace"),
      );

      expect(blocksOf(result)).toEqual([
        "quote:xx>{table[ll]}",
        "paragraph:tail",
      ]);
      expectIntact(result);
    });

    it("시작 쪽 거울 5h: 표 뒤 형제는 범위 밖이라 남는다", () => {
      const result = run(
        [
          quoteBlock("x", "xxxx", [
            singleCellTable("t", "cell"),
            paragraphBlock("z", "zz"),
          ]),
          TAIL,
        ],
        inBlock("x", 2),
        inCell("t-r0c0", 2),
        (t) => dispatchKeydown(t, "Backspace"),
      );

      expect(blocksOf(result)).toEqual([
        "quote:xx>{table[ll],paragraph:zz}",
        "paragraph:tail",
      ]);
      expectIntact(result);
    });

    it("접힌 toggle X는 selection guard가 head를 라벨 끝으로 당겨 문서가 손상되지 않는다", () => {
      const result = cellToChild(
        [
          singleCellTable("t", "cell"),
          toggleBlock("x", "xxxx", { collapsed: true, children: [child()] }),
          TAIL,
        ],
        (t) => dispatchKeydown(t, "Backspace"),
      );

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        "table[ce]",
        "toggleListItem:>{paragraph:wxyz}",
        "paragraph:tail",
      ]);
      expect(modelBlocks(result)[1]).toMatchObject({
        type: "toggleListItem",
        collapsed: true,
      });
      expectIntact(result);
    });

    it("두 끝이 모두 표 밖이면(표를 완전히 감싸는 범위) 표를 지우고 양 끝 블록을 병합하는 현행이다", () => {
      const result = run(
        [
          paragraphBlock("a", "abcd"),
          singleCellTable("t", "cell"),
          quoteBlock("x", "xxxx", [child()]),
          TAIL,
        ],
        inBlock("a", 2),
        inBlock("b", 2),
        (t) => dispatchKeydown(t, "Backspace"),
      );

      expect(blocksOf(result)).toEqual(["paragraph:abyz", "paragraph:tail"]);
      expectIntact(result);
    });
  });
});
