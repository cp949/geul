/**
 * top-level CustomBlock(model, RD-002-DELTA-01)이 포함된 문서를 exportMarkdown에
 * 넣을 때의 계약을 확인한다. `customBlockToMarkdown`에 등록되지 않은 타입은
 * 신규 손실 카테고리 `CUSTOM_BLOCK_LOST`로 처리된다 — strict는 거절
 * (`MARKDOWN_LOSS_NOT_ALLOWED`), lossy는 그 block을 폐기하고 `warnings`에
 * 포함해 성공한다(spec §4.5, 기존 `MEDIA_TYPE_LOST`/`INLINE_COLOR`와 동일한
 * strict/lossy 이분법 재사용, RD-003). RD-002-DELTA-05/07이 도입한
 * `MARKDOWN_DOCUMENT_INVALID` 무조건 거절은 "RD-003이 나중에 진짜
 * CUSTOM_BLOCK_LOST 정책으로 교체한다"고 이미 예고해 둔 임시 정지 동작이었다
 * — 이 파일의 첫 `describe`가 그 교체 계약을 검증한다. 등록된 타입은 정상
 * 렌더된다(두 번째 `describe`). 뒤이은 세 번째 `describe`(RD-002-DELTA-16)는
 * `customBlockToMarkdown`과 무관하게 block **내부** inline 레벨 커스텀
 * 원소·CustomTextMark를 여전히 무조건 거절한다 — `customInlineContent`/
 * `customStyles`는 이 RD(RD-003) 범위 밖이다.
 */
import type { CustomBlock, Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { analyzeMarkdownLoss, exportMarkdown } from "../src/index.js";
import { buildDocument, paragraphBlock } from "./fixtures/quote-divider-document.js";

const widget = { id: "widget-1", type: "myWidget", content: "none" as const };

const documentWithCustomBlock: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [paragraphBlock("p1", "hi"), widget],
};

describe("CUSTOM_BLOCK_LOST: 미등록 top-level CustomBlock export 거절/폐기(RD-003)", () => {
  it("strict 모드에서 미등록 top-level CustomBlock이 있으면 MARKDOWN_LOSS_NOT_ALLOWED(CUSTOM_BLOCK_LOST 포함)를 반환한다", () => {
    const result = exportMarkdown(documentWithCustomBlock, { mode: "strict" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "CUSTOM_BLOCK_LOST",
            blockId: "widget-1",
            message: expect.stringContaining("myWidget"),
          },
        ],
      },
    });
  });

  it("lossy 모드에서는 미등록 top-level CustomBlock을 폐기하고 CUSTOM_BLOCK_LOST 경고와 함께 성공한다", () => {
    const result = exportMarkdown(documentWithCustomBlock, { mode: "lossy" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.markdown).not.toContain("myWidget");
    expect(result.value.warnings).toEqual([
      {
        kind: "CUSTOM_BLOCK_LOST",
        blockId: "widget-1",
        message: expect.stringContaining("myWidget"),
      },
    ]);
  });

  it("CustomBlock이 없는 기존 문서는 회귀 없이 그대로 export된다(양쪽 모드)", () => {
    const document = buildDocument([paragraphBlock("p1", "hi")]);

    expect(exportMarkdown(document, { mode: "strict" }).ok).toBe(true);
    expect(exportMarkdown(document, { mode: "lossy" }).ok).toBe(true);
  });

  it("analyzeMarkdownLoss는 customBlockTypes 없이 호출하면 top-level CustomBlock을 CUSTOM_BLOCK_LOST로 보고한다(안전한 기본값)", () => {
    expect(() => analyzeMarkdownLoss(documentWithCustomBlock)).not.toThrow();
    expect(analyzeMarkdownLoss(documentWithCustomBlock)).toEqual([
      {
        kind: "CUSTOM_BLOCK_LOST",
        blockId: "widget-1",
        message: expect.stringContaining("myWidget"),
      },
    ]);
  });

  it("analyzeMarkdownLoss는 customBlockTypes에 등록된 타입을 손실로 보고하지 않는다", () => {
    expect(
      analyzeMarkdownLoss(documentWithCustomBlock, new Set(["myWidget"])),
    ).toEqual([]);
  });
});

