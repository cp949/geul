/**
 * markdown 내보내기가 보존하지 못하는 hardBreak(`\n`)의 GFM 손실 보고를 검증한다(Issue #401).
 * 대상 모양은 셋이다.
 * - 블록 끝: 마지막 글자 런 끝의 `\n`. `a\`로 나가 재가져오기에서 개행이 사라진다.
 * - mark 런 끝: bold·italic·strike 런 끝의 `\n`. `**a\&#xA;**`로 나가 글자가 `&#xA;`로 바뀐다.
 * - 제목 3–6의 안쪽 `\n`: ATX 제목이 개행을 담지 못해 공백 한 칸이 된다.
 * strict는 MARKDOWN_LOSS_NOT_ALLOWED로 거절하고 lossy는 HARD_BREAK_LOST 경고를 낸다.
 * lossy 출력은 끝 개행을 지우거나(블록 끝) mark 밖으로 뺀다(mark 런 끝).
 * 보고는 블록당 1건이다. 표 셀·중간 개행·시작 개행·link 단독 런·제목 1·2는 대상이 아니다.
 * `code` 런의 개행은 INLINE_CODE_NEWLINE이 이미 보고하므로 이 kind의 대상에서 뺀다.
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
  importMarkdown,
  type MarkdownLoss,
} from "../src/index.js";
import {
  hardBreakLossShape,
  normalizeHardBreakEdges,
} from "../src/markdown/hard-break-edges.js";
import { buildDocument } from "./fixtures/quote-divider-document.js";
import {
  type Host,
  hostDocument,
  importedRuns,
  kindsOf,
  lossesOf,
  lossyMarkdown,
  run,
  strictRejectedLosses,
} from "./markdown-inline-run-support.js";

const LINK: TextMark = { type: "link", href: "https://e.com" };
const BOLD: TextMark = { type: "bold" };
const ITALIC: TextMark = { type: "italic" };
const STRIKE: TextMark = { type: "strike" };
const CODE: TextMark = { type: "code" };
const UNDERLINE: TextMark = { type: "underline" };

const TEXT_HOSTS: readonly Host[] = [
  "paragraph",
  "heading",
  "bulletListItem",
  "checkListItem",
  "quote",
  "callout",
];

const HOSTS: readonly Host[] = [...TEXT_HOSTS, "tableCell"];

/**
 * lossy 내보내기의 경고 중 HARD_BREAK_LOST만 돌려준다.
 */
const lossyHardBreakWarnings = (document: Document): MarkdownLoss[] => {
  const result = exportMarkdown(document, { mode: "lossy" });
  if (!result.ok) throw new Error(`lossy 내보내기 실패: ${result.error.code}`);
  return result.value.warnings.filter(
    (warning) => warning.kind === "HARD_BREAK_LOST",
  );
};

/**
 * 재가져온 content의 글자를 이어 붙인다. 글자 런 경계는 보지 않는다.
 */
const joinedText = (runs: unknown): string =>
  (runs as InlineContent)
    .map((item) => ("text" in item ? item.text : ""))
    .join("");

/**
 * 재가져온 content에서 mark가 달린 런의 글자와 mark 종류만 뽑는다.
 */
const markedRuns = (runs: unknown): Array<[string, string[]]> =>
  (runs as InlineContent).flatMap((item): Array<[string, string[]]> =>
    "text" in item && (item.marks ?? []).length > 0
      ? [[item.text, (item.marks ?? []).map((mark) => mark.type)]]
      : [],
  );

const plain = (text: string): InlineContentItem => ({ text });

