/**
 * callout의 GFM export 산출 형상을 검증한다(Issue #209 RD-003 DELTA-02).
 * strict export는 CALLOUT_STATE_LOST로 거절하고, lossy export는 content를
 * 일반 문단으로 방출한다(icon·backgroundColor 폐기, 설계 §4).
 * markdown-toggle-export.test.ts와 동형이되, callout은 목록류가 아니라
 * children이 있으면 NESTED_CHILDREN도 함께 나는 지점이 다르다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown } from "../src/index.js";

describe("callout GFM export", () => {
  it("strict export가 CALLOUT_STATE_LOST로 거절한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [{ id: "c-1", type: "callout", content: [{ text: "안내" }] }],
    };
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "CALLOUT_STATE_LOST",
            blockId: "c-1",
            message: expect.stringContaining("c-1"),
          },
        ],
      },
    });
  });

  it("lossy export는 icon·backgroundColor를 버리고 일반 문단으로 방출한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "c-1",
          type: "callout",
          content: [{ text: "안내" }],
          icon: "💡",
          backgroundColor: "#FEF7E0",
        },
      ],
    };
    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value.markdown).toBe("안내\n");
    expect(exported.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "CALLOUT_STATE_LOST", blockId: "c-1" }),
        expect.objectContaining({ kind: "BLOCK_COLOR", blockId: "c-1" }),
      ]),
    );
  });

  it("children이 있는 callout은 NESTED_CHILDREN도 함께 보고하며 형제 문단으로 평탄화된다(목록류·quote와 다른 지점)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "c-1",
          type: "callout",
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
    expect(exported.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "CALLOUT_STATE_LOST", blockId: "c-1" }),
        expect.objectContaining({ kind: "NESTED_CHILDREN", blockId: "c-1" }),
      ]),
    );
    expect(exported.value.markdown).toBe("부모\n\n자식\n");
  });
});
