/**
 * 커스텀 block(EXT-001)의 envelope 검증과 zod 라우팅 계층을 검증한다.
 * 알려진 14종 block으로의 라우팅 위임이 parseDocument와 동일한 에러
 * path·message를 유지하는지도 함께 고정한다(spec §4.2~§4.3,
 * docs/specs/2026-09-06-r4-extensibility-integration-parity-design.md).
 * Document/parseDocument는 top-level CustomBlock을 받는다(RD-002-DELTA-01) —
 * nested children으로 들어간 CustomBlock은 여전히 거절된다(top-level 전용,
 * RD-002-DELTA-01 "설계 결정" 1).
 */
import { describe, expect, it } from "vitest";

import type { DocumentError } from "../src/index.js";
import { parseBlockOrCustomBlock, parseDocument } from "../src/index.js";

describe("커스텀 block 라우팅", () => {
  it("알려지지 않은 type은 CustomBlock으로 라우팅되어 파싱되고 JSON round-trip을 보존한다", () => {
    const raw = {
      id: "widget-1",
      type: "myWidget",
      content: "none",
      props: { count: 3, label: "hello", enabled: true, note: null },
    };

    expect(parseBlockOrCustomBlock(raw)).toEqual({ ok: true, value: raw });
  });

  it("content는 inline도 허용한다", () => {
    const raw = { id: "widget-2", type: "myWidget", content: "inline" };

    expect(parseBlockOrCustomBlock(raw)).toEqual({ ok: true, value: raw });
  });

  it("content가 none/inline이 아니면 거절한다", () => {
    const result = parseBlockOrCustomBlock({
      id: "widget-3",
      type: "myWidget",
      content: "block",
    });

    expect(result.ok).toBe(false);
  });

  it("props에 중첩 객체가 있으면 거절한다", () => {
    const result = parseBlockOrCustomBlock({
      id: "widget-4",
      type: "myWidget",
      content: "none",
      props: { nested: { a: 1 } },
    });

    expect(result.ok).toBe(false);
  });

  it("props에 배열이 있으면 거절한다", () => {
    const result = parseBlockOrCustomBlock({
      id: "widget-5",
      type: "myWidget",
      content: "none",
      props: { list: [1, 2] },
    });

    expect(result.ok).toBe(false);
  });

  it("선언되지 않은 키가 있으면 거절한다", () => {
    const result = parseBlockOrCustomBlock({
      id: "widget-6",
      type: "myWidget",
      content: "none",
      unknownKey: true,
    });

    expect(result.ok).toBe(false);
  });

  it("알려진 14종 type은 blockSchema로 라우팅되어 기존과 동일하게 파싱된다", () => {
    const raw = { id: "p1", type: "paragraph", content: [{ text: "hi" }] };

    expect(parseBlockOrCustomBlock(raw)).toEqual({ ok: true, value: raw });
  });

  // 알려진 타입의 malformed 입력이 라우팅 도입 전(parseDocument 직접 경로)과
  // 동일한 에러를 내는지 나란히 비교한다 — path는 parseDocument 쪽의
  // ["blocks", 0, ...] 접두사만 제거하면 완전히 같아야 한다.
  const expectSameErrorAsParseDocument = (malformedBlock: unknown) => {
    const viaDocument = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [malformedBlock],
    });
    const viaBlock = parseBlockOrCustomBlock(malformedBlock);

    expect(viaDocument.ok).toBe(false);
    expect(viaBlock.ok).toBe(false);
    if (viaDocument.ok || viaBlock.ok) return;

    const documentError = (
      viaDocument as { ok: false; error: DocumentError }
    ).error;
    const blockError = (viaBlock as { ok: false; error: DocumentError })
      .error;

    expect(blockError).toEqual({
      ...documentError,
      path: documentError.path.slice(2),
    });
  };

  it("잘못된 paragraph(content 누락)의 에러가 parseDocument와 동일하다", () => {
    expectSameErrorAsParseDocument({ id: "p1", type: "paragraph" });
  });

  it("잘못된 divider(여분 키)의 에러가 parseDocument와 동일하다", () => {
    expectSameErrorAsParseDocument({
      id: "d1",
      type: "divider",
      extra: "x",
    });
  });

  it("잘못된 table(headerRows 값 위반)의 에러가 parseDocument와 동일하다", () => {
    expectSameErrorAsParseDocument({
      id: "t1",
      type: "table",
      columns: [{ id: "c1", width: 100 }],
      rows: [],
      headerRows: 2,
      headerColumns: 0,
    });
  });

  it("잘못된 CustomBlock(여분 키)의 에러가 parseDocument와 동일하다", () => {
    expectSameErrorAsParseDocument({
      id: "widget-2",
      type: "myWidget",
      extra: "x",
    });
  });
});

describe("Document 최상위 CustomBlock(RD-002-DELTA-01)", () => {
  it("top-level CustomBlock을 포함한 문서가 parseDocument로 파싱되고 JSON round-trip을 보존한다", () => {
    const widget = {
      id: "widget-1",
      type: "myWidget",
      content: "none",
      props: { count: 3 },
    };
    const raw = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "p1", type: "paragraph", content: [{ text: "hi" }] },
        widget,
      ],
    };

    const result = parseDocument(raw);

    expect(result).toEqual({ ok: true, value: raw });
  });

  it("top-level CustomBlock의 id가 다른 block의 id와 충돌하면 Duplicate id로 거절한다", () => {
    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "dup", type: "paragraph", content: [{ text: "hi" }] },
        { id: "dup", type: "myWidget", content: "none" },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 1, "id"],
        message: "Duplicate id: dup",
      },
    });
  });

  it("다른 block의 children에 중첩된 CustomBlock은 여전히 거절된다(top-level 전용)", () => {
    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          content: [{ text: "hi" }],
          children: [{ id: "widget-3", type: "myWidget", content: "none" }],
        },
      ],
    });

    expect(result.ok).toBe(false);
  });
});
