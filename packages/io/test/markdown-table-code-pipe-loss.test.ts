/**
 * markdown 내보내기가 표 셀 안 `code` 런의 `\|`를 손실로 보고하는지 검증한다(Issue #402).
 * - 대상: 표 셀 `code` 런 텍스트에서 `|` 바로 앞의 연속 백슬래시가 홀수 개인 경우.
 *   micromark 표 파서가 `\\`를 짝으로 읽어 `|`를 열 구분자로 본다. 표 열이 갈라진다.
 * - strict는 MARKDOWN_LOSS_NOT_ALLOWED로 거절한다.
 * - lossy는 INLINE_CODE_TABLE_PIPE 경고를 셀당 1건 내고, 해당 런의 `code` 마크만 벗긴다.
 *   다른 마크와 글자는 그대로라 표 1열 1행으로 재가져와진다.
 * - 대상이 아닌 모양: 짝수 개 백슬래시, `|` 없는 `\`, 평문 `\|`, 표 밖 `code`, 런 경계.
 *   출력은 그대로이고 strict 왕복이 같다.
 */
import type {
  Document,
  InlineContent,
  InlineContentItem,
  TextMark,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  exportMarkdown,
  importMarkdown,
  type MarkdownLoss,
} from "../src/index.js";
import { buildDocument } from "./fixtures/quote-divider-document.js";
import {
  hostDocument,
  importedRuns,
  joinedText,
  kindsOf,
  lossesOf,
  lossyMarkdown,
  markedRuns,
  run,
  strictMarkdown,
  strictRejectedLosses,
  tableCellDocument,
} from "./markdown-inline-run-support.js";

const BOLD: TextMark = { type: "bold" };
const ITALIC: TextMark = { type: "italic" };
const CODE: TextMark = { type: "code" };
const UNDERLINE: TextMark = { type: "underline" };
const RED: TextMark = { type: "textColor", color: "#FF0000" };

const KIND = "INLINE_CODE_TABLE_PIPE";

const plain = (text: string): InlineContentItem => ({ text });

/**
 * 백슬래시 n개 뒤에 `|`가 오는 글자를 만든다.
 */
const slashPipe = (count: number): string => `${"\\".repeat(count)}|`;

/**
 * lossy 내보내기의 경고 중 INLINE_CODE_TABLE_PIPE만 돌려준다.
 */
const lossyPipeWarnings = (document: Document): MarkdownLoss[] => {
  const result = exportMarkdown(document, { mode: "lossy" });
  if (!result.ok) throw new Error(`lossy 내보내기 실패: ${result.error.code}`);
  return result.value.warnings.filter((warning) => warning.kind === KIND);
};

/**
 * markdown을 재가져와 첫 표의 행 수와 열 수를 돌려준다.
 */
const importedShape = (markdown: string): [number, number] => {
  const result = importMarkdown(markdown);
  if (!result.ok) throw new Error(`재가져오기 실패: ${result.error.code}`);
  const block = result.value.document.blocks[0];
  if (block === undefined || !("rows" in block)) {
    throw new Error("재가져온 첫 블록이 표가 아니다");
  }
  return [block.rows.length, block.columns.length];
};

/**
 * 열 2개·행 1개 표를 만든다. 두 셀에 각각 content를 둔다(cellId "c1", "c2").
 */
const twoCellDocument = (
  first: InlineContent,
  second: InlineContent,
): Document =>
  buildDocument([
    {
      id: "host",
      type: "table",
      columns: [
        { id: "col1", width: 160 },
        { id: "col2", width: 160 },
      ],
      rows: [
        {
          id: "row",
          cells: [
            {
              id: "c1",
              columnId: "col1",
              rowSpan: 1,
              columnSpan: 1,
              content: first,
            },
            {
              id: "c2",
              columnId: "col2",
              rowSpan: 1,
              columnSpan: 1,
              content: second,
            },
          ],
        },
      ],
      headerRows: 1,
      headerColumns: 0,
    },
  ]);

const POSITIVE: ReadonlyArray<readonly [string, string]> = [
  ["홀수 1개 중간", "x\\|y"],
  ["홀수 1개 단독", "\\|"],
  ["홀수 3개", `x${slashPipe(3)}y`],
  ["홀수 3개 단독", slashPipe(3)],
  ["홀수 5개", `x${slashPipe(5)}y`],
  ["홀수 5개 단독", slashPipe(5)],
  // 한 런에 파이프가 둘 이상이면 어느 쪽이 홀수여도 대상이다. 첫 매치만 보면 놓친다.
  ["짝수 뒤에 홀수", "\\\\|x\\|"],
  ["홀수 뒤에 짝수", "\\|x\\\\|"],
];

