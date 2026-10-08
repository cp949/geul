/**
 * 표 셀 위에 표를 포함한 text/html을 drop하는 계약을 고정한다(Issue #312,
 * #313).
 * 수정 전에는 PM 기본 drop이 표를 셀 안에 쪼개 넣어 삽입된 표의 blockId·rowId·
 * cellId가 null이 됐다. 문서 검증이 실패해 되돌림 guard가 drop을 통째로
 * 지웠다(문단 + 표, 표 + 문단, 표 둘). 이제 표 셀을 행 우선 줄로 풀어
 * 블록 사이를 hardBreak로 이어 셀 안에 한 transaction으로 넣는다. 내용이
 * 사라지지 않고 표 밖으로 새지 않는다. 표 하나만 든 html도 같다(Issue
 * #313). 수정 전에는 PM 기본 drop에 맡겨 셀 안 문단이 표 밖으로 새거나 목록이
 * 사라졌다. 2x2 표는 셀 사이 구분 없이 이어졌다.
 *
 * 다루는 축은 다음과 같다.
 * - T1 이슈 재현 문서와 문서 무결성(표 1개, 행·열·셀 id 그대로, 표 뒤 문단 없음)
 * - T2 입력 종류(표 + 문단, 문단 + 표 + 문단, 2x2 + 문단, 표 둘, 중첩 표)
 * - T3 importHtml이 낸 블록 트리 실측(표 앞뒤 빈 문단 없음, 중첩 표는 한 셀)
 * - T4 빈 셀·공백 셀, 셀 content 마크, 위치 마크 미적용
 * - T5 selection·meta·dispatch 1회·revision +1·undo 1회·현재 selection 보존
 * - T6 현행을 유지하는 입력(모든 셀이 빈 표, 한 블록 html, importHtml 실패,
 *   내부 드래그, 파일 동반, 좌표 null)
 * - T8 표 하나만 든 html(Issue #313): 셀 안 문단·제목·목록, 2x2·헤더·rowspan,
 *   1x1, `<br>`·`<pre>` 셀, 마크 유지, 표 밖 구분선·이미지
 * - T7 셀이 아닌 위치는 importHtml을 부르지 않고 좌표를 한 번만 푼다
 *
 * 표가 없는 여러 블록 html은 clipboard-drop-cell-html.test.ts가 소유한다.
 * jsdom은 좌표를 해석하지 못해 view.posAtCoords를 stub한다. 실제 브라우저
 * drop은 e2e/clipboard-paste.spec.ts가 맡는다.
 */
