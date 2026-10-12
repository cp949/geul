/**
 * 빈 bulletListItem의 마커 줄이 thematic break로 읽히는 두 모양의 GFM 손실 보고를
 * 검증한다(Issue #392). #391의 형제 결함이다.
 * (1) 내용이 빈 bulletListItem + 첫 자식 divider: 마커가 `-`로 나오면 `- ---`가
 *     재가져오기 때 thematic break 한 줄로 읽혀 항목이 사라진다.
 *     `-` 마커는 바로 앞 형제가 checkListItem·toggleListItem일 때 나온다.
 * (2) 내용이 빈 bulletListItem이 첫 자식 사슬로 3단 이상 이어지고 끝이 자식 없는
 *     빈 bulletListItem인 모양: `* * *`가 thematic break로 읽힌다. 마커와 무관하다.
 * 두 모양 모두 NESTED_CHILDREN으로 보고한다. strict는 거절하고 lossy는 경고한다.
 * 모양만 보므로 안전한 `* ---`도 보고한다(마커 인식은 목록 묶기 규칙을 따로 알아야 한다).
 * lossy 출력은 바뀌지 않고 경고만 더해진다.
 * 왕복 대조 행렬은 구조가 어긋나는 입력이 빠짐없이 손실 목록을 갖는지 지킨다.
 */
import { isDeepStrictEqual } from "node:util";

import type { Block, Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  analyzeMarkdownLoss,
  exportMarkdown,
  importMarkdown,
} from "../src/index.js";
import {
  buildDocument,
  dividerBlock,
  paragraphBlock,
} from "./fixtures/quote-divider-document.js";

/**
 * 내용이 비고 children을 받는 bulletListItem을 만든다.
 */
const emptyBullet = (id: string, children?: Block[]): Block => ({
  id,
  type: "bulletListItem",
  content: [],
  ...(children === undefined ? {} : { children }),
});

/**
 * 내용이 빈 bulletListItem을 첫 자식으로 depth단 잇고 끝에 tail을 붙인 사슬을
 * 만든다. 바깥부터 `chain-1`, `chain-2` 순으로 id를 매기고, tail이 없으면 끝은
 * 자식 없는 빈 항목이다.
 */
const emptyBulletChain = (depth: number, tail?: Block): Block => {
  const build = (level: number): Block => {
    const isLast = level === depth;
    if (isLast) {
      return emptyBullet(
        `chain-${level}`,
        tail === undefined ? undefined : [tail],
      );
    }
    return emptyBullet(`chain-${level}`, [build(level + 1)]);
  };
  return build(1);
};

/**
 * 문서 전체 손실 중 NESTED_CHILDREN이 걸린 블록 id만 뽑는다.
 */
const nestedChildrenIds = (document: Document): string[] =>
  analyzeMarkdownLoss(document)
    .filter((loss) => loss.kind === "NESTED_CHILDREN")
    .map((loss) => loss.blockId);

/**
 * lossy 내보내기 결과의 markdown을 꺼낸다. 실패하면 오류 코드로 던진다.
 */
const lossyMarkdown = (document: Document): string => {
  const result = exportMarkdown(document, { mode: "lossy" });
  if (!result.ok) throw new Error(result.error.code);
  return result.value.markdown;
};

/**
 * 앞 형제가 checkListItem이라 마커가 `-`로 나오는 divider 항목 문서를 만든다.
 */
const checkThenDividerBullet = (): Document =>
  buildDocument([
    {
      id: "check",
      type: "checkListItem",
      checked: true,
      content: [{ text: "t" }],
    },
    emptyBullet("divider-bullet", [dividerBlock("divider")]),
  ]);