describe("표 셀 code 런의 홀수 개 백슬래시 뒤 파이프는 strict가 거절한다", () => {
  it.each(POSITIVE)("%s", (_label, text) => {
    expect(
      strictRejectedLosses(tableCellDocument([run(text, [CODE])])),
    ).toEqual([
      {
        kind: KIND,
        blockId: "host",
        rowId: "row",
        cellId: "cell",
        message: expect.stringContaining("cell"),
      },
    ]);
  });
});

describe("표 셀 code 런의 홀수 개 백슬래시 뒤 파이프는 lossy가 경고하고 code만 벗긴다", () => {
  it.each(POSITIVE)("%s: 경고가 한 건이다", (_label, text) => {
    expect(lossyPipeWarnings(tableCellDocument([run(text, [CODE])]))).toEqual([
      {
        kind: KIND,
        blockId: "host",
        rowId: "row",
        cellId: "cell",
        message: expect.stringContaining("cell"),
      },
    ]);
  });

  it.each(POSITIVE)(
    "%s: 표 1행 1열로 재가져오고 글자는 같고 code는 없다",
    (_label, text) => {
      const markdown = lossyMarkdown(tableCellDocument([run(text, [CODE])]));

      expect(importedShape(markdown)).toEqual([1, 1]);
      const runs = importedRuns(markdown);
      expect(joinedText(runs)).toBe(text);
      expect(markedRuns(runs)).toEqual([]);
    },
  );
});

describe("code와 다른 mark가 함께 달린 런은 code만 벗는다", () => {
  // mark 배열은 정규 순서(bold, code, italic)로 둔다. 어긋나면 문서 검증이 거절한다.
  const COMBINED = [
    ["bold", [BOLD, CODE]],
    ["italic", [CODE, ITALIC]],
  ] as const;

  it.each(COMBINED)("%s+code는 strict가 거절한다", (_label, marks) => {
    expect(
      strictRejectedLosses(tableCellDocument([run("\\|", [...marks])])),
    ).toEqual([
      {
        kind: KIND,
        blockId: "host",
        rowId: "row",
        cellId: "cell",
        message: expect.stringContaining("cell"),
      },
    ]);
  });

  it.each(COMBINED)(
    "%s+code는 lossy에서 code만 벗고 열이 갈라지지 않는다",
    (label, marks) => {
      const markdown = lossyMarkdown(
        tableCellDocument([run("\\|", [...marks])]),
      );

      expect(importedShape(markdown)).toEqual([1, 1]);
      const runs = importedRuns(markdown);
      expect(joinedText(runs)).toBe("\\|");
      expect(markedRuns(runs)).toEqual([["\\|", [label]]]);
    },
  );
});

describe("보고는 셀당 1건이다", () => {
  it("한 셀에 대상 런이 둘이어도 1건이다", () => {
    const document = tableCellDocument([
      run("a\\|", [CODE]),
      plain(" "),
      run("b\\|", [CODE]),
    ]);

    expect(lossyPipeWarnings(document)).toHaveLength(1);
    expect(strictRejectedLosses(document)).toHaveLength(1);
  });

  it("한 표에 대상 셀이 둘이면 2건이고 셀 위치가 다르다", () => {
    const document = twoCellDocument(
      [run("a\\|", [CODE])],
      [run("b\\|", [CODE])],
    );

    expect(
      lossyPipeWarnings(document).map((loss) => [loss.rowId, loss.cellId]),
    ).toEqual([
      ["row", "c1"],
      ["row", "c2"],
    ]);
  });

  it("대상 셀 옆의 대상 아닌 셀은 보고하지 않는다", () => {
    const document = twoCellDocument([run("a\\|", [CODE])], [run("b", [CODE])]);

    expect(lossyPipeWarnings(document).map((loss) => loss.cellId)).toEqual([
      "c1",
    ]);
  });

  it("lossy 출력은 두 셀 모두 열이 갈라지지 않는다", () => {
    const markdown = lossyMarkdown(
      twoCellDocument([run("a\\|", [CODE])], [run("b\\|", [CODE])]),
    );

    expect(importedShape(markdown)).toEqual([1, 2]);
  });
});

