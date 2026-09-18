/**
 * callout PM 노드의 스키마 계약을 고정한다 — blockContent 그룹 멤버로서
 * blockContainer(callout, blockGroup?) 포장이 스키마-유효함과, doc 직접
 * 멤버가 아님(컨테이너로만 감싸임), icon attrs 기본값을 검증한다. HTML
 * 표현(`data-geul-callout`)은 io 계층 소관이라(설계 §4) 이 PM 노드는
 * parseHTML/renderHTML을 선언하지 않는다 — list-item-extension.ts의 4종
 * 목록 항목과 동일 패턴(quote-schema.test.ts와 달리 DOM round-trip 없음).
 */
import { describe, expect, it } from "vitest";

import { liveSchema, requireNode } from "./editor-controller-support.js";

describe("callout 노드 스키마 계약", () => {
  it("callout은 blockContent 그룹이고 blockContainer(callout, blockGroup?)가 스키마-유효하다", () => {
    const schema = liveSchema();
    const callout = requireNode(schema, "callout");
    const doc = requireNode(schema, "doc");
    const blockGroup = requireNode(schema, "blockGroup");
    const blockContainer = requireNode(schema, "blockContainer");

    expect(blockContainer.contentMatch.matchType(callout)).not.toBeNull();
    expect(doc.contentMatch.matchType(callout)).toBeNull();
    expect(callout.isTextblock).toBe(true);
    expect(callout.contentMatch.matchType(blockGroup)).toBeNull();

    const blockGroupNode = blockGroup.createAndFill();
    if (blockGroupNode === null) throw new Error("blockGroup fill failed");

    expect(() =>
      blockContainer.createChecked(null, [callout.create(), blockGroupNode]),
    ).not.toThrow();
  });

  it("icon 속성은 기본값 null이고 문자열 값을 그대로 보존한다", () => {
    const schema = liveSchema();
    const callout = requireNode(schema, "callout");

    expect(callout.create().attrs).toEqual({ icon: null });
    expect(callout.create({ icon: "💡" }).attrs).toEqual({ icon: "💡" });
  });
});
