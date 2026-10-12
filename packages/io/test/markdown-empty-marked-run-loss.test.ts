/**
 * mark 달린 빈 글자 런의 GFM 손실 보고를 검증한다(Issue #393).
 * bold·italic·strike·code mark가 붙은 빈 글자 런(`{ text: "", marks }`)은
 * 마커만(`****` 등) 나가 재가져오기 때 divider·codeBlock·글자로 구조가 바뀔 수 있다.
 * 그래서 strict는 MARKDOWN_LOSS_NOT_ALLOWED로 거절하고 lossy는
 * EMPTY_MARKED_RUN 경고를 낸다.
 * 대상은 블록 content와 표 셀 content 모두이고, 런이 content 중간에 끼어도 본다.
 * 보고는 블록당 1건, 표는 셀당 1건이다.
 * link 단독 빈 런과 mark 없는 빈 런은 대상이 아니다.
 * underline·textColor 빈 런은 기존 kind만 낸다.
 * lossy 출력은 바뀌지 않고 경고만 더해진다.
 */
import type {
  Block,
  Document,
  InlineContent,
  InlineContentItem,
  TextMark,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  analyzeMarkdownLoss,
  exportMarkdown,
  type MarkdownLoss,
} from "../src/index.js";
import {
  buildDocument,
  calloutBlock,
  headingBlock,
  paragraphBlock,
  quoteBlock,
} from "./fixtures/quote-divider-document.js";

const LINK: TextMark = { type: "link", href: "https://e.com" };
const BOLD: TextMark = { type: "bold" };
const ITALIC: TextMark = { type: "italic" };
const STRIKE: TextMark = { type: "strike" };
const CODE: TextMark = { type: "code" };

type Host =
  | "paragraph"
  | "heading"
  | "bulletListItem"
  | "checkListItem"
  | "quote"
  | "callout"
  | "tableCell";

const HOSTS: readonly Host[] = [
  "paragraph",
  "heading",
  "bulletListItem",
  "checkListItem",
  "quote",
  "callout",
  "tableCell",
];

/**
 * mark 목록을 가진 빈 글자 런 하나를 만든다. marks를 주지 않으면 mark 필드를 생략한다.
 */
const emptyRun = (marks?: TextMark[]): InlineContentItem =>
  marks === undefined ? { text: "" } : { text: "", marks };

/**
 * 호스트 종류에 content를 얹은 문서를 만든다. 호스트 블록 id는 항상 "host"다.
 * 표 셀은 열 1개·행 1개 표의 유일한 셀에 content를 둔다(rowId "row", cellId "cell").
 */
const hostDocument = (host: Host, content: InlineContent): Document => {
  const block: Block = (() => {
    switch (host) {
      case "paragraph":
        return { ...paragraphBlock("host", ""), content };
      case "heading":
        return { ...headingBlock("host", 1, ""), content };
      case "bulletListItem":
        return { id: "host", type: "bulletListItem", content };
      case "checkListItem":
        return { id: "host", type: "checkListItem", checked: false, content };
      case "quote":
        return { ...quoteBlock("host", ""), content };
      case "callout":
        return { ...calloutBlock("host", ""), content };
      case "tableCell":
        return {
          id: "host",
          type: "table",
          columns: [{ id: "col", width: 160 }],
          rows: [
            {
              id: "row",
              cells: [
                {
                  id: "cell",
                  columnId: "col",
                  rowSpan: 1,
                  columnSpan: 1,
                  content,
                },
              ],
            },
          ],
          headerRows: 1,
          headerColumns: 0,
        };
    }
  })();
  return buildDocument([block]);
};

/**
 * 호스트 종류에 맞는 손실 위치 필드를 돌려준다. 표 셀이면 rowId·cellId가 붙는다.
 */
const locationOf = (
  host: Host,
): { blockId: string; rowId?: string; cellId?: string } =>
  host === "tableCell"
    ? { blockId: "host", rowId: "row", cellId: "cell" }
    : { blockId: "host" };

/**
 * callout은 content와 무관하게 항상 CALLOUT_STATE_LOST를 낸다.
 * 이 파일은 빈 마커 런이 만드는 손실만 보므로 그 kind는 걸러 낸다.
 */