describe("code 마크를 벗긴 런은 이웃 평문 런과 합쳐진다", () => {
  it("앞뒤 평문 사이의 대상 런은 재가져오면 평문 런 하나다", () => {
    const markdown = lossyMarkdown(
      tableCellDocument([plain("a"), run("x\\|y", [CODE]), plain("b")]),
    );

    expect(importedRuns(markdown)).toEqual([{ text: "ax\\|yb" }]);
  });

  it("대상이 아닌 이웃 code 런은 code를 유지한다", () => {
    const markdown = lossyMarkdown(
      tableCellDocument([
        plain("a"),
        run("x\\|y", [CODE]),
        plain(" "),
        run("z", [CODE]),
      ]),
    );

    expect(importedShape(markdown)).toEqual([1, 1]);
    expect(markedRuns(importedRuns(markdown))).toEqual([["z", ["code"]]]);
  });
});

describe("대상이 아닌 모양은 손실 없이 왕복한다", () => {
  const NON_TARGETS: ReadonlyArray<readonly [string, InlineContent]> = [
    ["짝수 0개", [run("a|b", [CODE])]],
    ["짝수 2개", [run(`a${slashPipe(2)}b`, [CODE])]],
    ["짝수 4개", [run(`a${slashPipe(4)}b`, [CODE])]],
    ["백슬래시 뒤에 파이프가 없는 끝", [run("a\\", [CODE])]],
    ["백슬래시 뒤에 파이프가 없는 중간", [run("a\\b", [CODE])]],
    ["평문 홀수 1개", [plain("a\\|b")]],
    ["평문 홀수 3개", [plain(`a${slashPipe(3)}b`)]],
    [
      "code 런이 백슬래시로 끝나고 다음 평문 런이 파이프로 시작",
      [run("a\\", [CODE]), plain("|b")],
    ],
  ];

  it.each(NON_TARGETS)("%s: 손실이 없다", (_label, content) => {
    expect(kindsOf(tableCellDocument(content))).not.toContain(KIND);
  });

  it.each(NON_TARGETS)("%s: strict 왕복이 같다", (_label, content) => {
    const document = tableCellDocument(content);
    const markdown = strictMarkdown(document);

    expect(importedShape(markdown)).toEqual([1, 1]);
    expect(importedRuns(markdown)).toEqual(content);
  });

  it.each(NON_TARGETS)("%s: lossy 출력이 strict와 같다", (_label, content) => {
    const document = tableCellDocument(content);

    expect(lossyMarkdown(document)).toBe(strictMarkdown(document));
  });

  it.each(["paragraph", "heading", "bulletListItem", "quote"] as const)(
    "표 밖 %s의 code `\\|`는 대상이 아니다",
    (host) => {
      const document = hostDocument(host, [run("x\\|y", [CODE])]);

      expect(kindsOf(document)).not.toContain(KIND);
      expect(importedRuns(strictMarkdown(document))).toEqual([
        run("x\\|y", [CODE]),
      ]);
    },
  );
});