import type { DocumentBlock, TableBlock } from "@cp949/geul-model";
import { importHtml } from "@cp949/geul-io";
import { Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { contentTextStart } from "./block-test-support.js";
import {
  cellDropBlocks,
  handledDrop,
  htmlDrop,
  mountCellDrop,
  stubPosAtCoords,
} from "./clipboard-drop-test-support.js";
import {
  blocksOf,
  dropData,
  dropEventOf,
  outline,
} from "./clipboard-test-support.js";
import { inCell } from "./table-boundary-test-support.js";
import { boldCellBlocks, kindsOf } from "./table-cell-paste-test-support.js";

// importHtml 호출 여부를 본다. 기본은 원본 그대로이고, 실패 케이스만 한 번 실패로 바꾼다.
vi.mock("@cp949/geul-io", async (importOriginal) => {
  const original = await importOriginal<typeof import("@cp949/geul-io")>();
  return { ...original, importHtml: vi.fn(original.importHtml) };
});

const TABLE_1X1 = "<table><tr><td>t</td></tr></table>";
const TABLE_2X2 =
  "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>";
const P_THEN_TABLE = `<p>x</p>${TABLE_1X1}`;

/** 블록을 "type" 또는 "table[행/행]" 요약으로 줄인다. 셀은 `|`로 잇는다. */
const shapeOf = (blocks: readonly DocumentBlock[]): string[] =>
  blocks.map((block) =>
    block.type === "table"
      ? `table[${(block as TableBlock).rows
          .map((row) => row.cells.map((cell) => cell.id).join("|"))
          .join("/")}]`
      : block.type,
  );

/** 표가 1개이고 행·열·셀 id가 fixture 그대로이며 표 뒤 문단이 늘지 않았음을 단언한다. */
const expectTableIntact = (
  editor: Parameters<typeof blocksOf>[0],
  tiptap: ReturnType<typeof mountCellDrop>["tiptap"],
): void => {
  const blocks = blocksOf(editor);
  expect(blocks.map((block) => block.type)).toEqual([
    "paragraph",
    "codeBlock",
    "table",
    "paragraph",
  ]);
  const found = blocks.find((block) => block.type === "table");
  if (found === undefined) throw new Error("표 조회 실패");
  const table = found as TableBlock;
  expect(table.id).toBe("t");
  expect(table.columns.map((column) => column.id)).toEqual(["t-col0"]);
  expect(table.rows.map((row) => row.id)).toEqual(["t-row0"]);
  expect(table.rows[0]?.cells.map((cell) => cell.id)).toEqual(["t-r0c0"]);
  expect(shapeOf(blocks)).toEqual([
    "paragraph",
    "codeBlock",
    "table[t-r0c0]",
    "paragraph",
  ]);
  expect(outline(blocks).at(-1)).toBe("p:tail");
  expect(tiptap.state.doc.childCount).toBe(4);
  expect(() =>
    tiptap.schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
  ).not.toThrow();
};

beforeEach(() => {
  vi.mocked(importHtml).mockClear();
});

describe("표 셀 위 표 포함 html drop(Issue #312)", () => {
  describe("이슈 재현과 문서 무결성(T1)", () => {
    it("문단 + 표 html이 셀 안 hardBreak로 들어가고 표 구조가 그대로다", () => {
      const { editor, editable, tiptap } = mountCellDrop();

      htmlDrop(editable, P_THEN_TABLE);

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["cex", "br", "tll"]);
      expectTableIntact(editor, tiptap);
    });

    it("수정 전 되돌림 guard가 지우던 입력이 문서를 바꾼다", () => {
      const { editor, editable } = mountCellDrop();
      const before = editor.getDocument().blocks;

      htmlDrop(editable, P_THEN_TABLE);

      expect(editor.getDocument().blocks).not.toEqual(before);
    });
  });

  describe("입력 종류(T2)", () => {
    it.each([
      ["표 + 문단", `${TABLE_1X1}<p>y</p>`, ["cet", "br", "yll"]],
      [
        "문단 + 표 + 문단",
        `<p>x</p>${TABLE_1X1}<p>y</p>`,
        ["cex", "br", "t", "br", "yll"],
      ],
      [
        "2x2 표 + 문단(셀 행 우선)",
        `<p>x</p>${TABLE_2X2}`,
        ["cex", "br", "a", "br", "b", "br", "c", "br", "dll"],
      ],
      [
        "표 + 목록 둘",
        `${TABLE_1X1}<ul><li>a</li><li>b</li></ul>`,
        ["cet", "br", "a", "br", "bll"],
      ],
      [
        "표 둘",
        `${TABLE_1X1}<table><tr><td>u</td></tr></table>`,
        ["cet", "br", "ull"],
      ],
      ["목록 + 표", `<ul><li>a</li></ul>${TABLE_1X1}`, ["cea", "br", "tll"]],
    ] as const)(
      "%s: 내용이 보존되고 표 밖으로 새지 않는다",
      (_label, html, kinds) => {
        const { editor, editable, tiptap } = mountCellDrop();

        htmlDrop(editable, html);

        expect(kindsOf(tiptap, "t-r0c0")).toEqual(kinds);
        expectTableIntact(editor, tiptap);
      },
    );

    it("중첩 표는 importHtml이 낸 한 셀 그대로 평탄화한다", () => {
      const { editor, editable, tiptap } = mountCellDrop();

      htmlDrop(
        editable,
        "<p>x</p><table><tr><td>o<table><tr><td>in</td></tr></table></td></tr></table>",
      );

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["cex", "br", "oinll"]);
      expectTableIntact(editor, tiptap);
    });

    it("셀 안 문단이 둘인 표 + 문단은 importHtml이 이은 셀 하나다", () => {
      const { editor, editable, tiptap } = mountCellDrop();

      htmlDrop(
        editable,
        "<p>x</p><table><tr><td><p>a</p><p>b</p></td></tr></table>",
      );

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["cex", "br", "abll"]);
      expectTableIntact(editor, tiptap);
    });

    it("병합 셀이 든 표 + 문단은 존재하는 셀만 읽는다", () => {
      const { editor, editable, tiptap } = mountCellDrop();

      htmlDrop(
        editable,
        '<p>x</p><table><tr><td colspan="2">a</td></tr><tr><td>b</td><td>c</td></tr></table>',
      );

      expect(kindsOf(tiptap, "t-r0c0")).toEqual([
        "cex",
        "br",
        "a",
        "br",
        "b",
        "br",
        "cll",
      ]);
      expectTableIntact(editor, tiptap);
    });
  });

  describe("importHtml 블록 트리 실측(T3)", () => {
    // 평탄화 입력의 근거다. importHtml이 표 앞뒤에 빈 문단을 만들지 않고
    // 중첩 표를 바깥 표의 한 셀로 이어 붙이는 것을 고정한다.
    const blockTypes = (html: string): string[] => {
      const imported = importHtml(html);
      if (!imported.ok) throw new Error("importHtml 실패");
      return imported.value.document.blocks.map((block) => block.type);
    };

    it.each([
      ["표 단독", TABLE_1X1, ["table"]],
      ["문단 + 표", P_THEN_TABLE, ["paragraph", "table"]],
      ["표 + 문단", `${TABLE_1X1}<p>y</p>`, ["table", "paragraph"]],
      [
        "문단 + 표 + 문단",
        `<p>x</p>${TABLE_1X1}<p>y</p>`,
        ["paragraph", "table", "paragraph"],
      ],
      ["표 둘", `${TABLE_1X1}${TABLE_1X1}`, ["table", "table"]],
      [
        "중첩 표",
        "<table><tr><td>o<table><tr><td>in</td></tr></table></td></tr></table>",
        ["table"],
      ],
    ] as const)(
      "%s: 표 앞뒤에 빈 문단이 없는 블록 열이다",
      (_label, html, types) => {
        expect(blockTypes(html)).toEqual(types);
      },
    );
  });

  describe("빈 셀과 마크(T4)", () => {
    it("빈 셀과 공백뿐인 셀은 줄을 내지 않는다", () => {
      const { editor, editable, tiptap } = mountCellDrop();

      htmlDrop(
        editable,
        "<p>x</p><table><tr><td></td><td> </td><td>z</td></tr></table>",
      );

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["cex", "br", "zll"]);
      expectTableIntact(editor, tiptap);
    });

    it("셀 content의 마크를 유지한다", () => {
      const { editable, tiptap } = mountCellDrop();

      htmlDrop(
        editable,
        "<p>x</p><table><tr><td><strong>B</strong></td></tr></table>",
      );

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["cex", "br", "B*bold", "ll"]);
    });

    it("drop 위치의 마크를 입히지 않는다", () => {
      // 셀은 "ce" + bold "ll"이다. drop 위치는 bold "ll" 안(offset 3)이다.
      const { editable, tiptap } = mountCellDrop(boldCellBlocks(), 3);

      htmlDrop(editable, P_THEN_TABLE);

      expect(kindsOf(tiptap, "t-r0c0")).toEqual([
        "ce",
        "l*bold",
        "x",
        "br",
        "t",
        "l*bold",
      ]);
    });
  });

  describe("transaction 계약(T5)", () => {
    it("drop 뒤 selection은 삽입 범위이고 tr은 uiEvent drop만 단다", () => {
      const { editable, tiptap, pos } = mountCellDrop();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      const event = htmlDrop(editable, P_THEN_TABLE);

      const { selection } = tiptap.state;
      expect(selection).toBeInstanceOf(TextSelection);
      expect(selection.from).toBe(pos);
      // x(1) + hardBreak(1) + t(1)
      expect(selection.to).toBe(pos + 3);
      expect(
        tiptap.state.doc.textBetween(selection.from, selection.to, "", "\n"),
      ).toBe("x\nt");
      const transaction = dispatch.mock.calls[0]?.[0];
      expect(transaction?.getMeta("uiEvent")).toBe("drop");
      expect(transaction?.getMeta("paste")).toBeUndefined();
      expect(event.defaultPrevented).toBe(true);
    });

    it("dispatch 1회, revision +1, undo 1회로 원복된다", () => {
      const { editor, editable, tiptap } = mountCellDrop();
      const initialJson = tiptap.state.doc.toJSON();
      const revision = editor.getDocument().revision;
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      htmlDrop(editable, `${P_THEN_TABLE}<p>y</p>`);

      expect(kindsOf(tiptap, "t-r0c0")).toEqual([
        "cex",
        "br",
        "t",
        "br",
        "yll",
      ]);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(editor.getDocument().revision).toBe(revision + 1);

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });

    it("drop과 무관한 범위 선택을 지우지 않는다", () => {
      const { editor, editable, tiptap } = mountCellDrop();
      const tailStart = contentTextStart(tiptap, "tail");
      tiptap.commands.setTextSelection({
        from: tailStart,
        to: tailStart + 2,
      });

      htmlDrop(editable, P_THEN_TABLE);

      expect(outline(blocksOf(editor)).at(-1)).toBe("p:tail");
      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["cex", "br", "tll"]);
    });

    it("같은 셀 안의 다른 범위 선택을 지우지 않는다", () => {
      const { editable, tiptap } = mountCellDrop(cellDropBlocks(), 1);
      tiptap.commands.setTextSelection({
        from: inCell("t-r0c0", 2)(tiptap),
        to: inCell("t-r0c0", 4)(tiptap),
      });

      htmlDrop(editable, P_THEN_TABLE);

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["cx", "br", "tell"]);
    });
  });

  describe("현행을 유지하는 입력(T6)", () => {
    it.each([
      ["모든 셀이 빈 표", "<table><tr><td></td></tr></table>"],
      ["공백뿐인 셀의 표", "<table><tr><td> </td><td></td></tr></table>"],
    ] as const)(
      "%s: 줄이 0개라 직접 삽입하지 않고 위임한다",
      (_label, html) => {
        const { editor, tiptap } = mountCellDrop();
        const before = tiptap.state.doc;
        const revision = editor.getDocument().revision;

        expect(
          handledDrop(
            tiptap,
            dropEventOf({ "text/html": html, "text/plain": "plain" }),
          ),
        ).toBeFalsy();
        expect(tiptap.state.doc).toBe(before);
        expect(editor.getDocument().revision).toBe(revision);
      },
    );

    it("importHtml이 실패하면 표 포함 html도 위임한다", () => {
      vi.mocked(importHtml).mockImplementationOnce(() => ({
        ok: false,
        error: { code: "HTML_PARSE_FAILED", message: "forced" },
      }));
      const { tiptap } = mountCellDrop();
      const before = tiptap.state.doc;

      expect(
        handledDrop(tiptap, dropEventOf({ "text/html": P_THEN_TABLE })),
      ).toBeFalsy();
      expect(importHtml).toHaveBeenCalledTimes(1);
      expect(tiptap.state.doc).toBe(before);
    });

    it("내부 드래그(view.dragging)는 importHtml을 부르지 않고 위임한다", () => {
      const { tiptap } = mountCellDrop();
      tiptap.view.dragging = { slice: Slice.empty, move: false };
      const before = tiptap.state.doc;

      expect(
        handledDrop(tiptap, dropEventOf({ "text/html": P_THEN_TABLE })),
      ).toBeFalsy();
      expect(importHtml).not.toHaveBeenCalled();
      expect(tiptap.state.doc).toBe(before);
    });

    it("파일 동반 drop은 importHtml을 부르지 않고 직접 삽입하지 않는다", () => {
      const { editable, tiptap } = mountCellDrop();
      const file = new File(["x"], "a.txt", { type: "text/plain" });

      dropData(editable, { "text/html": P_THEN_TABLE }, [file]);

      expect(importHtml).not.toHaveBeenCalled();
      expect(kindsOf(tiptap, "t-r0c0")).not.toContain("br");
    });

    it("posAtCoords가 null이면 importHtml을 부르지 않고 위임한다", () => {
      const { tiptap } = mountCellDrop();
      stubPosAtCoords(tiptap, null);
      const before = tiptap.state.doc;

      expect(
        handledDrop(tiptap, dropEventOf({ "text/html": P_THEN_TABLE })),
      ).toBeFalsy();
      expect(importHtml).not.toHaveBeenCalled();
      expect(tiptap.state.doc).toBe(before);
    });
  });

  describe("표 하나만 든 html(T8, Issue #313)", () => {
    const CELL_TWO_PARAGRAPHS =
      "<table><tr><td><p>a</p><p>b</p></td></tr></table>";

    it.each([
      ["셀 안 문단 둘", CELL_TWO_PARAGRAPHS, ["ceabll"]],
      [
        "셀 안 제목 + 문단",
        "<table><tr><td><h1>h</h1><p>p</p></td></tr></table>",
        ["cehpll"],
      ],
      ["셀 안 문단 둘인 표와 구분선", `${CELL_TWO_PARAGRAPHS}<hr>`, ["ceabll"]],
      [
        "셀 안 목록이 든 표",
        "<table><tr><td><ul><li>a</li><li>b</li></ul></td></tr></table>",
        ["ceabll"],
      ],
      [
        "셀 하나만 문단 둘인 2x2",
        "<table><tr><td><p>a</p><p>b</p></td><td></td></tr><tr><td></td><td></td></tr></table>",
        ["ceabll"],
      ],
    ] as const)(
      "%s: 내용이 셀 안에 들어가고 표 밖으로 새지 않는다",
      (_label, html, kinds) => {
        const { editor, editable, tiptap } = mountCellDrop();

        htmlDrop(editable, html);

        expect(kindsOf(tiptap, "t-r0c0")).toEqual(kinds);
        expectTableIntact(editor, tiptap);
      },
    );

    it.each([
      ["2x2 표", TABLE_2X2, ["cea", "br", "b", "br", "c", "br", "dll"]],
      [
        "헤더 행이 있는 표",
        "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>c</td><td>d</td></tr></tbody></table>",
        ["cea", "br", "b", "br", "c", "br", "dll"],
      ],
      [
        "rowspan 병합 셀이 든 표",
        '<table><tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr></table>',
        ["cea", "br", "b", "br", "cll"],
      ],
    ] as const)(
      "%s: 셀을 행 우선으로 hardBreak로 이어 넣는다",
      (_label, html, kinds) => {
        const { editor, editable, tiptap } = mountCellDrop();

        htmlDrop(editable, html);

        expect(kindsOf(tiptap, "t-r0c0")).toEqual(kinds);
        expectTableIntact(editor, tiptap);
      },
    );

    it.each([
      ["1x1 표", TABLE_1X1],
      ["1x1 표와 구분선", `${TABLE_1X1}<hr>`],
      ["1x1 표와 이미지", `${TABLE_1X1}<img src="https://example.com/a.png">`],
    ] as const)("%s: 줄 하나도 직접 삽입한다", (_label, html) => {
      const { editor, editable, tiptap } = mountCellDrop();

      htmlDrop(editable, html);

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["cetll"]);
      expectTableIntact(editor, tiptap);
    });

    it("셀 안 br로 나눈 줄은 hardBreak로 남고 굵게·링크 마크는 유지된다", () => {
      const { editor, editable, tiptap } = mountCellDrop();

      htmlDrop(
        editable,
        '<table><tr><td><strong>a</strong><br><a href="https://example.com/">b</a></td></tr></table>',
      );

      expect(kindsOf(tiptap, "t-r0c0")).toEqual([
        "ce",
        "a*bold",
        "br",
        "b*link",
        "ll",
      ]);
      expectTableIntact(editor, tiptap);
    });

    it("셀 안 pre의 개행은 hardBreak다", () => {
      const { editor, editable, tiptap } = mountCellDrop();

      htmlDrop(editable, "<table><tr><td><pre>a\nb</pre></td></tr></table>");

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["cea", "br", "bll"]);
      expectTableIntact(editor, tiptap);
    });

    it("표 하나만 든 html도 selection·meta·dispatch 1회·undo 1회 계약이 같다", () => {
      const { editor, editable, tiptap, pos } = mountCellDrop();
      const initialJson = tiptap.state.doc.toJSON();
      const revision = editor.getDocument().revision;
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      const event = htmlDrop(editable, TABLE_2X2);

      const { selection } = tiptap.state;
      expect(selection).toBeInstanceOf(TextSelection);
      expect(selection.from).toBe(pos);
      // a(1) + br(1) + b(1) + br(1) + c(1) + br(1) + d(1)
      expect(selection.to).toBe(pos + 7);
      const transaction = dispatch.mock.calls[0]?.[0];
      expect(transaction?.getMeta("uiEvent")).toBe("drop");
      expect(transaction?.getMeta("paste")).toBeUndefined();
      expect(event.defaultPrevented).toBe(true);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(editor.getDocument().revision).toBe(revision + 1);

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });
  });

  describe("셀이 아닌 위치(T7)", () => {
    it("문단 위치는 importHtml을 부르지 않고 좌표를 한 번만 푼다", () => {
      const { tiptap } = mountCellDrop();
      const pos = contentTextStart(tiptap, "p1") + 2;
      const posAtCoords = vi.fn(() => ({ pos, inside: pos }));
      tiptap.view.posAtCoords = posAtCoords;
      const before = tiptap.state.doc;

      expect(
        handledDrop(tiptap, dropEventOf({ "text/html": P_THEN_TABLE })),
      ).toBeFalsy();

      expect(importHtml).not.toHaveBeenCalled();
      expect(posAtCoords).toHaveBeenCalledTimes(1);
      expect(tiptap.state.doc).toBe(before);
    });
  });
});