describe("블록 끝 hardBreak는 손실로 보고한다", () => {
  it.each(TEXT_HOSTS)(
    "%s의 끝 개행은 strict 내보내기를 HARD_BREAK_LOST로 거절한다",
    (host) => {
      const document = hostDocument(host, [plain("a\n")]);

      expect(strictRejectedLosses(document)).toEqual([
        {
          kind: "HARD_BREAK_LOST",
          blockId: "host",
          message: expect.stringContaining("host"),
        },
      ]);
    },
  );

  it.each(TEXT_HOSTS)(
    "%s의 끝 개행은 lossy 내보내기가 같은 경고를 한 건 낸다",
    (host) => {
      expect(
        lossyHardBreakWarnings(hostDocument(host, [plain("a\n")])),
      ).toEqual([
        {
          kind: "HARD_BREAK_LOST",
          blockId: "host",
          message: expect.stringContaining("host"),
        },
      ]);
    },
  );

  it.each(TEXT_HOSTS)(
    "%s의 끝 개행은 lossy 출력에서 지워지고 재가져오면 글자가 a다",
    (host) => {
      const markdown = lossyMarkdown(hostDocument(host, [plain("a\n")]));

      expect(markdown.trimEnd().endsWith("a")).toBe(true);
      expect(markdown).not.toContain("\\");
      expect(importedRuns(markdown)).toEqual([{ text: "a" }]);
    },
  );

  it("analyzeMarkdownLoss를 직접 불러도 같은 손실을 낸다", () => {
    expect(lossesOf(hostDocument("paragraph", [plain("a\n")]))).toEqual([
      {
        kind: "HARD_BREAK_LOST",
        blockId: "host",
        message: expect.stringContaining("host"),
      },
    ]);
  });
});

describe("끝 연속 개행은 전부 지우고 한 건만 보고한다", () => {
  const SHAPES: ReadonlyArray<readonly [string, InlineContent, string]> = [
    ["한 런의 끝 개행 둘", [plain("a\n\n")], "a"],
    ["글자 런 뒤 개행만 있는 런", [plain("a\n"), plain("\n")], "a"],
    ["bold가 달린 마지막 런", [run("a\n", [BOLD])], "a"],
    ["개행만 있는 한 런", [plain("\n")], ""],
  ];

  it.each(SHAPES)("%s는 strict가 거절한다", (_label, content) => {
    expect(strictRejectedLosses(hostDocument("paragraph", content))).toEqual([
      {
        kind: "HARD_BREAK_LOST",
        blockId: "host",
        message: expect.stringContaining("host"),
      },
    ]);
  });

  it.each(SHAPES)("%s는 lossy 경고가 한 건이다", (_label, content) => {
    expect(
      lossyHardBreakWarnings(hostDocument("paragraph", content)),
    ).toHaveLength(1);
  });

  it.each(SHAPES)(
    "%s는 lossy 출력에서 끝 개행이 모두 지워진다",
    (_label, content, text) => {
      const markdown = lossyMarkdown(hostDocument("paragraph", content));

      expect(markdown).not.toContain("\\");
      expect(markdown).not.toContain("&#xA;");
      expect(markdown.trim()).toBe(
        content.some((item) => "marks" in item) && text !== ""
          ? `**${text}**`
          : text,
      );
    },
  );

  it("bold가 달린 마지막 런은 재가져오면 개행 없는 bold a다", () => {
    const markdown = lossyMarkdown(
      hostDocument("paragraph", [run("a\n", [BOLD])]),
    );

    expect(importedRuns(markdown)).toEqual([{ text: "a", marks: [BOLD] }]);
  });

  it.each(TEXT_HOSTS)("%s에서도 개행만 있는 런은 한 건이다", (host) => {
    // 정리하면 빈 content가 되는 checkListItem은 CHECKED_STATE_LOST를 함께 낸다.
    expect(
      kindsOf(hostDocument(host, [plain("\n")])).filter(
        (kind) => kind === "HARD_BREAK_LOST",
      ),
    ).toHaveLength(1);
  });
});

