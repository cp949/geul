/**
 * 셀 인라인 변환 helper(cell-html-inline.ts)의 규칙을 고정한다(Issue #304).
 * importHtml이 만든 블록 트리를 줄 목록으로 평탄화해 표 셀이 받는 inline
 * Fragment로 만든다. 순수 함수라 편집기 문서를 바꾸지 않는다. 실제 붙여넣기
 * 결과는 clipboard-paste-table-cell-multiblock-html.test.ts가 소유한다.
 *
 * 다루는 규칙은 다음과 같다.
 * - 줄이 되는 블록과 되지 않는 블록(구분선·미디어·custom 블록)
 * - children 깊이 우선 순서와 들여쓰기 없음
 * - codeBlock 내부 개행은 hardBreak이고 code 마크가 없음
 * - 빈 줄 접기와 줄 사이 hardBreak 하나
 * - 줄 안 마크 유지와 셀에 없는 inline 원소·마크 제거
 * - 무효 문자 정리
 * - 개행·공백뿐인 줄 접기와 줄 앞뒤 hardBreak 제거
 * - 마크 정규화: bold와 code가 함께면 code만 남김
 * - 발동 조건: content 블록 2개 이상이고 정리 뒤 줄 1개 이상. 표가 있으면 null
 * - 최소 블록 수 인자(Issue #308): CellSelection 경로는 1을 넘겨 한 블록 html도
 *   변환한다. 기본값은 2다
 * - flattenTables 옵션(Issue #312, #313): drop 전용이다. 표의 셀을 행 우선
 *   줄로 평탄화한다. 표가 하나 이상이면 최소 블록 수 1을 쓰므로 표 하나만 있어도
 *   줄을 낸다. 옵션이 없으면 표가 있을 때 null이다
 */
import type { Block, DocumentBlock } from "@cp949/geul-model";
import type { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { buildCellHtmlInline } from "../src/cell-html-inline.js";
import { gridTable } from "./table-boundary-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  listItemBlock,
  mounted,
  paragraphBlock,
} from "./list-item-block-type-support.js";
import { kindsOfFragment } from "./table-cell-paste-test-support.js";

const SOH = String.fromCharCode(1);
const TAB = String.fromCharCode(9);

/** helper가 쓰는 셀 스키마다. 편집기에서 얻는다. */
const cellSchema = (): Schema =>
  mounted(documentOf(paragraphBlock("p", "x"))).tiptap.schema;

/** 변환 결과를 종류 목록으로 얻는다. 발동하지 않으면 null이다. */
const convert = (...blocks: DocumentBlock[]): string[] | null => {
  const fragment = buildCellHtmlInline(cellSchema(), blocks);
  return fragment === null ? null : kindsOfFragment(fragment);
};

/** 최소 블록 수 1로 변환한다(CellSelection 경로). 발동하지 않으면 null이다. */
const convertSingle = (...blocks: DocumentBlock[]): string[] | null => {
  const fragment = buildCellHtmlInline(cellSchema(), blocks, 1);
  return fragment === null ? null : kindsOfFragment(fragment);
};

/** flattenTables를 켜고 변환한다(drop 경로). 발동하지 않으면 null이다. */
const convertFlat = (
  blocks: readonly DocumentBlock[],
  minBlocks?: number,
): string[] | null => {
  const fragment = buildCellHtmlInline(cellSchema(), blocks, minBlocks, {
    flattenTables: true,
  });
  return fragment === null ? null : kindsOfFragment(fragment);
};

const heading = (id: string, text: string): Block => ({
  id,
  type: "heading",
  level: 1,
  content: [{ text }],
});

const quote = (id: string, text: string, children?: Block[]): Block => ({
  id,
  type: "quote",
  content: [{ text }],
  ...(children === undefined ? {} : { children }),
});

