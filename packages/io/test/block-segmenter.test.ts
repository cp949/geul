/**
 * block-segmenter.ts가 소유하는 문단/헤딩/표 경계 재귀 판정을 직접
 * 검증한다. import-html.ts와 clipboard-table-parser.ts가 공유하는 재귀
 * walk라, 두 소비자의 통합 테스트(html-security.test.ts,
 * clipboard-mixed-content-block-boundary.test.ts)와 별개로 segmentBlocks
 * 자체를 이 파일에서 직접 검증한다. 정책은 두 소비자 중 어느 쪽에도
 * 치우치지 않은 최소 조합(p/h1~h6/div·li·blockquote/ul·ol/table)을 쓴다.
 */
import { describe, expect, it } from "vitest";

import {
  type BlockSegment,
  type BlockSegmentPolicy,
  NESTED_BOUNDARY_TAG_NAMES,
  isParagraphTag,
  isTransparentListTag,
  segmentBlocks,
} from "../src/html/block-segmenter.js";
import type { HtmlNode } from "../src/html/inline-content.js";
import { parseHtmlFragment } from "../src/html/parse-html.js";

const genericPolicy: BlockSegmentPolicy = {
  isSimpleBoundary: isParagraphTag,
  headingLevelFromTagName: (tagName) =>
    /^h[1-6]$/.test(tagName) ? Number(tagName[1]) : undefined,
  isNestedBoundary: (tagName) => NESTED_BOUNDARY_TAG_NAMES.has(tagName),
  isTransparent: isTransparentListTag,
  isTableNode: (node) => node.tagName === "table",
};

/**
 * HTML 조각을 파싱해 segmentBlocks(genericPolicy)에 그대로 넣는다. sanitize
 * 를 거치지 않으므로 이 파일의 입력은 두 소비자의 허용 목록과 무관하게
 * 재귀 판정만 검증한다.
 */
const segment = (html: string): BlockSegment[] => {
  const parsed = parseHtmlFragment(html);
  if (parsed === undefined) throw new Error("fixture 파싱 실패");
  return segmentBlocks(parsed.root.children, genericPolicy);
};

const textOf = (nodes: readonly HtmlNode[]): string =>
  nodes
    .map((node) =>
      node.type === "text"
        ? node.value
        : node.type === "element"
          ? textOf(node.children)
          : "",
    )
    .join("");

describe("segmentBlocks", () => {
  it("p 두 개를 각각 독립된 simpleBoundary 세그먼트로 낸다(요소 참조를 포함해 dataBeBlockId 등을 읽을 수 있게)", () => {
    const segments = segment("<p>one</p><p>two</p>");
    expect(segments.map((s) => s.kind)).toEqual([
      "simpleBoundary",
      "simpleBoundary",
    ]);
    expect(
      segments.map((s) => (s.kind === "simpleBoundary" ? textOf(s.nodes) : "")),
    ).toEqual(["one", "two"]);
    expect(
      segments.map((s) => (s.kind === "simpleBoundary" ? s.node.tagName : "")),
    ).toEqual(["p", "p"]);
  });

  it("h1~h6 태그의 레벨을 그대로 heading 세그먼트에 싣는다(다운그레이드는 호출자 몫)", () => {
    const segments = segment("<h1>a</h1><h4>b</h4>");
    expect(segments).toEqual([
      {
        kind: "heading",
        level: 1,
        node: expect.anything(),
        nodes: expect.any(Array),
      },
      {
        kind: "heading",
        level: 4,
        node: expect.anything(),
        nodes: expect.any(Array),
      },
    ]);
  });

  it("인접한 div 두 개가 구분자 없이 병합되지 않고 각각 분리된다", () => {
    const segments = segment("<div>one</div><div>two</div>");
    expect(segments.map((s) => s.kind)).toEqual(["paragraph", "paragraph"]);
    expect(
      segments.map((s) => (s.kind === "paragraph" ? textOf(s.nodes) : "")),
    ).toEqual(["one", "two"]);
  });

  it("ul/li로 감싼 인접 항목이 하나로 뭉개지지 않는다(Issue #113류 회귀)", () => {
    const segments = segment("<ul><li>one</li><li>two</li></ul>");
    expect(segments.map((s) => s.kind)).toEqual(["paragraph", "paragraph"]);
    expect(
      segments.map((s) => (s.kind === "paragraph" ? textOf(s.nodes) : "")),
    ).toEqual(["one", "two"]);
  });

  it("중첩된 li도 각 깊이의 경계를 개별 인식한다", () => {
    const segments = segment("<ul><li>outer<ul><li>inner</li></ul></li></ul>");
    expect(segments.map((s) => s.kind)).toEqual(["paragraph", "paragraph"]);
    expect(
      segments.map((s) => (s.kind === "paragraph" ? textOf(s.nodes) : "")),
    ).toEqual(["outer", "inner"]);
  });

  it("표 노드는 재귀하지 않고 표 세그먼트로 통째로 낸다", () => {
    const segments = segment(
      "<p>intro</p><table><tbody><tr><td>cell</td></tr></tbody></table>",
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ kind: "simpleBoundary" });
    const tableSegment = segments[1];
    expect(tableSegment?.kind).toBe("table");
    if (tableSegment?.kind === "table") {
      expect(tableSegment.node.tagName).toBe("table");
      expect(tableSegment.nonSectionChildren).toEqual([]);
    }
  });

  it("표 직속 비섹션 자식(caption)을 조상 마크를 씌운 채로 돌려준다", () => {
    const segments = segment(
      "<table><caption>Cap</caption><tbody><tr><td>a</td></tr></tbody></table>",
    );
    const tableSegment = segments[0];
    expect(tableSegment?.kind).toBe("table");
    if (tableSegment?.kind === "table") {
      expect(textOf(tableSegment.nonSectionChildren)).toBe("Cap");
    }
  });

  it("heading이 표를 자식으로 품으면 heading 취급을 접고 표를 보존한다", () => {
    const html =
      "<h1>before<table><tbody><tr><td>c</td></tr></tbody></table>after</h1>";
    const segments = segment(html);
    expect(segments.map((s) => s.kind)).toEqual([
      "paragraph",
      "table",
      "paragraph",
    ]);
  });

  it("임의 인라인 wrapper(span 등) 안에서도 인식된 블록 경계를 분리하고 조상을 보존한다", () => {
    const segments = segment("<span><div>a</div><div>b</div></span>");
    // span 자체는 정책에 없지만 안의 div는 경계다. 경계를 분리하면서도
    // 각 텍스트를 감싼 span 조상은 잃지 않는다.
    expect(segments.map((s) => s.kind)).toEqual(["paragraph", "paragraph"]);
    expect(
      segments.map((s) => (s.kind === "paragraph" ? textOf(s.nodes) : "")),
    ).toEqual(["a", "b"]);
    expect(
      segments.map((s) =>
        s.kind === "paragraph" && s.nodes[0]?.type === "element"
          ? s.nodes[0].tagName
          : "",
      ),
    ).toEqual(["span", "span"]);
  });
});