describe("mark 런 끝 hardBreak는 손실로 보고하고 개행을 mark 밖으로 뺀다", () => {
  const MARK_CASES: ReadonlyArray<readonly [string, TextMark[]]> = [
    ["bold", [BOLD]],
    ["italic", [ITALIC]],
    ["strike", [STRIKE]],
  ];
  const HOST_MARK_CASES = TEXT_HOSTS.flatMap((host) =>
    MARK_CASES.map(([label, marks]) => [host, label, marks] as const),
  );

  it.each(HOST_MARK_CASES)(
    "%s의 %s 런 끝 개행은 strict가 HARD_BREAK_LOST 한 건으로 거절한다",
    (host, _label, marks) => {
      const document = hostDocument(host, [run("a\n", marks), plain("b")]);

      expect(strictRejectedLosses(document)).toEqual([
        {
          kind: "HARD_BREAK_LOST",
          blockId: "host",
          message: expect.stringContaining("host"),
        },
      ]);
    },
  );

  it.each(HOST_MARK_CASES)(
    "%s의 %s 런 끝 개행은 lossy 출력에 &#xA;가 없고 글자 합이 a\\nb다",
    (host, _label, marks) => {
      const markdown = lossyMarkdown(
        hostDocument(host, [run("a\n", marks), plain("b")]),
      );
      const runs = importedRuns(markdown);

      expect(markdown).not.toContain("&#xA;");
      expect(joinedText(runs)).toBe("a\nb");
      expect(markedRuns(runs)).toEqual([["a", marks.map((m) => m.type)]]);
    },
  );

  it("analyzeMarkdownLoss를 직접 불러도 같은 손실을 낸다", () => {
    expect(
      lossesOf(hostDocument("paragraph", [run("a\n", [BOLD]), plain("b")])),
    ).toEqual([
      {
        kind: "HARD_BREAK_LOST",
        blockId: "host",
        message: expect.stringContaining("host"),
      },
    ]);
  });

  it("앞에 글자가 있고 뒤가 공백으로 시작해도 같다", () => {
    const document = hostDocument("paragraph", [
      plain("x"),
      run("a\n", [BOLD]),
      plain(" y"),
    ]);
    const markdown = lossyMarkdown(document);
    const runs = importedRuns(markdown);

    expect(strictRejectedLosses(document)).toHaveLength(1);
    expect(markdown).not.toContain("&#xA;");
    expect(joinedText(runs)).toBe("xa\n y");
    expect(markedRuns(runs)).toEqual([["a", ["bold"]]]);
  });

  it("mark가 둘인 런(bold+italic)도 같다", () => {
    const document = hostDocument("paragraph", [
      run("a\n", [BOLD, ITALIC]),
      plain("b"),
    ]);
    const runs = importedRuns(lossyMarkdown(document));

    expect(strictRejectedLosses(document)).toHaveLength(1);
    expect(joinedText(runs)).toBe("a\nb");
    expect(markedRuns(runs)).toEqual([["a", ["bold", "italic"]]]);
  });

  it("개행만 가진 bold 런은 사라지고 평문 개행이 된다", () => {
    const document = hostDocument("paragraph", [run("\n", [BOLD]), plain("b")]);
    const markdown = lossyMarkdown(document);
    const runs = importedRuns(markdown);

    expect(strictRejectedLosses(document)).toHaveLength(1);
    expect(markdown).not.toContain("&#xA;");
    expect(joinedText(runs)).toBe("\nb");
    expect(markedRuns(runs)).toEqual([]);
  });

  it("link와 bold가 함께 달린 런의 끝 개행은 대상이다(실측: 현행 왕복이 a&#xA;로 깨진다)", () => {
    const document = hostDocument("paragraph", [
      run("a\n", [LINK, BOLD]),
      plain("b"),
    ]);
    const markdown = lossyMarkdown(document);
    const runs = importedRuns(markdown);

    expect(strictRejectedLosses(document)).toHaveLength(1);
    expect(markdown).not.toContain("&#xA;");
    expect(joinedText(runs)).toBe("a\nb");
    expect(markedRuns(runs)).toEqual([["a", ["link", "bold"]]]);
  });

  it("link와 bold가 함께 달린 마지막 런의 끝 개행은 블록 끝으로 지워진다", () => {
    const document = hostDocument("paragraph", [
      plain("x"),
      run("a\n", [LINK, BOLD]),
    ]);
    const markdown = lossyMarkdown(document);

    expect(kindsOf(document)).toEqual(["HARD_BREAK_LOST"]);
    expect(markdown).not.toContain("&#xA;");
    expect(joinedText(importedRuns(markdown))).toBe("xa");
  });
});