describe("customBlockToMarkdown: 등록된 CustomBlock 렌더(RD-003)", () => {
  const renderer = (block: CustomBlock): string =>
    `<div data-widget-id="${block.id}">rendered</div>`;

  it("strict 모드에서 등록된 렌더러의 출력이 raw HTML 블록으로 포함되고 손실이 없다", () => {
    const result = exportMarkdown(documentWithCustomBlock, {
      mode: "strict",
      customBlockToMarkdown: { myWidget: renderer },
    });

    expect(result).toEqual({
      ok: true,
      value: expect.stringContaining(
        '<div data-widget-id="widget-1">rendered</div>',
      ),
    });
  });

  it("lossy 모드에서도 등록된 렌더러의 출력이 포함되고 warnings가 비어 있다", () => {
    const result = exportMarkdown(documentWithCustomBlock, {
      mode: "lossy",
      customBlockToMarkdown: { myWidget: renderer },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.markdown).toContain(
      '<div data-widget-id="widget-1">rendered</div>',
    );
    expect(result.value.warnings).toEqual([]);
  });

  it("다른 타입만 등록돼 있으면 미등록 타입은 여전히 CUSTOM_BLOCK_LOST로 거절된다", () => {
    const result = exportMarkdown(documentWithCustomBlock, {
      mode: "strict",
      customBlockToMarkdown: { otherWidget: renderer },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "CUSTOM_BLOCK_LOST",
            blockId: "widget-1",
            message: expect.stringContaining("myWidget"),
          },
        ],
      },
    });
  });

  it("content:\"inline\" 모드 CustomBlock이 등록돼도 blocksInlineContentViolation에서 크래시하지 않는다", () => {
    const inlineWidget = {
      id: "widget-2",
      type: "myInlineWidget",
      content: "inline" as const,
    };
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [inlineWidget],
    };

    const result = exportMarkdown(document, {
      mode: "strict",
      customBlockToMarkdown: { myInlineWidget: renderer },
    });

    expect(result).toEqual({
      ok: true,
      value: expect.stringContaining(
        '<div data-widget-id="widget-2">rendered</div>',
      ),
    });
  });
});

describe("MARKDOWN_DOCUMENT_INVALID: inline-level 커스텀 원소·마크 export 거절(RD-002-DELTA-16)", () => {
  const documentWithCustomInline: Document = {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "p1",
        type: "paragraph",
        content: [{ type: "custom", customType: "myWidgetInline" }],
      },
    ],
  };

  const documentWithCustomMark: Document = {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "p1",
        type: "paragraph",
        content: [{ text: "hi", marks: [{ type: "myMark" }] }],
      },
    ],
  };

  it("strict 모드에서 인라인 레벨 커스텀 원소가 있으면 MARKDOWN_DOCUMENT_INVALID를 반환한다", () => {
    expect(exportMarkdown(documentWithCustomInline, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_DOCUMENT_INVALID",
        message: expect.stringContaining("myWidgetInline"),
      },
    });
  });

  it("lossy 모드에서도 인라인 레벨 커스텀 원소가 있으면 손실 경고 대신 MARKDOWN_DOCUMENT_INVALID를 반환한다", () => {
    expect(exportMarkdown(documentWithCustomInline, { mode: "lossy" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_DOCUMENT_INVALID",
        message: expect.stringContaining("myWidgetInline"),
      },
    });
  });

  it("미등록 CustomTextMark가 있으면 두 모드 모두 MARKDOWN_DOCUMENT_INVALID를 반환한다", () => {
    expect(exportMarkdown(documentWithCustomMark, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_DOCUMENT_INVALID",
        message: expect.stringContaining("myMark"),
      },
    });
    expect(exportMarkdown(documentWithCustomMark, { mode: "lossy" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_DOCUMENT_INVALID",
        message: expect.stringContaining("myMark"),
      },
    });
  });

  it("analyzeMarkdownLoss는 인라인 레벨 커스텀 원소를 크래시 없이 건너뛴다(exportMarkdown이 이미 거절을 전담)", () => {
    expect(() => analyzeMarkdownLoss(documentWithCustomInline)).not.toThrow();
    expect(analyzeMarkdownLoss(documentWithCustomInline)).toEqual([]);
  });

  it("analyzeMarkdownLoss는 미등록 CustomTextMark도 크래시 없이 건너뛴다", () => {
    expect(() => analyzeMarkdownLoss(documentWithCustomMark)).not.toThrow();
    expect(analyzeMarkdownLoss(documentWithCustomMark)).toEqual([]);
  });
});
