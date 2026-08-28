/**
 * HTML import에서 지원하지 않는 블록 태그를 문단으로 강등하는 동작과
 * SAFE_BLOCK_DOWNGRADED 경고를 다룬다. html-security.test.ts에서 관심사
 * 단위로 분리했다(AGENTS.md: describe 직속 it 20개 이상 시 분리).
 */
import { MAX_NESTING_DEPTH } from "@cp949/geul-model";
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

// DELTA-04(children 재귀 왕복): import-html.ts의 blocksFromNodes가
// exportHtml의 children wrapper(<div data-be-block-id><p/>
// <div data-be-children>...)를 재귀적으로 벗겨 children을 복원한다. 이
// 재귀는 model의 findNestingDepthViolation(schema.ts)과 같은 모양의 깊이
// 카운터로 스스로를 depth <= MAX_NESTING_DEPTH일 때만 더 내려가도록
// 막는다(G-CNV-001, block-segmenter.ts는 고치지 않는다). exportHtml은
// parseDocument가 문서 생성 단계에서 이미 깊이를 막아 65단 이상인 Document를
// 애초에 만들 수 없으므로, buildNestedWrapperHtml은 손으로 조작한(정상
// exportHtml로는 나올 수 없는) 매우 깊은 wrapper 체인 HTML 문자열로
// documentFromRoot를 직접 공격하는 시나리오를 재현한다. 가장 안쪽은 내용을
// 비워(children 없음) wrapper 레벨 수가 곧 만들어지는 blocks 배열 중첩
// 깊이(model 기준 depth)와 1:1로 맞도록 한다.
const buildNestedWrapperHtml = (levels: number): string => {
  let html = "";
  for (let level = levels; level >= 1; level -= 1) {
    html = `<div data-be-block-id="b${level}"><p data-be-block-id="p${level}">t${level}</p><div data-be-children="1">${html}</div></div>`;
  }
  return html;
};

describe("재귀 스택 안전(PIT-0034)", () => {
  it(`children 중첩이 MAX_NESTING_DEPTH(${MAX_NESTING_DEPTH})까지는 통과한다`, () => {
    const result = importHtml(buildNestedWrapperHtml(MAX_NESTING_DEPTH));
    expect(result.ok).toBe(true);
  });

  // 변이: blocksFromNodes의 depth 가드(depth <= MAX_NESTING_DEPTH일 때만
  // wrapper를 인식)를 지우면 이 입력도 끝까지 재귀 해제해 실제 깊이
  // 그대로(MAX_NESTING_DEPTH + 1) 문서를 완성한다 — parseDocument의 기존
  // DOCUMENT_LIMIT_EXCEEDED 검증이 이 depth에서는 가드 유무와 무관하게
  // 동일한 결과 코드로 거절하므로, 이 테스트는 "가드가 있음"이 아니라
  // "이 depth-counter 설계가 정확히 model의 상한과 맞물려 있다"는
  // 완료 조건 4의 관측 가능한 결과(HTML_DOCUMENT_INVALID)를 고정한다.
  it(`children 중첩이 MAX_NESTING_DEPTH(${MAX_NESTING_DEPTH})를 한 단계라도 넘으면 HTML_DOCUMENT_INVALID로 거절한다`, () => {
    const result = importHtml(buildNestedWrapperHtml(MAX_NESTING_DEPTH + 1));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("HTML_DOCUMENT_INVALID");
  });

  // 완료 조건 4(관측 가능한 계약만 고정, 정정): 매우 깊게 중첩된(수천 단계)
  // wrapper HTML을 import해도 RangeError가 호출자 밖으로 새지 않고
  // 구조화된 Result 오류를 반환한다. wall-clock/timeout이 아니라 "던지지
  // 않는다"와 "ok:false다"라는 결정적 조건으로만 판정한다(PIT-0034).
  //
  // **주의(즉시 리뷰 발견, 정정)**: 이 depth(3000)에서 실제로는 내부적으로
  // RangeError가 발생한다 — blocksFromNodes의 depth 가드는 depth 65부터
  // wrapper 인식을 멈추고 나머지를 plainRun으로 넘기지만, 그 뒤
  // segmentBlocks(block-segmenter.ts의 walk)가 깊이 제한 없이 재귀해 이
  // 깊이에서 RangeError를 던진다(일반 <div> 중첩만으로도 동일하게
  // 재현되는, 이 DELTA 이전부터 있던 동작 — wrapper 구조와 무관). 이
  // 테스트가 여전히 통과하는 이유는 이 depth 가드가 아니라 importHtml의
  // 기존 최외곽 catch(모든 예외를 HTML_PARSE_FAILED로 흡수)다. 그래서
  // 이 테스트는 "신규 depth-counter가 스택을 지킨다"가 아니라 "그 경우에도
  // 공개 API 계약(크래시 비유출)은 성립한다"만 고정한다 — 방어 자체가
  // 결정적이지 않다는 사실은 pending-issues/09.md(block-segmenter.ts의
  // walk 무제한 재귀, 이 DELTA 범위 밖)로 분리했다.
  it("매우 깊게 중첩된(수천 단계) wrapper HTML을 import해도 크래시 없이 구조화된 Result 오류를 반환한다", () => {
    const veryDeepHtml = buildNestedWrapperHtml(3000);

    expect(() => importHtml(veryDeepHtml)).not.toThrow();

    const result = importHtml(veryDeepHtml);
    expect(result.ok).toBe(false);
  });
});
