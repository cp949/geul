/**
 * 빈 own content 컨테이너의 GFM 손실 보고를 검증한다(Issue #391).
 * 두 모양이 대상이다.
 * (1) 내용이 비고 자식이 없는 checkListItem: 체크박스를 붙일 paragraph가 없어
 *     `*`만 나가고 checked가 사라진다 -> CHECKED_STATE_LOST.
 * (2) 내용이 빈 목록 항목·quote의 첫 자식이 mdast paragraph로 나가는 블록
 *     (image 등): GFM이 own content와 첫 자식 경계를 구분하지 못해 재가져오기
 *     때 자식이 own content로 뭉친다 -> NESTED_CHILDREN.
 * lossy 출력은 바뀌지 않고 경고만 더해진다. 예외는 mark 없는 빈 글자 런 입력이다.
 */
import type { Block, Document, InlineContent } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { analyzeMarkdownLoss, exportMarkdown } from "../src/index.js";
import {
  buildDocument,
  headingBlock,
  paragraphBlock,
  quoteBlock,
} from "./fixtures/quote-divider-document.js";

const IMAGE_URL = "https://e.com/a.png";

/**
 * showPreview 기본값(mdast image 문단으로 나가는 경로)을 쓰는 image 블록을 만든다.
 */
const imageChild = (id: string): Block => ({
  id,
  type: "image",
  url: IMAGE_URL,
  name: "img",
});

/**
 * 내용이 비고 자식이 없는 checkListItem을 만든다.
 */
const emptyCheckItem = (id: string, checked: boolean): Block => ({
  id,
  type: "checkListItem",
  checked,
  content: [],
});

/**
 * 내용이 빈 목록 항목·quote 컨테이너를 만든다. children 첫 자리의 모양을
 * 바꿔 가며 경계 판정을 확인하는 데 쓴다.
 */
const emptyContainer = (
  type: "bulletListItem" | "numberedListItem" | "quote" | "checkListItem",
  children: Block[],
  content: InlineContent = [],
): Block =>
  ({
    id: "parent",
    type,
    content,
    ...(type === "checkListItem" ? { checked: true } : {}),
    children,
  }) as Block;

/**
 * 문서 전체 손실 중 부모 블록 id에 걸린 kind만 뽑는다. 자식 블록 자체의
 * 손실(예: 미디어 prop)이 섞여도 부모 판정만 비교하기 위해 쓴다.
 */
const parentKinds = (document: Document): string[] =>
  analyzeMarkdownLoss(document)
    .filter((loss) => loss.blockId === "parent")
    .map((loss) => loss.kind);

