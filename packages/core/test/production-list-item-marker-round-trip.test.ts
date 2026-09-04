/**
 * production 편집기가 실제로 렌더링하는 목록류 4종 HTML을 io.importHtml에
 * 다시 통과시켜 왕복을 검증한다(Issue #38 슬라이스 10 RD-003 DELTA-02).
 * DELTA-01(io)이 hand-authored fixture로 미리 검증한 마커 인식·상태 매핑이
 * 실제 production 렌더 DOM에서도 그대로 성립하는지가 이 파일의 목적이다 —
 * createProductionEditor(공개 API 밖, ADR-0002 — createEditor가 내부적으로
 * ProductionEditorSession을 거쳐 이미 이 함수를 쓴다)로 실제 에디터를 만들고
 * getHTML()로 실제 렌더 DOM을 얻는다.
 */
import type { Block, Document } from "@cp949/geul-model";
import { importHtml } from "@cp949/geul-io";
import { describe, expect, it } from "vitest";

import { createProductionEditor } from "../src/production-editor-assembly.js";

// 문서가 childless paragraph로 끝나지 않으면 ensureTrailingParagraphOnLoad가
// createId로 새 blockContainer id를 발급해 trailing paragraph를 붙인다
// (trailing-block-extension.ts, UI-010 불변식) — 이 fixture는 매번 그
// trailing paragraph를 직접 명시해 예측 불가능한 새 id 발급을 피한다.
const TRAILING_ID = "trailing";

const documentOf = (...blocks: Block[]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [...blocks, { id: TRAILING_ID, type: "paragraph", content: [] }],
});

/** production 편집기로 문서를 로드하고 실제 렌더 HTML을 얻는다. */
function productionHtml(document: Document): string {
  const editor = createProductionEditor({
    document,
    createId: () => {
      throw new Error(
        "이 fixture는 trailing paragraph를 이미 포함해 새 id 발급이 없어야 한다",
      );
    },
    onUpdate: () => {},
    canApplyDocumentChange: () => true,
  });
  try {
    return editor.getHTML();
  } finally {
    editor.destroy();
  }
}

/** io.importHtml 결과에서 trailing paragraph를 떼어 원본 fixture와 비교한다. */
function importedBlocksWithoutTrailing(html: string): Document["blocks"] {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  const blocks = result.value.document.blocks;
  expect(blocks.at(-1)).toEqual({
    id: TRAILING_ID,
    type: "paragraph",
    content: [],
  });
  return blocks.slice(0, -1);
}

describe("production 목록류 렌더 DOM ↔ io.importHtml 왕복", () => {
  it("bulletListItem은 그대로 왕복한다", () => {
    const html = productionHtml(
      documentOf({
        id: "B",
        type: "bulletListItem",
        content: [{ text: "bullet" }],
      }),
    );

    expect(importedBlocksWithoutTrailing(html)).toEqual([
      { id: "B", type: "bulletListItem", content: [{ text: "bullet" }] },
    ]);
  });

  it("numberedListItem은 startNumber 없이도 왕복한다", () => {
    const html = productionHtml(
      documentOf({
        id: "N",
        type: "numberedListItem",
        content: [{ text: "num" }],
      }),
    );

    expect(importedBlocksWithoutTrailing(html)).toEqual([
      { id: "N", type: "numberedListItem", content: [{ text: "num" }] },
    ]);
  });

  it("numberedListItem은 startNumber 값을 왕복한다", () => {
    const html = productionHtml(
      documentOf({
        id: "N",
        type: "numberedListItem",
        content: [{ text: "num" }],
        startNumber: 3,
      }),
    );

    expect(importedBlocksWithoutTrailing(html)).toEqual([
      {
        id: "N",
        type: "numberedListItem",
        content: [{ text: "num" }],
        startNumber: 3,
      },
    ]);
  });

  it("checkListItem은 checked:false를 명시값으로 왕복한다", () => {
    const html = productionHtml(
      documentOf({
        id: "C",
        type: "checkListItem",
        content: [{ text: "check" }],
        checked: false,
      }),
    );

    expect(importedBlocksWithoutTrailing(html)).toEqual([
      {
        id: "C",
        type: "checkListItem",
        content: [{ text: "check" }],
        checked: false,
      },
    ]);
  });

  it("checkListItem은 checked:true를 왕복한다", () => {
    const html = productionHtml(
      documentOf({
        id: "C",
        type: "checkListItem",
        content: [{ text: "check" }],
        checked: true,
      }),
    );

    expect(importedBlocksWithoutTrailing(html)).toEqual([
      {
        id: "C",
        type: "checkListItem",
        content: [{ text: "check" }],
        checked: true,
      },
    ]);
  });

  it("toggleListItem은 collapsed 없이도 왕복한다", () => {
    const html = productionHtml(
      documentOf({
        id: "T",
        type: "toggleListItem",
        content: [{ text: "toggle" }],
      }),
    );

    expect(importedBlocksWithoutTrailing(html)).toEqual([
      { id: "T", type: "toggleListItem", content: [{ text: "toggle" }] },
    ]);
  });

  it("toggleListItem은 collapsed:true를 왕복한다", () => {
    const html = productionHtml(
      documentOf({
        id: "T",
        type: "toggleListItem",
        content: [{ text: "toggle" }],
        collapsed: true,
      }),
    );

    expect(importedBlocksWithoutTrailing(html)).toEqual([
      {
        id: "T",
        type: "toggleListItem",
        content: [{ text: "toggle" }],
        collapsed: true,
      },
    ]);
  });

  it("data-be-block-group 중첩 안의 목록류 부모+자식은 상태와 함께 왕복한다", () => {
    const html = productionHtml(
      documentOf({
        id: "P",
        type: "bulletListItem",
        content: [{ text: "parent" }],
        children: [
          {
            id: "C",
            type: "checkListItem",
            content: [{ text: "child" }],
            checked: true,
          },
        ],
      }),
    );

    expect(importedBlocksWithoutTrailing(html)).toEqual([
      {
        id: "P",
        type: "bulletListItem",
        content: [{ text: "parent" }],
        children: [
          {
            id: "C",
            type: "checkListItem",
            content: [{ text: "child" }],
            checked: true,
          },
        ],
      },
    ]);
  });
});
