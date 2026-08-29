/**
 * divider PM 노드의 스키마 계약을 고정한다 — content 없는 atom leaf, group
 * "block" 직접 멤버(blockContainer로 포장되지 않음), hr 렌더링과
 * data-be-block-id 출력, parseHTML 미선언(spec §4.2, G-EDT-003), 그리고
 * priority가 blockContainer보다 엄격히 낮다는 채움 우선순위 계약. 변환기가
 * 아직 divider를 거절해(DELTA-04 소관) 이 파일은 스키마·DOMSerializer
 * 레벨만 검증한다 — dispatch나 문서 삽입은 다루지 않는다.
 */
import { DOMSerializer } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { BlockContainerExtension } from "../src/block-container-extension.js";
import { DividerExtension } from "../src/divider-extension.js";
import { liveSchema, requireNode } from "./editor-controller-support.js";

describe("divider 노드 스키마 계약", () => {
  it("divider는 atom·leaf이고 content expression이 없다", () => {
    const schema = liveSchema();
    const divider = requireNode(schema, "divider");

    expect(divider.isAtom).toBe(true);
    expect(divider.isLeaf).toBe(true);
    expect(divider.spec.content).toBeUndefined();
  });

  it("divider는 doc과 blockGroup의 직접 자식으로 유효하고 blockContainer 안에는 들어갈 수 없다", () => {
    const schema = liveSchema();
    const divider = requireNode(schema, "divider");
    const doc = requireNode(schema, "doc");
    const blockGroup = requireNode(schema, "blockGroup");
    const blockContainer = requireNode(schema, "blockContainer");

    expect(doc.contentMatch.matchType(divider)).not.toBeNull();
    expect(blockGroup.contentMatch.matchType(divider)).not.toBeNull();
    expect(blockContainer.contentMatch.matchType(divider)).toBeNull();
  });

  it("divider는 blockGroup을 자식으로 가질 스키마 경로가 없다", () => {
    const schema = liveSchema();
    const divider = requireNode(schema, "divider");
    const blockGroup = requireNode(schema, "blockGroup");

    const blockGroupNode = blockGroup.createAndFill();
    if (blockGroupNode === null) throw new Error("blockGroup fill failed");

    expect(divider.contentMatch.matchType(blockGroup)).toBeNull();
    expect(() => divider.createChecked(null, [blockGroupNode])).toThrow();
  });

  it("divider는 hr로 렌더되고 data-be-block-id를 낸다", () => {
    const schema = liveSchema();
    const divider = requireNode(schema, "divider");

    const dom = DOMSerializer.fromSchema(schema).serializeNode(
      divider.create({ blockId: "d-1" }),
    ) as HTMLElement;

    expect(dom.tagName).toBe("HR");
    expect(dom.getAttribute("data-be-block-id")).toBe("d-1");
  });

  it("divider 노드 spec에 parseDOM이 없다", () => {
    const schema = liveSchema();
    const divider = requireNode(schema, "divider");

    expect(divider.spec.parseDOM).toBeUndefined();
  });

  it("divider priority는 blockContainer보다 엄격히 낮다", () => {
    // Tiptap 3.30.1 sortExtensions는 동률에서 stable sort로 확장 배열 선언
    // 순서를 유지하므로 동률(1000)은 채움 계약 테스트를 통과한다 — 여기서는
    // G-EDT-003 "새 그룹 멤버는 더 낮게"를 값으로 직접 고정한다.
    const containerPriority = BlockContainerExtension.config.priority;
    if (containerPriority === undefined) {
      throw new Error("blockContainer priority missing");
    }

    expect(DividerExtension.config.priority).toBeLessThan(containerPriority);
  });
});
