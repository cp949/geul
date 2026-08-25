/**
 * `normalizeCellContent`가 공백 접기로 빈 세그먼트가 사라진 뒤 같은 mark를
 * 가진 이웃 세그먼트를 실제로 병합하는지 검증한다. 이 병합은
 * `normalized[normalized.length - 1]`(`.at(-1)`에서 인덱스 접근으로 치환한
 * 자리, Issue #120)을 최근 병합 대상으로 쓰므로, 이 인덱스가 틀리면
 * 세그먼트가 병합되지 않거나 엉뚱한 세그먼트에 붙는다.
 */
import { describe, expect, it } from "vitest";

import { normalizeCellContent } from "../src/clipboard/cell-text.js";

describe("normalizeCellContent", () => {
  it("공백 전용 세그먼트가 완전히 접혀 사라지면 같은 mark의 앞뒤 세그먼트를 병합한다", () => {
    // "abc" + " "(LF 앞이라 전체 접힘) + "\ndef" — 가운데 세그먼트가
    // 빈 텍스트로 사라지면 "abc"(bold)와 "\ndef"(bold)가 이웃하게 된다.
    const result = normalizeCellContent([
      { text: "abc", marks: [{ type: "bold" }] },
      { text: " " },
      { text: "\ndef", marks: [{ type: "bold" }] },
    ]);

    expect(result).toEqual([{ text: "abc\ndef", marks: [{ type: "bold" }] }]);
  });

  it("병합 대상이 없으면(mark가 다르면) 세그먼트를 그대로 유지한다", () => {
    const result = normalizeCellContent([
      { text: "abc", marks: [{ type: "bold" }] },
      { text: " " },
      { text: "\ndef", marks: [{ type: "italic" }] },
    ]);

    expect(result).toEqual([
      { text: "abc", marks: [{ type: "bold" }] },
      { text: "\ndef", marks: [{ type: "italic" }] },
    ]);
  });
});
