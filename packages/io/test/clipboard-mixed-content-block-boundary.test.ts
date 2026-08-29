/**
 * 클립보드 HTML 혼합 콘텐츠에서 어떤 태그가 문단/표 경계로 인식되는지
 * 검증한다 — heading(h1~h6, DELTA-03/Issue #72)과 div/li/blockquote,
 * ul/ol wrapper(Issue #113)가 이 파일의 관심사다. 표 앞뒤 문단 시퀀싱,
 * 레이아웃 표 래퍼, 마크 보존 등 나머지 혼합 콘텐츠 케이스는
 * `clipboard-mixed-content.test.ts`가 다룬다(원래 그 파일 하나였는데 20개를
 * 넘겨 관심사 단위로 나눴다 — 순수 이동, Issue #113).
 * `parseClipboardTable`의 나머지 케이스는 `clipboard-table-parser.test.ts`가
 * 다룬다(파일 분할은 Issue #68).
 */
import { describe, expect, it } from "vitest";
import type { ClipboardContentBlock } from "../src/clipboard/clipboard-content.js";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";

const TABLE = "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>";

// TABLE 리터럴이 파싱된 결과(columnCount 2, 셀 "a"/"b")를 그대로 고정한다.
// heading 분리를 확인하는 테스트들이 표 블록까지 함께 toEqual로 단언할 때
// 반복 정의를 피하려고 여기서 한 번만 만든다.
const TABLE_BLOCK: ClipboardContentBlock = {
  type: "table",
  data: {
    columnCount: 2,
    rows: [
      {
        cells: [
          {
            columnIndex: 0,
            rowSpan: 1,
            columnSpan: 1,
            content: [{ text: "a" }],
          },
          {
            columnIndex: 1,
            rowSpan: 1,
            columnSpan: 1,
            content: [{ text: "b" }],
          },
        ],
      },
    ],
  },
};