describe("제목 3–6의 안쪽 hardBreak는 손실로 보고한다", () => {
  const LEVELS = [3, 4, 5, 6] as const;

  it.each(LEVELS)("heading %i의 a\\nb는 strict가 거절한다", (level) => {
    expect(
      strictRejectedLosses(hostDocument("heading", [plain("a\nb")], level)),
    ).toEqual([
      {
        kind: "HARD_BREAK_LOST",
        blockId: "host",
        message: expect.stringContaining("host"),
      },
    ]);
  });

  it.each(LEVELS)("heading %i의 lossy 출력은 공백 한 칸 그대로다", (level) => {
    const document = hostDocument("heading", [plain("a\nb")], level);

    expect(lossyMarkdown(document)).toBe(`${"#".repeat(level)} a b\n`);
    expect(lossyHardBreakWarnings(document)).toHaveLength(1);
  });

  it("heading 3의 mark가 달린 런 안쪽 개행도 보고한다", () => {
    const document = hostDocument("heading", [run("a\nb", [BOLD])], 3);

    expect(kindsOf(document)).toEqual(["HARD_BREAK_LOST"]);
  });

  it("heading 3의 끝 개행은 한 건이고 출력에서 지워진다", () => {
    const document = hostDocument("heading", [plain("a\nb\n")], 3);

    expect(kindsOf(document)).toEqual(["HARD_BREAK_LOST"]);
    expect(lossyMarkdown(document)).toBe("### a b\n");
  });

  it.each([1, 2] as const)(
    "heading %i의 a\\nb는 손실이 없고 strict 왕복이 같다",
    (level) => {
      const content = [plain("a\nb")];
      const document = hostDocument("heading", content, level);
      const result = exportMarkdown(document, { mode: "strict" });

      expect(kindsOf(document)).toEqual([]);
      expect(result.ok).toBe(true);
      expect(importedRuns(result.ok ? result.value : "")).toEqual(content);
    },
  );

  it.each([1, 2] as const)("heading %i의 끝 개행은 대상이다", (level) => {
    const document = hostDocument("heading", [plain("a\n")], level);

    expect(kindsOf(document)).toEqual(["HARD_BREAK_LOST"]);
    expect(lossyMarkdown(document)).toBe(`${"#".repeat(level)} a\n`);
  });
});

