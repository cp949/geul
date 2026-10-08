/**
 * 한 줄 text/plain 붙여넣기·drop의 캐럿 마크 상속 계약을 고정한다(Issue #310).
 * 색 마크(textColor·backgroundColor) 캐럿에 한 줄을 붙이면 색이 이어져야 한다.
 * 이전에는 PM 기본 한 줄 경로가 마크 없는 text 노드를 만들어 색이 빠졌다.
 * 여러 줄은 줄마다 캐럿 마크를 입혀 색이 이어졌다. 줄 수와 무관하게 같은
 * 규칙을 쓴다.
 *
 * 다루는 축은 표 밖·셀 안 상속(C1·C2), 여러 줄과의 일치(C3), 범위 선택·마크
 * 없는 캐럿(C4·C5), bold·link 회귀(C6), 진입점 셋과 한 줄 drop(C7),
 * storedMarks 무시(C8), 무효 문자 정리본 경로(C9), transaction 계약(C10)이다.
 * 진입점은 Ctrl+V, Ctrl+Shift+V, view.pasteText다. drop은 jsdom이 좌표를
 * 해석하지 못해 view.posAtCoords를 stub한다. 실제 브라우저 동작은 e2e가
 * 맡는다.
 *
 * 문서는 p1(ce + 색 ll)과 tail이다. 색은 textColor #FF0000과 backgroundColor
 * #FFFF00이다. 캐럿은 p1 끝(offset 4)이다. 표 안은 1x1 표 셀(ce + 색 ll)
 * 끝이다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it, vi } from "vitest";

import {
  mountCellDrop,
  stubPosAtCoords,
} from "./clipboard-drop-test-support.js";
import { blocksOf, dropData, runsOf } from "./clipboard-test-support.js";
import {
  documentOf,
  headingBlock,
  mounted,
  paragraphBlock,
  setBoldStoredMark,
} from "./editor-controller-support.js";
import {
  inBlock,
  inCell,
  singleCellTable,
  TAIL,
} from "./table-boundary-test-support.js";
import {
  kindsOf,
  pasteIn,
  textSelection,
  type Place,
} from "./table-cell-paste-test-support.js";

const COLORS = [
  { type: "textColor", color: "#FF0000" },
  { type: "backgroundColor", color: "#FFFF00" },
] as const;
const SOH = String.fromCharCode(1);

type Entry = "Ctrl+V" | "Ctrl+Shift+V" | "view.pasteText";
const ENTRIES: readonly Entry[] = ["Ctrl+V", "Ctrl+Shift+V", "view.pasteText"];

/** p1 "ce"+색 "ll", tail. 표 밖 색 캐럿 문서다. */
const colorBlocks = (): Block[] => [
  {
    id: "p1",
    type: "paragraph",
    content: [{ text: "ce" }, { text: "ll", marks: [...COLORS] }],
  },
  TAIL,
];

/** 셀 t-r0c0이 "ce"+색 "ll"인 문서. 셀 안 색 캐럿을 본다. */
const colorCellBlocks = (): Block[] => {
  const table = singleCellTable("t", "") as Extract<Block, { type: "table" }>;
  const cell = table.rows[0]?.cells[0];
  if (cell === undefined) throw new Error("fixture 준비 실패");
  cell.content = [{ text: "ce" }, { text: "ll", marks: [...COLORS] }];
  return [paragraphBlock("p1", "para"), table, TAIL];
};

/** p1 "ce"+bold "ll", tail. */
const boldBlocks = (): Block[] => [
  {
    id: "p1",
    type: "paragraph",
    content: [{ text: "ce" }, { text: "ll", marks: [{ type: "bold" }] }],
  },
  TAIL,
];

/** p1 "ce"+link "ll", tail. */
const linkBlocks = (): Block[] => [
  {
    id: "p1",
    type: "paragraph",
    content: [
      { text: "ce" },
      { text: "ll", marks: [{ type: "link", href: "https://example.com" }] },
    ],
  },
  TAIL,
];

/**
 * 진입점별로 text를 붙인다. Ctrl+V와 Ctrl+Shift+V는 paste 이벤트이고
 * view.pasteText는 PM doPaste를 직접 부른다.
 */
