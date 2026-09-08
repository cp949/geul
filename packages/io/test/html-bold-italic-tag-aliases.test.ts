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
