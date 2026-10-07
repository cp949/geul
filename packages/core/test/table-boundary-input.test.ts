/**
 * 표 경계에 걸친 범위 선택의 글자 입력·Cut·붙여넣기·끌어 놓기·Shift-Enter·
 * insertCustomInlineContent 계약을 확인한다(Issue #292).
 *
 * 경계 범위는 비어 있지 않은 TextSelection이고 $from과 $to가 속한 표가
 * 서로 다른 범위다(Issue #289, table-boundary-range.ts). 이전에는 이 범위의
 * 입력 경로가 PM 기본 deleteSelection·replaceSelection을 타서 선택하지 않은
 * 뒷부분 텍스트가 셀로 옮겨 가거나 표가 사라졌다.
 *
 * 규칙은 #289 Backspace와 같다. 선택한 텍스트만 지우고(표 안은 셀 텍스트만,
 * 표 밖은 일반 삭제) 삽입은 지운 뒤 범위 시작의 캐럿에 들어간다. 끝 블록은
 * 남은 텍스트를 그대로 가진다. 예외는 내부 이동 drop이다. 부분 표 slice를
 * 임의 위치에 꽂는 결과가 정의되지 않아 문서·selection을 바꾸지 않고
 * 소비한다. 복사 드래그와 외부 drop은 현행이다.
 *
 * 다루는 축:
 * - 글자 입력: PM keypress 실 디스패치. 방향(정·역)과 서로 다른 두 표 포함
 * - IME: 조합 시작(compositionstart)이 범위를 먼저 지운다
 * - Cut: 지운 뒤 삽입 없음. clipboardData는 Copy와 같다
 * - 붙여넣기: plain 1·2줄·HTML·Markdown·TSV·표 HTML. undo 횟수
 * - 끌어 놓기: 내부 이동 drop 소비, 복사 드래그·외부 drop 현행
 * - Shift-Enter: head 위치와 무관하게 hardBreak 삽입. 삽입할 수 없는
 *   캐럿(codeBlock·h1)은 지우기만 하고 소비한다
 * - insertCustomInlineContent
 * - 대상 밖 현행 유지(같은 셀·같은 표 안 범위·CellSelection·표를 감싸는
 *   범위·표 밖)
 * - Tiptap InputRule은 경계 범위에서 변환을 일으키지 않는다
 * - DOM 파생 selection 기준 적용과 역방향 stale 소비(G-EDT-002)
 *
 * 방향은 anchor→head다. 정방향은 범위 시작이 anchor이고 역방향은 head다.
 * 셀에서 뒤 블록으로 가는 정방향과 앞 블록에서 셀로 가는 역방향은 $head가
 * 표 밖이고, 반대 두 방향은 $head가 셀이다. 핸들러의 isInTable($head) 판정이
 * 방향마다 다른 경로를 타서 네 방향을 모두 시험한다.
 *
 * 실제 DOM 선택·키 입력·IME는 e2e/table-boundary-input.spec.ts가 증명한다.
 * 실제 확장 세트(createEditor + mountTiptapEditor)를 쓴다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import type { CustomInlineContentDefinition } from "../src/index.js";
import { expectSchemaValid } from "./block-join/block-join-test-support.js";
import { dispatchKeydown, dispatchTextInput } from "./block-test-support.js";
import { dispatchPasteData } from "./clipboard-test-support.js";
import {
  calloutBlock,
  codeBlockBlock,
  dividerBlock,
  documentOf,
  editorState,
  headingBlock,
  mounted,
  notApplicable,
  okResult,
  paragraphBlock,
  quoteBlock,
} from "./editor-controller-support.js";
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
} from "./table-boundary-test-support.js";
import { selectCellRange } from "./table-test-support.js";

/**
 * 경계 범위 fixture. blocks는 문서, from·to는 범위 시작·끝 위치다. after는
 * 지운 뒤 캐럿에 ins를 삽입한 결과 최상위 블록 요약이다. 끝 블록은 남은
 * 텍스트를 가진다.
 */
interface Scenario {
  readonly id: "C1" | "C2" | "C3";
  readonly name: string;
  readonly blocks: () => Block[];
  readonly from: Pos;
  readonly to: Pos;
  readonly after: (ins: string) => string[];
}

// D1: 표 1x1 "cell" 뒤 문단 "wxyz". D3: 앞 문단 "abcd" 뒤 표 1x1 "cell".
const d1 = (): Block[] => [
  singleCellTable("t", "cell"),
  paragraphBlock("w", "wxyz"),
  TAIL,
];
const d3 = (): Block[] => [
  paragraphBlock("a", "abcd"),
  singleCellTable("t", "cell"),
  TAIL,
];

const C1: Scenario = {
  id: "C1",
  name: "셀 2 -> 뒤 문단 2",
  blocks: d1,
  from: inCell("t-r0c0", 2),
  to: inBlock("w", 2),
  after: (ins) => [`table[ce${ins}]`, "paragraph:yz", "paragraph:tail"],
};
const C2: Scenario = {
  id: "C2",
  name: "셀 0 -> 뒤 문단 1",
  blocks: d1,
  from: inCell("t-r0c0", 0),
  to: inBlock("w", 1),
  after: (ins) => [`table[${ins}]`, "paragraph:xyz", "paragraph:tail"],
};
const C3: Scenario = {
  id: "C3",
  name: "앞 문단 2 -> 셀 2",
  blocks: d3,
  from: inBlock("a", 2),
  to: inCell("t-r0c0", 2),
  after: (ins) => [`paragraph:ab${ins}`, "table[ll]", "paragraph:tail"],
};
const SCENARIOS: readonly Scenario[] = [C1, C2, C3];

/** 동작. 마운트된 tiptap과 컨트롤러를 받아 이벤트 소비 여부를 돌려준다. */
type Act = (tiptap: TiptapEditor, editor: RunResult["editor"]) => boolean;

/** 정방향·역방향 선택으로 시나리오를 실행한다. */
const runScenario = (
  scenario: Scenario,
  reversed: boolean,
  act: Act,
  options: Parameters<typeof run>[4] = {},
): RunResult =>
  reversed
    ? run(scenario.blocks(), scenario.to, scenario.from, act, options)
    : run(scenario.blocks(), scenario.from, scenario.to, act, options);