const paste = (entry: Entry, blocks: Block[], place: Place, text: string) => {
  if (entry === "view.pasteText") {
    const m = mounted(documentOf(...blocks));
    place(m.tiptap);
    const dispatch = vi.spyOn(m.tiptap.view, "dispatch");
    m.tiptap.view.pasteText(text);
    return { ...m, dispatch };
  }
  return pasteIn(
    blocks,
    place,
    { "text/plain": text },
    {
      shift: entry === "Ctrl+Shift+V",
    },
  );
};

type Mounted = ReturnType<typeof mounted>;

/** 첫 최상위 블록의 inline 런이다. */
const firstRuns = (m: Pick<Mounted, "editor">) => runsOf(blocksOf(m.editor)[0]);

/** 마크를 입힌 런을 만든다. */
const colored = (text: string) => ({ text, marks: [...COLORS] });

describe("한 줄 평문 붙여넣기의 캐럿 마크 상속(Issue #310)", () => {
  describe("storedMarks 무시(C8)", () => {
    it.each(ENTRIES)("%s는 storedMarks를 무시한다", (entry) => {
      const m = paste(
        entry,
        [paragraphBlock("p1", "abcd"), TAIL],
        (tiptap) => {
          textSelection(inBlock("p1", 2))(tiptap);
          setBoldStoredMark(tiptap);
        },
        "X",
      );

      expect(firstRuns(m)).toEqual([{ text: "abXcd" }]);
    });

    it.each(ENTRIES)(
      "%s는 색 캐럿에서도 storedMarks를 쓰지 않고 캐럿 위치 마크를 쓴다",
      (entry) => {
        const m = paste(
          entry,
          colorBlocks(),
          (tiptap) => {
            textSelection(inBlock("p1", 4))(tiptap);
            setBoldStoredMark(tiptap);
          },
          "ab",
        );

        // bold가 섞이지 않는다. 색은 캐럿 위치 마크다.
        expect(firstRuns(m)).toEqual([{ text: "ce" }, colored("llab")]);
      },
    );
  });

  describe("표 밖 색 캐럿(C1)", () => {
    it("textColor와 backgroundColor가 한 줄 삽입 텍스트에 이어진다", () => {
      const result = pasteIn(colorBlocks(), textSelection(inBlock("p1", 4)), {
        "text/plain": "ab",
      });

      expect(firstRuns(result)).toEqual([{ text: "ce" }, colored("llab")]);
    });
  });

  describe("셀 안 색 캐럿(C2)", () => {
    it("셀 안에서도 색이 이어진다", () => {
      const result = pasteIn(
        colorCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/plain": "ab" },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "ce",
        "llab*textColor*backgroundColor",
      ]);
      expect(result.tiptap.state.doc.childCount).toBe(3);
    });
  });

  describe("여러 줄과의 일치(C3)", () => {
    it("표 밖 한 줄과 여러 줄의 삽입 텍스트 마크가 같다", () => {
      const single = pasteIn(colorBlocks(), textSelection(inBlock("p1", 4)), {
        "text/plain": "ab",
      });
      const multi = pasteIn(colorBlocks(), textSelection(inBlock("p1", 4)), {
        "text/plain": "a\nb",
      });

      // 여러 줄 결과는 이전과 같다. 줄마다 색이 이어진다.
      expect(runsOf(blocksOf(multi.editor)[0])).toEqual([
        { text: "ce" },
        colored("lla"),
      ]);
      expect(runsOf(blocksOf(multi.editor)[1])).toEqual([colored("b")]);
      expect(firstRuns(single)).toEqual([{ text: "ce" }, colored("llab")]);
    });

    it("셀 안 한 줄과 여러 줄의 삽입 텍스트 마크가 같다", () => {
      const single = pasteIn(
        colorCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/plain": "ab" },
      );
      const multi = pasteIn(
        colorCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/plain": "a\nb" },
      );

      expect(kindsOf(multi.tiptap, "t-r0c0")).toEqual([
        "ce",
        "lla*textColor*backgroundColor",
        "br*textColor*backgroundColor",
        "b*textColor*backgroundColor",
      ]);
      expect(kindsOf(single.tiptap, "t-r0c0")[1]).toBe(
        "llab*textColor*backgroundColor",
      );
    });
  });

  describe("범위 선택과 마크 없는 캐럿(C4·C5)", () => {
    it("색 구간 안 범위 선택은 범위 시작 위치 마크로 색을 유지한다", () => {
      const result = pasteIn(
        colorBlocks(),
        textSelection(inBlock("p1", 3), inBlock("p1", 4)),
        { "text/plain": "ab" },
      );

      expect(firstRuns(result)).toEqual([{ text: "ce" }, colored("lab")]);
    });

    it("색 구간 안 범위 선택은 셀 안에서도 색을 유지한다", () => {
      const result = pasteIn(
        colorCellBlocks(),
        textSelection(inCell("t-r0c0", 3), inCell("t-r0c0", 4)),
        { "text/plain": "ab" },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "ce",
        "lab*textColor*backgroundColor",
      ]);
    });

    it("마크 없는 구간 끝에 붙이면 마크가 없다", () => {
      const result = pasteIn(colorBlocks(), textSelection(inBlock("p1", 2)), {
        "text/plain": "ab",
      });

      expect(firstRuns(result)).toEqual([{ text: "ceab" }, colored("ll")]);
    });

    it("마크 없는 셀 구간 끝에 붙이면 마크가 없다", () => {
      const result = pasteIn(
        colorCellBlocks(),
        textSelection(inCell("t-r0c0", 2)),
        { "text/plain": "ab" },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "ceab",
        "ll*textColor*backgroundColor",
      ]);
    });
  });

  describe("bold·link 회귀(C6)", () => {
    it("bold 캐럿은 한 줄에도 bold를 잇는다", () => {
      const result = pasteIn(boldBlocks(), textSelection(inBlock("p1", 4)), {
        "text/plain": "ab",
      });

      expect(firstRuns(result)).toEqual([
        { text: "ce" },
        { text: "llab", marks: [{ type: "bold" }] },
      ]);
    });

    it("link 끝 캐럿은 한 줄에도 link를 잇는다", () => {
      const result = pasteIn(linkBlocks(), textSelection(inBlock("p1", 4)), {
        "text/plain": "ab",
      });

      expect(firstRuns(result)).toEqual([
        { text: "ce" },
        {
          text: "llab",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]);
    });

    it("link 안쪽 캐럿은 한 줄에도 link를 잇는다", () => {
      const result = pasteIn(linkBlocks(), textSelection(inBlock("p1", 3)), {
        "text/plain": "ab",
      });

      expect(firstRuns(result)).toEqual([
        { text: "ce" },
        {
          text: "labl",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]);
    });
  });

  describe("진입점 셋과 한 줄 drop(C7)", () => {
    it.each(ENTRIES)("%s는 표 밖에서 색을 잇는다", (entry) => {
      const m = paste(
        entry,
        colorBlocks(),
        textSelection(inBlock("p1", 4)),
        "ab",
      );

      expect(firstRuns(m)).toEqual([{ text: "ce" }, colored("llab")]);
    });

    it.each(ENTRIES)("%s는 셀 안에서 색을 잇는다", (entry) => {
      const m = paste(
        entry,
        colorCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        "ab",
      );

      expect(kindsOf(m.tiptap, "t-r0c0")).toEqual([
        "ce",
        "llab*textColor*backgroundColor",
      ]);
    });

    it("표 밖 한 줄 drop도 위치의 색을 잇는다", () => {
      const blocks = [...colorBlocks(), singleCellTable("t", "cell")];
      const { editor, editable, tiptap } = mountCellDrop(blocks);
      stubPosAtCoords(tiptap, inBlock("p1", 4)(tiptap));

      dropData(editable, { "text/plain": "ab" });

      expect(runsOf(blocksOf(editor)[0])).toEqual([
        { text: "ce" },
        colored("llab"),
      ]);
    });

    it("셀 안 한 줄 drop도 위치의 색을 잇는다", () => {
      const { editor, editable, tiptap } = mountCellDrop(colorCellBlocks(), 4);

      dropData(editable, { "text/plain": "ab" });

      expect(kindsOf(tiptap, "t-r0c0")).toEqual([
        "ce",
        "llab*textColor*backgroundColor",
      ]);
      expect(blocksOf(editor).map((block) => block.type)).toEqual([
        "paragraph",
        "table",
        "paragraph",
      ]);
    });

    it("drop은 캐럿이 아닌 위치의 색만 쓴다", () => {
      // 선택(tail 끝)은 마크가 없다. 위치는 색 구간 안쪽이다.
      const { editor, editable, tiptap } = mountCellDrop(
        [...colorBlocks(), singleCellTable("t", "cell")],
        0,
      );
      stubPosAtCoords(tiptap, inBlock("p1", 3)(tiptap));

      dropData(editable, { "text/plain": "ab" });

      expect(runsOf(blocksOf(editor)[0])).toEqual([
        { text: "ce" },
        colored("labl"),
      ]);
    });
  });

  describe("무효 문자가 섞인 한 줄(C9)", () => {
    // view.pasteText에 무효 문자를 직접 넘기는 입력은 이 확장이 정리하지 않는다.
    // 붙여넣기 이벤트가 정리본을 만들어 view.pasteText에 넘기는 경로만 본다.
    it.each(["Ctrl+V", "Ctrl+Shift+V"] as const)(
      "%s는 정리본에도 색을 잇는다",
      (entry) => {
        const m = paste(
          entry,
          colorBlocks(),
          textSelection(inBlock("p1", 4)),
          `a${SOH}b`,
        );

        expect(firstRuns(m)).toEqual([{ text: "ce" }, colored("llab")]);
      },
    );

    it("셀 안에서도 정리본에 색을 잇는다", () => {
      const m = paste(
        "Ctrl+V",
        colorCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        `a${SOH}b`,
      );

      expect(kindsOf(m.tiptap, "t-r0c0")).toEqual([
        "ce",
        "llab*textColor*backgroundColor",
      ]);
    });
  });

  describe("블록 보존", () => {
    it("빈 문단에 붙여도 blockId가 유지된다", () => {
      const m = paste(
        "Ctrl+V",
        [paragraphBlock("p1", ""), TAIL],
        textSelection(inBlock("p1", 0)),
        "ab",
      );

      expect(blocksOf(m.editor).map((block) => block.id)).toEqual([
        "p1",
        "tail",
      ]);
      expect(firstRuns(m)).toEqual([{ text: "ab" }]);
    });

    it("제목 블록 캐럿에 붙여도 블록 종류가 바뀌지 않는다", () => {
      const m = paste(
        "Ctrl+V",
        [headingBlock("p1", 2, "abcd"), TAIL],
        textSelection(inBlock("p1", 2)),
        "X",
      );

      expect(blocksOf(m.editor).map((block) => block.type)).toEqual([
        "heading",
        "paragraph",
      ]);
      expect(firstRuns(m)).toEqual([{ text: "abXcd" }]);
    });
  });

  describe("transaction 계약(C10)", () => {
    it.each(ENTRIES)(
      "%s는 dispatch 1회, undo 1회, paste meta와 uiEvent를 단다",
      (entry) => {
        const m = paste(
          entry,
          colorBlocks(),
          textSelection(inBlock("p1", 4)),
          "ab",
        );

        expect(m.dispatch).toHaveBeenCalledTimes(1);
        const transaction = m.dispatch.mock.calls[0]?.[0];
        expect(transaction?.getMeta("paste")).toBe(true);
        expect(transaction?.getMeta("uiEvent")).toBe("paste");
        expect(firstRuns(m)).toEqual([{ text: "ce" }, colored("llab")]);

        m.tiptap.commands.undo();
        expect(firstRuns(m)).toEqual([{ text: "ce" }, colored("ll")]);
      },
    );

    it("Ctrl+V는 dispatch 1회에 paste meta와 uiEvent paste를 단다", () => {
      const result = pasteIn(colorBlocks(), textSelection(inBlock("p1", 4)), {
        "text/plain": "ab",
      });

      expect(result.dispatch).toHaveBeenCalledTimes(1);
      const transaction = result.dispatch.mock.calls[0]?.[0];
      expect(transaction?.getMeta("paste")).toBe(true);
      expect(transaction?.getMeta("uiEvent")).toBe("paste");
      expect(result.event.defaultPrevented).toBe(true);
    });

    it("셀 안 Ctrl+V도 dispatch 1회에 paste meta와 uiEvent paste를 단다", () => {
      const result = pasteIn(
        colorCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/plain": "ab" },
      );

      expect(result.dispatch).toHaveBeenCalledTimes(1);
      const transaction = result.dispatch.mock.calls[0]?.[0];
      expect(transaction?.getMeta("paste")).toBe(true);
      expect(transaction?.getMeta("uiEvent")).toBe("paste");
    });
  });
});
