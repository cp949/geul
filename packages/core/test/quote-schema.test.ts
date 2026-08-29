/**
 * quote PM 노드의 스키마 계약을 고정한다 — blockContent 그룹 멤버로서
 * blockContainer(quote, blockGroup?) 포장이 스키마-유효함과, doc 직접
 * 멤버가 아님(컨테이너로만 감싸임)을 검증한다. 렌더링·파싱은 PM
 * DOMSerializer/DOMParser 레벨만 다룬다 — 변환기가 quote를 아직
 * 거절해(DELTA-04 소관) dispatch나 문서 삽입은 이 파일 범위 밖이다.
 */
import { DOMParser as PmDOMParser, DOMSerializer } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { liveSchema, requireNode } from "./editor-controller-support.js";

describe("quote 노드 스키마 계약", () => {
  it("quote는 blockContent 그룹이고 blockContainer(quote, blockGroup?)가 스키마-유효하다", () => {
    const schema = liveSchema();
    const quote = requireNode(schema, "quote");
    const doc = requireNode(schema, "doc");
    const blockGroup = requireNode(schema, "blockGroup");
    const blockContainer = requireNode(schema, "blockContainer");

    expect(blockContainer.contentMatch.matchType(quote)).not.toBeNull();
    expect(doc.contentMatch.matchType(quote)).toBeNull();
    expect(quote.isTextblock).toBe(true);
    expect(quote.contentMatch.matchType(blockGroup)).toBeNull();

    const blockGroupNode = blockGroup.createAndFill();
    if (blockGroupNode === null) throw new Error("blockGroup fill failed");

    expect(() =>
      blockContainer.createChecked(null, [quote.create(), blockGroupNode]),
    ).not.toThrow();
  });

  it("quote는 PM 레벨에서 blockquote로 렌더되고 blockquote를 quote로 파싱한다", () => {
    const schema = liveSchema();
    const quote = requireNode(schema, "quote");

    const dom = DOMSerializer.fromSchema(schema).serializeNode(
      quote.create(null, schema.text("x")),
    ) as HTMLElement;

    expect(dom.tagName).toBe("BLOCKQUOTE");
    expect(dom.textContent).toBe("x");

    const container = document.createElement("div");
    container.innerHTML = "<blockquote>x</blockquote>";

    const parsed = PmDOMParser.fromSchema(schema).parse(container);
    const quoteNodes: Array<{ textContent: string }> = [];
    parsed.descendants((node) => {
      if (node.type.name === "quote") quoteNodes.push(node);
      return true;
    });

    expect(quoteNodes).toHaveLength(1);
    expect(quoteNodes[0]?.textContent).toBe("x");
    expect(parsed.firstChild?.type.name).toBe("blockContainer");
    expect(parsed.firstChild?.firstChild?.type.name).toBe("quote");
  });
});