/** 시나리오 x 방향 조합. it.each 입력이다. */
const CASES = SCENARIOS.flatMap((scenario) =>
  [
    { direction: "정방향", reversed: false },
    { direction: "역방향", reversed: true },
  ].map((entry) => ({ scenario, ...entry })),
);

/** PM keypress를 실 디스패치한다. 소비 여부(defaultPrevented)를 돌려준다. */
const typeChar =
  (char: string): Act =>
  (tiptap) => {
    const event = new KeyboardEvent("keypress", {
      key: char,
      charCode: char.charCodeAt(0),
      bubbles: true,
      cancelable: true,
    });
    tiptap.view.dom.dispatchEvent(event);
    return event.defaultPrevented;
  };

/** cut·copy 이벤트를 실 디스패치한다. 이벤트와 담긴 clipboardData를 돌려준다. */
const clipboardEvent = (
  tiptap: TiptapEditor,
  type: "cut" | "copy",
  data: DataTransfer | null = new DataTransfer(),
) => {
  const event = new ClipboardEvent(type, {
    clipboardData: data,
    bubbles: true,
    cancelable: true,
  });
  tiptap.view.dom.dispatchEvent(event);
  return { event, data };
};

const cut: Act = (tiptap) =>
  clipboardEvent(tiptap, "cut").event.defaultPrevented;

/** 시나리오 범위의 cut·copy가 clipboardData에 실은 text/plain·text/html. */
const clipboardPayload = (
  scenario: Scenario,
  reversed: boolean,
  type: "cut" | "copy",
) => {
  const payload = { plain: "", html: "" };
  runScenario(scenario, reversed, (tiptap) => {
    const { event, data } = clipboardEvent(tiptap, type);
    payload.plain = data?.getData("text/plain") ?? "";
    payload.html = data?.getData("text/html") ?? "";
    return event.defaultPrevented;
  });
  return payload;
};

/** paste 이벤트를 실 디스패치한다. 소비 여부(defaultPrevented)를 돌려준다. */
const paste =
  (entries: Record<string, string>): Act =>
  (tiptap) =>
    dispatchPasteData(tiptap.view.dom, entries).defaultPrevented;

/**
 * 끌기를 끝낸다. Tiptap 붙여넣기 규칙은 문서에 붙은 편집기의 dragstart를
 * 전역에 기억하고 dragend에서만 지운다. 안 지우면 다음 테스트의 drop이 이미
 * 해제된 편집기에 10ms 뒤 deleteRange를 건다.
 */
const endDrag = (): void => {
  window.dispatchEvent(new Event("dragend"));
};

/**
 * 현재 selection을 dragstart로 끌기 시작해 pos에 놓는다. dragstart가 PM의
 * view.dragging을 채우고 drop이 그것을 쓴다. copy가 true면 복사 드래그다.
 * external이 있으면 dragstart 없이 외부에서 끌어 온 text/plain 하나를 놓는다.
 * jsdom은 좌표를 해석하지 못해 posAtCoords를 고정한다.
 */
