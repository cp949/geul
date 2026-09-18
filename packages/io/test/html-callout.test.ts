/**
 * HTML export/import의 callout ↔ `<div data-geul-callout>` 매핑(Issue #209
 * RD-003 DELTA-01, 설계 `docs/specs/2026-09-18-callout-block-design.md`
 * §4)을 검증한다. content/children 분할 규칙(D6)은 quote와 완전히 동일한
 * `splitQuoteChildren`을 재사용한다 — 깊이 상한·D6 세부 분기(첫 자식 타입별
 * 승격 규칙)의 전면 재검증은 `html-blockquote.test.ts`가 이미 소유한다.
 * 이 파일은 callout 고유 지점(icon, `data-geul-callout` 판별이 일반 div
 * wrapper·클립보드 경로를 오염시키지 않는지)만 다룬다.
 */
import type { Block, Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml, parseClipboardTable } from "../src/index.js";
import {
  buildDocument,
  calloutBlock,
  headingBlock,
  paragraphBlock,
} from "./fixtures/quote-divider-document.js";

const expectCalloutRoundTrip = (
  document: Document,
  expectedHtml: string,
): void => {
  const exported = exportHtml(document);
  expect(exported).toEqual({ ok: true, value: expectedHtml });
  if (!exported.ok) return;
  expect(importHtml(exported.value)).toEqual({
    ok: true,
    value: { document, warnings: [] },
  });
};

const expectImportedBlocks = (html: string, blocks: Block[]): void => {
  expect(importHtml(html)).toEqual({
    ok: true,
    value: { document: buildDocument(blocks), warnings: [] },
  });
};

describe("callout ↔ data-geul-callout div 왕복", () => {
  it('icon 없는 callout이 <div data-geul-block-id data-geul-callout="true"><p>content</p></div>로 export되고 re-import된다', () => {
    expectCalloutRoundTrip(
      buildDocument([
        paragraphBlock("paragraph-1", "앞"),
        calloutBlock("callout-1", "안내"),
      ]),
      '<p data-geul-block-id="paragraph-1">앞</p><div data-geul-block-id="callout-1" data-geul-callout="true"><p>안내</p></div>',
    );
  });

  it("icon이 있는 callout은 data-geul-icon을 함께 낸다", () => {
    expectCalloutRoundTrip(
      buildDocument([calloutBlock("callout-1", "안내", "💡")]),
      '<div data-geul-block-id="callout-1" data-geul-callout="true" data-geul-icon="💡"><p>안내</p></div>',
    );
  });

  it("backgroundColor가 있는 callout은 기존 TextBlockProps 직렬화 규칙을 그대로 받는다", () => {
    const withColor: Block = {
      id: "callout-1",
      type: "callout",
      content: [{ text: "안내" }],
      backgroundColor: "#FEF7E0",
    };
    expectCalloutRoundTrip(
      buildDocument([withColor]),
      '<div data-geul-block-id="callout-1" data-geul-callout="true" data-geul-background-color="#FEF7E0" style="background-color:#FEF7E0"><p>안내</p></div>',
    );
  });

  it("children 있는 callout이 div 안 <p> + data-geul-children 컨테이너로 export되고 자기 출력 re-import로 원본이 복원된다", () => {
    expectCalloutRoundTrip(
      buildDocument([
        calloutBlock("callout-1", "안내", "💡", [
          paragraphBlock("paragraph-1", "자식"),
          headingBlock("heading-1", 3, "제목"),
        ]),
      ]),
      '<div data-geul-block-id="callout-1" data-geul-callout="true" data-geul-icon="💡"><p>안내</p><div data-geul-children="1"><p data-geul-block-id="paragraph-1">자식</p><h3 data-geul-block-id="heading-1">제목</h3></div></div>',
    );
  });

  it("content 빈 callout + children 문서가 왕복 보존된다(D6 첫 문단 승격 역변환 대칭)", () => {
    expectCalloutRoundTrip(
      buildDocument([
        {
          id: "callout-1",
          type: "callout",
          content: [],
          children: [paragraphBlock("paragraph-1", "본문")],
        },
      ]),
      '<div data-geul-block-id="callout-1" data-geul-callout="true"><p></p><div data-geul-children="1"><p data-geul-block-id="paragraph-1">본문</p></div></div>',
    );
  });
});

describe("data-geul-callout 판별이 일반 div를 오염시키지 않는다", () => {
  it("data-geul-callout 속성이 없는 <div>는 여전히 문단 경계(children wrapper 등)로 처리된다", () => {
    // callout 판별(isCalloutNode)이 NESTED_BOUNDARY_TAG_NAMES의 일반 div보다
    // 먼저 걸리더라도, 마커 속성이 없으면 그대로 통과해 기존 동작(재귀 탐색)을
    // 유지해야 한다 — 이 테스트가 지는 변이: isCalloutNode를 태그명만으로
    // 판정하면(속성 체크 누락) 이 일반 div가 callout으로 잘못 승격된다.
    expectImportedBlocks("<div><p>A</p><p>B</p></div>", [
      paragraphBlock("html-1", "A"),
      paragraphBlock("html-2", "B"),
    ]);
  });

  it("클립보드 파서는 callout div를 여전히 문단 경계로 다룬다(isCalloutNode 미전달)", () => {
    const result = parseClipboardTable({
      html: '<div data-geul-callout="true"><p>A</p></div><table><tr><td>c</td><td>d</td></tr></table>',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toEqual({
      type: "paragraph",
      content: [{ text: "A" }],
    });
    expect(result.value[1]?.type).toBe("table");
  });
});