describe("parseClipboardTable 혼합 콘텐츠 시퀀스 변환", () => {
  // DELTA-03(Issue #72): blockSequenceFromNodes가 h1~h3를 heading 블록
  // 경계로 인식한다. Issue #37 재발 방지 — toContainText 등 부분 문자열
  // 단언은 인접 블록 병합을 감춘다(spec §4.1 '정정(2026-08-21 리뷰)').
  // 배열 전체를 toEqual로 단언해 3원소(heading×2 + table)를 고정한다.
  it("h1~h3 heading과 표가 섞이면 각각 정확히 분리된다", () => {
    const result = parseClipboardTable({
      html: "<h1>A</h1><h2>B</h2>" + TABLE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { type: "heading", level: 1, content: [{ text: "A" }] },
      { type: "heading", level: 2, content: [{ text: "B" }] },
      TABLE_BLOCK,
    ]);
  });

  // h4~h6는 model HeadingBlock.level이 1~6으로 확장돼(Issue #38 슬라이스
  // 3, DELTA-04) 더 이상 문단으로 다운그레이드하지 않는다 — heading level
  // 4~6으로 그대로 유지되고, 여전히 블록 경계로 인식해 인접 h4~h6와
  // 병합하지 않는다.
  it("h4~h6는 heading level 4-6으로 유지되고 인접 블록과 병합되지 않는다", () => {
    const merged = parseClipboardTable({
      html: "<h4>A</h4><h4>B</h4>" + TABLE,
    });
    expect(merged.ok).toBe(true);
    if (merged.ok) {
      expect(merged.value).toEqual([
        { type: "heading", level: 4, content: [{ text: "A" }] },
        { type: "heading", level: 4, content: [{ text: "B" }] },
        TABLE_BLOCK,
      ]);
    }

    // h4/h5/h6 각 레벨을 최소 1개씩 커버한다 — 셋 다 해당 레벨의 heading
    // 으로 유지됨을 확인한다.
    const levels = parseClipboardTable({
      html: "<h4>A</h4><h5>B</h5><h6>C</h6>" + TABLE,
    });
    expect(levels.ok).toBe(true);
    if (levels.ok) {
      expect(levels.value).toEqual([
        { type: "heading", level: 4, content: [{ text: "A" }] },
        { type: "heading", level: 5, content: [{ text: "B" }] },
        { type: "heading", level: 6, content: [{ text: "C" }] },
        TABLE_BLOCK,
      ]);
    }
  });

  // heading 텍스트도 셀 텍스트와 같은 정규화(collapseHtmlWhitespace +
  // normalizeCellContent)를 거쳐야 한다 — 누락되면 model의
  // isValidInlineText가 거절하는 코드포인트가 남아 readEditorDocument에서
  // throw된다(editor 영구 desync).
  it("heading 텍스트도 셀과 같은 공백·제어문자 정규화를 거친다", () => {
    const result = parseClipboardTable({ html: "<h1>\n\tA \t</h1>" + TABLE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toEqual({
      type: "heading",
      level: 1,
      content: [{ text: "A" }],
    });
  });

  // 트랙-6 회귀: HTML5 파싱 규칙상 <table> 시작 태그는 <p>만 자동으로
  // 닫고 <h1>~<h6>는 닫지 않는다 — 표가 heading의 실제 자식으로 파싱
  // 트리에 남는다(<h1>intro<table>...</table>outro</h1> 형태). 수정 전
  // 코드는 heading을 표보다 먼저 리프로 접어 표 구조(셀 경계)가 사라지고
  // 서로 다른 셀 값이 구분자 없이 이어붙었다(예: "ab"). heading 텍스트는
  // model이 "표를 품은 heading"을 표현할 수 없어 문단으로 다운그레이드된다
  // — 표 앞뒤 텍스트 순서와 표 구조(셀 값 분리)만 보존하면 된다.
  it("heading 안에 중첩된 표는 뭉개지지 않고 표 블록으로 보존된다", () => {
    const result = parseClipboardTable({
      html: `<h1>intro${TABLE}outro</h1>`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { type: "paragraph", content: [{ text: "intro" }] },
      TABLE_BLOCK,
      { type: "paragraph", content: [{ text: "outro" }] },
    ]);
  });

  // h4~h6도 h1~h3와 같은 파싱 규칙(table이 자동으로 닫지 않음)을 받는다.
  it("h4~h6 안에 중첩된 표도 뭉개지지 않고 표 블록으로 보존된다", () => {
    const result = parseClipboardTable({
      html: `<h4>intro${TABLE}outro</h4>`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { type: "paragraph", content: [{ text: "intro" }] },
      TABLE_BLOCK,
      { type: "paragraph", content: [{ text: "outro" }] },
    ]);
  });

  // 트랙-6 테스트 갭: 다중 표(Issue #73)와 heading 경계 인식(Issue #72)이
  // 같은 순회 함수를 각자 확장하면서 생기는 조합도 고정한다 — 두 표
  // 사이에 heading이 끼어도 각 표가 독립된 표 블록으로, heading은
  // heading대로 분리된다.
  it("표 2개 사이에 heading이 있어도 각각 독립된 표·heading 블록으로 분리된다", () => {
    const result = parseClipboardTable({
      html: `${TABLE}<h2>middle</h2>${TABLE}`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      TABLE_BLOCK,
      { type: "heading", level: 2, content: [{ text: "middle" }] },
      TABLE_BLOCK,
    ]);
  });

  // 완료 조건 1(Issue #113, 발단 #72): div도 p/heading과 같은 문단 경계다
  // — 인접한 div끼리 구분자 없이 병합되지 않는다. 수정 전에는 div가
  // clipboardAllowedTagNames에 없어 sanitize가 unwrap하고,
  // blockSequenceFromNodes가 남은 텍스트를 전부 하나의 pending으로
  // 흡수해 {p:"ab"} 하나로 뭉쳤다(이슈 실측 케이스).
  it("연속된 div는 각각 독립된 문단으로 분리된다", () => {
    const result = parseClipboardTable({
      html: `<div>a</div><div>b</div>${TABLE}`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { type: "paragraph", content: [{ text: "a" }] },
      { type: "paragraph", content: [{ text: "b" }] },
      TABLE_BLOCK,
    ]);
  });

  // 완료 조건 2, 5(Issue #113): ul/ol 자체는 순수 wrapper로 두고 li만
  // 문단 경계로 인식한다 — <ul><li>one</li><li>two</li></ul>이
  // {p:"onetwo"} 하나로 뭉치던 이슈 실측 케이스가 li 2개짜리 문단으로
  // 분리된다. ol도 같은 wrapper 취급을 받는지 함께 확인한다(리스트
  // 마커·순서 자체는 model에 대응 Block 타입이 없어 보존하지 않는다 —
  // 범위 밖).
  it("ul/ol 안 연속된 li는 각각 독립된 문단으로 분리된다", () => {
    const ulResult = parseClipboardTable({
      html: `<ul><li>one</li><li>two</li></ul>${TABLE}`,
    });
    expect(ulResult.ok).toBe(true);
    if (ulResult.ok) {
      expect(ulResult.value).toEqual([
        { type: "paragraph", content: [{ text: "one" }] },
        { type: "paragraph", content: [{ text: "two" }] },
        TABLE_BLOCK,
      ]);
    }

    const olResult = parseClipboardTable({
      html: `<ol><li>one</li><li>two</li></ol>${TABLE}`,
    });
    expect(olResult.ok).toBe(true);
    if (olResult.ok) {
      expect(olResult.value).toEqual([
        { type: "paragraph", content: [{ text: "one" }] },
        { type: "paragraph", content: [{ text: "two" }] },
        TABLE_BLOCK,
      ]);
    }
  });

  // 완료 조건 3(Issue #113): blockquote도 문단 경계다 — 인접한 p/div와
  // 구분자 없이 병합되지 않고 독립된 문단으로 분리된다.
  it("blockquote는 독립된 문단으로 분리되고 인접 p·div와 병합되지 않는다", () => {
    const result = parseClipboardTable({
      html: `<p>x</p><blockquote>y</blockquote><div>z</div>${TABLE}`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { type: "paragraph", content: [{ text: "x" }] },
      { type: "paragraph", content: [{ text: "y" }] },
      { type: "paragraph", content: [{ text: "z" }] },
      TABLE_BLOCK,
    ]);
  });

  // 완료 조건 4(Issue #113): HTML5 파싱 규칙상 <table> 시작 태그는 <p>만
  // 자동으로 닫고 div/li/blockquote는 닫지 않는다(parse5로 확인) — 표가
  // 이 세 태그의 실제 자식으로 파싱 트리에 남을 수 있다. p/heading과 같은
  // containsAnyTable 예외가 필요하다: 표를 자식으로 품으면 문단 경계
  // 취급을 접고 통과해 내려가 표 구조(셀 경계)를 보존한다.
  it("div/li/blockquote 안에 중첩된 표는 뭉개지지 않고 표 블록으로 보존된다", () => {
    const cases = [
      { label: "div", html: `<div>intro${TABLE}outro</div>` },
      { label: "li", html: `<ul><li>intro${TABLE}outro</li></ul>` },
      {
        label: "blockquote",
        html: `<blockquote>intro${TABLE}outro</blockquote>`,
      },
    ];

    for (const { label, html } of cases) {
      const result = parseClipboardTable({ html });
      expect(result.ok, label).toBe(true);
      if (!result.ok) continue;
      expect(result.value, label).toEqual([
        { type: "paragraph", content: [{ text: "intro" }] },
        TABLE_BLOCK,
        { type: "paragraph", content: [{ text: "outro" }] },
      ]);
    }
  });

  // 완료 조건 5(Issue #113): "ul/ol을 순수 wrapper로 두고 li만 경계로
  // 추가"하는 것이 중첩 li(리스트 안 리스트)에서도 충분한지 확인한다.
  // li를 flush→pending 치환→flush로 끝내지 않고 재귀(walk)로 처리하므로
  // 중첩된 li도 각자 독립된 문단 경계로 인식되고 문서 순서가 보존된다.
  it("중첩된 li도 각각 독립된 문단으로 분리되고 순서가 보존된다", () => {
    const result = parseClipboardTable({
      html: `<ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul>${TABLE}`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { type: "paragraph", content: [{ text: "one" }] },
      { type: "paragraph", content: [{ text: "nested" }] },
      { type: "paragraph", content: [{ text: "two" }] },
      TABLE_BLOCK,
    ]);
  });
});