describe("이슈 입력 두 가지의 NESTED_CHILDREN", () => {
  const CASES: ReadonlyArray<
    readonly [string, () => Document, string, string]
  > = [
    [
      "앞 형제가 checkListItem인 divider 항목",
      checkThenDividerBullet,
      "divider-bullet",
      "* [x] t\n\n- ---\n",
    ],
    [
      "빈 bulletListItem 3단 사슬",
      () => buildDocument([emptyBulletChain(3)]),
      "chain-1",
      "* * *\n",
    ],
  ];

  it.each(CASES)(
    "%s은 strict 내보내기를 NESTED_CHILDREN으로 거절한다",
    (_label, build, blockId) => {
      expect(exportMarkdown(build(), { mode: "strict" })).toEqual({
        ok: false,
        error: {
          code: "MARKDOWN_LOSS_NOT_ALLOWED",
          losses: [
            {
              kind: "NESTED_CHILDREN",
              blockId,
              message: expect.stringContaining(blockId),
            },
          ],
        },
      });
    },
  );

  it.each(CASES)(
    "%s은 lossy 내보내기가 경고를 내고 출력은 그대로다",
    (_label, build, blockId, markdown) => {
      expect(exportMarkdown(build(), { mode: "lossy" })).toEqual({
        ok: true,
        value: {
          markdown,
          warnings: [
            {
              kind: "NESTED_CHILDREN",
              blockId,
              message: expect.stringContaining(blockId),
            },
          ],
        },
      });
    },
  );

  it("두 모양의 메시지는 서로 다르고 각자의 원인을 적는다", () => {
    const [dividerLoss] = analyzeMarkdownLoss(checkThenDividerBullet());
    const [chainLoss] = analyzeMarkdownLoss(
      buildDocument([emptyBulletChain(3)]),
    );

    expect(dividerLoss?.message).toContain("divider");
    expect(chainLoss?.message).toContain("nested empty list items");
    expect(dividerLoss?.message).not.toBe(chainLoss?.message);
  });
});

describe("빈 bulletListItem 사슬의 보고 범위", () => {
  it("3단 사슬은 시작 블록 1건이다", () => {
    expect(nestedChildrenIds(buildDocument([emptyBulletChain(3)]))).toEqual([
      "chain-1",
    ]);
  });

  it("4단 사슬은 3단 이상이 시작되는 블록마다 2건이다", () => {
    expect(nestedChildrenIds(buildDocument([emptyBulletChain(4)]))).toEqual([
      "chain-1",
      "chain-2",
    ]);
  });

  it("목록 항목 안쪽의 3단 사슬도 보고한다", () => {
    const document = buildDocument([
      {
        id: "outer",
        type: "bulletListItem",
        content: [{ text: "바깥" }],
        children: [emptyBulletChain(3)],
      },
    ]);

    expect(nestedChildrenIds(document)).toEqual(["chain-1"]);
  });

  it("quote 안쪽의 3단 사슬도 보고한다", () => {
    const document = buildDocument([
      {
        id: "outer",
        type: "quote",
        content: [{ text: "인용" }],
        children: [emptyBulletChain(3)],
      },
    ]);

    expect(nestedChildrenIds(document)).toEqual(["chain-1"]);
  });

  it("사슬 첫 항목에 뒤따르는 형제 자식이 있어도 보고한다", () => {
    const document = buildDocument([
      emptyBullet("outer", [
        emptyBullet("mid", [emptyBullet("leaf")]),
        paragraphBlock("sibling", "형제"),
      ]),
    ]);

    expect(nestedChildrenIds(document)).toEqual(["outer"]);
  });

  it("앞 형제가 checkListItem이라 바깥 마커가 `-`인 3단 사슬도 보고한다", () => {
    const document = buildDocument([
      {
        id: "check",
        type: "checkListItem",
        checked: false,
        content: [{ text: "t" }],
      },
      emptyBulletChain(3),
    ]);

    expect(nestedChildrenIds(document)).toEqual(["chain-1"]);
  });

  it("빈 글자 런만 가진 항목도 빈 항목으로 보고 사슬에 센다", () => {
    const document = buildDocument([
      {
        id: "outer",
        type: "bulletListItem",
        content: [{ text: "" }],
        children: [
          {
            id: "mid",
            type: "bulletListItem",
            content: [{ text: "" }],
            children: [emptyBullet("leaf")],
          },
        ],
      },
    ]);

    expect(nestedChildrenIds(document)).toEqual(["outer"]);
  });
});

