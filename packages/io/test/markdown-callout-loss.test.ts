/**
 * callout의 GFM 손실 분석(analyzeMarkdownLoss)을 직접 호출해
 * CALLOUT_STATE_LOST 판정을 검증한다(Issue #209 RD-003 DELTA-02, 설계
 * §4). 손실 형상(strict 거절 shape·lossy 경고 배열)은
 * markdown-callout-export.test.ts가 exportMarkdown을 통해 이미 검증한다 —
 * 이 파일은 analyzeMarkdownLoss 자체의 판정 경계(icon 유무·재귀)를
 * 전담한다(markdown-toggle-loss.test.ts와 동형).
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { analyzeMarkdownLoss } from "../src/index.js";

describe("callout GFM 손실 분석(CALLOUT_STATE_LOST)", () => {
  it("callout이 섞인 문서에서 그 블록만 손실을 보고한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "p-1", type: "paragraph", content: [{ text: "일반 문단" }] },
        { id: "c-1", type: "callout", content: [{ text: "안내" }] },
      ],
    };

    expect(analyzeMarkdownLoss(document)).toEqual([
      {
        kind: "CALLOUT_STATE_LOST",
        blockId: "c-1",
        message: expect.stringContaining("c-1"),
      },
    ]);
  });

  it("quote·목록·heading은 CALLOUT_STATE_LOST를 만들지 않는다(회귀)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "q-1", type: "quote", content: [{ text: "인용" }] },
        { id: "b-1", type: "bulletListItem", content: [{ text: "목록" }] },
        { id: "h-1", type: "heading", level: 2, content: [{ text: "제목" }] },
      ],
    };

    expect(analyzeMarkdownLoss(document)).toEqual([]);
  });

  it("다른 블록의 children에 중첩된 callout도 재귀로 감지한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "b-1",
          type: "bulletListItem",
          content: [{ text: "부모" }],
          children: [
            { id: "c-1", type: "callout", content: [{ text: "중첩 안내" }] },
          ],
        },
      ],
    };

    expect(analyzeMarkdownLoss(document)).toEqual([
      {
        kind: "CALLOUT_STATE_LOST",
        blockId: "c-1",
        message: expect.stringContaining("c-1"),
      },
    ]);
  });

  it("icon 유무(있음/없음)와 무관하게 CALLOUT_STATE_LOST를 동일하게 보고한다", () => {
    const build = (icon: string | undefined): Document => ({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "c-1",
          type: "callout",
          content: [{ text: "안내" }],
          ...(icon === undefined ? {} : { icon }),
        },
      ],
    });

    const expected = [
      {
        kind: "CALLOUT_STATE_LOST",
        blockId: "c-1",
        message: expect.stringContaining("c-1"),
      },
    ];
    expect(analyzeMarkdownLoss(build(undefined))).toEqual(expected);
    expect(analyzeMarkdownLoss(build("💡"))).toEqual(expected);
  });

  it("children 있는 callout은 CALLOUT_STATE_LOST와 NESTED_CHILDREN을 함께 보고한다(toggleListItem과 다른 지점 — callout은 목록류가 아니다)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "c-1",
          type: "callout",
          content: [{ text: "안내" }],
          children: [
            { id: "p-1", type: "paragraph", content: [{ text: "자식" }] },
          ],
        },
      ],
    };

    expect(analyzeMarkdownLoss(document)).toEqual(
      expect.arrayContaining([
        {
          kind: "CALLOUT_STATE_LOST",
          blockId: "c-1",
          message: expect.any(String),
        },
        {
          kind: "NESTED_CHILDREN",
          blockId: "c-1",
          message: expect.any(String),
        },
      ]),
    );
    expect(analyzeMarkdownLoss(document)).toHaveLength(2);
  });
});
