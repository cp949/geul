/**
 * 독립 문서 모델의 저장용 텍스트 mark 정규 순서와 검증 계약을 확인한다.
 */
import { describe, expect, it } from "vitest";
import {
  canonicalizeTextMarks,
  isCanonicalTextMarks,
  parseDocument,
} from "../src/index.js";

describe("독립 문서 모델 - mark 정렬/검증", () => {
  it("저장용 mark를 모든 패키지가 공유하는 하나의 정규 순서로 정렬한다", () => {
    expect(
      canonicalizeTextMarks([
        { type: "underline" },
        { type: "italic" },
        { type: "code" },
        { type: "link", href: "https://example.com" },
        { type: "strike" },
        { type: "bold" },
      ]),
    ).toEqual([
      { type: "link", href: "https://example.com" },
      { type: "bold" },
      { type: "code" },
      { type: "italic" },
      { type: "strike" },
      { type: "underline" },
    ]);
  });

  it("동일한 mark는 중복을 제거해 멱등한 정규 배열로 만든다", () => {
    const once = canonicalizeTextMarks([
      { type: "underline" },
      { type: "bold" },
      { type: "bold" },
      { type: "link", href: "https://example.com" },
      { type: "link", href: "https://example.com" },
      { type: "underline" },
    ]);

    expect(once).toEqual([
      { type: "link", href: "https://example.com" },
      { type: "bold" },
      { type: "underline" },
    ]);
    expect(isCanonicalTextMarks(once)).toBe(true);
    expect(canonicalizeTextMarks(once)).toEqual(once);
  });

  it("충돌하는 link mark는 문서 검증이 판정하도록 그대로 남긴다", () => {
    const marks = canonicalizeTextMarks([
      { type: "link", href: "https://first.example" },
      { type: "link", href: "https://second.example" },
    ]);

    expect(marks).toHaveLength(2);
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "conflicting-links",
            type: "paragraph",
            content: [{ text: "links", marks }],
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 1],
      },
    });
  });

  it("정규 순서를 따르는 저장용 mark 배열만 허용한다", () => {
    const canonical = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "canonical-marks",
          type: "paragraph",
          content: [
            {
              text: "marked",
              marks: [
                { type: "link", href: "https://example.com" },
                { type: "bold" },
                { type: "code" },
                { type: "italic" },
                { type: "strike" },
                { type: "underline" },
              ],
            },
          ],
        },
      ],
    };

    expect(parseDocument(canonical)).toMatchObject({ ok: true });
    expect(
      parseDocument({
        ...canonical,
        blocks: [
          {
            ...canonical.blocks[0],
            content: [
              {
                text: "marked",
                marks: [
                  { type: "link", href: "https://example.com" },
                  { type: "bold" },
                  { type: "italic" },
                  { type: "underline" },
                  { type: "strike" },
                  { type: "code" },
                ],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 2],
      },
    });
  });
});
