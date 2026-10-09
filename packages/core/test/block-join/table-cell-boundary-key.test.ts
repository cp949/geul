/**
 * 표 셀 경계 캐럿의 Backspace·Delete와 같은 표 안 셀 사이 범위의 Backspace·
 * Delete 계약을 확인한다(Issue #317).
 *
 * 셀 content는 "inline*"라(D19) caretContext가 null을 돌려준다. 이전에는
 * BlockJoin 핸들러가 false로 폴스루했고, Tiptap 기본 체인이 문서를 바꿨다가
 * revision guard가 되돌렸다. 되돌림은 selection을 문서 끝으로 보내고 빈 undo
 * 항목을 남겼다.
 *
 * 계약. 셀 맨 앞 Backspace·Mod-Backspace와 셀 맨 끝 Delete·Mod-Delete는 키를
 * 소비하고 문서·selection·stored mark·change 이벤트·dispatch·undo 단위를
 * 바꾸지 않는다(G-EDT-001). 첫 셀·마지막 셀·빈 셀·중첩 위치 표·머리글 행
 * 표도 같다. 같은 표 안 셀 사이 범위(비어 있지 않은 TextSelection, 두 끝이
 * 같은 표)의 Backspace·Delete도 같은 no-op 소비다. 겹친 셀 텍스트를 지우지
 * 않는다(#289가 이 범위를 경계 범위 삭제에서 뺀 이유가 그대로다).
 *
 * 대상 밖은 현행이다. 셀 중간 Backspace·Delete(문자 삭제)와 같은 위치의
 * Enter, 한 셀 안 범위 삭제는 바뀌지 않는다.
 *
 * 키 소비는 view.someProp("handleKeyDown", ...) 실 디스패치로 검증한다.
 * 실제 DOM 키 입력과 undo는 e2e/table-boundary-range.spec.ts가 증명한다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import {
  dispatchKeydown,
  dispatchModifiedKeydown,
} from "../block-test-support.js";
import { headingBlock, paragraphBlock } from "../editor-controller-support.js";
import {
  blocksOf,
  expectNoOpConsumed,
  gridTable,
  inCell,
  type Pos,
  run,
  type RunResult,
  TAIL,
} from "../table-boundary-test-support.js";

type Press = (tiptap: TiptapEditor) => boolean;

const backspace: Press = (t) => dispatchKeydown(t, "Backspace");
const del: Press = (t) => dispatchKeydown(t, "Delete");
const modBackspace: Press = (t) =>
  dispatchModifiedKeydown(t, "Backspace", { ctrlKey: true });
const modDelete: Press = (t) =>
  dispatchModifiedKeydown(t, "Delete", { ctrlKey: true });

/** no-op 소비 단언에 undo 항목이 없음을 더한다. */
const expectNoOpNoUndo = (result: RunResult): void => {
  expectNoOpConsumed(result);
  expect(result.tiptap.can().undo()).toBe(false);
};

/** 캐럿 하나를 두고 키를 누른다. */
const pressAt = (blocks: Block[], at: Pos, press: Press): RunResult =>
  run(blocks, at, at, press);

/** 앞 문단 + 2x2 표(`c00|c01/c10|c11`) + 뒤 문단. */
const flat = (): Block[] => [
  paragraphBlock("p0", "abcd"),
  gridTable("t", 2, 2),
  TAIL,
];

