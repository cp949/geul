/**
 * HTML 파이프라인 깊이-캡 계약(Issue #130)을 다룬다. parseHtmlFragment가
 * parse5 트리를 MAX_HTML_TREE_DEPTH에서 반복 순회로 절단해 텍스트를
 * 보존하는 단위 계약과, 두 진입점(importHtml·parseClipboardTable)이 임의
 * 깊이 입력에서 크래시 없이 구조화된 결과를 반환하는 계약을 깊이·구조
 * 단언으로만 고정한다(PIT-0034 — wall-clock·timeout 비의존).
 */
import { describe, expect, it } from "vitest";

import {
  MAX_HTML_TREE_DEPTH,
  parseHtmlFragment,
} from "../src/html/parse-html.js";
import { importHtml, parseClipboardTable } from "../src/index.js";
import { expectSingleTable } from "./clipboard-table-support.js";
import {
  buildDeepChainHtml,
  documentVisibleText,
  htmlTreeDepth,
  htmlVisibleText,
} from "./html-depth-support.js";

describe("parseHtmlFragment 깊이-캡", () => {
  it(`트리 깊이가 MAX_HTML_TREE_DEPTH(${MAX_HTML_TREE_DEPTH}) 이하인 입력은 절단 없이 원래 깊이를 유지한다`, () => {
    // div 체인 255단 + 최심부 텍스트 노드 1 = 트리 깊이 정확히 캡.
    const parsed = parseHtmlFragment(
      buildDeepChainHtml("div", MAX_HTML_TREE_DEPTH - 1, "x"),
    );

    expect(parsed).toBeDefined();
    if (parsed === undefined) return;
    expect(parsed.truncated).toBe(false);
    expect(htmlTreeDepth(parsed.root)).toBe(MAX_HTML_TREE_DEPTH);
    expect(htmlVisibleText(parsed.root)).toBe("x");
  });

  it("캡을 한 단계 넘는 입력은 절단되어 결과 트리 깊이가 캡 이하가 되고 최심부 텍스트가 보존된다", () => {
    // div 체인 256단 + 텍스트 = 트리 깊이 캡+1. 깊이 256의 div가 텍스트
    // 노드로 치환돼 결과 깊이는 캡 이하다.
    const parsed = parseHtmlFragment(
      buildDeepChainHtml("div", MAX_HTML_TREE_DEPTH, "x"),
    );

    expect(parsed).toBeDefined();
    if (parsed === undefined) return;
    expect(parsed.truncated).toBe(true);
    expect(htmlTreeDepth(parsed.root)).toBeLessThanOrEqual(MAX_HTML_TREE_DEPTH);
    expect(htmlVisibleText(parsed.root)).toBe("x");
  });

  it("절단된 서브트리의 텍스트는 br 개행을 유지한 채 하나로 합쳐진다", () => {
    const parsed = parseHtmlFragment(
      buildDeepChainHtml("div", MAX_HTML_TREE_DEPTH, "a<br>b"),
    );

    expect(parsed).toBeDefined();
    if (parsed === undefined) return;
    expect(parsed.truncated).toBe(true);
    expect(htmlVisibleText(parsed.root)).toBe("a\nb");
  });

  // 아래 세 테스트: 절단 수집이 텍스트만 이어 붙이면 서로 다른 블록의
  // 텍스트("Alpha"/"Beta", 셀 "c1"/"c2")가 한 단어처럼 붙어 의미가 바뀐다 —
  // G-CNV-002 "보이는 text와 block 경계를 보존한다". 블록 경계 태그 사이에는
  // 개행 구분자가 들어가야 한다(연속 개행 중복은 정리해도 된다).
  it("절단된 서브트리 안의 p 형제 텍스트는 붙지 않고 개행으로 구분된다", () => {
    const parsed = parseHtmlFragment(
      buildDeepChainHtml("div", MAX_HTML_TREE_DEPTH, "<p>Alpha</p><p>Beta</p>"),
    );

    expect(parsed).toBeDefined();
    if (parsed === undefined) return;
    expect(parsed.truncated).toBe(true);
    expect(htmlVisibleText(parsed.root)).toBe("Alpha\nBeta");
  });

  it("절단된 서브트리 안의 표 셀 텍스트는 붙지 않고 개행으로 구분된다", () => {
    const parsed = parseHtmlFragment(
      buildDeepChainHtml(
        "div",
        MAX_HTML_TREE_DEPTH,
        "<table><tr><td>c1</td><td>c2</td></tr></table>",
      ),
    );

    expect(parsed).toBeDefined();
    if (parsed === undefined) return;
    expect(parsed.truncated).toBe(true);
    expect(htmlVisibleText(parsed.root)).toBe("c1\nc2");
  });

  it("절단된 서브트리 안의 li 형제 텍스트는 붙지 않고 개행으로 구분된다", () => {
    const parsed = parseHtmlFragment(
      buildDeepChainHtml(
        "div",
        MAX_HTML_TREE_DEPTH,
        "<ul><li>one</li><li>two</li></ul>",
      ),
    );

    expect(parsed).toBeDefined();
    if (parsed === undefined) return;
    expect(parsed.truncated).toBe(true);
    expect(htmlVisibleText(parsed.root)).toBe("one\ntwo");
  });

  it("절단 수집 텍스트에 script·style 원문은 포함되지 않는다", () => {
    const parsed = parseHtmlFragment(
      buildDeepChainHtml(
        "div",
        MAX_HTML_TREE_DEPTH,
        "<script>alert(1)</script><style>p{}</style>after",
      ),
    );

    expect(parsed).toBeDefined();
    if (parsed === undefined) return;
    expect(parsed.truncated).toBe(true);
    const visible = htmlVisibleText(parsed.root);
    expect(visible).toContain("after");
    expect(visible).not.toContain("alert");
    expect(visible).not.toContain("p{}");
  });
});

