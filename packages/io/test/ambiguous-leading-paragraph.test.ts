/**
 * hasAmbiguousLeadingParagraph가 "own content가 비고 첫 child가
 * paragraph"인 GFM 표현 불가능 경계를 목록 항목 종류·children 형태 전수에
 * 걸쳐 정확히 판정하는지 검증한다. loss-analysis.ts와 export-markdown.ts의
 * flattenBlocks·listNode가 모두 이 판정에 의존한다(아키텍처 리뷰 6차 후보 L5).
 * 같은 파일 뒤쪽에서 넓은 판정 firstChildMergesIntoOwnContent(첫 자식이 mdast
 * paragraph로 나가는 모든 블록)와 isCheckboxAnchorLost(Issue #391)의 진리표,
 * 그리고 좁은 판정이 넓은 판정의 부분집합이라는 관계를 검증한다.
 */
import type { Block, InlineContent } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  firstChildMergesIntoOwnContent,
  hasAmbiguousLeadingParagraph,
  isCheckboxAnchorLost,
} from "../src/markdown/gfm-container-shape.js";

const withChildren = (
  type: "bulletListItem" | "numberedListItem",
  content: InlineContent,
  children?: Block[],
): Block =>
  ({
    id: `${type}-fixture`,
    type,
    content,
    ...(children === undefined ? {} : { children }),
  }) as Block;

const paragraphChild: Block = {
  id: "paragraph-child",
  type: "paragraph",
  content: [{ text: "본문" }],
};

const quoteChild: Block = {
  id: "quote-child",
  type: "quote",
  content: [{ text: "인용" }],
};

describe("hasAmbiguousLeadingParagraph", () => {
  it.each(["bulletListItem", "numberedListItem"] as const)(
    "%s는 own content가 비고 첫 child가 paragraph면 true다",
    (type) => {
      const block = withChildren(type, [], [paragraphChild]);
      expect(hasAmbiguousLeadingParagraph(block)).toBe(true);
    },
  );

  it("own content가 있으면 첫 child가 paragraph여도 false다", () => {
    const block = withChildren(
      "bulletListItem",
      [{ text: "own" }],
      [paragraphChild],
    );
    expect(hasAmbiguousLeadingParagraph(block)).toBe(false);
  });

  it("첫 child가 paragraph가 아니면 false다", () => {
    const block = withChildren("bulletListItem", [], [quoteChild]);
    expect(hasAmbiguousLeadingParagraph(block)).toBe(false);
  });

  it("children이 없으면 false다", () => {
    expect(
      hasAmbiguousLeadingParagraph(withChildren("bulletListItem", [])),
    ).toBe(false);
  });

  it("children이 빈 배열이면 false다", () => {
    expect(
      hasAmbiguousLeadingParagraph(withChildren("bulletListItem", [], [])),
    ).toBe(false);
  });

  it("목록 항목이 아니면 own content가 비어도 false다", () => {
    const paragraph: Block = {
      id: "paragraph-parent",
      type: "paragraph",
      content: [],
      children: [paragraphChild],
    };
    expect(hasAmbiguousLeadingParagraph(paragraph)).toBe(false);
  });

  it("children 필드 자체가 없는 종류(table)는 false다", () => {
    const table: Block = {
      id: "table-fixture",
      type: "table",
      columns: [],
      rows: [],
      headerRows: 0,
      headerColumns: 0,
    };
    expect(hasAmbiguousLeadingParagraph(table)).toBe(false);
  });
});

/**
 * Block["type"] 전수 목록이다. Record로 선언해 새 블록 타입이 생기면 이 표가
 * 컴파일 단계에서 모자라게 한다(부분집합 관계 테스트가 새 타입을 놓치지 않는다).
 */
const ALL_TYPES = Object.keys({
  paragraph: 0,
  heading: 0,
  table: 0,
  quote: 0,
  divider: 0,
  codeBlock: 0,
  bulletListItem: 0,
  numberedListItem: 0,
  checkListItem: 0,
  toggleListItem: 0,
  callout: 0,
  file: 0,
  image: 0,
  video: 0,
  audio: 0,
  iframe: 0,
} satisfies Record<Block["type"], 0>) as Array<Block["type"]>;

/**
 * 타입과 content, 첫 자식 타입만 가진 판정용 블록을 만든다. 두 판정은 이
 * 세 값만 읽으므로 나머지 필드는 채우지 않는다.
 */
const judged = (
  type: Block["type"],
  content: InlineContent,
  firstChildType?: Block["type"],
): Block =>
  ({
    id: "judged",
    type,
    content,
    ...(firstChildType === undefined
      ? {}
      : { children: [{ id: "first", type: firstChildType }] }),
  }) as unknown as Block;