describe("인접한 code 런은 내보낼 때 합쳐지므로 합친 값으로 판정한다", () => {
  // 모델 불변식은 인접 동일 mark 런을 금하지만 parseDocument는 통과시킨다.
  // underline·색은 내보낼 때 mark가 버려져 갈라진 code 런이 inlineCode 하나로 합쳐진다.
  const SPLIT: ReadonlyArray<readonly [string, InlineContent, string]> = [
    [
      "underline으로 갈라진 런",
      [run("\\", [CODE, UNDERLINE]), run("|", [CODE])],
      "UNDERLINE",
    ],
    [
      "색으로 갈라진 런",
      [run("\\", [CODE, RED]), run("|", [CODE])],
      "INLINE_COLOR",
    ],
    ["빈 런이 낀 런", [run("\\", [CODE]), plain(""), run("|", [CODE])], ""],
    ["인접 동일 mark 런", [run("\\", [CODE]), run("|", [CODE])], ""],
  ];

  it.each(SPLIT)(
    "%s: 합친 값이 대상이라 보고한다",
    (_label, content, other) => {
      const kinds = kindsOf(tableCellDocument(content));

      expect(kinds).toContain(KIND);
      expect(kinds.filter((kind) => kind === KIND)).toHaveLength(1);
      expect(kinds.filter((kind) => kind !== KIND)).toEqual(
        other === "" ? [] : [other],
      );
    },
  );

  it.each(SPLIT)("%s: strict가 거절한다", (_label, content) => {
    const losses = strictRejectedLosses(tableCellDocument(content));

    expect(losses?.map((loss) => loss.kind)).toContain(KIND);
  });

  it.each(SPLIT)(
    "%s: lossy가 경고하고 표 1행 1열로 재가져온다",
    (_label, content) => {
      const document = tableCellDocument(content);
      const markdown = lossyMarkdown(document);

      expect(lossyPipeWarnings(document)).toHaveLength(1);
      expect(importedShape(markdown)).toEqual([1, 1]);
      expect(joinedText(importedRuns(markdown))).toBe("\\|");
      expect(markedRuns(importedRuns(markdown))).toEqual([]);
    },
  );

  it("합쳐도 짝수 개이면 대상이 아니다", () => {
    const document = tableCellDocument([run("\\", [CODE]), run("\\|", [CODE])]);
    const markdown = strictMarkdown(document);

    expect(kindsOf(document)).not.toContain(KIND);
    expect(lossyMarkdown(document)).toBe(markdown);
    expect(importedShape(markdown)).toEqual([1, 1]);
    expect(importedRuns(markdown)).toEqual([run("\\\\|", [CODE])]);
  });

  it("bold로 감싼 인접 code 런은 합쳐지므로 대상이다", () => {
    const document = tableCellDocument([
      run("\\", [BOLD, CODE]),
      run("|", [BOLD, CODE]),
    ]);
    const markdown = lossyMarkdown(document);

    expect(strictRejectedLosses(document)?.map((loss) => loss.kind)).toEqual([
      KIND,
    ]);
    expect(importedShape(markdown)).toEqual([1, 1]);
    expect(markedRuns(importedRuns(markdown))).toEqual([["\\|", ["bold"]]]);
  });

  // 감싸는 mark가 달라 합쳐지지 않는다. 코드 스팬이 각자 닫혀 왕복이 같다(실측).
  it.each([
    [
      "bold+code `\\` 다음 code `|`",
      [run("\\", [BOLD, CODE]), run("|", [CODE])],
    ],
    [
      "code `\\` 다음 bold+code `|`",
      [run("\\", [CODE]), run("|", [BOLD, CODE])],
    ],
  ] as const)("%s는 대상이 아니고 strict 왕복이 같다", (_label, content) => {
    const document = tableCellDocument([...content]);
    const markdown = strictMarkdown(document);

    expect(kindsOf(document)).not.toContain(KIND);
    expect(lossyMarkdown(document)).toBe(markdown);
    expect(importedShape(markdown)).toEqual([1, 1]);
    expect(importedRuns(markdown)).toEqual(content);
  });
});

describe("이미 있던 손실과 공존한다", () => {
  it("INLINE_CODE_NEWLINE과 각자 따로 보고한다", () => {
    const document = tableCellDocument([
      run("a\\|", [CODE]),
      run("b\nc", [CODE]),
    ]);

    expect(kindsOf(document).sort()).toEqual(
      ["INLINE_CODE_NEWLINE", KIND].sort(),
    );
  });

  it("EMPTY_MARKED_RUN과 각자 따로 보고한다", () => {
    const document = tableCellDocument([run("a\\|", [CODE]), run("", [BOLD])]);

    expect(kindsOf(document).sort()).toEqual(["EMPTY_MARKED_RUN", KIND].sort());
  });
});

describe("analyzeMarkdownLoss를 직접 불러도 같은 보고를 낸다", () => {
  it.each(POSITIVE)("%s", (_label, text) => {
    expect(lossesOf(tableCellDocument([run(text, [CODE])]))).toEqual([
      {
        kind: KIND,
        blockId: "host",
        rowId: "row",
        cellId: "cell",
        message: expect.stringContaining("cell"),
      },
    ]);
  });

  it("bold+code도 같다", () => {
    expect(kindsOf(tableCellDocument([run("\\|", [BOLD, CODE])]))).toEqual([
      KIND,
    ]);
  });

  it("두 셀이면 2건이다", () => {
    expect(
      lossesOf(
        twoCellDocument([run("a\\|", [CODE])], [run("b\\|", [CODE])]),
      ).map((loss) => loss.cellId),
    ).toEqual(["c1", "c2"]);
  });
});
