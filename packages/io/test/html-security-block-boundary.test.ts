/**
 * HTML import에서 지원하지 않는 블록 태그를 문단으로 강등하는 동작과
 * SAFE_BLOCK_DOWNGRADED 경고를 다룬다. html-security.test.ts에서 관심사
 * 단위로 분리했다(AGENTS.md: describe 직속 it 20개 이상 시 분리).
 */
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

describe("HTML 보안", () => {
  it("안전하지만 지원하지 않는 블록을 정화 후 강등하면 경고한다", () => {
    const result = importHtml("<aside>Loose <strong>text</strong></aside>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [
          { text: "Loose " },
          { text: "text", marks: [{ type: "bold" }] },
        ],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: "aside",
      }),
    ]);
  });

  // DELTA-03(Issue #72): clipboard 전용 sanitize 허용 목록에 h4~h6를
  // 추가해도 문서 import 공유 목록(htmlAllowedTagNames/htmlSanitizeSchema)은
  // 바뀌지 않는다 — importHtml에서 h4는 여전히 sanitize가 unwrap해
  // 문단으로 흡수되고 SAFE_BLOCK_DOWNGRADED 경고가 그대로 난다. 위 aside
  // 사례와 대칭인 회귀 방지 테스트다.
  it("importHtml은 h4를 여전히 문단으로 강등하고 SAFE_BLOCK_DOWNGRADED를 경고한다", () => {
    const result = importHtml("<h4>x</h4>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "x" }],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: "h4",
      }),
    ]);
  });

  // ce55f9f는 div/li/blockquote/ul/ol을 supportedBlockNames에 추가했지만
  // import-warnings.ts의 topLevel 판정은 그대로 두어 회귀가 생겼다 —
  // collectFromNodes가 div 자신은 지원 태그라 통과시키면서도 재귀 호출은
  // 항상 topLevel:false로 넘겨, div 안에 중첩된 미지원 태그(h4 등)가 더는
  // 어떤 경고도 받지 못했다(이전엔 최소한 div 자신이 오귀속으로라도
  // SAFE_BLOCK_DOWNGRADED를 냈다). isBlockBoundaryTag로 이 다섯 태그를
  // 통과할 때만 topLevel을 유지해 실제 원인 태그(h4)에 정확히 귀속된
  // 경고를 되살린다.
  it("div에 중첩된 h4도 SAFE_BLOCK_DOWNGRADED로 경고한다", () => {
    const result = importHtml("<div><h4>text</h4></div>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      { id: "html-1", type: "paragraph", content: [{ text: "text" }] },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: "h4",
      }),
    ]);
  });

  // 이미 지원하지 않는 태그(span) 자신이 경고를 낸 뒤에는 그 안에 중첩된
  // 내용까지 각각 다시 경고하지 않는다 — isBlockBoundaryTag는 div/li/
  // blockquote/ul/ol만 통과시키고, span처럼 애초에 미지원인 태그를 지나면
  // topLevel을 false로 낮춰 중복 경고를 막는다(기존 aside 사례와 같은
  // "하나의 경고로 대표한다" 관례).
  it("미지원 태그 안에 중첩된 내용은 중복 경고하지 않는다", () => {
    const result = importHtml("<div><span><h4>text</h4></span></div>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: "span",
      }),
    ]);
  });

  // Issue #113이 clipboard 경로(clipboard-table-parser.ts)의 div/li/
  // blockquote/ul/ol 문단 경계 인식을 고쳤을 때 HTML import 경로는 반영되지
  // 않아 남아 있었다 — sanitize가 이 다섯 태그를 unwrap해 인접 텍스트가
  // 구분자 없이 병합됐다(아키텍처 리뷰 2차 후보 G). documentFromRoot가
  // clipboard-table-parser.ts와 같은 재귀 경계 인식(block-segmenter.ts)을
  // 쓰도록 바꿔 더 이상 병합되지 않고, supportedBlockNames
  // (import-warnings.ts)도 함께 갱신해 SAFE_BLOCK_DOWNGRADED가 나지 않는다.
  it("div 두 개는 강등 경고 없이 각각 별도 문단이 된다", () => {
    const result = importHtml("<div>one</div><div>two</div>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      { id: "html-1", type: "paragraph", content: [{ text: "one" }] },
      { id: "html-2", type: "paragraph", content: [{ text: "two" }] },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it("ul/li로 감싼 인접 항목이 하나의 문단으로 뭉개지지 않는다(Issue #113 회귀의 import 경로 재현)", () => {
    const result = importHtml("<ul><li>one</li><li>two</li></ul>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      { id: "html-1", type: "paragraph", content: [{ text: "one" }] },
      { id: "html-2", type: "paragraph", content: [{ text: "two" }] },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it("blockquote와 중첩된 li도 강등 경고 없이 개별 문단 경계로 인식된다", () => {
    const result = importHtml(
      "<blockquote>quoted</blockquote><ul><li>outer<ul><li>inner</li></ul></li></ul>",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      { id: "html-1", type: "paragraph", content: [{ text: "quoted" }] },
      { id: "html-2", type: "paragraph", content: [{ text: "outer" }] },
      { id: "html-3", type: "paragraph", content: [{ text: "inner" }] },
    ]);
    expect(result.value.warnings).toEqual([]);
  });
});
