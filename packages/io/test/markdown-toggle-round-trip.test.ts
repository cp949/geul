/**
 * 토글 제목·토글 목록의 GFM lossy export→import 왕복이 콘텐츠와 구조를
 * 보존하고(RD-005 완료 조건 3번), 인접한 bulletListItem·toggleListItem이
 * 별도 mdast list로 나뉘어도 재병합되지 않음을 검증한다.
 */
import type { Block, Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown, importMarkdown } from "../src/index.js";

type BlockMeaning = Record<string, unknown>;

/**
 * GFM이 보존하지 않는 안정 ID만 제거해 lossy round-trip 뒤 블록 계층과
 * 형제 순서를 원본과 비교할 수 있는 의미 표현을 만든다.
 */
const blockMeaning = (block: Block): BlockMeaning => {
  const withoutId = Object.fromEntries(
    Object.entries(block).filter(([key]) => key !== "id" && key !== "children"),
  );
  if (!("children" in block) || block.children === undefined) {
    return withoutId;
  }
  return {
    ...withoutId,
    children: block.children.map(blockMeaning),
  };
};

describe("토글 GFM lossy round-trip", () => {
  it("인접한 bulletListItem과 toggleListItem은 별도 mdast list로 나뉘어도 재병합되지 않는다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "b-1", type: "bulletListItem", content: [{ text: "일반" }] },
        { id: "t-1", type: "toggleListItem", content: [{ text: "토글" }] },
        { id: "b-2", type: "bulletListItem", content: [{ text: "일반2" }] },
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

    const imported = importMarkdown(exported.value.markdown);
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);
    expect(imported.value.warnings).toEqual([]);
    // 세 항목이 하나의 목록으로 재병합됐다면 여기가 단일 bulletListItem
    // 블록 안에 children 3개(또는 형제 3개가 아닌 다른 형상)로 나타난다 —
    // 형제 3개 그대로 유지되는지가 재병합 방지의 직접 증거다.
    expect(imported.value.document.blocks.map(blockMeaning)).toEqual([
      { type: "bulletListItem", content: [{ text: "일반" }] },
      { type: "bulletListItem", content: [{ text: "토글" }] },
      { type: "bulletListItem", content: [{ text: "일반2" }] },
    ]);
  });

  it("children이 있는 toggleListItem은 NESTED_CHILDREN 없이 목록 계층으로 GFM round-trip한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "t-1",
          type: "toggleListItem",
          content: [{ text: "부모" }],
          collapsed: true,
          children: [
            { id: "p-1", type: "paragraph", content: [{ text: "자식 문단" }] },
            {
              id: "b-1",
              type: "bulletListItem",
              content: [{ text: "손자 글머리" }],
            },
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

    const imported = importMarkdown(exported.value.markdown);
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);
    expect(imported.value.warnings).toEqual([]);
    expect(imported.value.document.blocks.map(blockMeaning)).toEqual([
      {
        type: "bulletListItem",
        content: [{ text: "부모" }],
        children: [
          { type: "paragraph", content: [{ text: "자식 문단" }] },
          { type: "bulletListItem", content: [{ text: "손자 글머리" }] },
        ],
      },
    ]);
  });

  it("toggle heading은 lossy export→import 후 일반 heading·children으로 콘텐츠를 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "h-1",
          type: "heading",
          level: 3,
          content: [{ text: "제목" }],
          isToggleable: true,
          collapsed: false,
          children: [
            { id: "p-1", type: "paragraph", content: [{ text: "본문" }] },
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

    const imported = importMarkdown(exported.value.markdown);
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);
    expect(imported.value.warnings).toEqual([]);
    expect(imported.value.document.blocks.map(blockMeaning)).toEqual([
      { type: "heading", level: 3, content: [{ text: "제목" }] },
      { type: "paragraph", content: [{ text: "본문" }] },
    ]);
  });
});
