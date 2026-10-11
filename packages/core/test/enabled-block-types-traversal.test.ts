/**
 * findDisabledBlock의 구조적 순회가 model Block 입력과 ClipboardContentBlock
 * 입력에서 같은 판정을 내는지 고정한다(Issue #370). TablePasteExtension이
 * 지운 옛 사본과 같은 결과인지는 삭제 시점에 실측했다.
 *
 * 다루는 축은 최상위에만 있는 막은 타입, children 깊이 2 이상에만 있는 막은
 * 타입, 막은 타입이 없는 입력, 표 data(셀) 비순회, CustomBlock 건너뜀,
 * pre-order 첫 발견 반환이다.
 */
import type { ClipboardContentBlock } from "@cp949/geul-io";
import type { Block, Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  type EnabledBlockTypes,
  findDisabledBlock,
  isBlockTypeEnabled,
} from "../src/enabled-block-types.js";
import {
  clipBlock,
  clipBullet,
  clipParagraph,
} from "./clipboard-block-test-support.js";
import {
  calloutBlock,
  listItemBlock,
  oneCellTableBlock,
  paragraphBlock,
  quoteBlock,
} from "./editor-controller-support.js";

const DENY_QUOTE: EnabledBlockTypes = { mode: "deny", types: ["quote"] };
const DENY_TABLE: EnabledBlockTypes = { mode: "deny", types: ["table"] };
const ALLOW_PARAGRAPH: EnabledBlockTypes = {
  mode: "allow",
  types: ["paragraph", "table"],
};

/** 표 옆 블록 검사용 2x1 표 variant다. 셀 content만 든 단순 표다. */
const clipTable = (text: string): ClipboardContentBlock => ({
  type: "table",
  data: {
    columnCount: 1,
    rows: [
      {
        cells: [
          {
            columnIndex: 0,
            rowSpan: 1,
            columnSpan: 1,
            content: [{ text }],
          },
        ],
      },
    ],
  },
});

/** 클립보드 quote 블록이다. children이 있으면 함께 담는다. */
const clipQuote = (
  children?: readonly ClipboardContentBlock[],
): ClipboardContentBlock =>
  clipBlock({
    type: "quote",
    content: [{ text: "q" }],
    ...(children === undefined ? {} : { children }),
  });