describe("대상이 아닌 hardBreak는 손실 없이 왕복한다", () => {
  const roundTripCases: ReadonlyArray<readonly [string, InlineContent]> = [
    ["중간 개행", [plain("a\nb")]],
    ["시작 개행", [plain("\na")]],
    ["bold 런의 시작 개행", [run("\na", [BOLD])]],
    ["link 런 앞에 글자가 있는 끝 개행", [plain("x"), run("a\n", [LINK])]],
    ["link 런 뒤에 글자가 오는 끝 개행", [run("a\n", [LINK]), plain("b")]],
    ["mark 없는 런 뒤에 mark 런", [plain("a\n"), run("b", [BOLD])]],
    ["개행이 없는 content", [plain("ab"), run("c", [BOLD])]],
  ];
  const HOST_CASES = TEXT_HOSTS.filter((host) => host !== "heading").flatMap(
    (host) =>
      roundTripCases.map(([label, content]) => [host, label, content] as const),
  );

  it.each(HOST_CASES)(
    "%s의 %s는 손실이 없고 strict 왕복이 같다",
    (host, _label, content) => {
      const document = hostDocument(host, content);
      const result = exportMarkdown(document, { mode: "strict" });

      expect(kindsOf(document)).toEqual([]);
      if (host === "callout") return;
      expect(result.ok).toBe(true);
      expect(importedRuns(result.ok ? result.value : "")).toEqual(content);
    },
  );

  it.each(roundTripCases)("heading 1의 %s는 손실이 없다", (_label, content) => {
    expect(kindsOf(hostDocument("heading", content))).toEqual([]);
  });

  const tableCases: ReadonlyArray<readonly [string, InlineContent]> = [
    ["끝 개행", [plain("a\n")]],
    ["끝 연속 개행", [plain("a\n\n")]],
    ["bold 런 끝 개행", [run("a\n", [BOLD]), plain("b")]],
    ["bold 마지막 런 끝 개행", [run("a\n", [BOLD])]],
    ["시작 개행", [plain("\na")]],
    ["중간 개행", [plain("a\nb")]],
  ];

  it.each(tableCases)(
    "표 셀의 %s는 손실이 없고 strict 왕복이 같다",
    (_label, content) => {
      const document = hostDocument("tableCell", content);
      const result = exportMarkdown(document, { mode: "strict" });

      expect(kindsOf(document)).toEqual([]);
      expect(result.ok).toBe(true);
      expect(importedRuns(result.ok ? result.value : "")).toEqual(content);
    },
  );

  it.each(tableCases)(
    "표 셀의 %s는 lossy 출력이 strict 출력과 같다",
    (_label, content) => {
      const document = hostDocument("tableCell", content);
      const strict = exportMarkdown(document, { mode: "strict" });

      expect(strict.ok && strict.value).toBe(lossyMarkdown(document));
    },
  );

  it.each(HOSTS)(
    "%s의 code 런 개행은 HARD_BREAK_LOST 대상이 아니다",
    (host) => {
      const document = hostDocument(host, [run("a\n", [CODE]), plain("b")]);

      expect(kindsOf(document)).not.toContain("HARD_BREAK_LOST");
    },
  );

  it("마지막 code 런의 끝 개행도 HARD_BREAK_LOST 대상이 아니다", () => {
    const document = hostDocument("paragraph", [run("a\n", [CODE])]);

    expect(kindsOf(document)).toEqual(["INLINE_CODE_NEWLINE"]);
  });

  it("끝에 link 런이 있으면 그 앞 평문의 개행은 중간 개행이다", () => {
    const document = hostDocument("paragraph", [
      plain("a\n"),
      run("b", [LINK]),
    ]);

    expect(kindsOf(document)).toEqual([]);
  });
});

describe("HARD_BREAK_LOST와 이미 있던 손실의 공존", () => {
  it("빈 마커 런과 끝 개행이 함께 있으면 각 kind를 따로 보고한다", () => {
    const document = hostDocument("paragraph", [run("", [BOLD]), plain("a\n")]);

    expect(kindsOf(document)).toEqual(["EMPTY_MARKED_RUN", "HARD_BREAK_LOST"]);
  });

  it("underline이 달린 끝 개행은 UNDERLINE과 HARD_BREAK_LOST를 함께 낸다", () => {
    const document = hostDocument("paragraph", [run("a\n", [UNDERLINE])]);

    expect(kindsOf(document)).toEqual(["UNDERLINE", "HARD_BREAK_LOST"]);
  });

  it("textColor가 달린 끝 개행은 HARD_BREAK_LOST를 INLINE_COLOR 앞에 낸다", () => {
    const document = hostDocument("paragraph", [
      run("a\n", [{ type: "textColor", color: "#FF0000" }]),
    ]);

    expect(kindsOf(document)).toEqual(["HARD_BREAK_LOST", "INLINE_COLOR"]);
  });

  it("INLINE_CODE_NEWLINE 바로 뒤, EMPTY_MARKED_RUN 뒤에 보고한다", () => {
    const document = hostDocument("paragraph", [
      run("c\nd", [CODE]),
      run("", [BOLD]),
      run("a\n", [BOLD]),
      plain("b"),
    ]);

    expect(kindsOf(document)).toEqual([
      "INLINE_CODE_NEWLINE",
      "EMPTY_MARKED_RUN",
      "HARD_BREAK_LOST",
    ]);
  });

  it("여러 모양이 한 블록에 겹쳐도 한 건이다", () => {
    const document = hostDocument(
      "heading",
      [run("a\n", [BOLD]), plain("b\nc"), run("d\n", [ITALIC]), plain("e\n")],
      3,
    );

    expect(
      lossesOf(document).filter((l) => l.kind === "HARD_BREAK_LOST"),
    ).toHaveLength(1);
    expect(lossyHardBreakWarnings(document)).toHaveLength(1);
  });

  it("부모와 자식 블록이 각자 개행을 가지면 블록마다 한 건씩 보고한다", () => {
    const document = buildDocument([
      {
        id: "outer",
        type: "bulletListItem",
        content: [plain("바깥\n")],
        children: [
          {
            id: "inner",
            type: "bulletListItem",
            content: [plain("안\n")],
          },
        ],
      },
    ]);

    expect(
      analyzeMarkdownLoss(document)
        .filter((loss) => loss.kind === "HARD_BREAK_LOST")
        .map((loss) => loss.blockId),
    ).toEqual(["outer", "inner"]);
  });

  it("quote 안 자식 문단의 끝 개행도 그 자식 id로 보고한다", () => {
    const document = buildDocument([
      {
        id: "q",
        type: "quote",
        content: [plain("인용")],
        children: [{ id: "child", type: "paragraph", content: [plain("a\n")] }],
      },
    ]);

    expect(
      analyzeMarkdownLoss(document).filter(
        (loss) => loss.kind === "HARD_BREAK_LOST",
      ),
    ).toEqual([
      {
        kind: "HARD_BREAK_LOST",
        blockId: "child",
        message: expect.stringContaining("child"),
      },
    ]);
  });
});