describe("divider 항목의 보고 범위", () => {
  it("앞 형제가 없는 divider 항목은 `* ---`로 안전하게 왕복해도 모양만 보고 거짓 경고한다", () => {
    const document = buildDocument([
      emptyBullet("divider-bullet", [dividerBlock("divider")]),
    ]);

    expect(lossyMarkdown(document)).toBe("* ---\n");
    expect(nestedChildrenIds(document)).toEqual(["divider-bullet"]);
  });

  it("앞 형제가 paragraph인 divider 항목도 모양만 보고 거짓 경고한다", () => {
    const document = buildDocument([
      paragraphBlock("host", "본문"),
      emptyBullet("divider-bullet", [dividerBlock("divider")]),
    ]);

    expect(nestedChildrenIds(document)).toEqual(["divider-bullet"]);
  });

  it("divider 뒤에 다른 자식이 있어도 첫 자식이 divider면 보고한다", () => {
    const document = buildDocument([
      emptyBullet("divider-bullet", [
        dividerBlock("divider"),
        paragraphBlock("after", "뒤"),
      ]),
    ]);

    expect(nestedChildrenIds(document)).toEqual(["divider-bullet"]);
  });
});

describe("새 경고를 내지 않는 모양", () => {
  it("2단 사슬(`* *`)은 보고하지 않는다", () => {
    expect(nestedChildrenIds(buildDocument([emptyBulletChain(2)]))).toEqual([]);
  });

  it("끝에 divider가 붙은 3단 사슬(`* * * ---`)은 사슬로는 보고하지 않는다", () => {
    const document = buildDocument([emptyBulletChain(3, dividerBlock("tail"))]);

    // 끝 항목(chain-3)은 divider 항목 판정으로 보고되고 사슬 시작 블록은 아니다.
    expect(nestedChildrenIds(document)).toEqual(["chain-3"]);
  });

  it("끝 항목에 글자가 있는 3단 사슬(`* * * x`)은 보고하지 않는다", () => {
    const document = buildDocument([
      emptyBullet("chain-1", [
        emptyBullet("chain-2", [
          {
            id: "chain-3",
            type: "bulletListItem",
            content: [{ text: "x" }],
          },
        ]),
      ]),
    ]);

    expect(nestedChildrenIds(document)).toEqual([]);
  });

  it("중간에 numberedListItem이 낀 사슬(`* 1. *`)은 보고하지 않는다", () => {
    const document = buildDocument([
      emptyBullet("chain-1", [
        {
          id: "chain-2",
          type: "numberedListItem",
          content: [],
          children: [emptyBullet("chain-3")],
        },
      ]),
    ]);

    expect(nestedChildrenIds(document)).toEqual([]);
  });

  it("3단 빈 quote(`> > >`)는 보고하지 않는다", () => {
    const quote = (id: string, children?: Block[]): Block => ({
      id,
      type: "quote",
      content: [],
      ...(children === undefined ? {} : { children }),
    });
    const document = buildDocument([quote("q1", [quote("q2", [quote("q3")])])]);

    expect(nestedChildrenIds(document)).toEqual([]);
  });

  it("numberedListItem의 divider 자식(`1. ---`)은 보고하지 않는다", () => {
    const document = buildDocument([
      {
        id: "numbered",
        type: "numberedListItem",
        content: [],
        children: [dividerBlock("divider")],
      },
    ]);

    expect(nestedChildrenIds(document)).toEqual([]);
  });

  it("quote의 divider 자식(`> ---`)은 보고하지 않는다", () => {
    const document = buildDocument([
      {
        id: "quote",
        type: "quote",
        content: [],
        children: [dividerBlock("divider")],
      },
    ]);

    expect(nestedChildrenIds(document)).toEqual([]);
  });

  it("내용이 있는 bulletListItem의 divider 자식은 보고하지 않는다", () => {
    const document = buildDocument([
      {
        id: "filled",
        type: "bulletListItem",
        content: [{ text: "본문" }],
        children: [dividerBlock("divider")],
      },
    ]);

    expect(nestedChildrenIds(document)).toEqual([]);
  });

  it("끝에 자식이 있는 사슬(끝 항목 아래 paragraph)은 사슬로 보고하지 않는다", () => {
    const document = buildDocument([
      emptyBullet("chain-1", [
        emptyBullet("chain-2", [
          emptyBullet("chain-3", [paragraphBlock("tail", "끝")]),
        ]),
      ]),
    ]);

    // chain-3은 빈 content + 첫 자식 paragraph라 기존 판정으로만 보고된다.
    expect(nestedChildrenIds(document)).toEqual(["chain-3"]);
  });
});

