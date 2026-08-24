/**
 * 셀 색상 문자열의 정규 형식 계약. 저장 포맷은 대문자 #RRGGBB만 허용하고,
 * 이 판정의 권위는 model에 둔다(G-CNV-001 — core/react가 같은 규칙을
 * 따로 구현하지 않는다).
 */
import { describe, expect, it } from "vitest";

import { isCanonicalCellColor } from "../src/index.js";

describe("셀 색상 정규 형식", () => {
  it("대문자 #RRGGBB를 인정한다", () => {
    expect(isCanonicalCellColor("#AABBCC")).toBe(true);
    expect(isCanonicalCellColor("#0F1E2D")).toBe(true);
  });

  it("소문자 hex는 거절한다", () => {
    expect(isCanonicalCellColor("#aabbcc")).toBe(false);
  });

  it("3자리 축약과 색 이름과 빈 문자열을 거절한다", () => {
    expect(isCanonicalCellColor("#ABC")).toBe(false);
    expect(isCanonicalCellColor("red")).toBe(false);
    expect(isCanonicalCellColor("")).toBe(false);
  });
});