describe("HARD_BREAK_LOST 메시지", () => {
  const messageOf = (document: Document): string =>
    lossesOf(document)[0]?.message ?? "";

  it("세 모양의 메시지가 서로 다르다", () => {
    const blockEnd = messageOf(hostDocument("paragraph", [plain("a\n")]));
    const markEnd = messageOf(
      hostDocument("paragraph", [run("a\n", [BOLD]), plain("b")]),
    );
    const heading = messageOf(hostDocument("heading", [plain("a\nb")], 3));

    expect(new Set([blockEnd, markEnd, heading]).size).toBe(3);
    for (const message of [blockEnd, markEnd, heading]) {
      expect(message).toContain("Block host");
    }
  });
});

describe("normalizeHardBreakEdges와 hardBreakLossShape", () => {
  it("바뀐 것이 없으면 입력 배열을 그대로 돌려준다", () => {
    const content: InlineContent = [
      plain("a\nb"),
      run("c", [BOLD]),
      run("d\n", [LINK]),
    ];

    expect(normalizeHardBreakEdges(content)).toBe(content);
    expect(hardBreakLossShape(content)).toBeNull();
  });

  it("블록 끝 개행을 전부 지우고 비게 된 런은 없앤다", () => {
    expect(
      normalizeHardBreakEdges([plain("a\n"), run("\n", [BOLD]), plain("\n")]),
    ).toEqual([plain("a")]);
  });

  it("끝의 빈 런은 건너뛰고 그 앞 런의 끝 개행을 지운다", () => {
    expect(normalizeHardBreakEdges([plain("a\n"), plain("")])).toEqual([
      plain("a"),
      plain(""),
    ]);
  });

  it("mark 런 끝 개행을 mark 밖 평문 런으로 뺀다", () => {
    expect(normalizeHardBreakEdges([run("a\n\n", [BOLD]), plain("b")])).toEqual(
      [run("a", [BOLD]), plain("\n\n"), plain("b")],
    );
  });

  it("link 단독 런과 code 런은 건드리지 않는다", () => {
    const content: InlineContent = [
      run("a\n", [LINK]),
      run("b\n", [CODE]),
      plain("c"),
    ];

    expect(normalizeHardBreakEdges(content)).toBe(content);
  });

  const SHAPE_CASES: ReadonlyArray<
    readonly [string, InlineContent, number | undefined, string | null]
  > = [
    ["블록 끝", [plain("a\n")], undefined, "BLOCK_END"],
    ["mark 런 끝", [run("a\n", [BOLD]), plain("b")], undefined, "MARK_RUN_END"],
    ["제목 안쪽", [plain("a\nb")], 3, "HEADING_INNER"],
    ["제목 2 안쪽", [plain("a\nb")], 2, null],
    ["블록 끝이 먼저", [run("a\n", [BOLD]), plain("b\n")], 3, "BLOCK_END"],
  ];

  it.each(SHAPE_CASES)(
    "%s 모양을 판정한다",
    (_label, content, level, shape) => {
      expect(hardBreakLossShape(content, level)).toBe(shape);
    },
  );
});