describe("firstChildMergesIntoOwnContent", () => {
  it.each(["bulletListItem", "numberedListItem", "quote"] as const)(
    "%s는 content가 비고 첫 자식이 image면 true다",
    (type) => {
      expect(firstChildMergesIntoOwnContent(judged(type, [], "image"))).toBe(
        true,
      );
    },
  );

  it.each(["paragraph", "callout", "image"] as const)(
    "첫 자식이 %s(mdast paragraph로 나가는 종류)면 true다",
    (childType) => {
      expect(
        firstChildMergesIntoOwnContent(judged("bulletListItem", [], childType)),
      ).toBe(true);
    },
  );

  it.each(["file", "video", "audio", "iframe"] as const)(
    "첫 자식이 %s여도 mdast paragraph로 나가므로 true다",
    (childType) => {
      expect(
        firstChildMergesIntoOwnContent(judged("quote", [], childType)),
      ).toBe(true);
    },
  );

  it.each([
    "heading",
    "quote",
    "bulletListItem",
    "checkListItem",
    "codeBlock",
    "divider",
    "table",
  ] as const)(
    "첫 자식이 %s(paragraph로 나가지 않는 종류)면 false다",
    (childType) => {
      expect(
        firstChildMergesIntoOwnContent(judged("bulletListItem", [], childType)),
      ).toBe(false);
    },
  );

  it("content가 있으면 첫 자식이 image여도 false다", () => {
    expect(
      firstChildMergesIntoOwnContent(
        judged("bulletListItem", [{ text: "본문" }], "image"),
      ),
    ).toBe(false);
  });

  it("자식이 없거나 빈 배열이면 false다", () => {
    expect(firstChildMergesIntoOwnContent(judged("quote", []))).toBe(false);
    expect(
      firstChildMergesIntoOwnContent({
        ...judged("quote", []),
        children: [],
      } as Block),
    ).toBe(false);
  });

  it("컨테이너가 아니면 content가 비고 첫 자식이 image여도 false다", () => {
    expect(
      firstChildMergesIntoOwnContent(judged("paragraph", [], "image")),
    ).toBe(false);
  });

  it("좁은 판정이 참이면 넓은 판정도 참이다(타입 x content x 첫 자식 전수)", () => {
    const contents: InlineContent[] = [[], [{ text: "본문" }]];
    let narrowTrueCount = 0;
    for (const type of ALL_TYPES) {
      for (const content of contents) {
        for (const childType of ALL_TYPES) {
          const block = judged(type, content, childType);
          if (hasAmbiguousLeadingParagraph(block)) {
            narrowTrueCount += 1;
            expect(
              firstChildMergesIntoOwnContent(block),
              `${type}/${content.length}/${childType}`,
            ).toBe(true);
          }
        }
      }
    }
    // 부분집합 단언이 빈 반복으로 통과하지 않게, 좁은 판정이 참인 조합이 실제로 있음을 고정한다.
    expect(narrowTrueCount).toBeGreaterThan(0);
  });
});

describe("isCheckboxAnchorLost", () => {
  it("content가 비고 자식이 없는 checkListItem은 true다", () => {
    expect(isCheckboxAnchorLost(judged("checkListItem", []))).toBe(true);
  });

  it("content가 비고 자식이 빈 배열인 checkListItem은 true다", () => {
    expect(
      isCheckboxAnchorLost({
        ...judged("checkListItem", []),
        children: [],
      } as Block),
    ).toBe(true);
  });

  it.each(["quote", "heading", "divider", "codeBlock", "table"] as const)(
    "content가 비고 첫 자식이 %s면 true다",
    (childType) => {
      expect(isCheckboxAnchorLost(judged("checkListItem", [], childType))).toBe(
        true,
      );
    },
  );

  it.each(["paragraph", "image", "callout"] as const)(
    "content가 비고 첫 자식이 %s(mdast paragraph)면 false다",
    (childType) => {
      expect(isCheckboxAnchorLost(judged("checkListItem", [], childType))).toBe(
        false,
      );
    },
  );

  it("content가 있으면 false다", () => {
    expect(
      isCheckboxAnchorLost(judged("checkListItem", [{ text: "할 일" }])),
    ).toBe(false);
    expect(
      isCheckboxAnchorLost(
        judged("checkListItem", [{ text: "할 일" }], "quote"),
      ),
    ).toBe(false);
  });

  it("checkListItem이 아니면 content가 비어도 false다", () => {
    for (const type of ALL_TYPES) {
      if (type === "checkListItem") continue;
      expect(isCheckboxAnchorLost(judged(type, [])), type).toBe(false);
    }
  });
});
