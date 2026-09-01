/**
 * 토글 제목·토글 목록의 GFM 손실 분석(analyzeMarkdownLoss)을 직접 호출해
 * TOGGLE_STATE_LOST 판정을 검증한다(spec §7.2, RD-005 완료 조건 2번).
 * 손실 형상(strict 거절 shape·lossy 경고 배열)은 markdown-toggle-export.test.ts가
 * exportMarkdown을 통해 이미 검증한다 — 이 파일은 analyzeMarkdownLoss
 * 자체의 판정 경계(순서·회귀·재귀·collapsed 상태 무관)를 전담한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { analyzeMarkdownLoss } from "../src/index.js";

describe("토글 GFM 손실 분석(TOGGLE_STATE_LOST)", () => {
  it("toggle heading과 toggleListItem이 섞인 문서에서 순서대로 각각 손실을 보고한다", () => {
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
        { id: "p-1", type: "paragraph", content: [{ text: "일반 문단" }] },
        { id: "t-1", type: "toggleListItem", content: [{ text: "토글 목록" }] },
      ],
    };

    expect(analyzeMarkdownLoss(document)).toEqual([
      {
        kind: "TOGGLE_STATE_LOST",
        blockId: "h-1",
        message: expect.stringContaining("h-1"),
      },
      {
        kind: "TOGGLE_STATE_LOST",
        blockId: "t-1",
        message: expect.stringContaining("t-1"),
      },
    ]);
  });

  it("isToggleable이 아닌 heading·일반 목록 항목은 TOGGLE_STATE_LOST를 만들지 않는다(회귀)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "h-1",
          type: "heading",
          level: 2,
          content: [{ text: "일반 제목" }],
        },
        { id: "b-1", type: "bulletListItem", content: [{ text: "일반 목록" }] },
        {
          id: "n-1",
          type: "numberedListItem",
          content: [{ text: "번호 목록" }],
        },
        {
          id: "c-1",
          type: "checkListItem",
          checked: false,
          content: [{ text: "체크 목록" }],
        },
      ],
    };

    expect(analyzeMarkdownLoss(document)).toEqual([]);
  });

  it("다른 목록 항목의 children에 중첩된 toggleListItem도 재귀로 감지한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "b-1",
          type: "bulletListItem",
          content: [{ text: "부모" }],
          children: [
            {
              id: "t-1",
              type: "toggleListItem",
              content: [{ text: "중첩 토글" }],
            },
          ],
        },
      ],
    };

    expect(analyzeMarkdownLoss(document)).toEqual([
      {
        kind: "TOGGLE_STATE_LOST",
        blockId: "t-1",
        message: expect.stringContaining("t-1"),
      },
    ]);
  });

  it("collapsed 상태(true/false/undefined)와 무관하게 TOGGLE_STATE_LOST를 동일하게 보고한다", () => {
    const build = (collapsed: boolean | undefined): Document => ({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "t-1",
          type: "toggleListItem",
          content: [{ text: "토글" }],
          ...(collapsed === undefined ? {} : { collapsed }),
        },
      ],
    });

    const expected = [
      {
        kind: "TOGGLE_STATE_LOST",
        blockId: "t-1",
        message: expect.stringContaining("t-1"),
      },
    ];
    expect(analyzeMarkdownLoss(build(undefined))).toEqual(expected);
    expect(analyzeMarkdownLoss(build(true))).toEqual(expected);
    expect(analyzeMarkdownLoss(build(false))).toEqual(expected);
  });
});
