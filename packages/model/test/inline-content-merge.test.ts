/**
 * appendOrMergeInlineItem의 push/merge 제어 흐름을 확인하는 테스트.
 * 빈 텍스트 스킵, 인접 동일 mark 병합, marks의 undefined/빈 배열 동등
 * 취급과 정규화, push 시 원본 참조를 보존하지 않는 계약을 함께 다룬다.
 * textColor/backgroundColor는 color 값까지 같아야 병합한다(Issue #331).
 */
import { describe, expect, it } from "vitest";
import type { InlineContent, TextMark } from "../src/index.js";
import { appendOrMergeInlineItem } from "../src/index.js";

describe("appendOrMergeInlineItem", () => {
  it("빈 텍스트는 무시한다", () => {
    const target: InlineContent = [];
    appendOrMergeInlineItem(target, "", [{ type: "bold" }]);
    expect(target).toEqual([]);
  });

  it("target이 비어 있으면 새 조각을 추가한다", () => {
    const target: InlineContent = [];
    appendOrMergeInlineItem(target, "hello", undefined);
    expect(target).toEqual([{ text: "hello" }]);
  });

  it("직전 조각과 mark 조합이 같으면 텍스트를 이어 붙인다", () => {
    const target: InlineContent = [{ text: "a", marks: [{ type: "bold" }] }];
    appendOrMergeInlineItem(target, "b", [{ type: "bold" }]);
    expect(target).toEqual([{ text: "ab", marks: [{ type: "bold" }] }]);
  });

  it("직전 조각과 mark 조합이 다르면 새 조각을 추가한다", () => {
    const target: InlineContent = [{ text: "a", marks: [{ type: "bold" }] }];
    appendOrMergeInlineItem(target, "b", [{ type: "italic" }]);
    expect(target).toEqual([
      { text: "a", marks: [{ type: "bold" }] },
      { text: "b", marks: [{ type: "italic" }] },
    ]);
  });

  it("undefined와 빈 배열을 같은 마크 없음으로 취급해 병합한다", () => {
    const target: InlineContent = [{ text: "a" }];
    appendOrMergeInlineItem(target, "b", []);
    expect(target).toEqual([{ text: "ab" }]);
  });

  it("marks를 정규 순서로 저장한다", () => {
    const target: InlineContent = [];
    const marks: TextMark[] = [{ type: "italic" }, { type: "bold" }];
    appendOrMergeInlineItem(target, "hi", marks);
    expect(target).toEqual([
      { text: "hi", marks: [{ type: "bold" }, { type: "italic" }] },
    ]);
  });

  it("push한 조각은 호출자가 넘긴 marks 배열을 그대로 참조하지 않는다", () => {
    const target: InlineContent = [];
    const marks: TextMark[] = [{ type: "bold" }];
    appendOrMergeInlineItem(target, "a", marks);
    marks.push({ type: "italic" });
    expect(target).toEqual([{ text: "a", marks: [{ type: "bold" }] }]);
  });

  it("textColor의 color가 다르면 병합하지 않고 새 조각을 추가한다", () => {
    const target: InlineContent = [
      { text: "a", marks: [{ type: "textColor", color: "#FF0000" }] },
    ];
    appendOrMergeInlineItem(target, "b", [
      { type: "textColor", color: "#0000FF" },
    ]);
    expect(target).toEqual([
      { text: "a", marks: [{ type: "textColor", color: "#FF0000" }] },
      { text: "b", marks: [{ type: "textColor", color: "#0000FF" }] },
    ]);
  });

  it("textColor의 color가 같으면 텍스트를 이어 붙인다", () => {
    const target: InlineContent = [
      { text: "a", marks: [{ type: "textColor", color: "#FF0000" }] },
    ];
    appendOrMergeInlineItem(target, "b", [
      { type: "textColor", color: "#FF0000" },
    ]);
    expect(target).toEqual([
      { text: "ab", marks: [{ type: "textColor", color: "#FF0000" }] },
    ]);
  });

  it("backgroundColor의 color가 다르면 병합하지 않고 새 조각을 추가한다", () => {
    const target: InlineContent = [
      { text: "a", marks: [{ type: "backgroundColor", color: "#FF0000" }] },
    ];
    appendOrMergeInlineItem(target, "b", [
      { type: "backgroundColor", color: "#0000FF" },
    ]);
    expect(target).toEqual([
      { text: "a", marks: [{ type: "backgroundColor", color: "#FF0000" }] },
      { text: "b", marks: [{ type: "backgroundColor", color: "#0000FF" }] },
    ]);
  });

  it("backgroundColor의 color가 같으면 텍스트를 이어 붙인다", () => {
    const target: InlineContent = [
      { text: "a", marks: [{ type: "backgroundColor", color: "#FF0000" }] },
    ];
    appendOrMergeInlineItem(target, "b", [
      { type: "backgroundColor", color: "#FF0000" },
    ]);
    expect(target).toEqual([
      { text: "ab", marks: [{ type: "backgroundColor", color: "#FF0000" }] },
    ]);
  });
});