const dragAndDrop =
  (pos: Pos, options: { copy?: boolean; external?: string } = {}): Act =>
  (tiptap) => {
    const data = new DataTransfer();
    if (options.external === undefined) {
      tiptap.view.dom.dispatchEvent(
        new DragEvent("dragstart", {
          dataTransfer: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    } else {
      data.setData("text/plain", options.external);
    }
    const posAtCoords = vi
      .spyOn(tiptap.view, "posAtCoords")
      .mockReturnValue({ pos: pos(tiptap), inside: -1 });
    try {
      const drop = new DragEvent("drop", {
        dataTransfer: data,
        ctrlKey: options.copy === true,
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      });
      tiptap.view.dom.dispatchEvent(drop);
      return drop.defaultPrevented;
    } finally {
      posAtCoords.mockRestore();
      endDrag();
    }
  };

/** IME 조합 시작(compositionstart)을 실 디스패치한다. 이 확장은 항상 false로 물러난다. */
const compositionStart: Act = (tiptap) => {
  const event = new CompositionEvent("compositionstart", {
    bubbles: true,
    cancelable: true,
  });
  tiptap.view.dom.dispatchEvent(event);
  return true;
};

const shiftEnter: Act = (tiptap) => dispatchKeydown(tiptap, "Enter", true);

/** 문서 안 노드 수를 센다. */
const countOf = (result: RunResult, typeName: string): number => {
  let count = 0;
  result.tiptap.state.doc.descendants((node) => {
    if (node.type.name === typeName) count += 1;
    return true;
  });
  return count;
};

/** undo 1회로 원복되고 두 번째 undo는 대상이 없음을 단언한다. */
const expectUndoOnce = (result: RunResult): void => {
  expect(result.editor.commands.undo()).toEqual(okResult);
  expectRestored(result);
  expect(result.editor.commands.undo()).toEqual(notApplicable("undo"));
};

describe("표 경계 범위에서 글자를 입력하면 선택한 텍스트만 지우고 캐럿에 삽입한다(Issue #292)", () => {
  it.each(CASES)(
    "$scenario.id $scenario.name ($direction): 입력 결과가 #289 Backspace 결과에 글자를 더한 모양이다",
    ({ scenario, reversed }) => {
      const result = runScenario(scenario, reversed, typeChar("Q"));

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual(scenario.after("Q"));
      expectSchemaValid(result.tiptap);
    },
  );

  it.each(CASES)(
    "$scenario.id $scenario.name ($direction): dispatch 1회, undo 1회로 문서와 selection이 원복된다",
    ({ scenario, reversed }) => {
      const result = runScenario(scenario, reversed, typeChar("Q"));

      expect(result.dispatchCount).toBe(1);
      expect(result.changes).toHaveLength(1);
      expectUndoOnce(result);
    },
  );

  it("입력 뒤 캐럿은 삽입한 글자 뒤에 접혀 있다", () => {
    const result = run(
      d1(),
      inCell("t-r0c0", 2),
      inBlock("w", 2),
      typeChar("Q"),
    );

    expect(result.tiptap.state.selection.empty).toBe(true);
    expect(result.tiptap.state.selection.from).toBe(result.anchor + 1);
  });

  it("2x2 표 셀(1,1) offset 1에서 뒤 문단 offset 2까지 범위는 셀 `cQ`와 뒤 문단 `yz`를 남긴다", () => {
    const result = run(
      [gridTable("t", 2, 2), paragraphBlock("w", "wxyz"), TAIL],
      inCell("t-r1c1", 1),
      inBlock("w", 2),
      typeChar("Q"),
    );

    expect(blocksOf(result)).toEqual([
      "table[c00|c01/c10|cQ]",
      "paragraph:yz",
      "paragraph:tail",
    ]);
    expectSchemaValid(result.tiptap);
  });

  it("서로 다른 두 표에 걸친 범위는 양쪽 표 셀을 규칙대로 지우고 시작 셀에 입력한다", () => {
    const result = run(
      [
        singleCellTable("t1", "cell"),
        paragraphBlock("m", "mmmm"),
        singleCellTable("t2", "cell"),
        TAIL,
      ],
      inCell("t1-r0c0", 2),
      inCell("t2-r0c0", 2),
      typeChar("Q"),
    );

    expect(blocksOf(result)).toEqual([
      "table[ceQ]",
      "table[ll]",
      "paragraph:tail",
    ]);
    expectSchemaValid(result.tiptap);
  });

  it("병합 셀 표에서도 셀 병합 구조를 유지한다", () => {
    const result = run(
      [mergedTable(), paragraphBlock("w", "wxyz"), TAIL],
      inCell("m-1", 1),
      inBlock("w", 2),
      typeChar("Q"),
    );

    expect(outline(result.editor.getDocument().blocks, true)).toEqual([
      "table[mQ@2x1|@1x1|@1x1/@1x2/@1x1|@1x1|@1x1]",
      "paragraph:yz",
      "paragraph:tail",
    ]);
    expectSchemaValid(result.tiptap);
  });

  it("뒤 heading 블록으로 걸친 범위도 끝 블록이 타입을 유지한다", () => {
    const result = run(
      [singleCellTable("t", "cell"), headingBlock("w", 2, "wxyz"), TAIL],
      inCell("t-r0c0", 2),
      inBlock("w", 2),
      typeChar("Q"),
    );

    expect(blocksOf(result)).toEqual([
      "table[ceQ]",
      "heading:yz",
      "paragraph:tail",
    ]);
  });
});

describe("표 경계 범위에서 Cut하면 선택한 텍스트만 지우고 삽입은 없다(Issue #292)", () => {
  it.each(CASES)(
    "$scenario.id $scenario.name ($direction): 문서가 #289 Backspace 결과와 같다",
    ({ scenario, reversed }) => {
      const result = runScenario(scenario, reversed, cut);

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual(scenario.after(""));
      expectSchemaValid(result.tiptap);
    },
  );

  it.each(CASES)(
    "$scenario.id $scenario.name ($direction): dispatch 1회, undo 1회로 원복되고 캐럿은 범위 시작에 접힌다",
    ({ scenario, reversed }) => {
      const result = runScenario(scenario, reversed, cut);

      expect(result.dispatchCount).toBe(1);
      expect(result.changes).toHaveLength(1);
      expect(result.tiptap.state.selection.empty).toBe(true);
      expectUndoOnce(result);
    },
  );

  it.each(CASES)(
    "$scenario.id $scenario.name ($direction): clipboardData의 text/plain·text/html이 같은 범위의 Copy와 같다",
    ({ scenario, reversed }) => {
      const copied = clipboardPayload(scenario, reversed, "copy");
      const cutOut = clipboardPayload(scenario, reversed, "cut");

      expect(cutOut.plain).not.toBe("");
      expect(cutOut.html).not.toBe("");
      expect(cutOut).toEqual(copied);
    },
  );

  it("clipboardData가 없으면 PM 기본 경로에 맡기지 않고 소비해 문서를 바꾸지 않는다", () => {
    const result = run(d1(), inCell("t-r0c0", 2), inBlock("w", 2), (tiptap) => {
      const { event } = clipboardEvent(tiptap, "cut", null);
      return event.defaultPrevented;
    });

    expectNoOpConsumed(result);
  });
});

describe("라벨이 범위에 든 상위 블록은 입력·Cut 뒤에도 타입과 attrs를 유지한다(Issue #293)", () => {
  // 기준 문서 D: [table "cell", heading(level 2) "xxxx" > 자식 B "wxyz", tail].
  // 범위는 셀 offset 2 -> B offset 2다. 같은 함수를 공유해 #289 Backspace와
  // 같은 결과다.
  const nested = (): Block[] => [
    singleCellTable("t", "cell"),
    {
      ...headingBlock("x", 2, "xxxx"),
      children: [paragraphBlock("b", "wxyz")],
    } as Block,
    TAIL,
  ];
  const grandparent = (): Block[] => [
    singleCellTable("t", "cell"),
    quoteBlock("x", "xxxx", [
      calloutBlock("y", "yyyy", "i", [paragraphBlock("b", "wxyz")]),
    ]),
    TAIL,
  ];
  const from = inCell("t-r0c0", 2);
  const to = inBlock("b", 2);

  it.each([
    { name: "글자 입력 Q", act: typeChar("Q"), ins: "Q" },
    { name: "Cut", act: cut, ins: "" },
  ])(
    "$name: heading(level 2) 상위 블록이 타입과 attrs를 유지하고 라벨이 빈다",
    ({ act, ins }) => {
      const result = run(nested(), from, to, act);

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        `table[ce${ins}]`,
        "heading:>{paragraph:yz}",
        "paragraph:tail",
      ]);
      expect(result.editor.getDocument().blocks[1]).toMatchObject({
        type: "heading",
        level: 2,
      });
      result.tiptap.state.doc.check();
      expectSchemaValid(result.tiptap);
    },
  );

  it.each([
    { name: "글자 입력 Q", act: typeChar("Q"), ins: "Q" },
    { name: "Cut", act: cut, ins: "" },
  ])(
    "$name: 조부모 `X > Y > B`도 X·Y가 타입과 attrs를 유지한다",
    ({ act, ins }) => {
      const result = run(grandparent(), from, to, act);

      expect(blocksOf(result)).toEqual([
        `table[ce${ins}]`,
        "quote:>{callout:>{paragraph:yz}}",
        "paragraph:tail",
      ]);
      expect(result.editor.getDocument().blocks[1]).toMatchObject({
        type: "quote",
        children: [{ type: "callout", icon: "i" }],
      });
      expectSchemaValid(result.tiptap);
    },
  );

  it("글자 입력은 dispatch 1회, undo 1회로 원복된다", () => {
    const result = run(nested(), from, to, typeChar("Q"));

    expect(result.dispatchCount).toBe(1);
    expect(result.changes).toHaveLength(1);
    expectUndoOnce(result);
  });
});

describe("표 경계 범위에 붙여넣으면 선택한 텍스트만 지우고 캐럿에서 기존 규칙으로 붙인다(Issue #292)", () => {
  const KINDS = {
    "plain 1줄": { "text/plain": "PP" },
    "plain 2줄": { "text/plain": "P1\nP2" },
    HTML: { "text/html": "<p>H1</p>", "text/plain": "H1" },
    Markdown: { "text/plain": "# Title" },
    TSV: { "text/plain": "x\ty\n1\t2" },
    "표 HTML": {
      "text/html":
        "<table><tbody><tr><td>X</td><td>Y</td></tr></tbody></table>",
      "text/plain": "X\tY",
    },
  } as const;
  type Kind = keyof typeof KINDS;

  // 캐럿이 셀이면(C1·C2) 셀 안 규칙(ClipboardPaste는 물러나고 PM 기본)을,
  // 표 밖이면(C3) 블록 규칙을 쓴다. 표 붙여넣기는 캐럿 셀부터 덮어쓰거나
  // 캐럿 블록 뒤에 새 표를 둔다. 어느 쪽이든 선택하지 않은 텍스트(yz·xyz·ll)는
  // 남고 원본 표는 구조를 잃지 않는다.
  const EXPECTED: Record<Scenario["id"], Record<Kind, string[]>> = {
    C1: {
      "plain 1줄": ["table[cePP]", "paragraph:yz", "paragraph:tail"],
      "plain 2줄": [
        "table[ceP1]",
        "paragraph:P2",
        "paragraph:yz",
        "paragraph:tail",
      ],
      HTML: ["table[ceH1]", "paragraph:yz", "paragraph:tail"],
      Markdown: ["table[ce# Title]", "paragraph:yz", "paragraph:tail"],
      TSV: ["table[x|y/1|2]", "paragraph:yz", "paragraph:tail"],
      "표 HTML": ["table[X|Y]", "paragraph:yz", "paragraph:tail"],
    },
    C2: {
      "plain 1줄": ["table[PP]", "paragraph:xyz", "paragraph:tail"],
      "plain 2줄": [
        "table[P1]",
        "paragraph:P2",
        "paragraph:xyz",
        "paragraph:tail",
      ],
      HTML: ["table[H1]", "paragraph:xyz", "paragraph:tail"],
      Markdown: ["table[# Title]", "paragraph:xyz", "paragraph:tail"],
      TSV: ["table[x|y/1|2]", "paragraph:xyz", "paragraph:tail"],
      "표 HTML": ["table[X|Y]", "paragraph:xyz", "paragraph:tail"],
    },
    C3: {
      "plain 1줄": ["paragraph:abPP", "table[ll]", "paragraph:tail"],
      "plain 2줄": [
        "paragraph:abP1",
        "paragraph:P2",
        "table[ll]",
        "paragraph:tail",
      ],
      HTML: ["paragraph:ab", "paragraph:H1", "table[ll]", "paragraph:tail"],
      Markdown: [
        "paragraph:ab",
        "heading:Title",
        "table[ll]",
        "paragraph:tail",
      ],
      TSV: ["paragraph:ab", "table[x|y/1|2]", "table[ll]", "paragraph:tail"],
      "표 HTML": ["paragraph:ab", "table[X|Y]", "table[ll]", "paragraph:tail"],
    },
  };

  const KIND_NAMES = Object.keys(KINDS) as Kind[];
  const PASTE_CASES = CASES.flatMap((entry) =>
    KIND_NAMES.map((kind) => ({ ...entry, kind })),
  );
  // TablePaste는 붙여넣기 transaction마다 closeHistory로 undo 그룹을 닫는다.
  // 먼저 지운 transaction과 한 undo 그룹이 되지 못한다.
  const TABULAR: readonly Kind[] = ["TSV", "표 HTML"];
  const GROUPED_CASES = PASTE_CASES.filter(
    (entry) => !TABULAR.includes(entry.kind),
  );
  const TABULAR_CASES = PASTE_CASES.filter((entry) =>
    TABULAR.includes(entry.kind),
  );

  it.each(PASTE_CASES)(
    "$scenario.id $scenario.name ($direction) $kind: 선택하지 않은 텍스트를 보존하고 표를 없애지 않는다",
    ({ scenario, reversed, kind }) => {
      const result = runScenario(scenario, reversed, paste(KINDS[kind]));

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual(EXPECTED[scenario.id][kind]);
      expectSchemaValid(result.tiptap);
    },
  );

  it.each(GROUPED_CASES)(
    "$scenario.id $scenario.name ($direction) $kind: undo 1회로 문서와 selection이 원복된다",
    ({ scenario, reversed, kind }) => {
      const result = runScenario(scenario, reversed, paste(KINDS[kind]));

      expectUndoOnce(result);
    },
  );

  it.each(TABULAR_CASES)(
    "$scenario.id $scenario.name ($direction) $kind: 표 붙여넣기는 undo 그룹을 닫아 지움과 붙여넣기가 undo 2회로 원복된다",
    ({ scenario, reversed, kind }) => {
      const result = runScenario(scenario, reversed, paste(KINDS[kind]));

      expect(result.editor.commands.undo()).toEqual(okResult);
      expect(blocksOf(result)).toEqual(scenario.after(""));
      expect(result.editor.commands.undo()).toEqual(okResult);
      expectRestored(result);
      expect(result.editor.commands.undo()).toEqual(notApplicable("undo"));
    },
  );

  // 지움이 붙여넣기보다 먼저 dispatch된다. 이후 경로가 붙여넣기를 취소해도
  // 지움은 남는다. 알려진 한계이고 undo 1회로 복원된다. 캐럿이 표 밖이어야
  // ClipboardPaste가 pasteHandler를 부른다(셀 안 캐럿은 물러난다).
  it("pasteHandler가 붙여넣기를 취소해도 경계 범위 선택은 이미 지워져 있고 undo 1회로 복원된다", () => {
    const result = runScenario(C3, false, paste(KINDS["plain 1줄"]), {
      pasteHandler: () => false,
    });

    expect(result.handled).toBe(true);
    expect(blocksOf(result)).toEqual(C3.after(""));
    expectUndoOnce(result);
  });

  it("뒤 문단으로 걸친 범위에 plain 2줄을 붙여도 표 하나와 셀 하나가 남는다", () => {
    const result = run(
      d1(),
      inCell("t-r0c0", 2),
      inBlock("w", 2),
      paste(KINDS["plain 2줄"]),
    );

    expect(countOf(result, "table")).toBe(1);
    expect(countOf(result, "tableCell")).toBe(1);
  });
});

describe("표 경계 범위에서 IME 조합을 시작하면 선택한 텍스트만 먼저 지운다(Issue #292)", () => {
  // 조합 텍스트 입력은 브라우저 DOM 변경을 PM이 읽는 경로라 jsdom이 재현하지
  // 못한다. 조합 입력 뒤 결과는 e2e/table-boundary-input.spec.ts가 CDP
  // IME로 증명한다. 여기서는 compositionstart가 범위를 지우는지만 본다.
  it.each(CASES)(
    "$scenario.id $scenario.name ($direction): 조합 시작이 #289 Backspace 결과로 지우고 캐럿을 범위 시작에 접는다",
    ({ scenario, reversed }) => {
      const result = runScenario(scenario, reversed, compositionStart);

      expect(blocksOf(result)).toEqual(scenario.after(""));
      expect(result.tiptap.state.selection.empty).toBe(true);
      expectSchemaValid(result.tiptap);
    },
  );

  it.each(CASES)(
    "$scenario.id $scenario.name ($direction): 지움은 dispatch 1회, undo 1회로 원복된다",
    ({ scenario, reversed }) => {
      const result = runScenario(scenario, reversed, compositionStart);

      expect(result.dispatchCount).toBe(1);
      expectUndoOnce(result);
    },
  );

  it("경계 범위가 아니면 조합 시작이 문서를 바꾸지 않는다", () => {
    const result = run(
      d1(),
      inCell("t-r0c0", 1),
      inCell("t-r0c0", 3),
      compositionStart,
    );

    expect(blocksOf(result)).toEqual([
      "table[cell]",
      "paragraph:wxyz",
      "paragraph:tail",
    ]);
  });
});

describe("표 경계 범위에서 끌어 놓기는 내부 이동 drop만 소비한다(Issue #292)", () => {
  const dropAtTail = dragAndDrop(inBlock("tail", 2));

  it.each(CASES)(
    "$scenario.id $scenario.name ($direction): 내부 이동 drop은 문서·selection을 바꾸지 않고 소비한다",
    ({ scenario, reversed }) => {
      const result = runScenario(scenario, reversed, dropAtTail);

      expectNoOpConsumed(result);
      expect(result.tiptap.state.selection.empty).toBe(false);
    },
  );

  it("복사 드래그는 선택을 지우지 않고 현행대로 놓는다", () => {
    const result = runScenario(
      C1,
      false,
      dragAndDrop(inBlock("tail", 2), { copy: true }),
    );

    expect(result.handled).toBe(true);
    expect(blocksOf(result).slice(0, 2)).toEqual([
      "table[cell]",
      "paragraph:wxyz",
    ]);
  });

  it("외부에서 끌어 온 텍스트 drop은 현행대로 drop 위치에 삽입하고 선택을 지우지 않는다", () => {
    const result = runScenario(
      C1,
      false,
      dragAndDrop(inBlock("tail", 2), { external: "ZZ" }),
    );

    expect(result.handled).toBe(true);
    expect(blocksOf(result)).toEqual([
      "table[cell]",
      "paragraph:wxyz",
      "paragraph:taZZil",
    ]);
  });
});

describe("표 경계 범위에서 Shift-Enter는 지운 뒤 캐럿에 hardBreak를 삽입한다(Issue #292)", () => {
  // head가 셀이든 표 밖이든 같은 규칙이다. 네 방향을 모두 CASES가 덮는다.
  it.each(CASES)(
    "$scenario.id $scenario.name ($direction): 선택하지 않은 텍스트를 보존하고 캐럿에 줄바꿈이 들어간다",
    ({ scenario, reversed }) => {
      const result = runScenario(scenario, reversed, shiftEnter);

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual(scenario.after("\n"));
      expectSchemaValid(result.tiptap);
    },
  );

  it.each(CASES)(
    "$scenario.id $scenario.name ($direction): dispatch 1회, undo 1회로 원복된다",
    ({ scenario, reversed }) => {
      const result = runScenario(scenario, reversed, shiftEnter);

      expect(result.dispatchCount).toBe(1);
      expect(result.changes).toHaveLength(1);
      expectUndoOnce(result);
    },
  );

  it("범위가 heading(h2)에서 시작해 셀로 끝나면 그 heading 안에 줄바꿈을 넣는다", () => {
    const result = run(
      [headingBlock("h", 2, "title"), singleCellTable("t", "cell"), TAIL],
      inBlock("h", 2),
      inCell("t-r0c0", 1),
      shiftEnter,
    );

    expect(blocksOf(result)).toEqual([
      "heading:ti\n",
      "table[ell]",
      "paragraph:tail",
    ]);
    expectSchemaValid(result.tiptap);
  });

  // 캐럿 블록이 hardBreak를 받을 수 없으면(스키마 판정, codeBlock) 또는 h1이면
  // 삽입하지 않고 지우기만 한 뒤 소비한다. head 방향과 무관하다.
  it.each(
    [false, true].flatMap((reversed) =>
      [
        { name: "heading level 1", head: headingBlock("h", 1, "title") },
        { name: "codeBlock", head: codeBlockBlock("h", "title") },
      ].map((entry) => ({ ...entry, reversed })),
    ),
  )(
    "범위가 ($name, reversed=$reversed)에서 시작하면 줄바꿈 없이 선택한 텍스트만 지우고 소비한다",
    ({ name, head, reversed }) => {
      const blocks = [head, singleCellTable("t", "cell"), TAIL];
      const from = inBlock("h", 2);
      const to = inCell("t-r0c0", 1);
      const result = reversed
        ? run(blocks, to, from, shiftEnter)
        : run(blocks, from, to, shiftEnter);

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual([
        name === "codeBlock" ? "codeBlock:ti" : "heading:ti",
        "table[ell]",
        "paragraph:tail",
      ]);
      expect(result.dispatchCount).toBe(1);
      expectSchemaValid(result.tiptap);
      expectUndoOnce(result);
    },
  );

  it("병합 셀 표에서도 셀 병합 구조를 유지한다", () => {
    const result = run(
      [mergedTable(), paragraphBlock("w", "wxyz"), TAIL],
      inCell("m-1", 1),
      inBlock("w", 2),
      shiftEnter,
    );

    expect(outline(result.editor.getDocument().blocks, true)).toEqual([
      "table[m\n@2x1|@1x1|@1x1/@1x2/@1x1|@1x1|@1x1]",
      "paragraph:yz",
      "paragraph:tail",
    ]);
    expectSchemaValid(result.tiptap);
  });
});

describe("표 경계 범위에서 insertCustomInlineContent는 지운 뒤 캐럿에 삽입한다(Issue #292)", () => {
  const tag: CustomInlineContentDefinition = {
    render: ({ item }) => {
      const element = document.createElement("span");
      element.textContent = `tag:${item.customType}`;
      return element;
    },
  };
  const insertTag: Act = (_tiptap, editor) =>
    editor.commands.insertCustomInlineContent("myTag").ok;
  const withTag = { customInlineContent: { myTag: tag } };

  it.each(CASES)(
    "$scenario.id $scenario.name ($direction): 선택하지 않은 텍스트를 보존하고 캐럿에 원소가 들어간다",
    ({ scenario, reversed }) => {
      const result = runScenario(scenario, reversed, insertTag, withTag);

      expect(result.handled).toBe(true);
      expect(blocksOf(result)).toEqual(scenario.after("?"));
      expectSchemaValid(result.tiptap);
    },
  );

  it.each(CASES)(
    "$scenario.id $scenario.name ($direction): dispatch 1회, undo 1회로 원복된다",
    ({ scenario, reversed }) => {
      const result = runScenario(scenario, reversed, insertTag, withTag);

      expect(result.dispatchCount).toBe(1);
      expect(result.changes).toHaveLength(1);
      expectUndoOnce(result);
    },
  );

  it("범위가 없는 캐럿 삽입은 현행대로 캐럿에 넣는다", () => {
    const result = run(
      d1(),
      inBlock("w", 2),
      inBlock("w", 2),
      insertTag,
      withTag,
    );

    expect(blocksOf(result)).toEqual([
      "table[cell]",
      "paragraph:wx?yz",
      "paragraph:tail",
    ]);
  });
});

describe("표 경계 범위가 아니면 입력·Cut·붙여넣기·Shift-Enter는 현행 그대로다(Issue #292)", () => {
  const ACTIONS = {
    입력: typeChar("Q"),
    Cut: cut,
    붙여넣기: paste({ "text/plain": "PP" }),
    "Shift-Enter": shiftEnter,
  } as const;

  const SAME_CELL = {
    name: "같은 셀 안 범위",
    blocks: d1,
    from: inCell("t-r0c0", 1),
    to: inCell("t-r0c0", 3),
  };
  const WRAPPING = {
    name: "표를 완전히 감싸는 범위",
    blocks: (): Block[] => [
      paragraphBlock("a", "abcd"),
      singleCellTable("t", "cell"),
      paragraphBlock("w", "wxyz"),
      TAIL,
    ],
    from: inBlock("a", 2),
    to: inBlock("w", 2),
  };
  const OUTSIDE = {
    name: "표 밖 범위",
    blocks: (): Block[] => [
      paragraphBlock("a", "abcd"),
      paragraphBlock("w", "wxyz"),
      TAIL,
    ],
    from: inBlock("a", 2),
    to: inBlock("w", 2),
  };

  // 같은 셀 안 범위의 글자 입력은 PM keypress가 이 확장에 오지 않고 브라우저
  // 기본 입력에 맡긴다(부모가 같다). 그 밖에는 현행 결과를 고정한다.
  const EXPECTED = [
    {
      target: SAME_CELL,
      action: "Cut",
      blocks: ["table[cl]", "paragraph:wxyz", "paragraph:tail"],
    },
    {
      target: SAME_CELL,
      action: "붙여넣기",
      blocks: ["table[cPPl]", "paragraph:wxyz", "paragraph:tail"],
    },
    {
      target: SAME_CELL,
      action: "Shift-Enter",
      blocks: ["table[c\nl]", "paragraph:wxyz", "paragraph:tail"],
    },
    {
      target: WRAPPING,
      action: "입력",
      blocks: ["paragraph:abQyz", "paragraph:tail"],
    },
    {
      target: WRAPPING,
      action: "Cut",
      blocks: ["paragraph:abyz", "paragraph:tail"],
    },
    {
      target: WRAPPING,
      action: "붙여넣기",
      blocks: ["paragraph:abPPyz", "paragraph:tail"],
    },
    {
      target: WRAPPING,
      action: "Shift-Enter",
      blocks: ["paragraph:ab\nyz", "paragraph:tail"],
    },
    {
      target: OUTSIDE,
      action: "입력",
      blocks: ["paragraph:abQyz", "paragraph:tail"],
    },
    {
      target: OUTSIDE,
      action: "Cut",
      blocks: ["paragraph:abyz", "paragraph:tail"],
    },
    {
      target: OUTSIDE,
      action: "붙여넣기",
      blocks: ["paragraph:abPPyz", "paragraph:tail"],
    },
    {
      target: OUTSIDE,
      action: "Shift-Enter",
      blocks: ["paragraph:ab\nyz", "paragraph:tail"],
    },
  ] as const;

  it.each(EXPECTED)(
    "[$target.name] $action: 현행 결과다",
    ({ target, action, blocks }) => {
      const result = run(
        target.blocks(),
        target.from,
        target.to,
        ACTIONS[action],
      );

      expect(blocksOf(result)).toEqual(blocks);
    },
  );

  it("같은 셀 안 범위의 글자 입력은 이 확장이 소비하지 않는다", () => {
    const result = run(d1(), inCell("t-r0c0", 1), inCell("t-r0c0", 3), (t) =>
      dispatchTextInput(t, "Q"),
    );

    expect(result.handled).toBe(false);
    expect(result.dispatchCount).toBe(0);
  });

  it("같은 표 안 셀 사이 범위는 문서를 바꾸지 않는 현행 동작이다", () => {
    for (const act of Object.values(ACTIONS)) {
      const result = run(
        [gridTable("t", 2, 2), paragraphBlock("w", "wxyz"), TAIL],
        inCell("t-r0c0", 1),
        inCell("t-r1c1", 2),
        act,
      );

      expect(blocksOf(result)).toEqual([
        "table[c00|c01/c10|c11]",
        "paragraph:wxyz",
        "paragraph:tail",
      ]);
    }
  });

  it("CellSelection의 글자 입력은 이 확장이 소비하지 않는다", () => {
    const m = mounted(
      documentOf(gridTable("t", 2, 2), paragraphBlock("w", "wxyz"), TAIL),
    );
    selectCellRange(m.tiptap, "t-r0c0", "t-r0c1");

    expect(dispatchTextInput(m.tiptap, "Q")).toBe(false);
  });
});

describe("Tiptap 입력 규칙은 경계 범위에서 변환을 일으키지 않는다(Issue #292)", () => {
  it("`>` 뒤 범위에 공백을 입력해도 인용으로 바뀌지 않고 지운 뒤 캐럿에 공백만 들어간다", () => {
    const result = run(
      [paragraphBlock("a", ">cd"), singleCellTable("t", "cell"), TAIL],
      inBlock("a", 1),
      inCell("t-r0c0", 2),
      typeChar(" "),
    );

    expect(blocksOf(result)).toEqual([
      "paragraph:> ",
      "table[ll]",
      "paragraph:tail",
    ]);
  });
});

// 글자 입력은 이 표에 없다. PM keypress는 live selection의 부모가 같으면
// handleTextInput을 부르지 않고 브라우저 기본 입력에 맡긴다. live가 캐럿인 채
// DOM selection만 경계 범위인 상태는 이 핸들러가 닿지 않는 경로다.
describe("표 경계 범위는 DOM 파생 selection 기준으로 live 문서에 적용한다(Issue #292, G-EDT-002)", () => {
  /** live selection은 뒤 꼬리 문단 끝 캐럿이고 DOM selection이 경계 범위다. */
  const derivedBoundary = (act: Act) => {
    const m = mounted(
      documentOf(
        singleCellTable("t", "cell"),
        paragraphBlock("w", "wxyz"),
        TAIL,
      ),
    );
    const { tiptap } = m;
    setLiveSelection(
      tiptap,
      inBlock("tail", 4)(tiptap),
      inBlock("tail", 4)(tiptap),
    );
    // anchor가 뒤 문단이고 head가 셀이다.
    withDomSelection(
      tiptap,
      inBlock("w", 2)(tiptap),
      inCell("t-r0c0", 2)(tiptap),
      () => {
        act(tiptap, m.editor);
      },
    );
    return outline(m.editor.getDocument().blocks);
  };

  it.each([
    { action: "Cut", act: cut, ins: "" },
    { action: "붙여넣기", act: paste({ "text/plain": "PP" }), ins: "PP" },
    { action: "Shift-Enter", act: shiftEnter, ins: "\n" },
  ])(
    "DOM selection이 경계 범위이고 live selection이 다르면 $action 동작을 DOM 기준으로 적용한다",
    ({ act, ins }) => {
      expect(derivedBoundary(act)).toEqual(C1.after(ins));
    },
  );
});

describe("표 경계 범위 역방향 stale은 live 경계 범위를 건드리지 않고 소비한다(Issue #292, G-EDT-002)", () => {
  /**
   * live selection은 셀 offset 2부터 뒤 문단 offset 2까지 경계 범위, DOM
   * selection은 첫 문단 맨 앞 캐럿이다. 폴스루하면 PM 기본 처리가 live
   * 경계 범위에 적용돼 선택하지 않은 텍스트가 셀로 옮겨 간다.
   */
  const reverseStale = (act: Act) => {
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
    let handled = false;
    try {
      withDomSelection(
        tiptap,
        inBlock("a", 0)(tiptap),
        inBlock("a", 0)(tiptap),
        () => {
          handled = act(tiptap, m.editor);
        },
      );
      return {
        handled,
        dispatchCount: dispatchSpy.mock.calls.length,
        changes: m.changes.length - changesBefore,
        after: editorState(m.editor, tiptap),
        before,
        blocks: outline(m.editor.getDocument().blocks),
      };
    } finally {
      dispatchSpy.mockRestore();
    }
  };

  it.each([
    { action: "입력", act: typeChar("Q") },
    { action: "Cut", act: cut },
    { action: "붙여넣기", act: paste({ "text/plain": "PP" }) },
    { action: "Shift-Enter", act: shiftEnter },
    { action: "끌어 놓기", act: dragAndDrop(inBlock("tail", 2)) },
  ])(
    "$action 동작은 DOM 캐럿이 경계 범위 밖이고 live가 경계 범위이면 소비하고 문서를 바꾸지 않는다",
    ({ act }) => {
      const outcome = reverseStale(act);

      expect(outcome.blocks).toEqual([
        "paragraph:aaaa",
        "table[cell]",
        "paragraph:wxyz",
        "paragraph:tail",
      ]);
      expect(outcome.handled).toBe(true);
      expect(outcome.dispatchCount).toBe(0);
      expect(outcome.changes).toBe(0);
      expect(outcome.after).toEqual(outcome.before);
    },
  );
});

/** 읽기 전용으로 바꾼 뒤 act를 실행한다. 이벤트 소비 여부는 보지 않는다. */
const whileReadOnly =
  (act: Act): Act =>
  (tiptap, editor) => {
    editor.isEditable = false;
    return act(tiptap, editor);
  };

/**
 * 실제 keydown을 PM 리스너로 디스패치한다. someProp("handleKeyDown")으로
 * 직접 부르는 shiftEnter와 달리 PM의 editable 검사를 거친다.
 */
const realShiftEnter: Act = (tiptap) => {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  tiptap.view.dom.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("읽기 전용에서는 경계 범위 입력 경로가 문서를 바꾸지 않는다(Issue #292)", () => {
  // PM은 handleDOMEvents를 view.editable 검사 없이 실행한다. cut·compositionstart는
  // 이 확장이 직접 막고, 나머지는 PM이 editHandlers 안에서만 prop을 불러 막힌다.
  const ACTIONS = [
    { action: "Cut", act: cut },
    { action: "IME 조합 시작", act: compositionStart },
    { action: "글자 입력", act: typeChar("Q") },
    { action: "붙여넣기", act: paste({ "text/plain": "PP" }) },
    { action: "끌어 놓기", act: dragAndDrop(inBlock("tail", 2)) },
    { action: "Shift-Enter", act: realShiftEnter },
  ];
  const READ_ONLY_CASES = ACTIONS.flatMap((entry) =>
    CASES.map((scenarioCase) => ({ ...entry, ...scenarioCase })),
  );

  it.each(READ_ONLY_CASES)(
    "$action: $scenario.id $scenario.name ($direction)에서 문서·selection이 그대로다",
    ({ scenario, reversed, act }) => {
      const result = runScenario(scenario, reversed, whileReadOnly(act));

      expect(result.dispatchCount).toBe(0);
      expect(result.changes).toHaveLength(0);
      expect(editorState(result.editor, result.tiptap)).toEqual(result.before);
    },
  );

  // 대조군: 같은 문단 안 범위는 읽기 전용에서 PM 기본도 바꾸지 않는다.
  it.each([
    { action: "Cut", act: cut },
    { action: "IME 조합 시작", act: compositionStart },
  ])(
    "대조군 $action: 같은 문단 안 범위도 읽기 전용에서 문서가 그대로다",
    ({ act }) => {
      const result = run(
        d1(),
        inBlock("w", 1),
        inBlock("w", 3),
        whileReadOnly(act),
      );

      expect(result.dispatchCount).toBe(0);
      expect(editorState(result.editor, result.tiptap)).toEqual(result.before);
    },
  );

  it("insertCustomInlineContent는 프로그램적 API라 읽기 전용에서도 경계 범위를 지우고 삽입한다", () => {
    const result = run(
      d1(),
      C1.from,
      C1.to,
      whileReadOnly(
        (_tiptap, editor) =>
          editor.commands.insertCustomInlineContent("myTag").ok,
      ),
      {
        customInlineContent: {
          myTag: { render: () => document.createElement("span") },
        },
      },
    );

    expect(result.handled).toBe(true);
    expect(blocksOf(result)).toEqual(C1.after("?"));
  });
});

describe("붙일 내용이 없는 붙여넣기는 경계 범위를 지우지 않는다(Issue #292)", () => {
  const EMPTY = [
    { name: "빈 클립보드", entries: {} },
    { name: "미지원 데이터", entries: { "application/x-foo": "z" } },
  ];
  const EMPTY_CASES = EMPTY.flatMap((entry) =>
    CASES.map((scenarioCase) => ({ ...entry, ...scenarioCase })),
  );

  it.each(EMPTY_CASES)(
    "$name: $scenario.id $scenario.name ($direction)에서 소비하고 문서·selection이 그대로다",
    ({ scenario, reversed, entries }) => {
      const result = runScenario(scenario, reversed, paste(entries));

      expectNoOpConsumed(result);
      expect(result.tiptap.state.selection.empty).toBe(false);
    },
  );

  // 대조군: 일반 선택에서 같은 입력도 문서를 바꾸지 않는다.
  it.each(EMPTY)(
    "대조군 $name: 같은 문단 안 범위에서도 문서가 그대로다",
    ({ entries }) => {
      const result = run(
        d1(),
        inBlock("w", 1),
        inBlock("w", 3),
        paste(entries),
      );

      expect(result.dispatchCount).toBe(0);
      expect(editorState(result.editor, result.tiptap)).toEqual(result.before);
    },
  );

  it("파일만 붙여넣으면 지우고 기존 경로(MediaDropPaste)가 file 블록을 놓는다", () => {
    const result = run(d3(), C3.from, C3.to, (tiptap) => {
      const data = new DataTransfer();
      (data as unknown as { files: File[] }).files = [
        new File(["x"], "a.txt", { type: "text/plain" }),
      ];
      const event = new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      });
      tiptap.view.dom.dispatchEvent(event);
      return event.defaultPrevented;
    });

    // 먼저 지운 뒤 MediaDropPaste가 캐럿 뒤에 file 블록을 놓는다.
    expect(blocksOf(result)).toEqual([
      "paragraph:ab",
      "file:",
      "table[ll]",
      "paragraph:tail",
    ]);
  });
});

