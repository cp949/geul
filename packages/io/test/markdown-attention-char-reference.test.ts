/**
 * 빈 글자 런과 이모지 옆 여러 겹 mark 런의 markdown 직렬화를 검증한다(Issue #394).
 * mdast-util-to-markdown 2.1.2는 attention 앞뒤 글자를 문자 참조로 바꿀 때
 * 직렬화 조각의 마지막 UTF-16 코드 단위 하나를 읽는다.
 * - 빈 text 노드가 앞에 오면 `&#xNAN;`이 나온다.
 * - 서로게이트 쌍(이모지)이 옆에 오면 쌍의 반쪽만 인코딩해 깨진 서로게이트가 나온다.
 * 2.2.0이 attention 처리를 다시 써서 둘 다 고친다.
 * 단언은 네 가지다.
 * - strict 내보내기가 성공한다.
 * - 출력에 `NAN`이 없고 `encodeURIComponent`가 던지지 않는다(깨진 서로게이트 없음).
 * - 재가져오기가 성공하고 글자 런이 원본과 같다(빈 런은 사라진다).
 * - 정확한 문자열은 빈 런 + bold·italic 한 건만 고정한다.
 * mark 달린 빈 런은 입력에 쓰지 않는다(#393 EMPTY_MARKED_RUN 범위).
 */
import type {
  Block,
  Document,
  InlineContent,
  InlineContentItem,
  TextMark,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown, importMarkdown } from "../src/index.js";
import {
  buildDocument,
  paragraphBlock,
} from "./fixtures/quote-divider-document.js";

const BOLD: TextMark = { type: "bold" };
const ITALIC: TextMark = { type: "italic" };
const STRIKE: TextMark = { type: "strike" };
const CODE: TextMark = { type: "code" };

const EMOJI = "😀";

/**
 * 입력 content와, 재가져오기 뒤 기대하는 글자 런 목록을 묶은 케이스다.
 * 기대 목록에는 빈 런이 없다.
 */
type Case = readonly [string, InlineContent, InlineContentItem[]];

/**
 * mark 목록을 가진 글자 런 하나를 만든다.
 */
const run = (text: string, marks: TextMark[]): InlineContentItem => ({
  text,
  marks,
});

/**
 * 빈 런 + 여러 겹 mark 런의 케이스를 만든다. 입력과 기대 모두 마지막 런은 같다.
 */
const emptyThen = (label: string, marks: TextMark[]): Case => [
  `빈 런 + ${label}`,
  [{ text: "" }, run("a", marks)],
  [run("a", marks)],
];

const EMPTY_RUN_CASES: readonly Case[] = [
  emptyThen("bold·italic", [BOLD, ITALIC]),
  emptyThen("bold·code", [BOLD, CODE]),
  emptyThen("bold·strike", [BOLD, STRIKE]),
  emptyThen("italic·strike", [ITALIC, STRIKE]),
  emptyThen("bold·italic·strike", [BOLD, ITALIC, STRIKE]),
  [
    "marks가 빈 배열인 빈 런 + bold·italic",
    [{ text: "", marks: [] }, run("a", [BOLD, ITALIC])],
    [run("a", [BOLD, ITALIC])],
  ],
  [
    "빈 런 둘 + bold·italic",
    [{ text: "" }, { text: "" }, run("a", [BOLD, ITALIC])],
    [run("a", [BOLD, ITALIC])],
  ],
];

/**
 * 이모지 런이 mark 런의 앞이나 뒤에 오는 케이스를 만든다.
 */
const emojiNextTo = (label: string, marks: TextMark[]): Case[] => [
  [
    `이모지 + ${label}`,
    [{ text: EMOJI }, run("a", marks)],
    [{ text: EMOJI }, run("a", marks)],
  ],
  [
    `${label} + 이모지`,
    [run("a", marks), { text: EMOJI }],
    [run("a", marks), { text: EMOJI }],
  ],
];

const EMOJI_CASES: readonly Case[] = [
  ...emojiNextTo("bold·italic", [BOLD, ITALIC]),
  ...emojiNextTo("bold·strike", [BOLD, STRIKE]),
];

const ALL_CASES: readonly Case[] = [...EMPTY_RUN_CASES, ...EMOJI_CASES];

/**
 * content를 담은 paragraph 하나짜리 문서를 만든다.
 */
const paragraphDocument = (content: InlineContent): Document => {
  const block: Block = { ...paragraphBlock("host", ""), content };
  return buildDocument([block]);
};

/**
 * 열 1개·행 1개 표의 유일한 셀에 content를 둔 문서를 만든다.
 */
const tableCellDocument = (content: InlineContent): Document =>
  buildDocument([
    {
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
    },
  ]);

/**
 * strict 내보내기를 실행해 markdown 문자열을 돌려준다. 실패하면 던진다.
 */
const strictMarkdown = (document: Document): string => {
  const result = exportMarkdown(document, { mode: "strict" });
  if (!result.ok) throw new Error(`strict 내보내기 실패: ${result.error.code}`);
  return result.value;
};

/**
 * markdown을 재가져와 첫 블록의 글자 런을 돌려준다. 표이면 첫 셀의 글자 런이다.
 * 실패하면 던진다.
 */
const importedRuns = (markdown: string): unknown => {
  const result = importMarkdown(markdown);
  if (!result.ok) throw new Error(`재가져오기 실패: ${result.error.code}`);
  const block = result.value.document.blocks[0];
  if (block === undefined) throw new Error("재가져온 블록이 없다");
  if ("rows" in block) return block.rows[0]?.cells[0]?.content;
  return "content" in block ? block.content : undefined;
};

/**
 * 출력에 문자 참조 오염과 깨진 서로게이트가 없음을 단언한다.
 */
const expectCleanOutput = (markdown: string): void => {
  expect(markdown).not.toContain("NAN");
  expect(() => encodeURIComponent(markdown)).not.toThrow();
};

describe("빈 글자 런과 이모지 옆 여러 겹 mark 런의 직렬화", () => {
  it.each(ALL_CASES)(
    "문단의 %s는 strict 내보내기가 깨진 문자 참조 없이 성공하고 재가져오기가 글자를 보존한다",
    (_label, content, expected) => {
      const markdown = strictMarkdown(paragraphDocument(content));

      expectCleanOutput(markdown);
      expect(importedRuns(markdown)).toEqual(expected);
    },
  );

  it("표 셀의 빈 런 + bold·italic도 깨진 문자 참조 없이 성공하고 글자를 보존한다", () => {
    const markdown = strictMarkdown(
      tableCellDocument([{ text: "" }, run("a", [BOLD, ITALIC])]),
    );

    expectCleanOutput(markdown);
    expect(importedRuns(markdown)).toEqual([run("a", [BOLD, ITALIC])]);
  });

  it("표 셀의 이모지 + bold·strike도 깨진 서로게이트 없이 성공하고 글자를 보존한다", () => {
    const markdown = strictMarkdown(
      tableCellDocument([{ text: EMOJI }, run("a", [BOLD, STRIKE])]),
    );

    expectCleanOutput(markdown);
    expect(importedRuns(markdown)).toEqual([
      { text: EMOJI },
      run("a", [BOLD, STRIKE]),
    ]);
  });

  it("빈 런 + bold·italic의 출력 문자열은 `**_a_**`다", () => {
    const markdown = strictMarkdown(
      paragraphDocument([{ text: "" }, run("a", [BOLD, ITALIC])]),
    );

    expect(markdown).toBe("**_a_**\n");
  });
});