describe("내용이 빈 checkListItem(자식 없음)의 CHECKED_STATE_LOST", () => {
  it.each([true, false])(
    "checked가 %s여도 strict 내보내기를 CHECKED_STATE_LOST로 거절한다",
    (checked) => {
      const document = buildDocument([emptyCheckItem("empty-check", checked)]);

      expect(exportMarkdown(document, { mode: "strict" })).toEqual({
        ok: false,
        error: {
          code: "MARKDOWN_LOSS_NOT_ALLOWED",
          losses: [
            {
              kind: "CHECKED_STATE_LOST",
              blockId: "empty-check",
              message: expect.stringContaining("empty-check"),
            },
          ],
        },
      });
    },
  );

  it.each([true, false])(
    "checked가 %s여도 lossy 내보내기는 같은 경고를 내고 출력은 `*`만 남는다",
    (checked) => {
      const document = buildDocument([emptyCheckItem("empty-check", checked)]);

      expect(exportMarkdown(document, { mode: "lossy" })).toEqual({
        ok: true,
        value: {
          markdown: "*\n",
          warnings: [
            {
              kind: "CHECKED_STATE_LOST",
              blockId: "empty-check",
              message: expect.stringContaining("empty-check"),
            },
          ],
        },
      });
    },
  );

  it("내용이 있는 checkListItem은 경고하지 않는다", () => {
    const document = buildDocument([
      {
        id: "filled-check",
        type: "checkListItem",
        checked: true,
        content: [{ text: "할 일" }],
      },
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([]);
  });

  it("자식 없는 빈 checkListItem이 중첩 자식 안에 있어도 그 자식 id로 보고한다", () => {
    const document = buildDocument([
      paragraphBlock("host", "본문"),
      {
        id: "outer",
        type: "bulletListItem",
        content: [{ text: "바깥" }],
        children: [emptyCheckItem("inner-empty-check", false)],
      },
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([
      {
        kind: "CHECKED_STATE_LOST",
        blockId: "inner-empty-check",
        message: expect.stringContaining("inner-empty-check"),
      },
    ]);
  });
});

describe("내용이 빈 컨테이너의 첫 자식이 image일 때의 NESTED_CHILDREN", () => {
  const CASES = [
    ["bulletListItem", `* ![img](${IMAGE_URL})\n`],
    ["numberedListItem", `1. ![img](${IMAGE_URL})\n`],
    ["quote", `> ![img](${IMAGE_URL})\n`],
  ] as const;

  it.each(CASES)(
    "%s는 strict 내보내기를 부모 id의 NESTED_CHILDREN으로 거절한다",
    (type) => {
      const document = buildDocument([
        emptyContainer(type, [imageChild("image-child")]),
      ]);

      expect(exportMarkdown(document, { mode: "strict" })).toEqual({
        ok: false,
        error: {
          code: "MARKDOWN_LOSS_NOT_ALLOWED",
          losses: [
            {
              kind: "NESTED_CHILDREN",
              blockId: "parent",
              message: expect.stringContaining("parent"),
            },
          ],
        },
      });
    },
  );

  it.each(CASES)(
    "%s는 lossy 내보내기가 NESTED_CHILDREN 경고를 내고 출력은 그대로다",
    (type, markdown) => {
      const document = buildDocument([
        emptyContainer(type, [imageChild("image-child")]),
      ]);

      expect(exportMarkdown(document, { mode: "lossy" })).toEqual({
        ok: true,
        value: {
          markdown,
          warnings: [
            {
              kind: "NESTED_CHILDREN",
              blockId: "parent",
              message: expect.stringContaining("parent"),
            },
          ],
        },
      });
    },
  );

  it("showPreview가 false인 image(링크로 나감)도 같은 경계라 NESTED_CHILDREN이다", () => {
    const document = buildDocument([
      emptyContainer("bulletListItem", [
        { ...imageChild("image-child"), showPreview: false } as Block,
      ]),
    ]);

    expect(parentKinds(document)).toEqual(["NESTED_CHILDREN"]);
  });

  it("첫 자식이 callout이어도 NESTED_CHILDREN이다(callout도 mdast paragraph로 나간다)", () => {
    const document = buildDocument([
      emptyContainer("quote", [
        {
          id: "callout-child",
          type: "callout",
          content: [{ text: "알림" }],
        },
      ]),
    ]);

    expect(parentKinds(document)).toEqual(["NESTED_CHILDREN"]);
  });

  it.each(["bulletListItem", "numberedListItem", "quote"] as const)(
    "%s의 content가 있으면 첫 자식이 image여도 부모는 경고하지 않는다",
    (type) => {
      const document = buildDocument([
        emptyContainer(type, [imageChild("image-child")], [{ text: "본문" }]),
      ]);

      expect(parentKinds(document)).toEqual([]);
    },
  );

  it.each(["bulletListItem", "numberedListItem", "quote"] as const)(
    "%s의 content가 비어도 첫 자식이 quote면 경고하지 않는다",
    (type) => {
      const document = buildDocument([
        emptyContainer(type, [quoteBlock("quote-child", "인용")]),
      ]);

      expect(parentKinds(document)).toEqual([]);
    },
  );

  it("content가 비어도 첫 자식이 heading이면 경고하지 않는다", () => {
    const document = buildDocument([
      emptyContainer("bulletListItem", [
        headingBlock("heading-child", 2, "제목"),
      ]),
    ]);

    expect(parentKinds(document)).toEqual([]);
  });

  it("image가 첫 자식이 아니면(앞에 quote) 경고하지 않는다", () => {
    const document = buildDocument([
      emptyContainer("bulletListItem", [
        quoteBlock("quote-child", "인용"),
        imageChild("image-child"),
      ]),
    ]);

    expect(parentKinds(document)).toEqual([]);
  });

  it("빈 checkListItem의 첫 자식이 image면 NESTED_CHILDREN만 내고 CHECKED_STATE_LOST는 내지 않는다", () => {
    const document = buildDocument([
      emptyContainer("checkListItem", [imageChild("image-child")]),
    ]);

    expect(parentKinds(document)).toEqual(["NESTED_CHILDREN"]);
    expect(exportMarkdown(document, { mode: "lossy" })).toMatchObject({
      ok: true,
      value: { markdown: `* [x] ![img](${IMAGE_URL})\n` },
    });
  });

  it("빈 checkListItem의 첫 자식이 quote면 기존대로 CHECKED_STATE_LOST만 낸다", () => {
    const document = buildDocument([
      emptyContainer("checkListItem", [quoteBlock("quote-child", "인용")]),
    ]);

    expect(parentKinds(document)).toEqual(["CHECKED_STATE_LOST"]);
  });
});

describe('빈 글자 런([{ text: "" }])만 가진 own content는 빈 content와 같게 판정한다', () => {
  const emptyText: InlineContent = [{ text: "" }];

  it("빈 글자 런만 가진 checkListItem(자식 없음)은 CHECKED_STATE_LOST를 낸다", () => {
    const document = buildDocument([
      emptyContainer("checkListItem", [], emptyText),
    ]);

    expect(parentKinds(document)).toEqual(["CHECKED_STATE_LOST"]);
  });

  it.each(["bulletListItem", "numberedListItem", "quote"] as const)(
    "빈 글자 런만 가진 %s의 첫 자식이 image면 NESTED_CHILDREN을 낸다",
    (type) => {
      const document = buildDocument([
        emptyContainer(type, [imageChild("image-child")], emptyText),
      ]);

      expect(parentKinds(document)).toEqual(["NESTED_CHILDREN"]);
    },
  );

  it("빈 글자 런만 가진 목록 항목의 첫 자식이 paragraph면 NESTED_CHILDREN을 낸다", () => {
    const document = buildDocument([
      emptyContainer(
        "bulletListItem",
        [paragraphBlock("paragraph-child", "본문")],
        emptyText,
      ),
    ]);

    expect(parentKinds(document)).toEqual(["NESTED_CHILDREN"]);
  });

  it("글자가 있는 런이 하나라도 있으면 빈 content가 아니다", () => {
    const document = buildDocument([
      emptyContainer("checkListItem", [], [{ text: "" }, { text: "a" }]),
    ]);

    expect(parentKinds(document)).toEqual([]);
  });

  it("mark가 붙은 빈 런은 빈 content가 아니다(링크 문단이 체크박스를 받는다)", () => {
    const document = buildDocument([
      emptyContainer(
        "checkListItem",
        [],
        [{ text: "", marks: [{ type: "link", href: "https://e.com" }] }],
      ),
    ]);

    expect(parentKinds(document)).toEqual([]);
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "* [x] [](https://e.com)\n",
    });
  });

  // lossy 출력이 빈 content `[]`와 같아야 한다. 판정 둘(승격과 own 단락 판단)이
  // 모두 isEmptyContent를 읽는다. 하나라도 `length === 0`으로 돌아가면 빈 단락이
  // 끼어 `>\n>\n> x` 모양이 된다.
  const childCases: ReadonlyArray<readonly [string, Block[]]> = [
    ["본문 하나", [paragraphBlock("paragraph-child", "본문")]],
    [
      "빈 문단 뒤 문단",
      [
        paragraphBlock("empty-child", ""),
        paragraphBlock("paragraph-child", "둘째"),
      ],
    ],
  ];

  it.each(
    (["bulletListItem", "numberedListItem", "quote"] as const).flatMap((type) =>
      childCases.map(([label, children]) => [type, label, children] as const),
    ),
  )(
    "빈 글자 런만 가진 %s(자식: %s)의 lossy 출력은 빈 content와 같다",
    (type, _label, children) => {
      const withRun = buildDocument([
        emptyContainer(type, children, [{ text: "" }]),
      ]);
      const withEmpty = buildDocument([emptyContainer(type, children, [])]);

      const lossyMarkdown = (document: Document): unknown => {
        const result = exportMarkdown(document, { mode: "lossy" });
        return result.ok ? result.value.markdown : result;
      };

      expect(lossyMarkdown(withRun)).toBe(lossyMarkdown(withEmpty));
    },
  );

  it("빈 글자 런만 가진 quote의 non-paragraph 첫 자식은 own 빈 단락 없이 나간다", () => {
    const document = buildDocument([
      emptyContainer(
        "quote",
        [headingBlock("heading-child", 2, "제목")],
        [{ text: "" }],
      ),
    ]);

    expect(exportMarkdown(document, { mode: "lossy" })).toMatchObject({
      ok: true,
      value: { markdown: expect.stringMatching(/^> #+ 제목\n$/) },
    });
  });
});

describe("NESTED_CHILDREN 메시지", () => {
  const messageOf = (document: Document): string =>
    analyzeMarkdownLoss(document).find((loss) => loss.blockId === "parent")
      ?.message ?? "";

  it("컨테이너 모양 손실은 평탄화한다고 쓰지 않는다", () => {
    const document = buildDocument([
      emptyContainer("bulletListItem", [imageChild("image-child")]),
    ]);

    expect(messageOf(document)).not.toContain("flattens");
  });

  it("컨테이너가 아닌 블록의 children은 평탄화한다고 쓴다", () => {
    const document = buildDocument([
      {
        id: "parent",
        type: "paragraph",
        content: [{ text: "본문" }],
        children: [paragraphBlock("paragraph-child", "자식")],
      },
    ]);

    expect(messageOf(document)).toContain("flattens");
  });
});
