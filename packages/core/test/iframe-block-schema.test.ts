/**
 * iframe PM 노드의 스키마 계약을 고정한다(roadmap Issue #212 RD-002
 * DELTA-01, spec docs/specs/2026-09-19-iframe-block-design.md §3). media
 * 4종(media-block-schema.test.ts)과 동일한 비포장 atom 패턴이다 — content
 * 없는 atom leaf, group "block" 직접 멤버(blockContainer로 포장되지 않음),
 * div 렌더링과 data-geul-block-id 출력, parseHTML 미선언(G-EDT-003),
 * priority가 blockContainer보다 엄격히 낮다는 채움 우선순위 계약, attrs
 * 집합(media 4종 공통 attrs + previewWidth/textAlignment/showPreview +
 * aspectRatio).
 */
import { DOMSerializer } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { BlockContainerExtension } from "../src/block-container-extension.js";
import { IframeBlockExtension } from "../src/iframe-block-extension.js";
import { liveSchema, requireNode } from "./editor-controller-support.js";

describe("iframe 노드 스키마 계약", () => {
  it("atom·leaf이고 content expression이 없다", () => {
    const schema = liveSchema();
    const node = requireNode(schema, "iframe");

    expect(node.isAtom).toBe(true);
    expect(node.isLeaf).toBe(true);
    expect(node.spec.content).toBeUndefined();
  });

  it("doc과 blockGroup의 직접 자식으로 유효하고 blockContainer 안에는 들어갈 수 없다", () => {
    const schema = liveSchema();
    const node = requireNode(schema, "iframe");
    const doc = requireNode(schema, "doc");
    const blockGroup = requireNode(schema, "blockGroup");
    const blockContainer = requireNode(schema, "blockContainer");

    expect(doc.contentMatch.matchType(node)).not.toBeNull();
    expect(blockGroup.contentMatch.matchType(node)).not.toBeNull();
    expect(blockContainer.contentMatch.matchType(node)).toBeNull();
  });

  it("div로 렌더되고 data-geul-block-id를 낸다", () => {
    const schema = liveSchema();
    const node = requireNode(schema, "iframe");

    const dom = DOMSerializer.fromSchema(schema).serializeNode(
      node.create({ blockId: "iframe-1" }),
    ) as HTMLElement;

    expect(dom.tagName).toBe("DIV");
    expect(dom.getAttribute("data-geul-block-id")).toBe("iframe-1");
  });

  it("노드 spec에 parseDOM이 없다", () => {
    const schema = liveSchema();
    const node = requireNode(schema, "iframe");

    expect(node.spec.parseDOM).toBeUndefined();
  });

  it("addNodeView가 없다(declarative renderHTML만 쓴다, spec §1 정정)", () => {
    expect(IframeBlockExtension.config.addNodeView).toBeUndefined();
  });

  it("priority는 blockContainer보다 엄격히 낮다", () => {
    const containerPriority = BlockContainerExtension.config.priority;
    if (containerPriority === undefined) {
      throw new Error("blockContainer priority missing");
    }

    expect(IframeBlockExtension.config.priority).toBeLessThan(
      containerPriority,
    );
  });

  it("media 4종 공통 attrs와 previewWidth·textAlignment·showPreview·aspectRatio를 갖는다", () => {
    const schema = liveSchema();
    const node = requireNode(schema, "iframe");
    const attrNames = Object.keys(node.create().attrs);

    expect(attrNames.sort()).toEqual(
      [
        "aspectRatio",
        "backgroundColor",
        "blockId",
        "caption",
        "localPreviewFile",
        "localPreviewUrl",
        "name",
        "previewWidth",
        "showPreview",
        "textAlignment",
        "url",
      ].sort(),
    );
  });

  it("aspectRatio 기본값은 16:9다", () => {
    const schema = liveSchema();
    const node = requireNode(schema, "iframe");

    expect(node.create().attrs.aspectRatio).toBe("16:9");
  });
});