describe("findDisabledBlock — model Block 입력", () => {
  const isEnabled = (type: Block["type"]): boolean =>
    isBlockTypeEnabled(type, DENY_QUOTE);

  it("막은 타입이 없으면 undefined를 반환한다", () => {
    const blocks: Document["blocks"] = [
      paragraphBlock("p1", "a", [paragraphBlock("p2", "b")]),
      oneCellTableBlock("t1"),
    ];

    expect(findDisabledBlock(blocks, isEnabled)).toBeUndefined();
  });

  it("최상위에만 있는 막은 타입 블록을 그대로 반환한다", () => {
    const quote = quoteBlock("q1", "q");
    const blocks: Document["blocks"] = [paragraphBlock("p1", "a"), quote];

    expect(findDisabledBlock(blocks, isEnabled)).toBe(quote);
  });

  it("children 깊이 2 이상에만 있는 막은 타입 블록을 찾는다", () => {
    const deepQuote = quoteBlock("q1", "q");
    const blocks: Document["blocks"] = [
      paragraphBlock("p1", "a", [
        listItemBlock("l1", "bulletListItem", "b", {
          children: [paragraphBlock("p2", "c", [deepQuote])],
        }),
      ]),
    ];

    expect(findDisabledBlock(blocks, isEnabled)).toBe(deepQuote);
  });

  it("pre-order로 첫 발견 블록을 반환한다 — 부모가 자기 자식보다 먼저다", () => {
    const innerQuote = quoteBlock("q-inner", "inner");
    const outerQuote = quoteBlock("q-outer", "outer", [innerQuote]);
    const laterQuote = quoteBlock("q-later", "later");
    const blocks: Document["blocks"] = [
      paragraphBlock("p1", "a", [outerQuote]),
      laterQuote,
    ];

    expect(findDisabledBlock(blocks, isEnabled)).toBe(outerQuote);
  });

  it("앞 형제의 깊은 자식이 뒤 형제 최상위보다 먼저 발견된다", () => {
    const deepQuote = quoteBlock("q-deep", "deep");
    const topQuote = quoteBlock("q-top", "top");
    const blocks: Document["blocks"] = [
      paragraphBlock("p1", "a", [paragraphBlock("p2", "b", [deepQuote])]),
      topQuote,
    ];

    expect(findDisabledBlock(blocks, isEnabled)).toBe(deepQuote);
  });

  it("CustomBlock은 건너뛰고 알려진 타입만 판정한다", () => {
    const quote = quoteBlock("q1", "q");
    const blocks: Document["blocks"] = [
      { id: "c1", type: "quote-like-custom", content: "inline" },
      quote,
    ];

    // allow 모드면 목록에 없는 CustomBlock type은 막은 것처럼 보이지만 건너뛴다.
    expect(
      findDisabledBlock(blocks, (type) =>
        isBlockTypeEnabled(type, ALLOW_PARAGRAPH),
      ),
    ).toBe(quote);
    expect(
      findDisabledBlock(blocks.slice(0, 1), (type) =>
        isBlockTypeEnabled(type, ALLOW_PARAGRAPH),
      ),
    ).toBeUndefined();
  });

  it("callout 자식 안의 막은 타입도 찾는다", () => {
    const deepQuote = quoteBlock("q1", "q");
    const blocks: Document["blocks"] = [
      calloutBlock("co1", "c", undefined, [deepQuote]),
    ];

    expect(findDisabledBlock(blocks, isEnabled)).toBe(deepQuote);
  });

  it("표 셀 안은 훑지 않는다 — 표 자체만 판정한다", () => {
    const table = oneCellTableBlock("t1");

    expect(findDisabledBlock([table], isEnabled)).toBeUndefined();
    expect(
      findDisabledBlock([table], (type) =>
        isBlockTypeEnabled(type, DENY_TABLE),
      ),
    ).toBe(table);
  });
});

describe("findDisabledBlock — ClipboardContentBlock 입력", () => {
  const isEnabled = (type: Block["type"]): boolean =>
    isBlockTypeEnabled(type, DENY_QUOTE);

  it("반환 원소 타입이 입력 원소 타입이고 첫 발견 객체를 그대로 준다", () => {
    const quote = clipQuote();
    const blocks: readonly ClipboardContentBlock[] = [clipTable("a"), quote];

    expect(findDisabledBlock(blocks, isEnabled)).toBe(quote);
  });

  it("표 variant(data 있음, id 없음)를 최상위에서 판정한다", () => {
    const table = clipTable("a");

    expect(findDisabledBlock([table], isEnabled)).toBeUndefined();
    expect(
      findDisabledBlock([table], (type) =>
        isBlockTypeEnabled(type, DENY_TABLE),
      ),
    ).toBe(table);
  });

  it("children 안의 표와 막은 타입을 함께 훑는다", () => {
    const deepQuote = clipQuote();
    const blocks: readonly ClipboardContentBlock[] = [
      clipBullet([{ text: "li" }], {
        children: [
          clipTable("a"),
          clipParagraph([], { children: [deepQuote] }),
        ],
      }),
    ];

    expect(findDisabledBlock(blocks, isEnabled)).toBe(deepQuote);
  });

  it("pre-order로 첫 발견 블록을 반환한다", () => {
    const inner = clipQuote();
    const outer = clipQuote([inner]);
    const blocks: readonly ClipboardContentBlock[] = [
      clipTable("a"),
      outer,
      clipQuote(),
    ];

    expect(findDisabledBlock(blocks, isEnabled)).toBe(outer);
  });
});
