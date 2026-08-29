/**
 * CodeBlock 저장 정규형과 source·language 검증을 확인한다.
 * 일반 인라인 텍스트와 다른 Tab 허용 경계, strict leaf 형상도 함께 고정한다.
 */
import { describe, expect, it } from "vitest";

import { parseDocument } from "../src/index.js";

/**
 * 단일 블록 fixture를 저장 문서 봉투로 감싼다.
 * 각 테스트가 CodeBlock 형상과 값만 드러내도록 공통 필드를 한곳에 둔다.
 */
const documentOf = (block: unknown) => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

/**
 * 검증하려는 필드만 덮어쓸 수 있는 기본 CodeBlock 입력을 만든다.
 */
const codeBlock = (overrides: Record<string, unknown> = {}) => ({
  id: "code-1",
  type: "codeBlock",
  content: [],
  ...overrides,
});

/**
 * 금지된 leaf children 안에서도 깊이 pre-pass가 먼저 오분류하는지 확인할
 * 수 있도록 지정한 깊이의 paragraph 사슬을 만든다.
 */
const nestedParagraphChain = (depth: number): unknown => {
  let block: unknown = {
    id: `nested-${depth}`,
    type: "paragraph",
    content: [],
  };
  for (let current = depth - 1; current >= 1; current -= 1) {
    block = {
      id: `nested-${current}`,
      type: "paragraph",
      content: [],
      children: [block],
    };
  }
  return block;
};

type ParentBlockType = "paragraph" | "heading" | "quote";

/**
 * CodeBlock을 중첩할 수 있는 세 container 형상을 같은 fixture로 만든다.
 */
const parentBlock = (type: ParentBlockType, child: unknown) => ({
  id: `parent-${type}`,
  type,
  ...(type === "heading" ? { level: 1 } : {}),
  content: [],
  children: [child],
});

describe("CodeBlock 저장 정규형", () => {
  it("빈 source와 단일 source run을 정규형으로 허용한다", () => {
    const empty = documentOf(codeBlock());
    const source = 'const value = `a < b && b > c`;\n\treturn "\'&<>";  ';
    const nonEmpty = documentOf(codeBlock({ content: [{ text: source }] }));

    expect(parseDocument(empty)).toEqual({ ok: true, value: empty });
    expect(parseDocument(nonEmpty)).toEqual({ ok: true, value: nonEmpty });
  });

  it("빈 text run과 복수 run을 DOCUMENT_INVALID로 거절한다", () => {
    expect(
      parseDocument(documentOf(codeBlock({ content: [{ text: "" }] }))),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "text"],
      },
    });

    expect(
      parseDocument(
        documentOf(codeBlock({ content: [{ text: "a" }, { text: "b" }] })),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "content"] },
    });
  });

  it("content의 marks key를 빈 배열도 포함해 DOCUMENT_INVALID로 거절한다", () => {
    for (const marks of [[], [{ type: "bold" }]]) {
      expect(
        parseDocument(
          documentOf(codeBlock({ content: [{ text: "source", marks }] })),
        ),
      ).toMatchObject({
        ok: false,
        error: {
          code: "DOCUMENT_INVALID",
          path: ["blocks", 0, "content", 0],
        },
      });
    }
  });

  it("children과 미선언 필드를 DOCUMENT_INVALID로 거절한다", () => {
    expect(
      parseDocument(
        documentOf(
          codeBlock({
            children: [{ id: "child", type: "paragraph", content: [] }],
          }),
        ),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
    });

    expect(
      parseDocument(documentOf(codeBlock({ unexpected: true }))),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
    });

    expect(
      parseDocument(
        documentOf(
          codeBlock({ content: [{ text: "source", unexpected: true }] }),
        ),
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0],
      },
    });
  });

  it("깊은 children이 붙은 CodeBlock도 leaf 형상 위반으로 먼저 거절한다", () => {
    expect(
      parseDocument(
        documentOf(codeBlock({ children: [nestedParagraphChain(65)] })),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
    });
  });
});