describe("정리하면 비는 content를 가진 컨테이너는 빈 content와 같은 구조로 나간다", () => {
  type ContainerType =
    | "bulletListItem"
    | "numberedListItem"
    | "toggleListItem"
    | "quote"
    | "checkListItem";
  const CONTAINERS: readonly ContainerType[] = [
    "bulletListItem",
    "numberedListItem",
    "toggleListItem",
    "quote",
    "checkListItem",
  ];
  const NEWLINE_CONTENTS: ReadonlyArray<readonly [string, InlineContent]> = [
    ["평문 개행", [plain("\n")]],
    ["bold 개행", [run("\n", [BOLD])]],
  ];

  /**
   * 컨테이너 블록 하나를 담은 문서를 만든다. 자식이 있으면 문단 "kid" 하나를 붙인다.
   * checkListItem은 checked를 true로 둔다.
   */
  const containerDocument = (
    type: ContainerType,
    content: InlineContent,
    withChild: boolean,
  ): Document =>
    buildDocument([
      {
        id: "host",
        type,
        ...(type === "checkListItem" ? { checked: true } : {}),
        content,
        ...(withChild
          ? {
              children: [
                { id: "kid", type: "paragraph", content: [plain("kid")] },
              ],
            }
          : {}),
      } as Block,
    ]);

  const CASES = CONTAINERS.flatMap((type) =>
    [false, true].flatMap((withChild) =>
      NEWLINE_CONTENTS.map(
        ([label, content]) =>
          [
            type,
            withChild ? "자식 문단 있음" : "자식 없음",
            label,
            withChild,
            content,
          ] as const,
      ),
    ),
  );

  it.each(CASES)(
    "%s %s %s: lossy 출력이 content [] 문서와 같다",
    (type, _child, _label, withChild, content) => {
      const empty = containerDocument(type, [], withChild);
      const newline = containerDocument(type, content, withChild);

      expect(lossyMarkdown(newline)).toBe(lossyMarkdown(empty));
    },
  );

  it.each(CASES)(
    "%s %s %s: 구조 손실은 content [] 문서와 같고 HARD_BREAK_LOST가 한 건 더해진다",
    (type, _child, _label, withChild, content) => {
      const emptyKinds = analyzeMarkdownLoss(
        containerDocument(type, [], withChild),
      ).map((loss) => loss.kind);
      const kinds = analyzeMarkdownLoss(
        containerDocument(type, content, withChild),
      ).map((loss) => loss.kind);

      expect(kinds.filter((kind) => kind === "HARD_BREAK_LOST")).toHaveLength(
        1,
      );
      expect(kinds.filter((kind) => kind !== "HARD_BREAK_LOST").sort()).toEqual(
        [...emptyKinds].sort(),
      );
    },
  );

  it.each(CASES)(
    "%s %s %s: strict는 거절하고 lossy 출력은 재가져오기에 성공한다",
    (type, _child, _label, withChild, content) => {
      const document = containerDocument(type, content, withChild);

      expect(exportMarkdown(document, { mode: "strict" }).ok).toBe(false);
      expect(importMarkdown(lossyMarkdown(document)).ok).toBe(true);
    },
  );

  it("checkListItem 단독 개행은 CHECKED_STATE_LOST와 HARD_BREAK_LOST를 낸다", () => {
    expect(
      kindsOf(containerDocument("checkListItem", [plain("\n")], false)).sort(),
    ).toEqual(["CHECKED_STATE_LOST", "HARD_BREAK_LOST"]);
  });

  it("자식이 있는 bulletListItem의 개행은 NESTED_CHILDREN과 HARD_BREAK_LOST를 낸다", () => {
    expect(
      kindsOf(containerDocument("bulletListItem", [plain("\n")], true)).sort(),
    ).toEqual(["HARD_BREAK_LOST", "NESTED_CHILDREN"]);
  });

  it("개행 뒤에도 글자가 남는 content는 빈 content로 보지 않는다", () => {
    const document = containerDocument("bulletListItem", [plain("a\n")], true);

    expect(kindsOf(document)).toEqual(["HARD_BREAK_LOST"]);
    expect(lossyMarkdown(document)).toBe("* a\n\n  kid\n");
  });
});