const withoutCalloutLoss = (losses: readonly MarkdownLoss[]): MarkdownLoss[] =>
  losses.filter((loss) => loss.kind !== "CALLOUT_STATE_LOST");

/**
 * 경고 메시지가 담아야 하는 id를 돌려준다. 블록은 블록 id, 표 셀은 셀 id다.
 */
const messageIdOf = (host: Host): string =>
  host === "tableCell" ? "cell" : "host";

/**
 * 문서의 손실 중 callout 고유 손실을 뺀 것만 돌려준다.
 */
const lossesOf = (document: Document): MarkdownLoss[] =>
  withoutCalloutLoss(analyzeMarkdownLoss(document));

/**
 * 문서의 손실 kind 목록만 뽑는다(callout 고유 손실 제외).
 */
const kindsOf = (document: Document): string[] =>
  lossesOf(document).map((loss) => loss.kind);

/**
 * strict 내보내기를 실행해 거절 결과의 손실 목록(callout 고유 손실 제외)을 돌려준다.
 * 성공하면 null이다.
 */
const strictRejectedLosses = (document: Document): MarkdownLoss[] | null => {
  const result = exportMarkdown(document, { mode: "strict" });
  if (result.ok) return null;
  expect(result.error.code).toBe("MARKDOWN_LOSS_NOT_ALLOWED");
  return "losses" in result.error
    ? withoutCalloutLoss(result.error.losses)
    : [];
};

/**
 * lossy 내보내기를 실행해 markdown 문자열만 돌려준다. 실패하면 결과 전체를 돌려준다.
 */
const lossyMarkdown = (document: Document): unknown => {
  const result = exportMarkdown(document, { mode: "lossy" });
  return result.ok ? result.value.markdown : result;
};

const MARK_CASES: ReadonlyArray<readonly [string, TextMark[]]> = [
  ["bold", [BOLD]],
  ["italic", [ITALIC]],
  ["strike", [STRIKE]],
  ["code", [CODE]],
  ["bold+italic", [BOLD, ITALIC]],
  ["link+bold", [LINK, BOLD]],
];

const HOST_MARK_CASES = HOSTS.flatMap((host) =>
  MARK_CASES.map(([label, marks]) => [host, label, marks] as const),
);

