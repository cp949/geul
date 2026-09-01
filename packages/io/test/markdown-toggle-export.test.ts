/**
 * 토글 제목·토글 목록의 GFM export 산출 형상을 검증한다(RD-005 완료 조건
 * 2·3번). strict export는 TOGGLE_STATE_LOST로 거절하고, lossy export는
 * 콘텐츠를 보존한 채 접힘 정보만 버린다(spec §7.2).
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown } from "../src/index.js";

describe("토글 제목 GFM export", () => {
  it("strict export가 TOGGLE_STATE_LOST로 거절한다(children 없어도)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "h-1",
          type: "heading",
          level: 2,
          content: [{ text: "제목" }],
          isToggleable: true,
        },
      ],
    };
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "TOGGLE_STATE_LOST",
            blockId: "h-1",
            message: expect.stringContaining("h-1"),
          },
        ],
      },
    });
  });

  it("lossy export는 일반 heading으로 낮추고 TOGGLE_STATE_LOST를 기록한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "h-1",
          type: "heading",
          level: 2,
          content: [{ text: "제목" }],
          isToggleable: true,
          collapsed: true,
        },
      ],
    };
    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toEqual({
      markdown: "## 제목\n",
      warnings: [
        {
          kind: "TOGGLE_STATE_LOST",
          blockId: "h-1",
          message: expect.stringContaining("h-1"),
        },
      ],
    });
  });

  it("children이 있는 toggle heading은 NESTED_CHILDREN과 TOGGLE_STATE_LOST를 함께 기록한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "h-1",
          type: "heading",
          level: 2,
          content: [{ text: "제목" }],
          isToggleable: true,
          children: [
            { id: "p-1", type: "paragraph", content: [{ text: "자식" }] },
          ],
        },
      ],
    };
    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value.warnings).toEqual([
      {
        kind: "NESTED_CHILDREN",
        blockId: "h-1",
        message: expect.stringContaining("h-1"),
      },
      {
        kind: "TOGGLE_STATE_LOST",
        blockId: "h-1",
        message: expect.stringContaining("h-1"),
      },
    ]);
  });

  it("isToggleable이 아닌 heading은 손실을 만들지 않는다(회귀)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "h-1", type: "heading", level: 2, content: [{ text: "일반" }] },
      ],
    };
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "## 일반\n",
    });
  });
});

describe("토글 목록 GFM export", () => {
  it("strict export가 TOGGLE_STATE_LOST로 거절한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "t-1", type: "toggleListItem", content: [{ text: "항목" }] },
      ],
    };
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "TOGGLE_STATE_LOST",
            blockId: "t-1",
            message: expect.stringContaining("t-1"),
          },
        ],
      },
    });
  });

  it("lossy export는 checked 없는 일반 글머리 목록으로 낮춘다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "t-1",
          type: "toggleListItem",
          content: [{ text: "항목" }],
          collapsed: true,
        },
      ],
    };
    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toEqual({
      markdown: "* 항목\n",
      warnings: [
        {
          kind: "TOGGLE_STATE_LOST",
          blockId: "t-1",
          message: expect.stringContaining("t-1"),
        },
      ],
    });
  });

  it("children이 있는 toggleListItem은 NESTED_CHILDREN 없이 목록 계층으로 낮춘다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "t-1",
          type: "toggleListItem",
          content: [{ text: "부모" }],
          children: [
            { id: "p-1", type: "paragraph", content: [{ text: "자식" }] },
          ],
        },
      ],
    };
    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value.warnings).toEqual([
      {
        kind: "TOGGLE_STATE_LOST",
        blockId: "t-1",
        message: expect.stringContaining("t-1"),
      },
    ]);
    expect(exported.value.markdown).toBe("* 부모\n\n  자식\n");
  });
});