describe("CodeBlock source 문자", () => {
  it("정상 surrogate pair가 있는 source를 그대로 보존한다", () => {
    const input = documentOf(
      codeBlock({ content: [{ text: "const face = '😀';" }] }),
    );

    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });

  it("LF와 Tab을 제외한 모든 C0 문자를 DOCUMENT_INVALID로 거절한다", () => {
    for (let codePoint = 0; codePoint <= 0x1f; codePoint += 1) {
      if (codePoint === 0x09 || codePoint === 0x0a) continue;
      const source = `before${String.fromCharCode(codePoint)}after`;

      expect(
        parseDocument(documentOf(codeBlock({ content: [{ text: source }] }))),
      ).toMatchObject({
        ok: false,
        error: {
          code: "DOCUMENT_INVALID",
          path: ["blocks", 0, "content", 0, "text"],
        },
      });
    }
  });

  it.each([
    ["DEL", "before\u007fafter"],
    ["짝 없는 high surrogate", `before${String.fromCharCode(0xd800)}after`],
    ["짝 없는 low surrogate", `before${String.fromCharCode(0xdfff)}after`],
  ])("%s를 DOCUMENT_INVALID로 거절한다", (_name, source) => {
    expect(
      parseDocument(documentOf(codeBlock({ content: [{ text: source }] }))),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "text"],
      },
    });
  });

  it("일반 inline text는 Tab을 계속 거절한다", () => {
    expect(
      parseDocument(
        documentOf({
          id: "paragraph-1",
          type: "paragraph",
          content: [{ text: "before\tafter" }],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "text"],
      },
    });
  });
});

describe("CodeBlock language 검증", () => {
  it("language 미지정은 property 부재를 유지한다", () => {
    const input = documentOf(codeBlock({ content: [{ text: "source" }] }));

    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });

  it("알려진 alias는 canonical ID로 바꾸고 알 수 없는 language는 exact 보존한다", () => {
    const known = documentOf(codeBlock({ language: " JS " }));
    const unknown = documentOf(codeBlock({ language: " HTML " }));

    expect(parseDocument(known)).toEqual({
      ok: true,
      value: documentOf(codeBlock({ language: "javascript" })),
    });
    expect(parseDocument(unknown)).toEqual({ ok: true, value: unknown });
  });

  it.each(["😀", "   "])(
    "정상 surrogate pair와 공백만 있는 unknown language %s를 exact 보존한다",
    (language) => {
      const input = documentOf(codeBlock({ language }));

      expect(parseDocument(input)).toEqual({ ok: true, value: input });
    },
  );

  it.each([
    ["빈 문자열", ""],
    ["NUL", "java\u0000script"],
    ["LF", "java\nscript"],
    ["DEL", "java\u007fscript"],
    ["짝 없는 surrogate", `java${String.fromCharCode(0xd800)}script`],
  ])("%s language를 DOCUMENT_INVALID로 거절한다", (_name, language) => {
    expect(parseDocument(documentOf(codeBlock({ language })))).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "language"],
      },
    });
  });
});

describe("중첩된 CodeBlock 검증", () => {
  it.each<ParentBlockType>(["paragraph", "heading", "quote"])(
    "%s children의 known alias를 canonical ID로 정규화한다",
    (type) => {
      const input = documentOf(
        parentBlock(type, codeBlock({ language: " JS " })),
      );
      const expected = documentOf(
        parentBlock(type, codeBlock({ language: "javascript" })),
      );

      expect(parseDocument(input)).toEqual({ ok: true, value: expected });
    },
  );

  it.each<ParentBlockType>(["paragraph", "heading", "quote"])(
    "%s children의 금지 source를 정확한 nested path로 거절한다",
    (type) => {
      expect(
        parseDocument(
          documentOf(
            parentBlock(
              type,
              codeBlock({ content: [{ text: "bad\u0000source" }] }),
            ),
          ),
        ),
      ).toMatchObject({
        ok: false,
        error: {
          code: "DOCUMENT_INVALID",
          path: ["blocks", 0, "children", 0, "content", 0, "text"],
        },
      });
    },
  );

  it.each<ParentBlockType>(["paragraph", "heading", "quote"])(
    "%s children의 금지 language를 정확한 nested path로 거절한다",
    (type) => {
      expect(
        parseDocument(
          documentOf(parentBlock(type, codeBlock({ language: "bad\nlang" }))),
        ),
      ).toMatchObject({
        ok: false,
        error: {
          code: "DOCUMENT_INVALID",
          path: ["blocks", 0, "children", 0, "language"],
        },
      });
    },
  );
});