describe("importHtml 깊이 방어(Issue #130)", () => {
  it("3000단 div 중첩도 크래시 없이 최심부 텍스트를 보존하고 DEEP_TREE_FLATTENED를 경고한다", () => {
    const html = buildDeepChainHtml("div", 3000, "deep-text");

    expect(() => importHtml(html)).not.toThrow();
    const result = importHtml(html);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(documentVisibleText(result.value.document)).toContain("deep-text");
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "DEEP_TREE_FLATTENED" }),
      ]),
    );
  });

  it("3000단 span 체인(비경계 태그)도 크래시 없이 텍스트를 보존하고 DEEP_TREE_FLATTENED를 경고한다", () => {
    const html = buildDeepChainHtml("span", 3000, "span-text");

    expect(() => importHtml(html)).not.toThrow();
    const result = importHtml(html);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(documentVisibleText(result.value.document)).toContain("span-text");
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "DEEP_TREE_FLATTENED" }),
      ]),
    );
  });

  it("template 중첩 폭탄도 크래시 없이 구조화된 Result를 반환한다", () => {
    // template의 콘텐츠는 parse5가 childNodes가 아닌 content 조각에 담는다 —
    // 캡이 content를 순회하지 않으면 fromParse5 재귀가 그대로 남는다. 이
    // 깊이(3,000)는 parse5 자신의 EOF template 정리 재귀 임계(비결정 구간
    // 4,000~8,000) 아래라 파서가 트리를 만들고, 캡·평탄화가 정상 동작한다.
    const html = `<p>keep</p>${"<template>".repeat(3000)}x`;

    expect(() => importHtml(html)).not.toThrow();
    const result = importHtml(html);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(documentVisibleText(result.value.document)).toContain("keep");
  });

  // 아래 30,000단 케이스들은 캡이 원리적으로 못 막는 구간이다 — parse5의
  // parseFragment 자체가 닫히지 않은 중첩 template의 EOF 정리
  // (eofInTemplate ↔ onEof 상호 재귀)에서 RangeError를 내며, 캡은
  // parseFragment "이후"에 돈다. 이 입력군은 파서가 트리를 만들지 못하므로
  // 평탄화 보존 대상이 아니라 기존 "파서 실패" 계약으로 흡수된다 —
  // parseHtmlFragment의 설계된 경계 catch가 undefined를 반환하고 두
  // 소비자가 각자의 구조화된 오류(HTML_PARSE_FAILED / NOT_TABULAR)로
  // 바꾼다. 30,000은 결정적 RangeError 구간(≥10,000)의 값이다 —
  // 비결정 구간(4,000~8,000) 값은 쓰지 않는다(PIT-0034).
  it("파서가 트리를 만들 수 없는 미폐쇄 template 30,000단은 parseHtmlFragment가 throw 없이 undefined를 반환한다", () => {
    const html = "<template>".repeat(30000) + "x";

    expect(() => parseHtmlFragment(html)).not.toThrow();
    expect(parseHtmlFragment(html)).toBeUndefined();
  });

  it("미폐쇄 template 30,000단 import는 예외 유출 없이 HTML_PARSE_FAILED로 거절된다", () => {
    const html = "<template>".repeat(30000) + "x";

    expect(() => importHtml(html)).not.toThrow();
    const result = importHtml(html);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("HTML_PARSE_FAILED");
  });

  it("미폐쇄 template 30,000단이 든 클립보드 HTML은 예외 유출 없이 NOT_TABULAR를 반환한다", () => {
    // <table>이 있어야 클립보드 경로가 HTML 파싱에 진입한다 — 표가 있어도
    // 파서가 트리를 만들지 못하면 구조화된 거절로 떨어져야 한다.
    const html =
      "<template>".repeat(30000) + "<table><tr><td>a</td></tr></table>";

    expect(() => parseClipboardTable({ html })).not.toThrow();
    expect(parseClipboardTable({ html })).toEqual({
      ok: false,
      error: { code: "NOT_TABULAR" },
    });
  });
});

describe("parseClipboardTable 깊이 방어(Issue #130)", () => {
  it("3000단 div 안의 표는 예외를 새지 않고 구조화된 NOT_TABULAR를 반환한다", () => {
    // 표 자체가 캡 너머(깊이 3001)에 있으므로 절단으로 사라진다 — 표를
    // 찾지 못한 구조화된 거절이 계약이다(기본 붙여넣기 폴백).
    const html = buildDeepChainHtml(
      "div",
      3000,
      "<table><tr><td>a</td><td>b</td></tr></table>",
    );

    expect(() => parseClipboardTable({ html })).not.toThrow();
    expect(parseClipboardTable({ html })).toEqual({
      ok: false,
      error: { code: "NOT_TABULAR" },
    });
  });

  it("표 셀 안 3000단 span 체인은 예외를 새지 않고 셀 텍스트를 보존한 표를 반환한다", () => {
    const html = `<table><tr><td>${buildDeepChainHtml("span", 3000, "x")}</td><td>b</td></tr></table>`;

    expect(() => parseClipboardTable({ html })).not.toThrow();
    const data = expectSingleTable(parseClipboardTable({ html }));

    expect(data.columnCount).toBe(2);
    expect(data.rows[0]?.cells[0]?.content).toEqual([{ text: "x" }]);
    expect(data.rows[0]?.cells[1]?.content).toEqual([{ text: "b" }]);
  });
});