describe("mark 달린 빈 글자 런의 EMPTY_MARKED_RUN", () => {
  it.each(HOST_MARK_CASES)(
    "%s의 %s 빈 런은 strict 내보내기를 EMPTY_MARKED_RUN으로 거절한다",
    (host, _label, marks) => {
      const document = hostDocument(host, [emptyRun(marks)]);

      expect(strictRejectedLosses(document)).toEqual([
        {
          kind: "EMPTY_MARKED_RUN",
          ...locationOf(host),
          message: expect.stringContaining(messageIdOf(host)),
        },
      ]);
    },
  );

  it.each(HOST_MARK_CASES)(
    "%s의 %s 빈 런은 lossy 내보내기가 같은 경고를 낸다",
    (host, _label, marks) => {
      const document = hostDocument(host, [emptyRun(marks)]);

      const result = exportMarkdown(document, { mode: "lossy" });

      expect(result.ok).toBe(true);
      expect(
        result.ok &&
          result.value.warnings.filter(
            (warning) => warning.kind === "EMPTY_MARKED_RUN",
          ),
      ).toEqual([
        {
          kind: "EMPTY_MARKED_RUN",
          ...locationOf(host),
          message: expect.stringContaining(messageIdOf(host)),
        },
      ]);
    },
  );

  it.each(HOSTS)(
    "%s에서 글자 사이에 낀 bold 빈 런도 EMPTY_MARKED_RUN이다",
    (host) => {
      const document = hostDocument(host, [
        { text: "a" },
        emptyRun([BOLD]),
        { text: "b" },
      ]);

      expect(kindsOf(document)).toEqual(["EMPTY_MARKED_RUN"]);
      expect(strictRejectedLosses(document)).toHaveLength(1);
    },
  );

  it.each(HOSTS)("%s에 빈 마커 런이 여럿이어도 경고는 한 건이다", (host) => {
    const document = hostDocument(host, [
      emptyRun([BOLD]),
      { text: "a" },
      emptyRun([ITALIC]),
      emptyRun([CODE]),
    ]);

    expect(lossesOf(document)).toEqual([
      {
        kind: "EMPTY_MARKED_RUN",
        ...locationOf(host),
        message: expect.stringContaining(messageIdOf(host)),
      },
    ]);
  });

  it("중첩 자식 블록의 빈 마커 런은 그 자식 id로 보고한다", () => {
    const document = buildDocument([
      {
        id: "outer",
        type: "bulletListItem",
        content: [{ text: "바깥" }],
        children: [
          {
            id: "inner",
            type: "bulletListItem",
            content: [emptyRun([BOLD])],
          },
        ],
      },
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([
      {
        kind: "EMPTY_MARKED_RUN",
        blockId: "inner",
        message: expect.stringContaining("inner"),
      },
    ]);
  });

  it("표의 셀 두 곳에 빈 마커 런이 있으면 셀마다 한 건씩 보고한다", () => {
    const cell = (id: string, content: InlineContent) => ({
      id,
      columnId: "col",
      rowSpan: 1 as const,
      columnSpan: 1 as const,
      content,
    });
    const document = buildDocument([
      {
        id: "host",
        type: "table",
        columns: [{ id: "col", width: 160 }],
        rows: [
          { id: "row-1", cells: [cell("cell-1", [emptyRun([BOLD])])] },
          { id: "row-2", cells: [cell("cell-2", [emptyRun([STRIKE])])] },
        ],
        headerRows: 1,
        headerColumns: 0,
      },
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([
      {
        kind: "EMPTY_MARKED_RUN",
        blockId: "host",
        rowId: "row-1",
        cellId: "cell-1",
        message: expect.stringContaining("cell-1"),
      },
      {
        kind: "EMPTY_MARKED_RUN",
        blockId: "host",
        rowId: "row-2",
        cellId: "cell-2",
        message: expect.stringContaining("cell-2"),
      },
    ]);
  });

  it("같은 mark 런이 빈 런을 양쪽에서 감싸도 보수적으로 보고한다", () => {
    // 이 입력은 `******a******`로 나가 재가져오기 결과가 빈 런을 뺀 입력과 같다.
    // 그래도 판정은 런 단위라 거절한다. 구조가 같아지는 경우를 가려내지 않는다.
    const document = hostDocument("paragraph", [
      emptyRun([BOLD]),
      { text: "a", marks: [BOLD] },
      emptyRun([BOLD]),
    ]);

    expect(kindsOf(document)).toEqual(["EMPTY_MARKED_RUN"]);
  });
});

describe("EMPTY_MARKED_RUN 대상이 아닌 빈 글자 런", () => {
  it.each(HOSTS)(
    "%s의 link 단독 빈 런은 경고 없이 strict가 성공한다",
    (host) => {
      const document = hostDocument(host, [emptyRun([LINK])]);

      expect(kindsOf(document)).toEqual([]);
      expect(strictRejectedLosses(document)).toEqual(
        host === "callout" ? [] : null,
      );
    },
  );

  it.each(HOSTS)(
    "%s의 mark 없는 빈 런은 EMPTY_MARKED_RUN을 내지 않는다",
    (host) => {
      const document = hostDocument(host, [
        { text: "a" },
        emptyRun(),
        { text: "b" },
      ]);

      expect(kindsOf(document)).toEqual([]);
      expect(strictRejectedLosses(document)).toEqual(
        host === "callout" ? [] : null,
      );
    },
  );

  it.each(HOSTS)(
    "%s의 빈 marks 배열 빈 런은 EMPTY_MARKED_RUN을 내지 않는다",
    (host) => {
      const document = hostDocument(host, [
        { text: "a" },
        emptyRun([]),
        { text: "b" },
      ]);

      expect(kindsOf(document)).not.toContain("EMPTY_MARKED_RUN");
    },
  );

  it.each(HOSTS)(
    "%s에서 글자가 있는 bold 런은 EMPTY_MARKED_RUN을 내지 않는다",
    (host) => {
      const document = hostDocument(host, [{ text: "굵게", marks: [BOLD] }]);

      expect(kindsOf(document)).toEqual([]);
    },
  );

  it.each(HOSTS)("%s의 underline 빈 런은 UNDERLINE만 낸다", (host) => {
    const document = hostDocument(host, [emptyRun([{ type: "underline" }])]);

    expect(kindsOf(document)).toEqual(["UNDERLINE"]);
  });

  it.each(HOSTS)("%s의 textColor 빈 런은 INLINE_COLOR만 낸다", (host) => {
    const document = hostDocument(host, [
      emptyRun([{ type: "textColor", color: "#FF0000" }]),
    ]);

    expect(kindsOf(document)).toEqual(["INLINE_COLOR"]);
  });

  it.each(HOSTS)("%s의 backgroundColor 빈 런은 INLINE_COLOR만 낸다", (host) => {
    const document = hostDocument(host, [
      emptyRun([{ type: "backgroundColor", color: "#00FF00" }]),
    ]);

    expect(kindsOf(document)).toEqual(["INLINE_COLOR"]);
  });
});

describe("EMPTY_MARKED_RUN 보고 순서", () => {
  it("블록은 INLINE_CODE_NEWLINE 바로 뒤, INLINE_COLOR 앞에 보고한다", () => {
    const document = hostDocument("paragraph", [
      { text: "a\nb", marks: [CODE] },
      emptyRun([BOLD]),
      { text: "c", marks: [{ type: "textColor", color: "#FF0000" }] },
    ]);

    expect(kindsOf(document)).toEqual([
      "INLINE_CODE_NEWLINE",
      "EMPTY_MARKED_RUN",
      "INLINE_COLOR",
    ]);
  });

  it("표 셀은 INLINE_CODE_NEWLINE과 INLINE_COLOR 사이에 보고한다", () => {
    const document = hostDocument("tableCell", [
      { text: "a\nb", marks: [CODE] },
      emptyRun([BOLD]),
      { text: "c", marks: [{ type: "textColor", color: "#FF0000" }] },
    ]);

    expect(kindsOf(document)).toEqual([
      "INLINE_CODE_NEWLINE",
      "EMPTY_MARKED_RUN",
      "INLINE_COLOR",
    ]);
  });
});

describe("EMPTY_MARKED_RUN 메시지", () => {
  const messageOf = (document: Document): string =>
    analyzeMarkdownLoss(document)[0]?.message ?? "";

  it("블록 메시지는 블록 id를 쓴다", () => {
    const document = hostDocument("paragraph", [emptyRun([BOLD])]);

    expect(messageOf(document)).toContain("Block host");
  });

  it("셀 메시지는 셀 id를 쓴다", () => {
    const document = hostDocument("tableCell", [emptyRun([BOLD])]);

    expect(messageOf(document)).toContain("Cell cell");
  });
});

describe("EMPTY_MARKED_RUN이어도 lossy 출력은 바뀌지 않는다", () => {
  it.each([
    ["bold", [BOLD], "****\n"],
    ["italic", [ITALIC], "**\n"],
    ["strike", [STRIKE], "~~~~\n"],
    ["code", [CODE], "``\n"],
  ] as const)(
    "paragraph의 %s 빈 런은 %j 그대로 나간다",
    (_label, marks, markdown) => {
      const document = hostDocument("paragraph", [emptyRun([...marks])]);

      expect(lossyMarkdown(document)).toBe(markdown);
    },
  );

  it("paragraph의 글자 사이 bold 빈 런은 a****b로 나간다", () => {
    const document = hostDocument("paragraph", [
      { text: "a" },
      emptyRun([BOLD]),
      { text: "b" },
    ]);

    expect(lossyMarkdown(document)).toBe("a****b\n");
  });

  it("표 셀의 글자 사이 bold 빈 런은 a****b로 나간다", () => {
    const document = hostDocument("tableCell", [
      { text: "a" },
      emptyRun([BOLD]),
      { text: "b" },
    ]);

    expect(lossyMarkdown(document)).toBe("| a****b |\n| ------ |\n");
  });

  it.each([
    ["paragraph", "****\n"],
    ["heading", "# ****\n"],
    ["bulletListItem", "* ****\n"],
    ["checkListItem", "* [ ] ****\n"],
    ["quote", "> ****\n"],
    ["callout", "****\n"],
    ["tableCell", "| **** |\n| ---- |\n"],
  ] as const)("%s의 bold 빈 런 lossy 출력은 %j다", (host, markdown) => {
    const document = hostDocument(host, [emptyRun([BOLD])]);

    expect(lossyMarkdown(document)).toBe(markdown);
  });
});