/**
 * id와 빈 children 키를 지우고 toggleListItem을 bulletListItem으로 낮춰 왕복 비교용
 * 의미만 남긴다. toggleListItem의 낮춤은 TOGGLE_STATE_LOST가 이미 보고하는 손실이라
 * 구조 어긋남으로 세지 않는다.
 */
const blockMeaning = (
  block: Document["blocks"][number],
): Record<string, unknown> => {
  const rest = Object.fromEntries(
    Object.entries(block)
      .filter(([key]) => key !== "id" && key !== "children")
      .map(([key, value]) =>
        key === "type" && value === "toggleListItem"
          ? [key, "bulletListItem"]
          : [key, value],
      ),
  );
  const children = (block as { children?: Document["blocks"] }).children;
  return children === undefined || children.length === 0
    ? rest
    : { ...rest, children: children.map(blockMeaning) };
};

/**
 * lossy 내보내기 뒤 재가져온 구조가 원본과 다른지 본다. 키 순서는 비교하지 않는다.
 */
const roundTripChangesStructure = (document: Document): boolean => {
  const imported = importMarkdown(lossyMarkdown(document));
  if (!imported.ok) throw new Error(imported.error.message);
  return !isDeepStrictEqual(
    imported.value.document.blocks.map(blockMeaning),
    document.blocks.map(blockMeaning),
  );
};

describe("왕복 대조 행렬: 구조가 어긋나는 입력은 NESTED_CHILDREN이 보고된다", () => {
  const PREVIOUS_SIBLINGS: ReadonlyArray<readonly [string, Block | undefined]> =
    [
      ["없음", undefined],
      ["paragraph", paragraphBlock("prev", "앞")],
      [
        "checkListItem",
        {
          id: "prev",
          type: "checkListItem",
          checked: true,
          content: [{ text: "앞" }],
        },
      ],
      [
        "bulletListItem",
        { id: "prev", type: "bulletListItem", content: [{ text: "앞" }] },
      ],
      [
        "numberedListItem",
        { id: "prev", type: "numberedListItem", content: [{ text: "앞" }] },
      ],
      [
        "toggleListItem",
        { id: "prev", type: "toggleListItem", content: [{ text: "앞" }] },
      ],
    ];

  const ITEM_SHAPES: ReadonlyArray<readonly [string, () => Block]> = [
    ["divider 자식", () => emptyBullet("item", [dividerBlock("divider")])],
    ["2단 사슬", () => emptyBulletChain(2)],
    ["3단 사슬", () => emptyBulletChain(3)],
    ["4단 사슬", () => emptyBulletChain(4)],
  ];

  const MATRIX = PREVIOUS_SIBLINGS.flatMap(([siblingLabel, sibling]) =>
    ITEM_SHAPES.map(([shapeLabel, build]) => ({
      label: `앞 형제 ${siblingLabel} x ${shapeLabel}`,
      document: buildDocument([
        ...(sibling === undefined ? [] : [sibling]),
        build(),
      ]),
    })),
  );

  it.each(MATRIX)(
    "$label: 구조가 어긋나면 NESTED_CHILDREN이 보고된다",
    ({ document }) => {
      // 앞 형제 toggleListItem은 늘 TOGGLE_STATE_LOST를 내므로 목록이 비었는지만
      // 보면 이 변경이 없어도 통과한다. 종류를 좁혀 확인한다.
      if (roundTripChangesStructure(document)) {
        expect(
          analyzeMarkdownLoss(document).map((loss) => loss.kind),
        ).toContain("NESTED_CHILDREN");
      }
    },
  );

  it("행렬에 실제로 구조가 어긋나는 입력이 있다(대조가 공회전하지 않는다)", () => {
    const broken = MATRIX.filter(({ document }) =>
      roundTripChangesStructure(document),
    );

    expect(broken.length).toBeGreaterThan(0);
  });

  it("앞 형제가 checkListItem인 divider 항목은 실제로 구조가 어긋난다", () => {
    expect(roundTripChangesStructure(checkThenDividerBullet())).toBe(true);
  });

  it("3단 사슬은 앞 형제와 무관하게 실제로 구조가 어긋난다", () => {
    expect(
      roundTripChangesStructure(buildDocument([emptyBulletChain(3)])),
    ).toBe(true);
  });
});
