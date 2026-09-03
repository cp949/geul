/**
 * 독립 문서 모델의 저장용 텍스트 mark 정규 순서와 검증 계약을 확인한다.
 */
import { describe, expect, it } from "vitest";
import {
  canonicalizeTextMarks,
  isCanonicalTextMarks,
  parseDocument,
  sameMarks,
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

  it("textColor/backgroundColor를 기존 6종 뒤 정규 순서에 편입한다", () => {
    expect(
      canonicalizeTextMarks([
        { type: "backgroundColor", color: "#112233" },
        { type: "bold" },
        { type: "textColor", color: "#AABBCC" },
        { type: "underline" },
      ]),
    ).toEqual([
      { type: "bold" },
      { type: "underline" },
      { type: "textColor", color: "#AABBCC" },
      { type: "backgroundColor", color: "#112233" },
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

  it("textColor/backgroundColor mark는 정규 #RRGGBB 대문자 색상값과 함께 통과한다", () => {
    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "colored",
          type: "paragraph",
          content: [
            {
              text: "colored",
              marks: [
                { type: "textColor", color: "#AABBCC" },
                { type: "backgroundColor", color: "#112233" },
              ],
            },
          ],
        },
      ],
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    const block = result.value.blocks[0];
    if (block?.type !== "paragraph") throw new Error("Expected a paragraph");
    expect(block.content[0]?.marks).toEqual([
      { type: "textColor", color: "#AABBCC" },
      { type: "backgroundColor", color: "#112233" },
    ]);
  });

  it("textColor color가 소문자 #rrggbb면 거절한다", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "bad-color",
            type: "paragraph",
            content: [
              { text: "colored", marks: [{ type: "textColor", color: "#aabbcc" }] },
            ],
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 0, "color"],
      },
    });
  });

  it("같은 인라인 항목에 textColor 마크가 2개면 거절한다(타입당 최대 1개)", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "duplicate-text-color",
            type: "paragraph",
            content: [
              {
                text: "colored",
                marks: [
                  { type: "textColor", color: "#AABBCC" },
                  { type: "textColor", color: "#112233" },
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
        path: ["blocks", 0, "content", 0, "marks", 1],
      },
    });
  });
});

// io(inline-content.ts, cell-text.ts, import-html.ts, import-markdown.ts)와
// core(table-commands.ts)가 인접 동일 mark run 병합 여부를 각자
// JSON.stringify나 위치 비교로 재구현하다 두 곳이 순서에 취약해졌다 —
// sameMarks가 정규 순서로 맞춰 비교하는 단일 판정을 소유한다.
describe("sameMarks", () => {
  it("mark 순서만 다른 두 배열은 같다고 판정한다", () => {
    expect(
      sameMarks(
        [{ type: "bold" }, { type: "italic" }],
        [{ type: "italic" }, { type: "bold" }],
      ),
    ).toBe(true);
  });

  it("marks가 없는 쪽(undefined)과 빈 배열은 같다고 판정한다", () => {
    expect(sameMarks(undefined, [])).toBe(true);
    expect(sameMarks([], undefined)).toBe(true);
    expect(sameMarks(undefined, undefined)).toBe(true);
  });

  it("href가 다른 link mark는 다르다고 판정한다", () => {
    expect(
      sameMarks(
        [{ type: "link", href: "https://a.example" }],
        [{ type: "link", href: "https://b.example" }],
      ),
    ).toBe(false);
  });

  it("mark 종류나 개수가 다르면 다르다고 판정한다", () => {
    expect(
      sameMarks([{ type: "bold" }], [{ type: "bold" }, { type: "italic" }]),
    ).toBe(false);
  });

  it("중복 mark가 섞여 있어도 정규화 후 비교한다", () => {
    expect(
      sameMarks([{ type: "bold" }, { type: "bold" }], [{ type: "bold" }]),
    ).toBe(true);
  });
});
