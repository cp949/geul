/**
 * 셀 정렬 값의 정규 형식(isCanonicalCellAlign) 계약.
 */
import { describe, expect, it } from "vitest";

import { isCanonicalCellAlign } from "../src/index.js";

describe("셀 정렬 정규 형식", () => {
  it("left/center/right를 허용한다", () => {
    expect(isCanonicalCellAlign("left")).toBe(true);
    expect(isCanonicalCellAlign("center")).toBe(true);
    expect(isCanonicalCellAlign("right")).toBe(true);
  });

  it("허용 목록 밖 값을 거부한다", () => {
    expect(isCanonicalCellAlign("justify")).toBe(false);
    expect(isCanonicalCellAlign("Left")).toBe(false);
    expect(isCanonicalCellAlign("")).toBe(false);
  });
});