describe("셀 맨 앞 Backspace·맨 끝 Delete는 키를 소비하고 아무것도 바꾸지 않는다(Issue #317)", () => {
  it.each([
    {
      name: "c10 맨 앞 Backspace",
      cell: "t-r1c0",
      offset: 0,
      press: backspace,
    },
    {
      name: "c10 맨 앞 Mod-Backspace",
      cell: "t-r1c0",
      offset: 0,
      press: modBackspace,
    },
    {
      name: "c01 맨 앞 Backspace",
      cell: "t-r0c1",
      offset: 0,
      press: backspace,
    },
    {
      name: "c01 맨 앞 Mod-Backspace",
      cell: "t-r0c1",
      offset: 0,
      press: modBackspace,
    },
    { name: "c00 맨 끝 Delete", cell: "t-r0c0", offset: 3, press: del },
    {
      name: "c00 맨 끝 Mod-Delete",
      cell: "t-r0c0",
      offset: 3,
      press: modDelete,
    },
    { name: "c10 맨 끝 Delete", cell: "t-r1c0", offset: 3, press: del },
  ])("$name", ({ cell, offset, press }) => {
    const result = pressAt(flat(), inCell(cell, offset), press);

    expectNoOpNoUndo(result);
    expect(blocksOf(result)).toEqual([
      "paragraph:abcd",
      "table[c00|c01/c10|c11]",
      "paragraph:tail",
    ]);
  });

  it("첫 셀 맨 앞 Backspace도 소비하고 불변이다", () => {
    expectNoOpNoUndo(pressAt(flat(), inCell("t-r0c0", 0), backspace));
  });

  it("마지막 셀 맨 끝 Delete도 소비하고 불변이다", () => {
    expectNoOpNoUndo(pressAt(flat(), inCell("t-r1c1", 3), del));
  });

  it("첫 블록이 표이고 첫 셀이 비었어도 맨 앞 Backspace는 불변이다", () => {
    const result = pressAt(
      [gridTable("t", 1, 2, ["", "x"]), TAIL],
      inCell("t-r0c0", 0),
      backspace,
    );

    expectNoOpNoUndo(result);
    expect(blocksOf(result)).toEqual(["table[|x]", "paragraph:tail"]);
  });

  it("첫 블록이 표이고 마지막 셀이 비었어도 맨 끝 Delete는 불변이다", () => {
    const result = pressAt(
      [gridTable("t", 1, 2, ["x", ""]), TAIL],
      inCell("t-r0c1", 0),
      del,
    );

    expectNoOpNoUndo(result);
    expect(blocksOf(result)).toEqual(["table[x|]", "paragraph:tail"]);
  });

  it("다른 블록의 자식으로 중첩된 표의 셀도 같다", () => {
    const nested = (): Block[] => [
      {
        ...headingBlock("x", 2, "xxxx"),
        children: [gridTable("u", 2, 2)],
      } as Block,
      TAIL,
    ];

    expectNoOpNoUndo(pressAt(nested(), inCell("u-r1c0", 0), backspace));
    expectNoOpNoUndo(pressAt(nested(), inCell("u-r0c0", 3), del));
  });

  it("머리글 행이 있는 표의 셀도 같다", () => {
    const headed = (): Block[] => [
      paragraphBlock("p0", "abcd"),
      { ...gridTable("t", 2, 2), headerRows: 1 } as Block,
      TAIL,
    ];

    expectNoOpNoUndo(pressAt(headed(), inCell("t-r0c1", 0), backspace));
    expectNoOpNoUndo(pressAt(headed(), inCell("t-r1c0", 0), backspace));
    expectNoOpNoUndo(pressAt(headed(), inCell("t-r0c0", 3), del));
  });
});

describe("셀 경계가 아닌 키는 현행 그대로다(Issue #317)", () => {
  it("셀 맨 앞 Enter는 이전처럼 소비하고 불변이다", () => {
    expectNoOpNoUndo(
      pressAt(flat(), inCell("t-r1c0", 0), (t) => dispatchKeydown(t, "Enter")),
    );
  });

  it.each([
    { name: "Backspace", press: backspace },
    { name: "Delete", press: del },
  ])("셀 중간 $name 키는 BlockJoin이 소비하지 않는다", ({ press }) => {
    const result = pressAt(flat(), inCell("t-r1c0", 1), press);

    // 문자 삭제는 브라우저 몫이다. jsdom에는 native 삭제가 없어 문서가
    // 그대로이고, BlockJoin이 소비했다면 dispatch 0회가 된다.
    expect(result.handled).toBe(false);
    expect(blocksOf(result)).toEqual([
      "paragraph:abcd",
      "table[c00|c01/c10|c11]",
      "paragraph:tail",
    ]);
  });

  it("한 셀 안 범위 Backspace는 선택한 글자를 지운다", () => {
    const result = run(
      flat(),
      inCell("t-r0c0", 1),
      inCell("t-r0c0", 3),
      backspace,
    );

    expect(result.handled).toBe(true);
    expect(blocksOf(result)).toEqual([
      "paragraph:abcd",
      "table[c|c01/c10|c11]",
      "paragraph:tail",
    ]);
  });
});

describe("같은 표 안 셀 사이 범위의 Backspace·Delete는 키를 소비하고 아무것도 바꾸지 않는다(Issue #317)", () => {
  const fixture = (): Block[] => [gridTable("t", 2, 2), TAIL];

  it.each([
    { name: "Backspace", press: backspace },
    { name: "Delete", press: del },
    { name: "Mod-Backspace", press: modBackspace },
    { name: "Mod-Delete", press: modDelete },
  ])("정방향 c00:1 -> c11:1 범위 $name", ({ press }) => {
    const result = run(
      fixture(),
      inCell("t-r0c0", 1),
      inCell("t-r1c1", 1),
      press,
    );

    expectNoOpNoUndo(result);
    expect(blocksOf(result)).toEqual([
      "table[c00|c01/c10|c11]",
      "paragraph:tail",
    ]);
  });

  it.each([
    { name: "Backspace", press: backspace },
    { name: "Delete", press: del },
  ])("역방향 c11:1 -> c00:1 범위 $name", ({ press }) => {
    expectNoOpNoUndo(
      run(fixture(), inCell("t-r1c1", 1), inCell("t-r0c0", 1), press),
    );
  });

  it("같은 행 두 셀 사이 범위도 같다", () => {
    expectNoOpNoUndo(
      run(fixture(), inCell("t-r0c0", 1), inCell("t-r0c1", 2), backspace),
    );
  });

  it("중첩 위치 표의 셀 사이 범위도 같다", () => {
    const nested = (): Block[] => [
      {
        ...headingBlock("x", 2, "xxxx"),
        children: [gridTable("u", 2, 2)],
      } as Block,
      TAIL,
    ];

    expectNoOpNoUndo(
      run(nested(), inCell("u-r0c0", 1), inCell("u-r1c1", 1), backspace),
    );
  });
});
