/**
 * 커스텀 inline 원소(EXT-002)와 커스텀 text mark(EXT-003)의 envelope 검증과
 * zod 라우팅 계층을 검증한다. 알려진 8종 mark로의 라우팅 위임이 기존 에러
 * 품질을 그대로 보존하는지도 함께 고정한다(spec §4.2~§4.3,
 * docs/specs/2026-09-06-r4-extensibility-integration-parity-design.md).
 * Document/parseDocument와 기존 InlineContent는 아직 이 라우팅을 쓰지
 * 않는다 — document-custom-block.test.ts와 같은 설계 결정.
 */
import { describe, expect, it } from "vitest";

import type { DocumentError } from "../src/index.js";
import { parseDocument, parseInlineContentItem } from "../src/index.js";

describe("커스텀 inline 원소·text mark 라우팅", () => {
  it("type: custom인 원소는 CustomInlineContentItem으로 파싱되고 JSON round-trip을 보존한다", () => {
    const raw = {
      type: "custom",
      customType: "mention",
      props: { userId: "u1", label: "Alice" },
    };

    expect(parseInlineContentItem(raw)).toEqual({ ok: true, value: raw });
  });

  it("커스텀 원소의 props에 중첩 배열이 있으면 거절한다", () => {
    const result = parseInlineContentItem({
      type: "custom",
      customType: "mention",
      props: { tags: ["a", "b"] },
    });

    expect(result.ok).toBe(false);
  });

  it("커스텀 원소에 선언되지 않은 키가 있으면 거절한다", () => {
    const result = parseInlineContentItem({
      type: "custom",
      customType: "mention",
      extra: true,
    });

    expect(result.ok).toBe(false);
  });

  it("text 런은 기존과 동일하게 파싱된다(마크 없음)", () => {
    const raw = { text: "hello" };

    expect(parseInlineContentItem(raw)).toEqual({ ok: true, value: raw });
  });

  it("text 런의 marks에 알려진 mark(link)를 쓰면 기존과 동일하게 파싱된다", () => {
    const raw = { text: "hello", marks: [{ type: "link", href: "/a" }] };

    expect(parseInlineContentItem(raw)).toEqual({ ok: true, value: raw });
  });

  it("text 런의 marks에 알려지지 않은 mark type을 쓰면 CustomTextMark로 라우팅되어 성공한다", () => {
    const raw = {
      text: "hello",
      marks: [{ type: "highlight", props: { color: "yellow" } }],
    };

    expect(parseInlineContentItem(raw)).toEqual({ ok: true, value: raw });
  });

  it("CustomTextMark의 props가 JSON 원시값이 아니면 거절한다", () => {
    const result = parseInlineContentItem({
      text: "hello",
      marks: [{ type: "highlight", props: { nested: { a: 1 } } }],
    });

    expect(result.ok).toBe(false);
  });

  it("CustomTextMark에 선언되지 않은 키가 있으면 거절한다", () => {
    const result = parseInlineContentItem({
      text: "hello",
      marks: [{ type: "highlight", extra: 1 }],
    });

    expect(result.ok).toBe(false);
  });

  // 알려진 mark의 malformed 입력이 라우팅 도입 전(parseDocument 직접 경로)과
  // 동일한 에러를 내는지 나란히 비교한다. path는 parseDocument 쪽의
  // ["blocks", 0, "content", 0, ...] 접두사만 제거하면 완전히 같아야 한다.
  it("잘못된 link mark(href 누락)의 에러가 parseDocument와 동일하다", () => {
    const malformedTextRun = { text: "hello", marks: [{ type: "link" }] };

    const viaDocument = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "p1", type: "paragraph", content: [malformedTextRun] },
      ],
    });
    const viaItem = parseInlineContentItem(malformedTextRun);

    expect(viaDocument.ok).toBe(false);
    expect(viaItem.ok).toBe(false);
    if (viaDocument.ok || viaItem.ok) return;

    const documentError = (viaDocument as { ok: false; error: DocumentError })
      .error;
    const itemError = (viaItem as { ok: false; error: DocumentError }).error;

    expect(itemError).toEqual({
      ...documentError,
      path: documentError.path.slice(4),
    });
  });
});