describe("buildCellHtmlInline", () => {
  describe("줄이 되는 블록", () => {
    it("문단 둘은 hardBreak 하나로 이은 두 줄이다", () => {
      expect(
        convert(paragraphBlock("a", "a"), paragraphBlock("b", "b")),
      ).toEqual(["a", "br", "b"]);
    });

    it.each([
      { name: "bulletListItem", type: "bulletListItem" as const },
      { name: "numberedListItem", type: "numberedListItem" as const },
    ])("$name 항목 둘은 접두어 없이 두 줄이다", ({ type }) => {
      expect(
        convert(listItemBlock("a", type, "a"), listItemBlock("b", type, "b")),
      ).toEqual(["a", "br", "b"]);
    });

    it("checkListItem·toggleListItem·callout의 content도 줄이다", () => {
      expect(
        convert(
          {
            id: "a",
            type: "checkListItem",
            checked: true,
            content: [{ text: "a" }],
          },
          {
            id: "b",
            type: "toggleListItem",
            collapsed: true,
            content: [{ text: "b" }],
          },
          { id: "c", type: "callout", icon: "x", content: [{ text: "c" }] },
        ),
      ).toEqual(["a", "br", "b", "br", "c"]);
    });

    it("제목과 인용은 서식 없이 줄이다", () => {
      expect(convert(heading("a", "a"), quote("b", "b"))).toEqual([
        "a",
        "br",
        "b",
      ]);
    });
  });

  describe("children 순서", () => {
    it("자식은 부모 다음 줄이고 깊이 우선이며 들여쓰기가 없다", () => {
      expect(
        convert(
          listItemBlock("a", "bulletListItem", "a", {
            children: [
              listItemBlock("b", "bulletListItem", "b", {
                children: [listItemBlock("c", "bulletListItem", "c")],
              }),
              listItemBlock("d", "bulletListItem", "d"),
            ],
          }),
          listItemBlock("e", "bulletListItem", "e"),
        ),
      ).toEqual(["a", "br", "b", "br", "c", "br", "d", "br", "e"]);
    });

    it("인용의 자식 문단도 부모 다음 줄이다", () => {
      expect(convert(quote("a", "a", [paragraphBlock("b", "b")]))).toEqual([
        "a",
        "br",
        "b",
      ]);
    });
  });

  describe("codeBlock", () => {
    it("내부 개행마다 hardBreak이고 code 마크가 없다", () => {
      expect(
        convert(codeBlockBlock("a", "x\ny"), paragraphBlock("b", "z")),
      ).toEqual(["x", "br", "y", "br", "z"]);
    });

    it("내부 연속 개행은 hardBreak를 그대로 둔다", () => {
      expect(
        convert(codeBlockBlock("a", "x\n\ny"), paragraphBlock("b", "z")),
      ).toEqual(["x", "br", "br", "y", "br", "z"]);
    });

    // Issue #304 리뷰로 정정: 빈 codeBlock은 줄을 내지 않지만 블록이 둘이라
    // 남은 줄 하나를 낸다. 이전에는 null이었다.
    it("빈 codeBlock은 줄을 내지 않는다(Issue #304 리뷰로 정정)", () => {
      expect(
        convert(codeBlockBlock("a", ""), paragraphBlock("b", "z")),
      ).toEqual(["z"]);
    });

    it("끝 개행은 hardBreak를 더하지 않는다", () => {
      expect(
        convert(codeBlockBlock("a", "a\nb\n"), paragraphBlock("b", "c")),
      ).toEqual(["a", "br", "b", "br", "c"]);
    });

    it("Tab은 셀에서 무효라 지운다", () => {
      expect(
        convert(codeBlockBlock("a", `x${TAB}y`), paragraphBlock("b", "z")),
      ).toEqual(["xy", "br", "z"]);
    });
  });

  describe("빈 줄과 줄이 아닌 블록", () => {
    it.each([
      {
        name: "가운데 빈 문단",
        blocks: [
          paragraphBlock("a", "a"),
          paragraphBlock("e", ""),
          paragraphBlock("b", "b"),
        ],
      },
      {
        name: "끝 빈 문단",
        blocks: [
          paragraphBlock("a", "a"),
          paragraphBlock("b", "b"),
          paragraphBlock("e", ""),
        ],
      },
      {
        name: "앞 빈 문단",
        blocks: [
          paragraphBlock("e", ""),
          paragraphBlock("a", "a"),
          paragraphBlock("b", "b"),
        ],
      },
    ])("$name: 줄을 내지 않아 hardBreak 하나다", ({ blocks }) => {
      expect(convert(...blocks)).toEqual(["a", "br", "b"]);
    });

    it.each([
      { name: "divider", block: { id: "d", type: "divider" } as Block },
      { name: "image", block: { id: "d", type: "image" } as Block },
      { name: "video", block: { id: "d", type: "video" } as Block },
      { name: "audio", block: { id: "d", type: "audio" } as Block },
      { name: "file", block: { id: "d", type: "file" } as Block },
      { name: "iframe", block: { id: "d", type: "iframe" } as Block },
      {
        name: "custom 블록",
        block: { id: "d", type: "myBlock", content: "inline" } as DocumentBlock,
      },
    ])("$name: 줄을 내지 않는다", ({ block }) => {
      expect(
        convert(paragraphBlock("a", "a"), block, paragraphBlock("b", "b")),
      ).toEqual(["a", "br", "b"]);
    });
  });

  describe("개행·공백뿐인 줄 접기(Issue #304 리뷰)", () => {
    const NBSP = String.fromCharCode(0xa0);

    it.each([
      { name: "가운데", blocks: ["a", "\n", "b"] },
      { name: "앞", blocks: ["\n", "a", "b"] },
      { name: "끝", blocks: ["a", "b", "\n"] },
      { name: "연속", blocks: ["a", "\n", "\n", "b"] },
    ])(
      "hardBreak뿐인 문단($name)은 빈 줄이라 hardBreak 하나다",
      ({ blocks }) => {
        expect(
          convert(...blocks.map((text, i) => paragraphBlock(`p${i}`, text))),
        ).toEqual(["a", "br", "b"]);
      },
    );

    it.each([
      { name: "공백", blank: " " },
      { name: "여러 공백", blank: "   " },
      { name: "NBSP", blank: NBSP },
    ])("공백류($name)뿐인 문단은 빈 줄이라 버린다", ({ blank }) => {
      expect(
        convert(
          paragraphBlock("a", "a"),
          paragraphBlock("e", blank),
          paragraphBlock("b", "b"),
        ),
      ).toEqual(["a", "br", "b"]);
    });

    it("공백과 hardBreak만 섞인 문단도 빈 줄이다", () => {
      expect(
        convert(
          paragraphBlock("a", "a"),
          paragraphBlock("e", " \n "),
          paragraphBlock("b", "b"),
        ),
      ).toEqual(["a", "br", "b"]);
    });

    it("줄 앞뒤의 hardBreak는 자르고 안쪽 hardBreak는 유지한다", () => {
      expect(
        convert(paragraphBlock("a", "\na\n\nb\n"), paragraphBlock("b", "c")),
      ).toEqual(["a", "br", "br", "b", "br", "c"]);
    });

    it("줄 안 텍스트의 앞뒤 공백은 그대로 둔다", () => {
      expect(
        convert(paragraphBlock("a", " a "), paragraphBlock("b", "b")),
      ).toEqual([" a ", "br", "b"]);
    });

    it("무효 문자를 지운 뒤 hardBreak만 남는 줄도 버린다", () => {
      expect(
        convert(
          paragraphBlock("a", "a"),
          paragraphBlock("e", `${SOH}\n${SOH}`),
          paragraphBlock("b", "b"),
        ),
      ).toEqual(["a", "br", "b"]);
    });
  });

  describe("줄 안 내용", () => {
    it("bold·link·textColor 마크를 유지하고 hardBreak에는 마크가 없다", () => {
      expect(
        convert(
          {
            id: "a",
            type: "paragraph",
            content: [
              { text: "a", marks: [{ type: "bold" }] },
              { text: "l", marks: [{ type: "link", href: "https://x.y" }] },
            ],
          },
          {
            id: "b",
            type: "paragraph",
            content: [
              { text: "c", marks: [{ type: "textColor", color: "#FF0000" }] },
            ],
          },
        ),
      ).toEqual(["a*bold", "l*link", "br", "c*textColor"]);
    });

    it("셀 스키마에 없는 custom inline 원소는 버린다", () => {
      expect(
        convert(
          {
            id: "a",
            type: "paragraph",
            content: [
              { text: "a" },
              { type: "custom", customType: "noSuchInline" },
            ],
          },
          paragraphBlock("b", "b"),
        ),
      ).toEqual(["a", "br", "b"]);
    });

    it("셀 스키마에 없는 custom 마크는 버리고 텍스트는 남긴다", () => {
      expect(
        convert(
          {
            id: "a",
            type: "paragraph",
            content: [{ text: "a", marks: [{ type: "noSuchMark" }] }],
          },
          paragraphBlock("b", "b"),
        ),
      ).toEqual(["a", "br", "b"]);
    });

    it("무효 문자를 지운다", () => {
      expect(
        convert(paragraphBlock("a", `a${SOH}b`), paragraphBlock("b", "c")),
      ).toEqual(["ab", "br", "c"]);
    });

    // Issue #304 리뷰로 정정: 정리 뒤 비는 줄은 줄을 내지 않고 남은 줄 하나를
    // 낸다. 이전에는 null이었다.
    it("정리 뒤 비는 줄은 줄을 내지 않는다(Issue #304 리뷰로 정정)", () => {
      expect(
        convert(paragraphBlock("a", SOH), paragraphBlock("b", "c")),
      ).toEqual(["c"]);
    });
  });

  describe("발동 조건", () => {
    it("줄이 하나면 null이다", () => {
      expect(convert(paragraphBlock("a", "a"))).toBeNull();
    });

    // Issue #304 리뷰로 정정: 줄이 하나 남아도 블록이 둘 이상이면 그 줄을 낸다.
    // 이전에는 null이라 호출부가 이전 경로로 내려가 표 뒤에 빈 문단을 남겼다.
    it("빈 문단이 섞여 줄이 하나 남아도 블록이 둘이면 그 줄을 낸다(Issue #304 리뷰로 정정)", () => {
      expect(
        convert(paragraphBlock("a", "a"), paragraphBlock("e", "")),
      ).toEqual(["a"]);
    });

    it("content 블록이 하나면 줄 수와 상관없이 null이다", () => {
      expect(convert(paragraphBlock("a", "a\nb"))).toBeNull();
      expect(
        convert(listItemBlock("a", "bulletListItem", "a"), {
          id: "d",
          type: "divider",
        }),
      ).toBeNull();
    });

    it("블록이 둘 이상이어도 줄이 0개이면 null이다", () => {
      expect(
        convert(paragraphBlock("a", SOH), paragraphBlock("b", "")),
      ).toBeNull();
    });

    it("줄이 없으면 null이다", () => {
      expect(convert({ id: "d", type: "divider" })).toBeNull();
      expect(convert()).toBeNull();
    });

    it("codeBlock 한 블록만 있으면 null이다", () => {
      expect(convert(codeBlockBlock("a", "x\ny"))).toBeNull();
    });

    it("최상위 표가 있으면 줄이 많아도 null이다", () => {
      expect(
        convert(
          {
            id: "t",
            type: "table",
            columns: [{ id: "c", width: 100 }],
            rows: [
              {
                id: "r",
                cells: [
                  {
                    id: "x",
                    columnId: "c",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [{ text: "x" }],
                  },
                ],
              },
            ],
            headerRows: 0,
            headerColumns: 0,
          },
          paragraphBlock("a", "a"),
          paragraphBlock("b", "b"),
        ),
      ).toBeNull();
    });
  });

  describe("최소 블록 수 인자(Issue #308)", () => {
    it("1이면 content 블록 하나도 줄을 내고 마크를 유지한다", () => {
      expect(
        convertSingle({
          id: "a",
          type: "paragraph",
          content: [{ text: "x", marks: [{ type: "bold" }] }],
        }),
      ).toEqual(["x*bold"]);
      expect(convertSingle(heading("h", "t"))).toEqual(["t"]);
    });

    it("1이면 codeBlock 한 블록도 개행이 hardBreak이고 code 마크가 없다", () => {
      expect(convertSingle(codeBlockBlock("a", "a\nb"))).toEqual([
        "a",
        "br",
        "b",
      ]);
    });

    it("1이어도 줄이 0개이면 null이다", () => {
      expect(convertSingle(paragraphBlock("a", ""))).toBeNull();
      expect(convertSingle(paragraphBlock("a", SOH))).toBeNull();
      expect(convertSingle({ id: "d", type: "divider" })).toBeNull();
      expect(convertSingle()).toBeNull();
    });

    it("생략하면 2다(한 블록은 null)", () => {
      expect(convert(paragraphBlock("a", "a"))).toBeNull();
      expect(convertSingle(paragraphBlock("a", "a"))).toEqual(["a"]);
    });
  });

  describe("표 평탄화 옵션 flattenTables(Issue #312)", () => {
    const table1 = (text = "t"): Block => gridTable("t1", 1, 1, [text]);

    it("옵션이 없으면 표와 문단이 함께여도 null이다", () => {
      expect(convert(paragraphBlock("a", "x"), table1())).toBeNull();
      expect(
        buildCellHtmlInline(
          cellSchema(),
          [paragraphBlock("a", "x"), table1()],
          2,
          { flattenTables: false },
        ),
      ).toBeNull();
    });

    it("표 하나만 있어도 줄을 낸다(1x1, 2x2)", () => {
      expect(convertFlat([table1()])).toEqual(["t"]);
      expect(
        convertFlat([gridTable("t2", 2, 2, ["a", "b", "c", "d"])]),
      ).toEqual(["a", "br", "b", "br", "c", "br", "d"]);
    });

    it("표 하나와 구분선은 표 밖 content가 없어도 표의 줄을 낸다", () => {
      expect(convertFlat([table1(), { id: "d", type: "divider" }])).toEqual([
        "t",
      ]);
    });

    it("옵션이 없으면 표 하나만 있어도 null이다", () => {
      expect(convert(table1())).toBeNull();
      expect(convertSingle(table1())).toBeNull();
    });

    it("셀이 모두 비면 표 하나만 있어도 줄이 0개라 null이다", () => {
      expect(convertFlat([gridTable("t2", 1, 1, [""])])).toBeNull();
    });

    it("셀 content의 br와 마크를 유지하고 pre 개행도 hardBreak다", () => {
      const table = gridTable("t2", 1, 2, ["", ""]);
      if (table.type !== "table") throw new Error("fixture 준비 실패");
      const cells = table.rows[0]?.cells;
      if (cells?.[0] === undefined || cells[1] === undefined) {
        throw new Error("fixture 준비 실패");
      }
      cells[0].content = [
        { text: "a", marks: [{ type: "bold" }] },
        { text: "\nb" },
      ];
      cells[1].content = [{ text: "c\nd" }];

      expect(convertFlat([table])).toEqual([
        "a*bold",
        "br",
        "b",
        "br",
        "c",
        "br",
        "d",
      ]);
    });

    it.each([
      [
        "문단 + 표",
        () => [paragraphBlock("a", "x"), table1()],
        ["x", "br", "t"],
      ],
      [
        "표 + 문단",
        () => [table1(), paragraphBlock("a", "y")],
        ["t", "br", "y"],
      ],
      [
        "문단 + 표 + 문단",
        () => [paragraphBlock("a", "x"), table1(), paragraphBlock("b", "y")],
        ["x", "br", "t", "br", "y"],
      ],
      [
        "표 둘",
        () => [table1("t"), gridTable("t2", 1, 1, ["u"])],
        ["t", "br", "u"],
      ],
    ] as const)("%s 입력은 문서 순서로 줄을 낸다", (_label, make, kinds) => {
      expect(convertFlat([...make()])).toEqual(kinds);
    });

    it("2x2 표와 문단은 셀을 행 우선으로 한 줄씩 낸다", () => {
      expect(
        convertFlat([
          paragraphBlock("a", "x"),
          gridTable("t2", 2, 2, ["a", "b", "c", "d"]),
        ]),
      ).toEqual(["x", "br", "a", "br", "b", "br", "c", "br", "d"]);
    });

    it("빈 셀과 공백뿐인 셀은 줄을 내지 않는다", () => {
      expect(
        convertFlat([
          paragraphBlock("a", "x"),
          gridTable("t2", 1, 4, ["", " ", "m", "n"]),
        ]),
      ).toEqual(["x", "br", "m", "br", "n"]);
    });

    it("셀 content의 마크를 유지한다", () => {
      const table = gridTable("t2", 1, 1, ["t"]);
      if (table.type !== "table") throw new Error("fixture 준비 실패");
      const cell = table.rows[0]?.cells[0];
      if (cell === undefined) throw new Error("fixture 준비 실패");
      cell.content = [{ text: "t", marks: [{ type: "bold" }] }];

      expect(convertFlat([paragraphBlock("a", "x"), table])).toEqual([
        "x",
        "br",
        "t*bold",
      ]);
    });

    it("병합으로 행마다 셀 수가 달라도 존재하는 셀만 읽는다", () => {
      const table = gridTable("t2", 2, 2, ["a", "b", "c", "d"]);
      if (table.type !== "table") throw new Error("fixture 준비 실패");
      const first = table.rows[0];
      if (first === undefined) throw new Error("fixture 준비 실패");
      first.cells = [{ ...first.cells[0]!, columnSpan: 2 }];

      expect(convertFlat([paragraphBlock("a", "x"), table])).toEqual([
        "x",
        "br",
        "a",
        "br",
        "c",
        "br",
        "d",
      ]);
    });

    it("셀의 무효 문자를 지우고 비는 셀은 버린다", () => {
      expect(
        convertFlat([
          paragraphBlock("a", "x"),
          gridTable("t2", 1, 2, [SOH, `m${SOH}n`]),
        ]),
      ).toEqual(["x", "br", "mn"]);
    });

    it("자식이 있는 블록 뒤의 표도 문서 순서다", () => {
      expect(
        convertFlat([
          listItemBlock("a", "bulletListItem", "a", {
            children: [paragraphBlock("c", "c")],
          }),
          table1(),
        ]),
      ).toEqual(["a", "br", "c", "br", "t"]);
    });

    it("표가 있으면 최소 블록 수가 크게 주어져도 1로 쓴다", () => {
      expect(convertFlat([table1()], 3)).toEqual(["t"]);
      expect(convertFlat([paragraphBlock("a", "x"), table1()], 3)).toEqual([
        "x",
        "br",
        "t",
      ]);
    });

    it("표가 없으면 flattenTables가 켜져도 최소 블록 수를 그대로 쓴다", () => {
      expect(convertFlat([paragraphBlock("a", "x")])).toBeNull();
      expect(convertFlat([paragraphBlock("a", "x")], 1)).toEqual(["x"]);
      expect(
        convertFlat([paragraphBlock("a", "x"), paragraphBlock("b", "y")], 3),
      ).toBeNull();
    });

    it("셀이 모두 비면 표 둘이어도 줄이 0개라 null이다", () => {
      expect(
        convertFlat([
          gridTable("t2", 1, 1, [""]),
          gridTable("t3", 1, 1, [" "]),
        ]),
      ).toBeNull();
    });

    it("입력 블록을 바꾸지 않는다", () => {
      const blocks = [paragraphBlock("a", "x"), table1()];
      const snapshot = structuredClone(blocks);

      convertFlat(blocks);

      expect(blocks).toEqual(snapshot);
    });
  });

  it("결과는 셀 스키마가 받아들이는 inline Fragment다", () => {
    const schema = cellSchema();
    const fragment = buildCellHtmlInline(schema, [
      codeBlockBlock("a", "x\ny"),
      paragraphBlock("b", "z"),
    ]);

    expect(fragment).not.toBeNull();
    if (fragment === null) return;
    expect(() =>
      schema.nodes.tableCell?.create(null, fragment).check(),
    ).not.toThrow();
  });

  // Issue #304 리뷰 F4: bold와 code가 함께 있으면 PM 스키마가 거절하는 마크
  // 집합이다. 한 줄 이전 경로와 같이 code만 남긴다.
  it("bold와 code가 함께인 텍스트는 code만 남아 셀 스키마를 통과한다", () => {
    const schema = cellSchema();
    const fragment = buildCellHtmlInline(schema, [
      {
        id: "a",
        type: "paragraph",
        content: [{ text: "x", marks: [{ type: "bold" }, { type: "code" }] }],
      },
      {
        id: "b",
        type: "paragraph",
        content: [{ text: "y", marks: [{ type: "code" }, { type: "bold" }] }],
      },
    ]);

    expect(fragment).not.toBeNull();
    if (fragment === null) return;
    expect(kindsOfFragment(fragment)).toEqual(["x*code", "br", "y*code"]);
    expect(() =>
      schema.nodes.tableCell?.create(null, fragment).check(),
    ).not.toThrow();
  });

  // 노드 수가 정확해야 줄마다 Fragment를 복사하는 구현과 구별된다. 시간 상한은
  // 단언하지 않는다.
  it("줄 N개는 text N개와 hardBreak N-1개 노드로 이뤄진다", () => {
    const count = 500;
    const blocks = Array.from({ length: count }, (_, i) =>
      paragraphBlock(`p${i}`, `t${i}`),
    );

    const fragment = buildCellHtmlInline(cellSchema(), blocks);

    expect(fragment?.childCount).toBe(count * 2 - 1);
  });

  it("입력 블록을 바꾸지 않는다", () => {
    const blocks = [
      paragraphBlock("a", "a"),
      listItemBlock("b", "bulletListItem", "b", {
        children: [paragraphBlock("c", "c")],
      }),
    ];
    const snapshot = structuredClone(blocks);

    buildCellHtmlInline(cellSchema(), blocks);

    expect(blocks).toEqual(snapshot);
  });
});
