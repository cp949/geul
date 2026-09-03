/**
 * 독립 문서 모델의 블록 수준 `TextBlockProps`(textColor/backgroundColor/
 * textAlignment) 검증을 확인한다. 콘텐츠를 갖는 nestable 블록 7종
 * (paragraph/heading/quote/목록 4종) 공통 optional 필드이고, table/divider/
 * codeBlock에는 적용하지 않는다(spec §3.3).
 */
import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/index.js";

// 7개 nestable 타입 각각의 최소 필수 필드. TextBlockProps 3개는 각 케이스가
// 공통으로 덧붙인다.
const NESTABLE_BLOCK_CASES = [
  { type: "paragraph", extra: {} },
  { type: "heading", extra: { level: 2 } },
  { type: "quote", extra: {} },
  { type: "bulletListItem", extra: {} },
  { type: "numberedListItem", extra: {} },
  { type: "checkListItem", extra: { checked: false } },
  { type: "toggleListItem", extra: {} },
] as const;

describe("독립 문서 모델 - TextBlockProps 검증", () => {
  it.each(NESTABLE_BLOCK_CASES)(
    "$type 블록은 정규 textColor/backgroundColor/textAlignment를 그대로 보존한다",
    ({ type, extra }) => {
      const block = {
        id: `${type}-1`,
        type,
        content: [],
        textColor: "#AABBCC",
        backgroundColor: "#112233",
        textAlignment: "center" as const,
        ...extra,
      };

      const result = parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [block],
      });

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      expect(result.value.blocks[0]).toMatchObject({
        textColor: "#AABBCC",
        backgroundColor: "#112233",
        textAlignment: "center",
      });
    },
  );

  it("textColor가 소문자 #rrggbb면 거절한다", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "p-1",
            type: "paragraph",
            content: [],
            textColor: "#aabbcc",
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "textColor"] },
    });
  });

  it("backgroundColor가 #RRGGBB 형식이 아니면 거절한다", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "p-1",
            type: "paragraph",
            content: [],
            backgroundColor: "red",
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "backgroundColor"],
      },
    });
  });

  it("textAlignment가 left/center/right 밖이면 거절한다", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "p-1",
            type: "paragraph",
            content: [],
            textAlignment: "justify",
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "textAlignment"],
      },
    });
  });

  it.each(["table", "divider", "codeBlock"] as const)(
    "%s 블록에 textColor를 넣으면 거절한다(TextBlockProps 대상 아님)",
    (type) => {
      const base =
        type === "table"
          ? {
              id: "t-1",
              type,
              columns: [],
              rows: [],
              headerRows: 0 as const,
              headerColumns: 0 as const,
            }
          : type === "codeBlock"
            ? { id: "c-1", type, content: [] }
            : { id: "d-1", type };

      expect(
        parseDocument({
          formatVersion: 1,
          revision: 0,
          blocks: [{ ...base, textColor: "#AABBCC" }],
        }),
      ).toMatchObject({ ok: false, error: { code: "DOCUMENT_INVALID" } });
    },
  );
});