describe("제목 1·2에서 글자가 전부 개행뿐이면 ATX 제목이라 개행을 담지 못한다", () => {
  const LEVELS = [1, 2] as const;
  const LINK_NEWLINE: InlineContent = [run("\n", [LINK])];

  it.each(LEVELS)(
    "heading %i의 개행뿐인 link 런은 strict가 거절한다",
    (level) => {
      expect(
        strictRejectedLosses(hostDocument("heading", LINK_NEWLINE, level)),
      ).toEqual([
        {
          kind: "HARD_BREAK_LOST",
          blockId: "host",
          message: expect.stringContaining("host"),
        },
      ]);
    },
  );

  it.each(LEVELS)(
    "heading %i의 개행뿐인 link 런은 lossy 출력이 그대로다",
    (level) => {
      const document = hostDocument("heading", LINK_NEWLINE, level);

      expect(lossyMarkdown(document)).toBe(
        `${"#".repeat(level)} [ ](https://e.com)\n`,
      );
      expect(lossyHardBreakWarnings(document)).toHaveLength(1);
    },
  );

  it.each(LEVELS)(
    "heading %i의 개행뿐인 link 런이 여럿이어도 한 건이다",
    (level) => {
      const document = hostDocument(
        "heading",
        [run("\n", [LINK]), run("\n", [LINK])],
        level,
      );

      expect(kindsOf(document)).toEqual(["HARD_BREAK_LOST"]);
    },
  );

  it.each(LEVELS)(
    "heading %i의 개행뿐인 평문 런은 블록 끝으로 한 건만 보고한다",
    (level) => {
      expect(kindsOf(hostDocument("heading", [plain("\n")], level))).toEqual([
        "HARD_BREAK_LOST",
      ]);
    },
  );

  const withLetters: ReadonlyArray<readonly [string, InlineContent]> = [
    ["link 런 앞에 글자", [plain("x"), run("a\n", [LINK])]],
    ["link 런 뒤에 글자", [run("a\n", [LINK]), plain("b")]],
    ["link 런 안 중간 개행", [run("a\nb", [LINK])]],
  ];

  it.each(
    LEVELS.flatMap((level) =>
      withLetters.map(([l, c]) => [level, l, c] as const),
    ),
  )(
    "heading %i의 글자가 있는 %s는 대상이 아니고 왕복이 같다",
    (level, _label, content) => {
      const document = hostDocument("heading", content, level);
      const result = exportMarkdown(document, { mode: "strict" });

      expect(kindsOf(document)).toEqual([]);
      expect(result.ok).toBe(true);
      expect(importedRuns(result.ok ? result.value : "")).toEqual(content);
    },
  );

  it("제목 3–6 메시지와 1·2 메시지가 모두 ATX 제목을 말한다", () => {
    const messageOf = (document: Document): string =>
      lossesOf(document)[0]?.message ?? "";
    const h1 = messageOf(hostDocument("heading", LINK_NEWLINE, 1));
    const h3 = messageOf(hostDocument("heading", [plain("a\nb")], 3));

    expect(h1).toContain("ATX");
    expect(h3).toContain("ATX");
    expect(h1).not.toContain("level 3 to 6");
  });

  it("hardBreakLossShape: 제목 1·2의 개행뿐인 link 런은 HEADING_INNER다", () => {
    expect(hardBreakLossShape(LINK_NEWLINE, 1)).toBe("HEADING_INNER");
    expect(hardBreakLossShape(LINK_NEWLINE, 2)).toBe("HEADING_INNER");
    expect(hardBreakLossShape(LINK_NEWLINE)).toBeNull();
  });
});
