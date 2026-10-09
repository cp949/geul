/**
 * `<b>`/`<i>`로 붙여넣거나 가져온 HTML도 `<strong>`/`<em>`과 동일하게
 * bold/italic mark로 인식되는지 확인한다. 클립보드는 워드·구형 웹페이지·
 * 브라우저 `execCommand('bold')` 등 실제 소스가 `<strong>`이 아니라
 * `<b>`(`<em>` 대신 `<i>`)를 흔히 낸다 — 이 두 태그를 지원 목록에서
 * 빠뜨리면 실사용 붙여넣기에서 서식이 조용히 사라진다.
 */
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

describe("HTML b/i 태그의 bold/italic mark 인식", () => {
  it("<b>는 <strong>과 동일하게 bold mark로 인식된다", () => {
    const result = importHtml("<p>a <b>b</b></p>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "a " }, { text: "b", marks: [{ type: "bold" }] }],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it("<i>는 <em>과 동일하게 italic mark로 인식된다", () => {
    const result = importHtml("<p>a <i>b</i></p>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "a " }, { text: "b", marks: [{ type: "italic" }] }],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it("<b>와 <i>를 중첩하면 bold+italic이 함께 적용된다", () => {
    const result = importHtml("<p><b><i>bi</i></b></p>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [
          {
            text: "bi",
            marks: [{ type: "bold" }, { type: "italic" }],
          },
        ],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });
});

/**
 * `font-weight:normal|400` 인라인 스타일이 붙은 `<b>`·`<strong>`은 굵지 않다
 * (Issue #316). Google Docs 복사는 문서 전체를 `<b style="font-weight:normal">`
 * 래퍼로 감싼다. 래퍼를 bold로 읽으면 본문 전체가 굵게 들어온다. 이 패턴만 다룬다.
 * `span`의 `font-weight:700` 같은 스타일 기반 굵게는 Issue #320부터 읽지만
 * 이 describe의 범위 밖이다. `color` 같은 색 선언은 Issue #334부터 마크로 읽으므로
 * "다른 선언"과 "무관한 선언" 행은 읽지 않는 `font-family`를 쓴다(색은
 * `html-inline-element-style`이 다룬다).
 */
describe("font-weight:normal 래퍼 <b>·<strong>", () => {
  const importedContent = (html: string) => {
    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };

  it.each([
    ['<b style="font-weight:normal">x</b>', "normal"],
    ['<b style="font-weight:400">x</b>', "400"],
    ['<b style="font-weight: normal;">x</b>', "공백과 세미콜론"],
    ['<b style="FONT-WEIGHT : Normal">x</b>', "대소문자와 콜론 앞 공백"],
    ['<b style="font-weight:400 !important">x</b>', "!important"],
    [
      '<b style="font-family:Arial;font-weight:normal">x</b>',
      "다른 선언과 함께",
    ],
    ['<strong style="font-weight:normal">x</strong>', "strong"],
  ])("%s(%s)는 bold가 아니다", (inner) => {
    const value = importedContent(`<p>${inner}</p>`);

    expect(value.document.blocks).toEqual([
      { id: "html-1", type: "paragraph", content: [{ text: "x" }] },
    ]);
  });

  it.each([
    ['<b style="font-weight:700">x</b>', "700"],
    ['<b style="font-weight:bold">x</b>', "bold"],
    ['<b style="font-family:Arial">x</b>', "무관한 선언"],
    [
      '<b style="font-weight:normal;font-weight:700">x</b>',
      "마지막 선언이 700",
    ],
    ['<strong style="font-weight:600">x</strong>', "strong 600"],
    ["<b>x</b>", "style 없음"],
    ["<strong>x</strong>", "strong style 없음"],
  ])("%s(%s)는 그대로 bold다", (inner) => {
    const value = importedContent(`<p>${inner}</p>`);

    expect(value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "x", marks: [{ type: "bold" }] }],
      },
    ]);
  });

  it("바깥 래퍼만 굵지 않고 안쪽 <b>는 bold다", () => {
    const value = importedContent(
      '<p><b style="font-weight:normal">a <b>b</b></b></p>',
    );

    expect(value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "a " }, { text: "b", marks: [{ type: "bold" }] }],
      },
    ]);
  });

  it("Google Docs 모양은 bold 없이 text와 textColor가 된다", () => {
    const value = importedContent(
      '<b style="font-weight:normal;" id="docs-internal-guid-x"><p><span style="color:#000000;font-weight:400;">hello</span></p></b>',
    );

    expect(value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [
          { text: "hello", marks: [{ type: "textColor", color: "#000000" }] },
        ],
      },
    ]);
  });

  it("style 제거 경고는 이전과 같다(경고 계약 불변)", () => {
    const value = importedContent('<p><b style="font-weight:normal">x</b></p>');

    expect(value.warnings).toEqual([
      {
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "b",
        attribute: "style",
        message: "Unsupported style attribute was removed from b",
      },
    ]);
  });

  it("strong의 style 제거 경고도 낸다", () => {
    const value = importedContent(
      '<p><strong style="font-weight:700">x</strong></p>',
    );

    expect(value.warnings).toEqual([
      {
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "strong",
        attribute: "style",
        message: "Unsupported style attribute was removed from strong",
      },
    ]);
  });
});