describe("노드 끌어 옮기기는 경계 범위 live selection이어도 소비하지 않는다(Issue #292)", () => {
  it("dragging.node가 있으면 선택이 아니라 그 노드를 지워 PM 기본이 처리하고 경계 범위 텍스트는 남는다", () => {
    const result = run(
      [
        singleCellTable("t", "cell"),
        paragraphBlock("w", "wxyz"),
        dividerBlock("d"),
        TAIL,
      ],
      inCell("t-r0c0", 2),
      inBlock("w", 2),
      (tiptap) => {
        let dividerPos = -1;
        tiptap.state.doc.descendants((node, pos) => {
          if (node.type.name === "divider") dividerPos = pos;
          return true;
        });
        // Tiptap의 drop 핸들러는 전역 drag 출처를 쓴다. 먼저 dragstart를 보내
        // 출처를 이 편집기로 맞춘 뒤 dragging만 노드 드래그로 바꾼다.
        tiptap.view.dom.dispatchEvent(
          new DragEvent("dragstart", {
            dataTransfer: new DataTransfer(),
            bubbles: true,
            cancelable: true,
          }),
        );
        const node = NodeSelection.create(tiptap.state.doc, dividerPos);
        (tiptap.view as unknown as { dragging: unknown }).dragging = {
          slice: node.content(),
          move: true,
          node,
        };
        const posAtCoords = vi
          .spyOn(tiptap.view, "posAtCoords")
          .mockReturnValue({ pos: inBlock("w", 1)(tiptap), inside: -1 });
        try {
          const drop = new DragEvent("drop", {
            dataTransfer: new DataTransfer(),
            bubbles: true,
            cancelable: true,
          });
          tiptap.view.dom.dispatchEvent(drop);
          return drop.defaultPrevented;
        } finally {
          posAtCoords.mockRestore();
          endDrag();
        }
      },
    );

    // 경계 범위가 소비하면 문서가 그대로다. 면제되면 PM 기본이 divider를 drop
    // 위치(문단 앞)로 옮기고 선택한 텍스트(`cell`·`wxyz`)는 지우지 않는다.
    expect(blocksOf(result)).toEqual([
      "table[cell]",
      "divider:",
      "paragraph:wxyz",
      "paragraph:tail",
    ]);
    expect(result.dispatchCount).toBe(1);
  });
});
